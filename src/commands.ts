import * as vscode from 'vscode';
import { checkAndDownloadTool, MsrExe } from './checkTool';
import { HomeFolder, SearchTextHolderReplaceRegex, SkipJumpOutForHeadResultsRegex } from './constants';
import { FileExtensionToMappedExtensionMap, getConfig, getConfigValue, getOverrideConfigByPriority, getRootFolder, getRootFolderExtraOptions, getRootFolderName, getSearchPathOptions, getSubConfigValue, removeSearchTextForCommandLine } from './dynamicConfig';
import { FindCommandType } from './enums';
import { enableColorAndHideCommandLine, outputDebug, outputInfo, runCommandInTerminal } from './outputUtils';
import { SearchProperty } from './ranker';
import { escapeRegExp, NormalTextRegex } from './regexUtils';
import { DefaultTerminalType, getCurrentWordAndText, getExtensionNoHeadDot, isNullOrEmpty, nowText, quotePaths, replaceTextByRegex, toOsPath, toPath } from './utils';
import path = require('path');

const ReplaceSearchPathRegex = /-r?p\s+\S+|-r?p\s+\".+?\"/;

function replaceSearchPathToDot(searchPathsOptions: string): string {
    return replaceTextByRegex(searchPathsOptions, ReplaceSearchPathRegex, '-rp .');
}

export function runFindingCommand(findCmd: FindCommandType, textEditor: vscode.TextEditor) {
    const RootConfig = vscode.workspace.getConfiguration('msr');
    if (RootConfig.get('enable.findingCommands') as boolean !== true) {
        outputDebug(nowText() + 'Your extension "vscode-msr": finding-commands is disabled by setting of `msr.enable.findingCommands`.');
    }

    const findCmdText = FindCommandType[findCmd];
    const [currentWord] = getCurrentWordAndText(textEditor.document, textEditor.selection.active, textEditor);
    const rawSearchText = currentWord;
    const searchText = findCmdText.match(/Regex/i) ? escapeRegExp(rawSearchText) : rawSearchText;

    const parsedFile = path.parse(textEditor.document.fileName);
    let command = getFindingCommandByCurrentWord(findCmd, searchText, parsedFile, rawSearchText, undefined);
    if (findCmdText.includes('FindTop')) {
        const [hasGotExe, ninExePath] = checkAndDownloadTool('nin');
        if (!hasGotExe) {
            outputInfo(nowText() + 'Not found nin to run ' + findCmdText + ' command:\n' + command, true);
            return;
        } else if (!isNullOrEmpty(ninExePath)) {
            const folder = path.dirname(ninExePath);
            if (folder === HomeFolder) {
                command = command.replace(/\s*\|\s*nin\s+/, ' | ' + ninExePath + ' ');
            }
        }
    }

    runCommandInTerminal(command, true, getConfig().ClearTerminalBeforeExecutingCommands);
}

export function runFindingCommandByCurrentWord(findCmd: FindCommandType, searchText: string, parsedFile: path.ParsedPath, rawSearchText: string = '') {
    const command = getFindingCommandByCurrentWord(findCmd, searchText, parsedFile, rawSearchText, undefined);
    const myConfig = getConfig();
    runCommandInTerminal(command, !myConfig.IsQuiet, myConfig.ClearTerminalBeforeExecutingCommands);
}

