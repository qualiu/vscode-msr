'use strict';

import * as vscode from 'vscode';
import path = require('path');
import fs = require('fs');
import { outputDebug, enableColorAndHideCommandline, outputInfo, outputError, runCommandInTerminal, MessageLevel, outputKeyInfo, outputMessage, clearOutputChannel } from './outputUtils';
import { IsWindows, HomeFolder } from './checkTool';
import { getNoDuplicateStringSet, replaceTextByRegex, runCommandGetInfo, replaceText } from './utils';
import { createRegex } from './regexUtils';
import { isNullOrUndefined } from 'util';
import { stringify } from 'querystring';
import { execSync } from 'child_process';
import { fstat } from 'fs';

export const IsDebugMode = false; // process.execArgv && process.execArgv.length > 0 && process.execArgv.some((arg) => /^--debug=?/.test(arg) || /^--(debug|inspect)-brk=?/.test(arg));
export const ShouldQuotePathRegex = IsWindows ? /[^\w\.,\\/:-]/ : /[^\w\.,\\/-]/;
export const SearchTextHolder = '%1';
export const SearchTextHolderReplaceRegex = /%~?1/g;

export const GitFolderName = path.parse(vscode.workspace.rootPath || '.').base;

const SplitPathsRegex = /\s*[,;]\s*/;
const SplitPathGroupsRegex = /\s*;\s*/;
const FolderToPathPairRegex = /(\w+\S+?)\s*=\s*(\S+.+)$/;

let MyConfig: DynamicConfig;

export function removeSearchTextForCommandLine(cmd: string): string {
    return cmd.replace(/(\s+-c)\s+Search\s+%~?1/, '$1');
}

export class DynamicConfig {
    public RootConfig: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('msr');
    public RootPath: string = '';
    public ShowInfo: boolean = false;
    public IsQuiet: boolean = false;
    public IsDebug: boolean = false;
    public DescendingSortForConsoleOutput: boolean = false;
    public DescendingSortForVSCode: boolean = false;

    public DefaultMaxSearchDepth: number = 16;
    public NeedSortResults: boolean = false;

    public ReRunCmdInTerminalIfCostLessThan: number = 3.3;

    public ConfigAndDocFilesRegex: RegExp = new RegExp('to-load');
    public CodeAndConfigAndDocFilesRegex: RegExp = new RegExp('to-load');
    public DefaultConstantsRegex: RegExp = new RegExp('to-load');
    public SearchAllFilesWhenFindingReferences: boolean = false;
    public SearchAllFilesWhenFindingDefinitions: boolean = false;
    public GetSearchTextHolderInCommandLine: RegExp = /\s+-c\s+.*?%~?1/;
    public DisabledFileExtensionRegex: RegExp = new RegExp('to-load');
    public DisabledGitRootFolderNameRegex: RegExp = new RegExp('to-load');
    public DisableFindDefinitionFileExtensionRegex: RegExp = new RegExp('to-load');
    public RootFolderExtraOptions: string = '';
}

