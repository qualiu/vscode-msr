import * as vscode from 'vscode';
import { AddKeepColorArg, AddOutputToStderrArg, ToolChecker, setOutputColumnIndexInCommandLine, setTimeoutInCommandLine } from './ToolChecker';
import { GitListFileHead, getConfigValueByAllParts, getConfigValueByProjectAndExtension, getConfigValueOfProject } from './configUtils';
import { DefaultWorkspaceFolder, HomeFolder, RemoveJumpRegex, ReplaceJunkPattern, SkipJumpOutForHeadResultsRegex, getDefaultRepoFolderByActiveFile, getRepoFolder, getSkipJunkPathArgs, isNullOrEmpty } from './constants';
import { FileExtensionToMappedExtensionMap, MyConfig, getConfig, getFileNamePattern, getGitIgnore, getSearchPathOptions, removeSearchTextForCommandLine, replaceToRelativeSearchPath } from './dynamicConfig';
import { FindCommandType, TerminalType } from './enums';
import { SkipPathVariableName } from './gitUtils';
import { enableColorAndHideCommandLine, outputDebugByTime, outputInfoByTime } from './outputUtils';
import { Ranker } from './ranker';
import { NormalTextRegex, escapeRegExp } from './regexUtils';
import { runCommandInTerminal, runRawCommandInTerminal } from './runCommandUtils';
import { SearchConfig } from './searchConfig';
import { DefaultTerminalType, IsLinuxTerminalOnWindows, IsWindowsTerminalOnWindows, changeFindingCommandForLinuxTerminalOnWindows, isLinuxTerminalOnWindows, toTerminalPath } from './terminalUtils';
import { MsrExe } from './toolSource';
import { getCurrentWordAndText, getExtensionNoHeadDot, getRepoFolderName, quotePaths, replaceSearchTextHolder, replaceTextByRegex, setSearchPathInCommand, toPath } from './utils';
import { changeSearchWordToVariationPattern, getSearchWordVariationPattern } from './wordReferenceUtils';
import path = require('path');

const ReplaceSearchPathRegex = /-r?p\s+\S+|-r?p\s+\".+?\"/g;

export let ProjectToGitFindFileExtraOptionsMap = new Map<string, RegExp>();

function replaceSearchPathToDot(searchPathsOptions: string): string {
    return replaceTextByRegex(searchPathsOptions, ReplaceSearchPathRegex, '-rp .');
}

export function escapeRegExpForFindingCommand(text: string): string {
    if (!IsWindowsTerminalOnWindows) {
        text = text.replace(/\\/g, '\\\\');
    }

    return escapeRegExp(text);
}