export function getSortCommandText(useProjectSpecific: boolean, addOptionalArgs: boolean, findCmd: FindCommandType, rootFolder = '', isCookingCmdAlias = false): string {
    const findCmdText = FindCommandType[findCmd];
    if (isNullOrEmpty(rootFolder) && useProjectSpecific) {
        rootFolder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
            ? vscode.workspace.workspaceFolders[0].uri.fsPath
            : '.';
    }

    const rootFolderName = getRootFolderName(rootFolder, useProjectSpecific);
    const folderKey = useProjectSpecific ? rootFolderName : 'default';
    let filePattern = '';
    if (findCmdText.includes('SortSource')) {
        filePattern = getOverrideConfigByPriority([folderKey, 'default'], 'allFiles');
    } else if (findCmdText.includes('SortCode')) {
        filePattern = getOverrideConfigByPriority([folderKey, 'default'], 'codeFiles');
    }

    if (!isNullOrEmpty(filePattern)) {
        filePattern = ' -f "' + filePattern + '"';
    }

    const optionalArgs = addOptionalArgs ? ' $*' : '';
    let extraOptions = ' ' + getRootFolderExtraOptions(folderKey);
    extraOptions += (findCmdText.match(/BySize/i) ? '--sz --wt' : '--wt --sz');
    extraOptions += ' ' + getOverrideConfigByPriority([folderKey, 'default'], 'listSortingFilesOptions') as string || '-l -H 10 -T 10';

    let searchPathsOptions = getSearchPathOptions(useProjectSpecific, rootFolder, '', FindCommandType.RegexFindDefinitionInCodeFiles === findCmd);

    if (isCookingCmdAlias) {
        extraOptions = replaceTextByRegex(extraOptions, /(^|\s+)(-[lICc]\s+|-[HT]\s*\d+)/, ' ');
        extraOptions = replaceTextByRegex(extraOptions, /(^|\s+)(--s[12])\s+\S+\s*/, ' ');
        extraOptions = extraOptions.trim() + ' -l' + optionalArgs;
        searchPathsOptions = replaceSearchPathToDot(searchPathsOptions);
    }

    extraOptions = extraOptions.trim();
    const command = MsrExe + ' ' + searchPathsOptions + filePattern + ' ' + extraOptions.trim();
    return command.trimRight();
}

export function getFindTopDistributionCommand(useProjectSpecific: boolean, addOptionalArgs: boolean, findCmd: FindCommandType, rootFolder = ''): string {
    const findCmdText = FindCommandType[findCmd];
    if (isNullOrEmpty(rootFolder) && useProjectSpecific) {
        rootFolder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
            ? vscode.workspace.workspaceFolders[0].uri.fsPath
            : '.';
    }

    const rootFolderName = getRootFolderName(rootFolder, useProjectSpecific);
    const folderKey = useProjectSpecific ? rootFolderName : 'default';
    let filePattern = '';
    if (findCmdText.includes('TopSource')) {
        filePattern = getOverrideConfigByPriority([folderKey, 'default'], 'allFiles');
    } else if (findCmdText.includes('TopCode')) {
        filePattern = getOverrideConfigByPriority([folderKey, 'default'], 'codeFiles');
    }

    if (!isNullOrEmpty(filePattern)) {
        filePattern = ' -f "' + filePattern + '"';
    }

    const optionalArgs = addOptionalArgs ? ' $*' : '';
    const extraOptions = "-l -PAC --xd -k 18";
    const useExtraPaths = 'true' === getConfigValue(folderKey, '', '', 'findingCommands.useExtraPaths');
    let searchPathsOptions = getSearchPathOptions(useProjectSpecific, rootFolder, '', FindCommandType.RegexFindDefinitionInCodeFiles === findCmd, useExtraPaths, useExtraPaths);
    searchPathsOptions = replaceSearchPathToDot(searchPathsOptions);
    let command = MsrExe + ' ' + searchPathsOptions + filePattern + ' ' + extraOptions.trim();
    if (findCmdText.includes('Folder')) {
        command += ' | nin nul "^([^\\\\/]+)[\\\\/]" -p -d ' + optionalArgs;
    } else {
        command += ' | nin nul "\\.(\\w+)$" -p -d ' + optionalArgs;
    }

    return command.trimRight();
}