export function getConfig(reload: boolean = false): DynamicConfig {
    if (MyConfig && !reload) {
        return MyConfig;
    }

    MyConfig = new DynamicConfig();
    MyConfig.RootConfig = vscode.workspace.getConfiguration('msr');
    const rootConfig = MyConfig.RootConfig;

    MyConfig.RootPath = vscode.workspace.rootPath || '.';
    MyConfig.ShowInfo = rootConfig.get('showInfo') as boolean;
    MyConfig.IsQuiet = rootConfig.get('quiet') as boolean;
    MyConfig.IsDebug = IsDebugMode || rootConfig.get('debug') as boolean;
    MyConfig.DescendingSortForConsoleOutput = rootConfig.get('descendingSortForConsoleOutput') as boolean;
    MyConfig.DescendingSortForVSCode = rootConfig.get('descendingSortForVSCode') as boolean;
    MyConfig.DefaultMaxSearchDepth = parseInt(rootConfig.get('default.maxSearchDepth') || '0');
    MyConfig.NeedSortResults = rootConfig.get('default.sortResults') as boolean;
    MyConfig.ReRunCmdInTerminalIfCostLessThan = rootConfig.get('reRunSearchInTerminalIfCostLessThan') as number || 3.3;
    MyConfig.ConfigAndDocFilesRegex = new RegExp(rootConfig.get('default.configAndDocs') as string || '\\.(json|xml|ini|ya?ml|md)|readme', 'i');
    MyConfig.CodeAndConfigAndDocFilesRegex = new RegExp(rootConfig.get('default.codeAndConfigDocs') as string || '\\.(cs\\w*|nuspec|config|c[px]*|h[px]*|java|scala|py|go|php|vue|tsx?|jsx?|json|ya?ml|xml|ini|md)$|readme', 'i');
    MyConfig.DefaultConstantsRegex = new RegExp(rootConfig.get('default.isConstant') as string);
    MyConfig.SearchAllFilesWhenFindingReferences = rootConfig.get('default.searchAllFilesForReferences') as boolean;
    MyConfig.SearchAllFilesWhenFindingDefinitions = rootConfig.get('default.searchAllFilesForDefinitions') as boolean;
    MyConfig.DisabledGitRootFolderNameRegex = createRegex(rootConfig.get('disable.projectRootFolderNamePattern') as string);

    MyConfig.DisabledFileExtensionRegex = createRegex(rootConfig.get('disable.extensionPattern') as string, 'i', true);
    MyConfig.DisableFindDefinitionFileExtensionRegex = createRegex(rootConfig.get('disable.findDef.extensionPattern') as string, 'i', true);

    let folderExtraOptions = (rootConfig.get(GitFolderName + '.extraOptions') as string || '').trim();
    if (folderExtraOptions.length > 0) {
        folderExtraOptions += ' ';
    }

    MyConfig.RootFolderExtraOptions = folderExtraOptions;

    outputDebug('----- vscode-msr configuration loaded. -----');
    printConfigInfo(rootConfig);
    return MyConfig;
}

export function getOverrideConfigByPriority(priorityPrefixList: string[], configNameTail: string, allowEmpty: boolean = true): string {
    const RootConfig = vscode.workspace.getConfiguration('msr');
    for (let k = 0; k < priorityPrefixList.length; k++) {
        const name = (priorityPrefixList[k].length > 0 ? priorityPrefixList[k] + '.' : priorityPrefixList[k]) + configNameTail;
        let valueObject = RootConfig.get(name);
        if (valueObject === undefined || valueObject === null) {
            continue;
        }

        const valueText = String(valueObject);
        if (valueText.length > 0 || allowEmpty) {
            return valueText;
        }
    }

    return '';
}

export function getOverrideOrDefaultConfig(mappedExtOrFolderName: string, suffix: string, allowEmpty: boolean = true): string {
    return getOverrideConfigByPriority([mappedExtOrFolderName, 'default'], suffix, allowEmpty);
}