export function runFindingCommand(findCmd: FindCommandType, textEditor: vscode.TextEditor) {
    const rootConfig = vscode.workspace.getConfiguration('msr');
    if (rootConfig.get('enable.findingCommands') as boolean !== true) {
        outputDebugByTime('Your extension "vscode-msr": finding-commands is disabled by setting of `msr.enable.findingCommands`.');
    }

    const parsedFile = path.parse(textEditor.document.fileName);
    const findCmdText = FindCommandType[findCmd];
    let [currentWord] = getCurrentWordAndText(textEditor.document, textEditor.selection.active, textEditor);
    const escapeHolder1 = '-ESCAPE-#-Holder#1-';
    const escapeHolder2 = '-ESCAPE-#-Holder#2-';
    currentWord = currentWord.replace(/%1/g, escapeHolder1).replace(/%~1/g, escapeHolder2);
    const isRegexFinding = findCmdText.match(/Regex/i);
    const isFindReference = findCmdText.match(/Reference/i);
    const searchWordVariationPattern = isRegexFinding && isFindReference
        ? changeSearchWordToVariationPattern(currentWord, parsedFile)
        : currentWord;

    let rawSearchText = !isRegexFinding && IsWindowsTerminalOnWindows
        ? currentWord
        : currentWord.replace(/\\/g, '\\\\');
    let searchText = isRegexFinding
        ? (isFindReference && searchWordVariationPattern !== currentWord
            ? searchWordVariationPattern
            : escapeRegExpForFindingCommand(currentWord)
        )
        : rawSearchText;
    if (!IsWindowsTerminalOnWindows) {
        rawSearchText = rawSearchText.replace(/`/g, '\\`');
        searchText = searchText.replace(/`/g, '\\`');
    }

    let command = getFindingCommandByCurrentWord(true, findCmd, searchText, parsedFile, rawSearchText, undefined);
    command = command.replace(new RegExp(escapeHolder1, 'g'), '%1').replace(new RegExp(escapeHolder2, 'g'), '%~1');
    if (findCmdText.includes('FindTop')) {
        const [hasGotExe, ninExePath] = new ToolChecker().checkAndDownloadTool('nin');
        if (!hasGotExe) {
            outputInfoByTime('Not found nin to run ' + findCmdText + ' command:\n' + command, true);
            return;
        } else if (!isNullOrEmpty(ninExePath)) {
            const folder = path.dirname(ninExePath);
            if (folder === HomeFolder) {
                command = command.replace(/\s*\|\s*nin\s+/, ' | ' + ninExePath + ' ');
            }
        }
    }

    if (MyConfig.useGitFileList(false)) {
        const repoFolder = getRepoFolder(toPath(parsedFile), true) || '.';
        const repoFolderName = getRepoFolderName(repoFolder, true);
        command = command.replace(ReplaceJunkPattern, 'gfind-file');
        const pattern = ProjectToGitFindFileExtraOptionsMap.get(repoFolderName);
        if (pattern) {
            command = command.replace(pattern, ' ');
        }
    }

    runCommandInTerminal(command, true, getConfig().ClearTerminalBeforeExecutingCommands);
}

export function runFindingCommandByCurrentWord(findCmd: FindCommandType, searchText: string, parsedFile: path.ParsedPath,
    rawSearchText: string = '', onlyRemoveJump: boolean = false, forceSearchPaths: string = '') {
    let command = getFindingCommandByCurrentWord(false, findCmd, searchText, parsedFile, rawSearchText, undefined, onlyRemoveJump);
    command = changeFindingCommandForLinuxTerminalOnWindows(command);
    command = setTimeoutInCommandLine(command, MyConfig.MaxWaitSecondsForAutoReSearchDefinition);
    const gitIgnore = getGitIgnore(parsedFile.dir);
    command = gitIgnore.replaceToSkipPathVariable(command);
    if (!isNullOrEmpty(forceSearchPaths)) {
        command = setSearchPathInCommand(command, forceSearchPaths);
    }

    const myConfig = getConfig();
    runCommandInTerminal(command, !myConfig.IsQuiet, myConfig.ClearTerminalBeforeExecutingCommands);
}

export function getSortCommandText(toRunInTerminal: boolean, isForProjectCmdAlias: boolean, addOptionalArgs: boolean, findCmd: FindCommandType, repoFolder = '', isCookingCmdAlias = false): string {
    const findCmdText = FindCommandType[findCmd];
    if (isNullOrEmpty(repoFolder)) {
        repoFolder = isForProjectCmdAlias ? getDefaultRepoFolderByActiveFile() || '.' : '.';
    }

    const repoFolderName = getRepoFolderName(repoFolder, isForProjectCmdAlias);
    const folderKey = isForProjectCmdAlias ? repoFolderName : 'default';
    let filePattern = '';
    if (findCmdText.includes('SortSource')) {
        filePattern = isForProjectCmdAlias ? MyConfig.AllFilesRegex.source : MyConfig.AllFilesDefaultRegex.source;
    } else if (findCmdText.includes('SortCode')) {
        filePattern = isForProjectCmdAlias ? MyConfig.CodeFilesRegex.source : MyConfig.CodeFilesDefaultRegex.source;
    }

    if (!isNullOrEmpty(filePattern)) {
        filePattern = ' -f "' + filePattern + '"';
    }

    const optionalArgs = addOptionalArgs ? ' $*' : '';
    let extraOptions = ' ' + getConfigValueOfProject(folderKey, 'extraOptions', true).trimRight();
    extraOptions += (findCmdText.match(/BySize/i) ? ' --sz --wt' : ' --wt --sz');
    extraOptions += ' ' + getConfigValueOfProject(folderKey, 'listSortingFilesOptions') as string || '-l -H 10 -T 10';

    let searchPathsOptions = getSearchPathOptions(toRunInTerminal, isForProjectCmdAlias, repoFolder, '', FindCommandType.RegexFindAsClassOrMethodDefinitionInCodeFiles === findCmd);
    if (isCookingCmdAlias) {
        extraOptions = replaceTextByRegex(extraOptions, /(^|\s+)(-[lICc]\s+|-[HT]\s*\d+)/g, ' ');
        extraOptions = replaceTextByRegex(extraOptions, /(^|\s+)(--s[12])\s+\S+\s*/g, ' ');
        extraOptions = extraOptions.trim() + ' -l' + optionalArgs;
        searchPathsOptions = replaceSearchPathToDot(searchPathsOptions);
    }

    extraOptions = extraOptions.trim();
    const command = MsrExe + ' ' + searchPathsOptions + filePattern + ' ' + extraOptions.trim();
    return command.trimRight();
}

export function getFindTopDistributionCommand(toRunInTerminal: boolean, isForProjectCmdAlias: boolean, addOptionalArgs: boolean, findCmd: FindCommandType, repoFolder = ''): string {
    const findCmdText = FindCommandType[findCmd];
    if (isNullOrEmpty(repoFolder)) {
        repoFolder = isForProjectCmdAlias ? getDefaultRepoFolderByActiveFile() || '.' : '.';
    }

    const repoFolderName = getRepoFolderName(repoFolder, isForProjectCmdAlias);
    const folderKey = isForProjectCmdAlias ? repoFolderName : 'default';
    let filePattern = '';
    if (findCmdText.includes('TopSource')) {
        filePattern = isForProjectCmdAlias ? MyConfig.AllFilesRegex.source : MyConfig.AllFilesDefaultRegex.source;
    } else if (findCmdText.includes('TopCode')) {
        filePattern = isForProjectCmdAlias ? MyConfig.CodeFilesRegex.source : MyConfig.CodeFilesDefaultRegex.source;
    }

    if (!isNullOrEmpty(filePattern)) {
        filePattern = ' -f "' + filePattern + '"';
    }

    const optionalArgs = addOptionalArgs ? ' $*' : '';
    const extraOptions = "-l -PAC --xd -k 18";
    const useExtraPaths = 'true' === getConfigValueByProjectAndExtension(folderKey, '', '', 'findingCommands.useExtraPaths');
    let searchPathsOptions = getSearchPathOptions(toRunInTerminal, isForProjectCmdAlias, repoFolder, '', FindCommandType.RegexFindAsClassOrMethodDefinitionInCodeFiles === findCmd, useExtraPaths, useExtraPaths);
    searchPathsOptions = replaceSearchPathToDot(searchPathsOptions);
    let command = MsrExe + ' ' + searchPathsOptions + filePattern + ' ' + extraOptions.trim();
    if (findCmdText.includes('Folder')) {
        command += ' | nin nul "^([^\\\\/]+)[\\\\/]" -p -d ' + optionalArgs;
    } else {
        command += ' | nin nul "\\.(\\w+)$" -p -d ' + optionalArgs;
    }

    return command.trimRight();
}

function setCustomSearchCommand(sourceProjectFolders: string, parsedFile: path.ParsedPath, searchWord: string, commandLine: string): string {
    // Check %AutoDecideSkipFolderToSearch% + %UseGitFileListToSearch% + %ProjectsFolders%
    const skipPathArgs = getSkipJunkPathArgs(IsWindowsTerminalOnWindows);
    const useGitFileListToSearch = `${GitListFileHead(getRepoFolderName(parsedFile.dir))} > /tmp/tmp-git-file-list && msr --no-check -w /tmp/tmp-git-file-list`;
    if (commandLine.match(/\s+-t\s+\S+/)) {
        searchWord = escapeRegExpForFindingCommand(searchWord);
    }

    commandLine = commandLine.replace(new RegExp('%UseGitFileListToSearch%', 'g'), useGitFileListToSearch);
    commandLine = commandLine.replace(new RegExp('%ProjectsFolders%', 'g'), sourceProjectFolders);
    commandLine = commandLine.replace(new RegExp('%FileExtMap%', 'g'), `"${getFileNamePattern(parsedFile)}"`);
    commandLine = commandLine.replace(new RegExp('%FileExt%', 'g'), `"${getFileNamePattern(parsedFile, false)}"`);

    if (commandLine.includes('%AutoDecideSkipFolderToSearch%')) {
        const findAutoDecideRegex = new RegExp('%AutoDecideSkipFolderToSearch%', 'g');
        if (isNullOrEmpty(skipPathArgs)) {
            commandLine = commandLine.replace(findAutoDecideRegex, useGitFileListToSearch);
        } else {
            commandLine = commandLine.replace(findAutoDecideRegex, `msr -rp ${sourceProjectFolders} ${skipPathArgs}`);
        }
    }

    if (commandLine.includes("%SelectedWordVariation%")) {
        const searchWordVariationPattern = '"' + getSearchWordVariationPattern(searchWord) + '"';
        commandLine = commandLine.replace(new RegExp('%SelectedWordVariation%', 'g'), searchWordVariationPattern);
    }

    if (IsWindowsTerminalOnWindows) {
        commandLine = commandLine.replace(new RegExp('/tmp/', 'g'), "%TMP%\\");
    } else {
        commandLine = commandLine.replace(/%(\w+)%/g, '$$$1');
    }

    if (!commandLine.indexOf(SkipPathVariableName)) {
        return commandLine;
    }

    commandLine = commandLine.replace(new RegExp('--(np|nd) \"[\\$%]' + SkipPathVariableName + '%?"', 'g'), skipPathArgs);
    return commandLine;
}

export function getFindingCommandByCurrentWord(toRunInTerminal: boolean, findCmd: FindCommandType, searchText: string,
    parsedFile: path.ParsedPath, rawSearchText: string = '', ranker: Ranker | undefined, onlyRemoveJump: boolean = false): string {
    const extension = getExtensionNoHeadDot(parsedFile.ext);
    const mappedExt = FileExtensionToMappedExtensionMap.get(extension) || extension;
    const repoFolder = getRepoFolder(toPath(parsedFile), true) || '.';
    const repoFolderName = getRepoFolderName(repoFolder, true);
    const repoFolderOsPath = toTerminalPath(repoFolder);
    const shouldChangeFolder = repoFolderOsPath.startsWith('/') && toRunInTerminal && IsLinuxTerminalOnWindows && SearchConfig.SearchRelativePathForLinuxTerminalsOnWindows;
    const findCmdText = FindCommandType[findCmd];
    function changeSearchFolderInCommand(command: string): string {
        if (shouldChangeFolder) {
            const pattern = new RegExp(' (-r?p) ' + repoFolderOsPath);
            command = command.replace(pattern, ' $1 .');
            command = command.replace(/ -W /, ' ');
        }

        return command;
    }

    if (findCmdText.includes('Sort')) {
        const command = getSortCommandText(toRunInTerminal, true, false, findCmd, repoFolder);
        return changeSearchFolderInCommand(command);
    }

    if (findCmdText.includes('Top')) {
        const command = getFindTopDistributionCommand(toRunInTerminal, true, false, findCmd, repoFolder);
        return changeSearchFolderInCommand(command);
    }

    if (searchText.length < 2) {
        return '';
    }

    const terminalType = !toRunInTerminal && isLinuxTerminalOnWindows() ? TerminalType.CMD : DefaultTerminalType;
    const parsedFilePath = toPath(parsedFile);
    const osFilePath = toTerminalPath(parsedFilePath, terminalType);
    const useExtraPaths = 'true' === getConfigValueByProjectAndExtension(repoFolderName, extension, mappedExt, 'findingCommands.useExtraPaths');
    const searchPathsOptions = getSearchPathOptions(toRunInTerminal, true, parsedFilePath, mappedExt, FindCommandType.RegexFindAsClassOrMethodDefinitionInCodeFiles === findCmd, useExtraPaths, useExtraPaths);
    const sourceProjectFolders = searchPathsOptions.replace(/-r?p\s+("[^"]+"|\S+).*/, '$1').trim();

    if (FindCommandType.MyFindOrReplaceSelectedText === findCmd) {
        let commandLine = getConfigValueByProjectAndExtension(repoFolderName, extension, mappedExt, 'myFindOrReplaceSelectedTextCommand', true, true);
        if (isNullOrEmpty(commandLine)) {
            const configNameSet = new Set<string>()
                .add(`msr.${extension}.myFindOrReplaceSelectedTextCommand`)
                .add(`msr.${mappedExt}.myFindOrReplaceSelectedTextCommand`)
                .add(`msr.${repoFolderName}.${extension}.myFindOrReplaceSelectedTextCommand`)
                .add(`msr.${repoFolderName}.${mappedExt}.myFindOrReplaceSelectedTextCommand`);

            const warningCommand = `echo Please add any of following ${configNameSet.size} configs in user settings: ${Array.from(configNameSet).join(', ')} reference existing config examples or doc.You can also hide this menu by unchecking msr.myFindOrReplaceSelectedTextCommand.menu.visible or set it to false.| msr - aPA - e "\\w*\\.(\\w+)" - x Examples - i - t "please.*?(Any).*?:|Hide.*?menu|msr.\\S+visible|false"`;
            runRawCommandInTerminal(AddKeepColorArg(AddOutputToStderrArg(warningCommand)));
            return '';
        }

        const escapedText = escapeRegExpForFindingCommand(searchText);
        commandLine = commandLine.replace(/\s+(--nt|-t|--text-match)(\s+\S*)%~?1/g, ` $1$2${escapedText}`);
        commandLine = commandLine.replace(/\s+(--nt|-t|--text-match)(\s+["'][^"']*)%~?1/g, ` $1$2${escapedText}`);
        commandLine = replaceSearchTextHolder(commandLine, searchText).trim();
        if (IsWindowsTerminalOnWindows) {
            // commandLine = commandLine.replace(new RegExp('/tmp/', 'g'), TempStorageFolder + '\\');
            commandLine = commandLine.replace(new RegExp('/tmp/', 'g'), '%TMP%' + '\\');
        }
        return setCustomSearchCommand(sourceProjectFolders, parsedFile, searchText, commandLine);
    }

    const isFindDefinition = findCmdText.includes('Definition');
    const isFindReference = findCmdText.includes('Reference');
    const isFindPlainText = findCmdText.includes('FindPlainText');
    const isFindInCurrentFile = findCmdText.includes('InCurrentFile');
    rawSearchText = rawSearchText.length < 1 ? searchText : rawSearchText;

    let extraOptions = isFindDefinition
        ? getConfigValueByAllParts(repoFolderName, extension, mappedExt, 'definition', 'extraOptions')
        : (isFindReference
            ? getConfigValueByAllParts(repoFolderName, extension, mappedExt, 'reference', 'extraOptions')
            : getConfigValueByProjectAndExtension(repoFolderName, extension, mappedExt, 'extraOptions')
        );

    let searchPattern = '';
    if (isFindDefinition) {
        searchPattern = getConfigValueByProjectAndExtension(repoFolderName, extension, mappedExt, 'definition');
    } else {
        searchPattern = isFindReference
            ? getConfigValueByProjectAndExtension(repoFolderName, extension, mappedExt, 'reference')
            : '';
    }

    if (isFindReference) {
        if (searchText.startsWith('\\b') && searchText.endsWith('\\b')) {
            searchPattern = searchPattern.substring(2, searchPattern.length - 2);
        }
        else {
            if (/^\W/.test(searchText) && searchPattern.startsWith('\\b')) {
                searchPattern = searchPattern.substring(2);
            }

            if (/\W$/.test(searchText) && searchPattern.endsWith('\\b')) {
                searchPattern = searchPattern.substring(0, searchPattern.length - 2);
            }
        }
    }

    let skipTextPattern = isFindDefinition
        ? getConfigValueByProjectAndExtension(repoFolderName, extension, mappedExt, 'skip.definition')
        : (isFindReference
            ? getConfigValueByProjectAndExtension(repoFolderName, extension, mappedExt, 'skip.reference')
            : ''
        );

    let filePattern = '';

    switch (findCmd) {
        case FindCommandType.RegexFindDefinitionInCurrentFile:
            let definitionPatterns = new Set<string>();
            const useDefaultValues = [false, true];
            for (let k = 0; k < useDefaultValues.length; k++) {
                const allowEmpty = k === 0;
                definitionPatterns.add(getConfigValueByProjectAndExtension(repoFolderName, extension, mappedExt, 'class.definition', allowEmpty, useDefaultValues[k]))
                    .add(getConfigValueByProjectAndExtension(repoFolderName, extension, mappedExt, 'member.definition', allowEmpty, useDefaultValues[k]))
                    .add(getConfigValueByProjectAndExtension(repoFolderName, extension, mappedExt, 'constant.definition', allowEmpty, useDefaultValues[k]))
                    .add(getConfigValueByProjectAndExtension(repoFolderName, extension, mappedExt, 'enum.definition', allowEmpty, useDefaultValues[k]))
                    .add(getConfigValueByProjectAndExtension(repoFolderName, extension, mappedExt, 'method.definition', allowEmpty, useDefaultValues[k]));

                definitionPatterns.delete('');
                if (definitionPatterns.size < 1) {
                    definitionPatterns.add((getConfigValueByProjectAndExtension(repoFolderName, extension, mappedExt, 'definition', allowEmpty, useDefaultValues[k])));
                    definitionPatterns.delete('');
                }
                if (definitionPatterns.size > 0) {
                    break;
                }
            }

            searchPattern = Array.from(definitionPatterns).join('|');
            skipTextPattern = ranker ? ranker.getSkipPatternForDefinition() : getConfigValueByProjectAndExtension(repoFolderName, extension, mappedExt, 'skip.definition');
            break;

        case FindCommandType.RegexFindReferencesInCurrentFile:
            skipTextPattern = '';
            break;

        case FindCommandType.RegexFindAsClassOrMethodDefinitionInCodeFiles:
        case FindCommandType.RegexFindReferencesInCodeFiles:
        case FindCommandType.FindPlainTextInCodeFiles:
        case FindCommandType.RegexFindPureReferencesInCodeFiles:
            filePattern = MyConfig.CodeFilesPlusUIRegex.source;
            break;

        case FindCommandType.RegexFindReferencesInDocs:
        case FindCommandType.FindPlainTextInDocFiles:
            filePattern = getConfigValueOfProject(repoFolderName, 'docFiles') as string;
            break;

        case FindCommandType.RegexFindReferencesInConfigFiles:
        case FindCommandType.FindPlainTextInConfigFiles:
            filePattern = getConfigValueOfProject(repoFolderName, 'configFiles') as string;
            break;

        case FindCommandType.RegexFindReferencesInCodeAndConfig:
        case FindCommandType.FindPlainTextInConfigAndConfigFiles:
            filePattern = MyConfig.CodeAndConfigRegex.source;
            break;

        case FindCommandType.RegexFindReferencesInSameTypeFiles:
            filePattern = getFileNamePattern(parsedFile);
            break;

        case FindCommandType.RegexFindReferencesInAllSourceFiles:
        case FindCommandType.FindPlainTextInAllSourceFiles:
        case FindCommandType.RegexFindPureReferencesInAllSourceFiles:
            filePattern = MyConfig.AllFilesRegex.source;
            break;

        case FindCommandType.RegexFindReferencesInAllSmallFiles:
        case FindCommandType.FindPlainTextInAllSmallFiles:
        default:
            filePattern = '';
            const smallFileExtraOptions = isFindReference
                ? getConfigValueByAllParts(repoFolderName, extension, mappedExt, 'reference', 'allSmallFiles.extraOptions')
                : getConfigValueByProjectAndExtension(repoFolderName, extension, mappedExt, 'allSmallFiles.extraOptions');
            if (!isNullOrEmpty(smallFileExtraOptions)) {
                extraOptions = smallFileExtraOptions;
            }
            break;
    }

    // if (!isSorting && ('.' + extension).match(new RegExp(getConfigValueOfProject(repoFolderName, 'scriptFiles') as string))) {
    //     filePattern = (MappedExtToCodeFilePatternMap.get(mappedExt) || getConfigValueOfProject(repoFolderName, 'scriptFiles')) as string;
    // }

    if (isFindInCurrentFile && !isNullOrEmpty(extraOptions)) {
        extraOptions = extraOptions.replace(/--[ws][12]\s+("[^"]*"|\S+)(\s+|$)/g, '').trim();
    }

    if (TerminalType.CMD !== DefaultTerminalType) {
        // escape double quoted variables
        if (isFindPlainText) {
            if (!IsWindowsTerminalOnWindows) {
                rawSearchText = rawSearchText.replace(/(\$\w+)/g, '\\$1');
            }
        } else {
            if (!IsWindowsTerminalOnWindows) {
                searchText = searchText.replace(/(\$)/g, '\\\\$1')
            }
        }
    }

    if (isFindPlainText) {
        searchPattern = ' -x "' + rawSearchText.replace(/"/g, '\\"') + '"';
        skipTextPattern = '';
    } else if (searchPattern.length > 0) {
        searchPattern = ' -t "' + searchPattern + '"';
    }

    // FindCommandType.RegexFindPureReferencesInCodeFiles || FindCommandType.RegexFindPureReferencesInAllSourceFiles
    if (findCmdText.includes('RegexFindPureReference')) {
        const skipPattern = getConfigValueByProjectAndExtension(repoFolderName, extension, mappedExt, 'skip.pureReference', true).trim();
        if (skipPattern.length > 0 && /\s+--nt\s+/.test(searchPattern) !== true) {
            skipTextPattern = skipPattern;
        }
    }

    if (filePattern.length > 0) {
        filePattern = ' -f "' + filePattern + '"';
    }

    const filePath = quotePaths(osFilePath);
    const oneFilePath = osFilePath.startsWith(DefaultWorkspaceFolder) ? replaceToRelativeSearchPath(toRunInTerminal, filePath, repoFolder) : filePath;

    if (skipTextPattern && skipTextPattern.length > 1) {
        skipTextPattern = ' --nt "' + skipTextPattern + '"';
    }

    if (!isNullOrEmpty(extraOptions)) {
        extraOptions = setOutputColumnIndexInCommandLine(extraOptions);
        extraOptions = ' ' + extraOptions.trimLeft();
    }

    let command = '';
    if (findCmd === FindCommandType.RegexFindDefinitionInCurrentFile) {
        if (mappedExt === 'ui' && searchPattern.indexOf('|let|') < 0) {
            searchPattern = searchPattern.replace('const|', 'const|let|');
        }

        command = MsrExe + ' -p ' + oneFilePath + skipTextPattern + extraOptions + ' ' + searchPattern.trimLeft();
    }
    else if (findCmd === FindCommandType.RegexFindReferencesInCurrentFile) {
        command = MsrExe + ' -p ' + oneFilePath + ' -e "\\b((public)|protected|private|internal|(static)|(readonly|const|let))\\b"' + skipTextPattern + extraOptions + ' ' + searchPattern;
    } else {
        command = MsrExe + ' ' + searchPathsOptions + filePattern + skipTextPattern + extraOptions + ' ' + searchPattern.trimLeft();
    }

    if (!NormalTextRegex.test(rawSearchText)) {
        command = removeSearchTextForCommandLine(command);
    }

    command = replaceSearchTextHolder(command, searchText).trim();
    command = command.replace(onlyRemoveJump ? RemoveJumpRegex : SkipJumpOutForHeadResultsRegex, ' ').trim();
    command = enableColorAndHideCommandLine(command);
    command = changeSearchFolderInCommand(command);
    return command;
}