export function getFindingCommandByCurrentWord(findCmd: FindCommandType, searchText: string, parsedFile: path.ParsedPath, rawSearchText: string = '', ranker: SearchProperty | undefined): string {
    const extension = getExtensionNoHeadDot(parsedFile.ext);
    const mappedExt = FileExtensionToMappedExtensionMap.get(extension) || extension;
    const rootFolder = getRootFolder(toPath(parsedFile), true) || '.';
    const rootFolderName = getRootFolderName(rootFolder, true);
    const findCmdText = FindCommandType[findCmd];

    if (findCmdText.includes('Sort')) {
        return getSortCommandText(true, false, findCmd, rootFolder);
    }

    if (findCmdText.includes('Top')) {
        return getFindTopDistributionCommand(true, false, findCmd, rootFolder);
    }

    if (searchText.length < 2) {
        return '';
    }

    rawSearchText = rawSearchText.length < 1 ? searchText : rawSearchText;

    const isFindDefinition = findCmdText.indexOf('Definition') >= 0;
    const isFindReference = findCmdText.indexOf('Reference') >= 0;
    const isFindPlainText = findCmdText.indexOf('FindPlainText') >= 0;

    let extraOptions = isFindDefinition
        ? getSubConfigValue(rootFolderName, extension, mappedExt, 'definition', 'extraOptions')
        : (isFindReference
            ? getSubConfigValue(rootFolderName, extension, mappedExt, 'reference', 'extraOptions')
            : getConfigValue(rootFolderName, extension, mappedExt, 'extraOptions')
        );

    let searchPattern = isFindDefinition
        ? getConfigValue(rootFolderName, extension, mappedExt, 'definition')
        : (isFindReference
            ? getConfigValue(rootFolderName, extension, mappedExt, 'reference')
            : ''
        );

    if (isFindReference) {
        if (/^\W/.test(searchText) && searchPattern.startsWith('\\b')) {
            searchPattern = searchPattern.substring(2);
        }

        if (/\W$/.test(searchText) && searchPattern.endsWith('\\b')) {
            searchPattern = searchPattern.substring(0, searchPattern.length - 2);
        }
    }

    let skipTextPattern = isFindDefinition
        ? getConfigValue(rootFolderName, extension, mappedExt, 'skip.definition')
        : (isFindReference
            ? getConfigValue(rootFolderName, extension, mappedExt, 'skip.reference')
            : ''
        );

    let filePattern = '';

    switch (findCmd) {
        case FindCommandType.RegexFindDefinitionInCurrentFile:
            let definitionPatterns = new Set<string>();
            const useDefaultValues = [false, true];
            for (let k = 0; k < useDefaultValues.length; k++) {
                const allowEmpty = k === 0;
                definitionPatterns.add(getConfigValue(rootFolderName, extension, mappedExt, 'class.definition', allowEmpty, useDefaultValues[k]))
                    .add(getConfigValue(rootFolderName, extension, mappedExt, 'member.definition', allowEmpty, useDefaultValues[k]))
                    .add(getConfigValue(rootFolderName, extension, mappedExt, 'constant.definition', allowEmpty, useDefaultValues[k]))
                    .add(getConfigValue(rootFolderName, extension, mappedExt, 'enum.definition', allowEmpty, useDefaultValues[k]))
                    .add(getConfigValue(rootFolderName, extension, mappedExt, 'method.definition', allowEmpty, useDefaultValues[k]));

                definitionPatterns.delete('');
                if (definitionPatterns.size < 1) {
                    definitionPatterns.add((getConfigValue(rootFolderName, extension, mappedExt, 'definition', allowEmpty, useDefaultValues[k])));
                    definitionPatterns.delete('');
                }
                if (definitionPatterns.size > 0) {
                    break;
                }
            }

            searchPattern = Array.from(definitionPatterns).join('|');
            skipTextPattern = ranker ? ranker.getSkipPatternForDefinition() : getConfigValue(rootFolderName, extension, mappedExt, 'skip.definition');
            break;

        case FindCommandType.RegexFindReferencesInCurrentFile:
            skipTextPattern = '';
            break;

        case FindCommandType.RegexFindDefinitionInCodeFiles:
        case FindCommandType.RegexFindReferencesInCodeFiles:
        case FindCommandType.FindPlainTextInCodeFiles:
        case FindCommandType.RegexFindPureReferencesInCodeFiles:
            filePattern = getOverrideConfigByPriority([rootFolderName, 'default'], 'codeFilesPlusUI') as string;
            break;

        case FindCommandType.RegexFindReferencesInDocs:
        case FindCommandType.FindPlainTextInDocFiles:
            filePattern = getOverrideConfigByPriority([rootFolderName, 'default'], 'docFiles') as string;
            break;

        case FindCommandType.RegexFindReferencesInConfigFiles:
        case FindCommandType.FindPlainTextInConfigFiles:
            filePattern = getOverrideConfigByPriority([rootFolderName, 'default'], 'configFiles') as string;
            break;

        case FindCommandType.RegexFindReferencesInCodeAndConfig:
        case FindCommandType.FindPlainTextInConfigAndConfigFiles:
            filePattern = getOverrideConfigByPriority([rootFolderName, 'default'], 'codeAndConfig') as string;
            break;

        case FindCommandType.RegexFindReferencesInAllProjectFiles:
        case FindCommandType.FindPlainTextInAllProjectFiles:
            filePattern = getOverrideConfigByPriority([rootFolderName, 'default'], 'allFiles') as string;
            break;

        case FindCommandType.RegexFindReferencesInAllSmallFiles:
        case FindCommandType.FindPlainTextInAllSmallFiles:
        default:
            filePattern = '';
            const smallFileExtraOptions = isFindReference
                ? getSubConfigValue(rootFolderName, extension, mappedExt, 'reference', 'allSmallFiles.extraOptions')
                : getConfigValue(rootFolderName, extension, mappedExt, 'allSmallFiles.extraOptions');
            if (!isNullOrEmpty(smallFileExtraOptions)) {
                extraOptions = smallFileExtraOptions;
            }
            break;
    }

    // if (!isSorting && ('.' + extension).match(new RegExp(getOverrideConfigByPriority([rootFolderName, 'default'], 'scriptFiles') as string))) {
    //     filePattern = (MappedExtToCodeFilePatternMap.get(mappedExt) || getOverrideConfigByPriority([rootFolderName, 'default'], 'scriptFiles')) as string;
    // }

    if (isFindPlainText) {
        searchPattern = ' -x "' + rawSearchText.replace(/"/g, '\\"') + '"';
        skipTextPattern = '';
    } else if (searchPattern.length > 0) {
        searchPattern = ' -t "' + searchPattern + '"';
    }

    if (findCmd === FindCommandType.RegexFindPureReferencesInCodeFiles) {
        const skipPattern = getConfigValue(rootFolderName, extension, mappedExt, 'skip.pureReference', true).trim();
        if (skipPattern.length > 0 && /\s+--nt\s+/.test(searchPattern) !== true) {
            skipTextPattern = skipPattern;
        }
    }

    const parsedFilePath = toPath(parsedFile);
    const osFilePath = toOsPath(parsedFilePath, DefaultTerminalType);
    const useExtraPaths = 'true' === getConfigValue(rootFolderName, extension, mappedExt, 'findingCommands.useExtraPaths');
    const searchPathsOptions = getSearchPathOptions(true, parsedFilePath, mappedExt, FindCommandType.RegexFindDefinitionInCodeFiles === findCmd, useExtraPaths, useExtraPaths);

    if (filePattern.length > 0) {
        filePattern = ' -f "' + filePattern + '"';
    }

    const filePath = quotePaths(osFilePath);

    if (skipTextPattern && skipTextPattern.length > 1) {
        skipTextPattern = ' --nt "' + skipTextPattern + '"';
    }

    if (!isNullOrEmpty(extraOptions)) {
        extraOptions = ' ' + extraOptions;
    }

    let command = '';
    if (findCmd === FindCommandType.RegexFindDefinitionInCurrentFile) {
        if (mappedExt === 'ui' && searchPattern.indexOf('|let|') < 0) {
            searchPattern = searchPattern.replace('const|', 'const|let|');
        }

        command = MsrExe + ' -p ' + filePath + skipTextPattern + extraOptions + ' ' + searchPattern;
    }
    else if (findCmd === FindCommandType.RegexFindReferencesInCurrentFile) {
        command = MsrExe + ' -p ' + filePath + ' -e "\\b((public)|protected|private|internal|(static)|(readonly|const|let))\\b"' + skipTextPattern + extraOptions + ' ' + searchPattern;
    } else {
        command = MsrExe + ' ' + searchPathsOptions + filePattern + skipTextPattern + extraOptions + ' ' + searchPattern;
    }

    if (!NormalTextRegex.test(rawSearchText)) {
        command = removeSearchTextForCommandLine(command);
    }

    command = command.replace(SearchTextHolderReplaceRegex, searchText).trim();
    command = command.replace(SkipJumpOutForHeadResultsRegex, ' ').trim();
    command = enableColorAndHideCommandLine(command);

    return command;
}