export function getSearchPathOptions(mappedExt: string,
    isFindingDefinition: boolean,
    useExtraSearchPathsForReference: boolean = true,
    useExtraSearchPathsForDefinition: boolean = true): string {

    const RootConfig = getConfig().RootConfig;
    const RootPath = vscode.workspace.rootPath || '.';
    const subName = isFindingDefinition ? 'definition' : 'reference';
    const skipFoldersPattern = getOverrideConfigByPriority([GitFolderName + '.' + subName + '.' + mappedExt, GitFolderName + '.' + subName, GitFolderName, mappedExt, 'default'], 'skipFolders');
    const skipFolderOptions = skipFoldersPattern.length > 1 ? ' --nd "' + skipFoldersPattern + '"' : '';
    if ((isFindingDefinition && !useExtraSearchPathsForDefinition) || (!isFindingDefinition && !useExtraSearchPathsForReference)) {
        return '-rp ' + RootPath + skipFolderOptions;
    }

    let extraSearchPathSet = getExtraSearchPathsOrFileLists('default.extraSearchPaths', GitFolderName);
    getExtraSearchPathsOrFileLists('default.extraSearchPathGroups', GitFolderName).forEach(a => extraSearchPathSet.add(a));
    splitPathList(RootConfig.get(GitFolderName + '.extraSearchPaths') as string).forEach((a => extraSearchPathSet.add(a)));

    let extraSearchPathFileListSet = getExtraSearchPathsOrFileLists('default.extraSearchPathListFiles', GitFolderName);
    getExtraSearchPathsOrFileLists('default.extraSearchPathListFileGroups', GitFolderName).forEach(a => extraSearchPathFileListSet.add(a));
    splitPathList(RootConfig.get(GitFolderName + '.extraSearchPathListFiles') as string).forEach((a => extraSearchPathFileListSet.add(a)));

    const thisTypeExtraSearchPaths = !isFindingDefinition ? new Set<string>() : getExtraSearchPathsOrFileLists(mappedExt + '.extraSearchPaths', GitFolderName);
    const thisTypeExtraSearchPathListFiles = !isFindingDefinition ? new Set<string>() : getExtraSearchPathsOrFileLists(mappedExt + '.extraSearchPathListFiles', GitFolderName);

    let searchPathSet = new Set<string>();
    searchPathSet.add(RootPath);
    thisTypeExtraSearchPaths.forEach(a => searchPathSet.add(a));
    extraSearchPathSet.forEach(a => searchPathSet.add(a));
    searchPathSet = getNoDuplicateStringSet(searchPathSet);

    let pathsText = Array.from(searchPathSet).join(',').replace(/"/g, '');
    if (ShouldQuotePathRegex.test(pathsText)) {
        pathsText = '"' + pathsText + '"';
    }

    let pathListFileSet = new Set<string>(thisTypeExtraSearchPathListFiles);
    extraSearchPathFileListSet.forEach(a => pathListFileSet.add(a));
    pathListFileSet = getNoDuplicateStringSet(extraSearchPathFileListSet);
    let pathFilesText = Array.from(pathListFileSet).join(',').replace(/"/g, '');
    if (ShouldQuotePathRegex.test(pathFilesText)) {
        pathFilesText = '"' + pathFilesText + '"';
    }

    const readPathListOptions = pathListFileSet.size > 0 ? ' -w "' + pathFilesText + '"' : '';
    return '-rp ' + pathsText + readPathListOptions + skipFolderOptions;
}

export function getExtraSearchPathsOrFileLists(configKey: string, folderName: string): Set<string> {
    let extraSearchPaths = new Set<string>();
    const RootConfig = getConfig().RootConfig || vscode.workspace.getConfiguration('msr');
    const extraPathObject = RootConfig.get(configKey);
    if (!extraPathObject) {
        return extraSearchPaths;
    }

    const valueType = typeof extraPathObject;
    let extraSearchPathGroups: string[] = [];
    if (valueType === 'string') {
        extraSearchPathGroups = (extraPathObject as string || '').trim().split(SplitPathGroupsRegex).filter(a => a.length > 0);
    } else {
        const pathArray = extraPathObject as string[];
        if (pathArray) {
            pathArray.forEach(a => {
                a.trim().split(SplitPathGroupsRegex).filter(a => a.length > 0).forEach(g => extraSearchPathGroups.push(a));
            });
        }
    }

    let folderNameToPathMap = new Map<string, string>();
    extraSearchPathGroups.forEach(a => {
        const m = FolderToPathPairRegex.exec(a);
        if (m) {
            folderNameToPathMap.set(m[1], m[2].trim());
        } else {
            a.split(SplitPathsRegex).forEach(p => {
                extraSearchPaths.add(p.trim());
            });
        }
    });

    const specificPaths = folderNameToPathMap.get(folderName) || '';
    splitPathList(specificPaths).forEach(a => extraSearchPaths.add(a));
    return getNoDuplicateStringSet(extraSearchPaths);
}

function splitPathList(pathListText: string) {
    let extraSearchPaths = new Set<string>();
    if (!pathListText) {
        return extraSearchPaths;
    }

    pathListText.split(SplitPathsRegex).forEach(a => {
        extraSearchPaths.add(a.trim());
    });

    extraSearchPaths = getNoDuplicateStringSet(extraSearchPaths);
    return extraSearchPaths;
}

export function printConfigInfo(config: vscode.WorkspaceConfiguration) {
    outputDebug('msr.enable.definition = ' + config.get('enable.definition'));
    outputDebug('msr.enable.reference = ' + config.get('enable.reference'));
    outputDebug('msr.enable.findingCommands = ' + config.get('enable.findingCommands'));
    outputDebug('msr.quiet = ' + config.get('quiet'));
    outputDebug('msr.debug = ' + config.get('debug'));
    outputDebug('msr.disable.extensionPattern = ' + config.get('disable.extensionPattern'));
    outputDebug('msr.disable.findDef.extensionPattern = ' + config.get('disable.findDef.extensionPattern'));
    outputDebug('msr.disable.projectRootFolderNamePattern = ' + config.get('disable.projectRootFolderNamePattern'));
}

export function cookShortcutCommandFile(useProjectSpecific: boolean, outputEveryScriptFile: boolean) {
    clearOutputChannel();
    const rootConfig = getConfig().RootConfig;
    const saveFolder = rootConfig.get('cmdAlias.saveFolder') as string || HomeFolder;
    const fileName = (useProjectSpecific ? GitFolderName + '.' : '') + 'msr-cmd-alias' + (IsWindows ? '.doskeys' : '.bashrc');
    const cmdAliasFile = path.join(saveFolder, fileName);

    const projectKey = useProjectSpecific ? GitFolderName : 'notUseProject';
    const configText = stringify(rootConfig);
    const configKeyHeads = new Set<string>(configText.split(/=(true|false)?(&|$)/));
    const skipFoldersPattern = getOverrideConfigByPriority([projectKey, 'default'], 'skipFolders') || '^([\\.\\$]|(Release|Debug|objd?|bin|node_modules|static|dist|target|(Js)?Packages|\\w+-packages?)$|__pycache__)';

    const fileTypes = ['cpp', 'cs', 'py', 'java', 'go', 'php', 'ui', 'scriptFiles', 'configFiles', 'docFiles'];
    const findTypes = ['definition', 'reference'];

    let cmdAliasMap = outputEveryScriptFile ? new Map<string, string>() : getExistingCmdAlias();
    const oldCmdCount = cmdAliasMap.size;

    let commands: string[] = [];
    fileTypes.forEach(ext => {
        if (!configKeyHeads.has(ext)) {
            return;
        }

        let cmdName = 'find-' + ext.replace('Files', '');
        const filePattern = getOverrideConfigByPriority([projectKey + '.' + ext, ext], 'codeFiles');

        // msr.definition.extraOptions msr.default.extraOptions
        const extraOption = addFullPathHideWarningOption(getOverrideConfigByPriority([projectKey + '.' + ext, projectKey, 'default'], 'extraOptions'));

        let body = 'msr -rp . --nd "' + skipFoldersPattern + '" -f "' + filePattern + '" ' + extraOption;
        commands.push(getCommandAlias(cmdName, body, false));

        findTypes.forEach(fd => {
            // msr.cpp.member.definition msr.py.class.definition msr.default.class.definition msr.default.definition
            let searchPattern = getOverrideConfigByPriority([projectKey + '.' + ext, projectKey, 'default'], fd);
            if (searchPattern.length > 0) {
                searchPattern = ' -t "' + searchPattern + '"';
            }

            // msr.cpp.member.skip.definition  msr.cpp.skip.definition msr.default.skip.definition 
            let skipPattern = getOverrideConfigByPriority([projectKey + '.' + ext, projectKey, 'default'], 'skip.' + fd);
            if (skipPattern.length > 0) {
                skipPattern = ' --nt "' + skipPattern + '"';
            }

            const newBody = body + skipPattern + searchPattern;
            commands.push(getCommandAlias(cmdName + '-' + fd.replace(/^(.{3}).*/, '$1'), newBody, true));
        });
    });

    // find-def  find-ref
    findTypes.forEach(fd => {
        const cmdName = 'find-' + fd.replace(/^(.{3}).*/, '$1');

        // msr.cpp.member.definition msr.py.class.definition msr.default.class.definition msr.default.definition
        let searchPattern = getOverrideConfigByPriority([projectKey, 'default'], fd);
        if (searchPattern.length > 0) {
            searchPattern = ' -t "' + searchPattern + '"';
        }

        // msr.cpp.member.skip.definition  msr.cpp.skip.definition msr.default.skip.definition 
        let skipPattern = getOverrideConfigByPriority([projectKey, 'default'], 'skip.' + fd);
        if (skipPattern.length > 0) {
            skipPattern = ' --nt "' + skipPattern + '"';
        }

        const filePattern = getOverrideConfigByPriority([projectKey, 'default'], 'codeFiles');

        // msr.definition.extraOptions msr.default.extraOptions
        const extraOption = addFullPathHideWarningOption(getOverrideConfigByPriority([projectKey, 'default'], 'extraOptions'));

        let body = 'msr -rp . --nd "' + skipFoldersPattern + '" -f "' + filePattern + '" ' + extraOption;
        body += skipPattern + searchPattern;
        commands.push(getCommandAlias(cmdName, body, true));
    });

    // msr.cpp.member.definition msr.py.class.definition msr.default.class.definition msr.default.definition
    const additionlFileTypes = ['allFiles', 'docFiles', 'configFiles', 'scriptFiles'];
    additionlFileTypes.forEach(fp => {
        const filePattern = getOverrideConfigByPriority([projectKey, 'default'], fp);

        // find-all
        const cmdName = 'find-' + fp.replace(/[A-Z]\w*$/, '');

        // msr.definition.extraOptions msr.default.extraOptions
        const extraOption = addFullPathHideWarningOption(getOverrideConfigByPriority([projectKey, 'default'], 'extraOptions'));
        let body = 'msr -rp . --nd "' + skipFoldersPattern + '" -f "' + filePattern + '" ' + extraOption;

        commands.push(getCommandAlias(cmdName, body, true));
    });

    // find-nd find-code find-ndp find-small find-all
    const allCodeFilePattern = getOverrideConfigByPriority([projectKey, 'default', ''], 'codeFiles');
    const extraOption = addFullPathHideWarningOption(getOverrideConfigByPriority([projectKey, 'default'], 'extraOptions'));
    commands.push(getCommandAlias('find-nd', 'msr -rp . --nd "' + skipFoldersPattern + '" ', false));
    commands.push(getCommandAlias('find-ndp', 'msr -rp %1 --nd "' + skipFoldersPattern + '" ', false));
    commands.push(getCommandAlias('find-code', 'msr -rp . --nd "' + skipFoldersPattern + '" -f "' + allCodeFilePattern + '" ' + extraOption, false));

    const allSmallFilesOptions = getOverrideConfigByPriority([projectKey, 'default', ''], 'allSmallFiles.extraOptions');
    commands.push(getCommandAlias('find-small', 'msr -rp . --nd "' + skipFoldersPattern + '" ' + allSmallFilesOptions, false));

    const quotedFile = ShouldQuotePathRegex.test(cmdAliasFile) ? '"' + cmdAliasFile + '"' : cmdAliasFile;
    if (IsWindows) {
        cmdAliasMap.set('alias', 'alias=doskey /macros 2>&1 | msr -PI -t "^($1)" $2 $3 $4 $5 $6 $7 $8 $9');
        cmdAliasMap.set('update-doskeys', 'update-doskeys=msr -p ' + quotedFile + ' -t .+ -o "doskey $0" --nt "\\s+&&?\\s+" -XA $*');
    }

    let allText = '';
    let failureCount = 0;
    const singleScriptFolder = path.join(saveFolder, 'cmdAlias');
    let failedToCreateSinlgeScriptFolder = false;
    if (outputEveryScriptFile && !fs.existsSync(singleScriptFolder)) {
        try {
            fs.mkdirSync(singleScriptFolder);
        } catch (err) {
            failedToCreateSinlgeScriptFolder = true;
            outputError('\n' + 'Failed to make single script folder: ' + singleScriptFolder + ' Error: ' + err.toString());
        }
    }

    cmdAliasMap.forEach((value, key, m) => {
        if (outputEveryScriptFile && !failedToCreateSinlgeScriptFolder && key.startsWith('find')) {
            const singleScriptPath = path.join(singleScriptFolder, IsWindows ? key + '.cmd' : key);
            try {
                fs.writeFileSync(singleScriptPath, value.trimRight() + (IsWindows ? '\r\n' : '\n'));
            } catch (err) {
                failureCount++;
                outputError('\n' + 'Failed to write single command alias script file:' + singleScriptPath + ' Error: ' + err.toString());
            }
        } else {
            allText += value + (IsWindows ? '\r\n\r\n' : '\n\n');
        }
    });

    if (outputEveryScriptFile) {
        if (failureCount < cmdAliasMap.size && !failedToCreateSinlgeScriptFolder) {
            outputCmdAliasGuide(saveFolder);
            let setPathCmd = 'msr -z "' + (IsWindows ? '%PATH%' : '$PATH') + '" -ix "' + singleScriptFolder + '" >' + (IsWindows ? 'nul' : '/dev/null') + ' && ';
            if (IsWindows) {
                setPathCmd += 'SET "PATH=%PATH%;' + singleScriptFolder + '"';
            } else {
                setPathCmd += 'export PATH=$PATH:' + singleScriptFolder;
            }

            runCommandInTerminal(setPathCmd, true, false);
            if (IsWindows) {
                runCommandInTerminal('where find-def.cmd', false, false);
                runCommandInTerminal('where find-def', false, false);
            } else {
                runCommandInTerminal('chmod +x ' + singleScriptFolder + '/find*', false, false);
                runCommandInTerminal('whereis find-def', false, false);
                runCommandInTerminal('whereis find-ref', false, false);
            }
        }

        if (failureCount > 0) {
            outputKeyInfo('Total = ' + cmdAliasMap.size + ', failures = ' + failureCount + ', made ' + (cmdAliasMap.size - failureCount) + ' command alias/doskey script files saved in: ' + singleScriptFolder);
        } else {
            outputKeyInfo('Successfully made ' + cmdAliasMap.size + ' command alias/doskey script files and saved in: ' + singleScriptFolder);
        }
    } else {
        try {
            fs.writeFileSync(cmdAliasFile, allText);
            outputCmdAliasGuide('');
            const existingInfo = IsWindows ? ' (existing = ' + oldCmdCount + ')' : '';
            outputKeyInfo('Successfully made ' + cmdAliasMap.size + existingInfo + ' command alias/doskey file and saved at: ' + cmdAliasFile);
            outputKeyInfo('To more freely use them (like in scripts or nested command line pipe): Press `F1` search `msr Cook` and choose cooking script files. (You can make menu `msr.cookCmdAliasFiles` visible).');
        } catch (err) {
            outputError('\n' + 'Failed to save command alias file: ' + cmdAliasFile + ' Error: ' + err.toString());
            return;
        }

        if (IsWindows) {
            runCommandInTerminal('doskey /MACROFILE="' + cmdAliasFile + '"');
            const regCmd = 'REG ADD "HKEY_CURRENT_USER\\Software\\Microsoft\\Command Processor" /v Autorun /d "DOSKEY /MACROFILE=\\"' + cmdAliasFile + '\\"" /f';
            runCommandInTerminal(regCmd, true, false);
            runCommandInTerminal('alias update', true, false);
        } else {
            runCommandInTerminal('source "' + quotedFile + '"');
            runCommandInTerminal('msr -p ~/.bashrc 2>/dev/null -x "' + quotedFile + '" -M && echo "source \\"' + quotedFile + '\\"" >> ~/.bashrc');
        }

        runCommandInTerminal('alias find-def', true, false);
    }

    function getCommandAlias(cmdName: string, body: string, useFunction: boolean): string {
        body = enableColorAndHideCommandline(body);
        // body = replaceTextByRegex(body, /\s+%~?1(\s+|$)/g, '').trimRight();

        const hasSearchTextHolder = /%~?1/.test(body);
        if (hasSearchTextHolder) {
            body = replaceTextByRegex(body.trimRight(), SearchTextHolderReplaceRegex, '$1');
        }

        const tailArgs = hasSearchTextHolder ? '$2 $3 $4 $5 $6 $7 $8 $9' : (IsWindows ? '$*' : '$@');

        let commandText = '';
        if (IsWindows) {
            if (outputEveryScriptFile) {
                commandText = '@' + body + ' ' + tailArgs;
                commandText = replaceTextByRegex(commandText, /(\S+)\$1/, '$1%~1');
                commandText = replaceTextByRegex(commandText, /\$(\d+)/, '%$1');
                commandText = replaceText(commandText, '$*', '%*');
            } else {
                commandText = cmdName + '=' + body + ' ' + tailArgs;
            }
        } else {
            if (useFunction) {
                const functionName = '_' + replaceText(cmdName, '-', '_');
                if (outputEveryScriptFile) {
                    commandText = body + ' ' + tailArgs;
                } else {
                    commandText = 'alias ' + cmdName + "='function " + functionName + '() {'
                        + '\n\t' + body + ' ' + tailArgs
                        + '\n' + '}; ' + functionName + "'";
                }
            } else {
                if (outputEveryScriptFile) {
                    commandText = body + " $@";
                } else {
                    commandText = 'alias ' + cmdName + "='" + body + " $@'";
                }
            }
        }

        cmdAliasMap.set(cmdName, commandText);
        return commandText;
    }

}

function outputCmdAliasGuide(singleScriptFolder: string = '') {
    if (singleScriptFolder.length > 0) {
        outputKeyInfo('Add folder ' + singleScriptFolder + ' to PATH then you can directly call the script name everywhere in/out vscode to search/replace like:');
    } else {
        outputKeyInfo('You can now directly use the command aliases(shortcuts) in/out vscode to search/replace like:');
    }

    outputKeyInfo('find-ndp dir1,dir2,file1,fileN -t MySearchRegex -x AndPlainText');
    outputKeyInfo('find-nd -t MySearchRegex -x AndPlainText');
    outputKeyInfo('find-doc -it MySearchRegex -x AndPlainText -l : Show path list');
    outputKeyInfo('find-code -t MySearchRegex -x AndPlainText');
    outputKeyInfo('find-py-def MySearchRegex -x AndPlainText : Search definition in python files');
    outputKeyInfo('find-py-ref MySearchRegex -x AndPlainText : Search references in python files');
    outputKeyInfo('find-ref "class\\s+MyClass" -x AndPlainText --np "unit|test" --xp src\\ext,src\\common -c show command line');
    outputKeyInfo('find-def MyClass -x AndPlainText --np "unit|test" --xp src\\ext,src\\common -c show command line');
    outputKeyInfo('find-ref MyClass --pp "test|unit" -U 3 -D 3 -H 20 -T 10 :  Preview Up/Down lines + Set Head/Tail lines in test');
    outputKeyInfo('find-ref MyOldClassMethodName -o NewName -j : preview');
    outputKeyInfo('find-ref MyOldClassMethodName -o NewName -R : Replace files, add -K to backup');
    outputKeyInfo('alias find -x all -H 9');
    outputKeyInfo('alias "find[\\w-]*ref"');
    outputKeyInfo('alias "^(find\\S+)=(.*)" -o "\\2"');
    outputKeyInfo('Use -W to output full path; Use -I to suppress warnings; Use -o to replace text, -j to preview changes, -R to replace files.');
    outputKeyInfo('See + Use command alias(shortcut) in `MSR-RUN-CMD` on `TERMINAL` tab, or start using in a new command window outside. (In vscode terminal, you can `click` to open search results)');
}

function addFullPathHideWarningOption(extraOption: string): string {
    if (!/(^|\s+)-[PACIGMOZc]*?W/.test(extraOption)) {
        extraOption = '-W ' + extraOption.trimLeft();
    }

    if (!/(^|\s+)-[PACWGMOZc]*?I/.test(extraOption)) {
        extraOption = '-I ' + extraOption.trimLeft();
    }

    return extraOption.trim();
}

function getExistingCmdAlias(): Map<string, string> {
    var map = new Map<string, string>();
    if (!IsWindows) {
        return map;
    }

    const [output, error] = runCommandGetInfo('cmd /c "doskey /MACROS"', MessageLevel.DEBUG, MessageLevel.DEBUG, MessageLevel.DEBUG);
    if (!output || error) {
        return map;
    }

    return getCmdAliasMapFromText(output, map);
}

function getCmdAliasMapFromText(output: string, map: Map<string, string>) {
    const lines = output.split(/[\r\n]+/);
    const reg = /^(\w+[\w\.-]+)=(.+)/;
    lines.forEach(a => {
        const match = reg.exec(a);
        if (match) {
            map.set(match[1], a);
        }
    });

    return map;
}
