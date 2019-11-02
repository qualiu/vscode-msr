import * as vscode from 'vscode';
import path = require('path');
import fs = require('fs');
import os = require('os');
import { outputDebug, enableColorAndHideCommandLine, outputError, runCommandInTerminal, MessageLevel, outputKeyInfo, clearOutputChannel, sendCmdToTerminal } from './outputUtils';
import { getNoDuplicateStringSet, replaceTextByRegex, runCommandGetInfo, replaceText, quotePaths, isNullOrEmpty } from './utils';
import { createRegex } from './regexUtils';
import { isNullOrUndefined } from 'util';
import { stringify } from 'querystring';
import { IsDebugMode, HomeFolder, IsWindows, SearchTextHolderReplaceRegex } from './constants';
import { FindType } from './enums';
import { MsrExe, MsrExePath } from './checkTool';

const SplitPathsRegex = /\s*[,;]\s*/;
const SplitPathGroupsRegex = /\s*;\s*/;
const FolderToPathPairRegex = /(\w+\S+?)\s*=\s*(\S+.+)$/;

let MyConfig: DynamicConfig;

export function removeSearchTextForCommandLine(cmd: string): string {
    return cmd.replace(/(\s+-c)\s+Search\s+%~?1/, '$1');
}

export class DynamicConfig {
    public RootConfig: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('msr');

    // Temp toggle enable/disable finding definition and reference
    public IsEnabledFindingDefinitionAndReference: boolean = true;

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
    public DisabledRootFolderNameRegex: RegExp = new RegExp('to-load');
    public DisableFindDefinitionFileExtensionRegex: RegExp = new RegExp('to-load');
    public SearchDefinitionInAllWorkspaces: boolean = true;
    public SearchReferencesInAllWorkspaces: boolean = true;

    public IsFindDefinitionEnabled: boolean = true;
    public IsFindReferencesEnabled: boolean = true;

    public ExcludeFoldersFromSettings: Set<string> = new Set<string>();

    public InitProjectCmdAliasForNewTerminals: boolean = true;
    public AutoMergeSkipFolders: boolean = true;

    public toggleEnableFindingDefinitionAndReference() {
        this.IsEnabledFindingDefinitionAndReference = !this.IsEnabledFindingDefinitionAndReference;
        this.update();

        outputDebug('Toggled: msr.enable.definition = ' + this.IsFindDefinitionEnabled);
        outputDebug('Toggled: msr.enable.reference = ' + this.IsFindReferencesEnabled);
    }

    public update() {
        this.RootConfig = vscode.workspace.getConfiguration('msr');
        this.IsFindDefinitionEnabled = this.RootConfig.get('enable.definition') as boolean && this.IsEnabledFindingDefinitionAndReference;
        this.IsFindReferencesEnabled = this.RootConfig.get('enable.reference') as boolean && this.IsEnabledFindingDefinitionAndReference;

        const rootConfig = this.RootConfig;

        this.InitProjectCmdAliasForNewTerminals = rootConfig.get('initProjectCmdAliasForNewTerminals') as boolean;
        this.AutoMergeSkipFolders = rootConfig.get('autoMergeSkipFolders') as boolean;
        this.ShowInfo = rootConfig.get('showInfo') as boolean;
        this.IsQuiet = rootConfig.get('quiet') as boolean;
        this.IsDebug = IsDebugMode || rootConfig.get('debug') as boolean;
        this.DescendingSortForConsoleOutput = rootConfig.get('descendingSortForConsoleOutput') as boolean;
        this.DescendingSortForVSCode = rootConfig.get('descendingSortForVSCode') as boolean;
        this.DefaultMaxSearchDepth = parseInt(rootConfig.get('default.maxSearchDepth') || '0');
        this.NeedSortResults = rootConfig.get('default.sortResults') as boolean;
        this.ReRunCmdInTerminalIfCostLessThan = rootConfig.get('reRunSearchInTerminalIfCostLessThan') as number || 3.3;
        this.ConfigAndDocFilesRegex = new RegExp(rootConfig.get('default.configAndDocs') as string || '\\.(json|xml|ini|ya?ml|md)|readme', 'i');
        this.CodeAndConfigAndDocFilesRegex = new RegExp(rootConfig.get('default.codeAndConfigDocs') as string || '\\.(cs\\w*|nuspec|config|c[px]*|h[px]*|java|scala|py|go|php|vue|tsx?|jsx?|json|ya?ml|xml|ini|md)$|readme', 'i');
        this.DefaultConstantsRegex = new RegExp(rootConfig.get('default.isConstant') as string);
        this.SearchAllFilesWhenFindingReferences = rootConfig.get('default.searchAllFilesForReferences') as boolean;
        this.SearchAllFilesWhenFindingDefinitions = rootConfig.get('default.searchAllFilesForDefinitions') as boolean;
        this.DisabledRootFolderNameRegex = createRegex(rootConfig.get('disable.projectRootFolderNamePattern') as string);

        this.DisabledFileExtensionRegex = createRegex(rootConfig.get('disable.extensionPattern') as string, 'i', true);
        this.DisableFindDefinitionFileExtensionRegex = createRegex(rootConfig.get('disable.findDef.extensionPattern') as string, 'i', true);

        this.SearchDefinitionInAllWorkspaces = rootConfig.get('definition.searchAllWorkspaces') as boolean;
        this.SearchReferencesInAllWorkspaces = rootConfig.get('reference.searchAllWorkspaces') as boolean;

        this.ExcludeFoldersFromSettings.clear();
        if (this.AutoMergeSkipFolders) {
            this.ExcludeFoldersFromSettings = this.getExcludeFolders('search');
            this.getExcludeFolders('files').forEach(a => this.ExcludeFoldersFromSettings.add(a));
        }
    }

    public shouldSkipFinding(findType: FindType, currentFilePath: string): boolean {
        if ((findType === FindType.Definition && !this.IsFindDefinitionEnabled) || (findType === FindType.Reference && !this.IsFindReferencesEnabled)) {
            outputDebug('Disabled by `msr.enable.' + findType + '` or temporarily toggled enable/disable by `msr.tmpToggleEnableForFindDefinitionAndReference`');
            return true;
        }

        const parsedFile = path.parse(currentFilePath);
        const extension = parsedFile.ext.replace(/^\./, '').toLowerCase() || 'default';
        let shouldSkip = 0;

        if (MyConfig.DisabledFileExtensionRegex.test(extension)) {
            outputDebug('Disabled for `*.' + extension + '` file in configuration: `msr.disable.extensionPattern`');
            shouldSkip += 1;
        }

        if (FindType.Definition === findType && MyConfig.DisableFindDefinitionFileExtensionRegex.test(extension)) {
            outputDebug('Disabled for `*.' + extension + '` file in configuration: `msr.disable.findDef.extensionPattern`');
            shouldSkip += 1;
        }

        const rootFolderName = getRootFolderName(currentFilePath) || '';
        if (MyConfig.DisabledRootFolderNameRegex.test(rootFolderName)) {
            outputDebug('Disabled for this git root folder in configuration: `msr.disable.projectRootFolderNamePattern` = ' + MyConfig.DisabledRootFolderNameRegex.source);
            shouldSkip += 1;
        }

        return shouldSkip > 0;
    }

    private getExcludeFolders(keyName: string): Set<string> {
        let textSet = new Set<string>();
        let config = vscode.workspace.getConfiguration(keyName);
        if (!config || !config.exclude) {
            return textSet;
        }

        const trimRegex = /^[\s\*/]+|[\s\*/]+$/;
        try {
            let map = new Map(Object.entries(config.exclude));
            map.forEach((value, key, _m) => {
                if (value) {
                    let text = replaceTextByRegex(key, trimRegex, '');
                    if (/^[\w-]+$/.test(text)) {
                        textSet.add(text);
                    }
                }
            });
        } catch (error) {
            outputDebug('Failed to get exclude folder from `' + keyName + '.exclude`: ' + error.toString());
        }

        outputDebug('Got ' + textSet.size + ' folders of `' + keyName + '.exclude`: ' + Array.from(textSet).join(' , '));
        return textSet;
    }
}

export function getConfig(reload: boolean = false): DynamicConfig {
    if (MyConfig && !reload) {
        return MyConfig;
    }

    if (!MyConfig) {
        MyConfig = new DynamicConfig();
    }

    MyConfig.update();

    outputDebug('----- vscode-msr configuration loaded: ' + new Date().toLocaleString() + ' -----');
    printConfigInfo(MyConfig.RootConfig);
    return MyConfig;
}

export function getRootFolder(filePath: string): string | undefined {
    if (isNullOrEmpty(filePath)) {
        return undefined;
    }

    const folderUri = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
    if (!folderUri || !folderUri.uri || !folderUri.uri.fsPath) {
        return undefined;
    }

    return folderUri.uri.fsPath;
}

export function getRootFolderName(filePath: string): string | undefined {
    const folder = getRootFolder(filePath);
    return isNullOrUndefined(folder) ? undefined : path.parse(folder).base;
}

export function getRootFolders(currentFilePath: string): string | undefined {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length < 1) {
        return undefined;
    }

    let rootFolderSet = new Set<string>().add(getRootFolder(currentFilePath) || '');
    vscode.workspace.workspaceFolders.forEach(a => rootFolderSet.add(a.uri.fsPath));
    rootFolderSet.delete('');
    return Array.from(rootFolderSet).join(',');
}

export function getRootFolderExtraOptions(rootFolderName: string): string {
    let folderExtraOptions = (MyConfig.RootConfig.get(rootFolderName + '.extraOptions') as string || '').trim();
    if (folderExtraOptions.length > 0) {
        folderExtraOptions += ' ';
    }

    return folderExtraOptions;
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

export function getSearchPathOptions(
    codeFilePath: string,
    mappedExt: string,
    isFindingDefinition: boolean,
    useExtraSearchPathsForReference: boolean = true,
    useExtraSearchPathsForDefinition: boolean = true): string {

    const rootConfig = getConfig().RootConfig;
    const rootFolderName = getRootFolderName(codeFilePath) || '';
    const rootPaths = !MyConfig.SearchReferencesInAllWorkspaces
        ? getRootFolder(codeFilePath)
        : getRootFolders(codeFilePath);

    const subName = isFindingDefinition ? 'definition' : 'reference';
    let skipFoldersPattern = getOverrideConfigByPriority([rootFolderName + '.' + subName + '.' + mappedExt, rootFolderName + '.' + subName, rootFolderName, mappedExt, 'default'], 'skipFolders');
    skipFoldersPattern = mergeSkipFolderPattern(skipFoldersPattern);

    const skipFolderOptions = skipFoldersPattern.length > 1 ? ' --nd "' + skipFoldersPattern + '"' : '';
    if ((isFindingDefinition && !useExtraSearchPathsForDefinition) || (!isFindingDefinition && !useExtraSearchPathsForReference)) {
        return isNullOrUndefined(rootPaths) || rootPaths.length === 0
            ? '-p ' + quotePaths(isFindingDefinition ? path.parse(codeFilePath).dir : codeFilePath)
            : '-rp ' + quotePaths(rootPaths) + skipFolderOptions;
    }

    let extraSearchPathSet = getExtraSearchPathsOrFileLists('default.extraSearchPaths', rootFolderName);
    getExtraSearchPathsOrFileLists('default.extraSearchPathGroups', rootFolderName).forEach(a => extraSearchPathSet.add(a));
    splitPathList(rootConfig.get(rootFolderName + '.extraSearchPaths') as string).forEach((a => extraSearchPathSet.add(a)));

    let extraSearchPathFileListSet = getExtraSearchPathsOrFileLists('default.extraSearchPathListFiles', rootFolderName);
    getExtraSearchPathsOrFileLists('default.extraSearchPathListFileGroups', rootFolderName).forEach(a => extraSearchPathFileListSet.add(a));
    splitPathList(rootConfig.get(rootFolderName + '.extraSearchPathListFiles') as string).forEach((a => extraSearchPathFileListSet.add(a)));

    const thisTypeExtraSearchPaths = !isFindingDefinition ? new Set<string>() : getExtraSearchPathsOrFileLists(mappedExt + '.extraSearchPaths', rootFolderName);
    const thisTypeExtraSearchPathListFiles = !isFindingDefinition ? new Set<string>() : getExtraSearchPathsOrFileLists(mappedExt + '.extraSearchPathListFiles', rootFolderName);

    let searchPathSet = new Set<string>();
    (rootPaths || (isFindingDefinition ? path.parse(codeFilePath).dir : codeFilePath)).split(',').forEach(a => searchPathSet.add(a));
    thisTypeExtraSearchPaths.forEach(a => searchPathSet.add(a));
    extraSearchPathSet.forEach(a => searchPathSet.add(a));
    searchPathSet = getNoDuplicateStringSet(searchPathSet);

    let pathsText = Array.from(searchPathSet).join(',').replace(/"/g, '');
    pathsText = quotePaths(pathsText);

    let pathListFileSet = new Set<string>(thisTypeExtraSearchPathListFiles);
    extraSearchPathFileListSet.forEach(a => pathListFileSet.add(a));
    pathListFileSet = getNoDuplicateStringSet(extraSearchPathFileListSet);
    let pathFilesText = Array.from(pathListFileSet).join(',').replace(/"/g, '');
    pathFilesText = quotePaths(pathFilesText);

    const readPathListOptions = pathListFileSet.size > 0 ? ' -w "' + pathFilesText + '"' : '';
    return isNullOrEmpty(rootPaths)
        ? '-p ' + pathsText + readPathListOptions + skipFolderOptions
        : '-rp ' + pathsText + readPathListOptions + skipFolderOptions;
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
    outputDebug('msr.initProjectCmdAliasForNewTerminals = ' + config.get('initProjectCmdAliasForNewTerminals'));
    outputDebug('msr.autoMergeSkipFolders = ' + config.get('autoMergeSkipFolders'));
}

export function cookCmdShortcutsOrFile(
    currentFilePath: string,
    useProjectSpecific: boolean,
    outputEveryScriptFile: boolean,
    newTerminal: vscode.Terminal | undefined = undefined,
    newTerminalShellPath: string = '') {
    clearOutputChannel();
    const rootConfig = getConfig().RootConfig;
    const saveFolder = newTerminal ? os.tmpdir() : rootConfig.get('cmdAlias.saveFolder') as string || HomeFolder;
    const rootFolderName = getRootFolderName(currentFilePath);
    if (isNullOrEmpty(rootFolderName) && !newTerminal) {
        useProjectSpecific = false;
    }

    // https://code.visualstudio.com/docs/editor/integrated-terminal#_configuration
    const shellConfig = vscode.workspace.getConfiguration('terminal.integrated.shell');
    const shellExe = !shellConfig ? '' : shellConfig.get(IsWindows ? 'windows' : 'linux') as string;
    const isWindowsTerminal = IsWindows && (!newTerminal || !/bash/i.test(newTerminal.name));
    const isLinuxOnWindows = IsWindows && !isWindowsTerminal;

    const fileName = (useProjectSpecific ? rootFolderName + '.' : '') + 'msr-cmd-alias' + (isWindowsTerminal ? '.doskeys' : '.bashrc');
    const cmdAliasFile = path.join(saveFolder, fileName);

    const projectKey = useProjectSpecific ? (rootFolderName || '') : 'notUseProject';
    const configText = stringify(rootConfig);
    const configKeyHeads = new Set<string>(configText.split(/=(true|false)?(&|$)/));
    let skipFoldersPattern = getOverrideConfigByPriority([projectKey, 'default'], 'skipFolders') || '^([\\.\\$]|(Release|Debug|objd?|bin|node_modules|static|dist|target|(Js)?Packages|\\w+-packages?)$|__pycache__)';
    if (useProjectSpecific) {
        skipFoldersPattern = mergeSkipFolderPattern(skipFoldersPattern);
    }

    const fileTypes = ['cpp', 'cs', 'py', 'java', 'go', 'php', 'ui', 'scriptFiles', 'configFiles', 'docFiles'];
    const findTypes = ['definition', 'reference'];

    let cmdAliasMap = outputEveryScriptFile ? new Map<string, string>() : getExistingCmdAlias(isWindowsTerminal);
    const oldCmdCount = cmdAliasMap.size;

    let commands: string[] = [];
    fileTypes.forEach(ext => {
        if (!configKeyHeads.has(ext)) {
            return;
        }

        let cmdName = 'find-' + ext.replace('Files', '');
        const filePattern = getOverrideConfigByPriority([projectKey + '.' + ext, ext, projectKey], 'codeFiles');

        // msr.definition.extraOptions msr.default.extraOptions
        const extraOption = addFullPathHideWarningOption(getOverrideConfigByPriority([projectKey + '.' + ext, ext, projectKey, 'default'], 'extraOptions'));

        let body = 'msr -rp . --nd "' + skipFoldersPattern + '" -f "' + filePattern + '" ' + extraOption;
        commands.push(getCommandAlias(cmdName, body, false));

        findTypes.forEach(fd => {
            // msr.cpp.member.definition msr.py.class.definition msr.default.class.definition msr.default.definition
            let searchPattern = getOverrideConfigByPriority([projectKey + '.' + ext, ext, projectKey, 'default'], fd);
            if (searchPattern.length > 0) {
                searchPattern = ' -t "' + searchPattern + '"';
            }

            // msr.cpp.member.skip.definition  msr.cpp.skip.definition msr.default.skip.definition 
            let skipPattern = getOverrideConfigByPriority([projectKey + '.' + ext, ext, projectKey, 'default'], 'skip.' + fd);
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

        const filePattern = getOverrideConfigByPriority([projectKey, 'default'], 'codeFilesPlusUI');

        // msr.definition.extraOptions msr.default.extraOptions
        const extraOption = addFullPathHideWarningOption(getOverrideConfigByPriority([projectKey, 'default'], 'extraOptions'));

        let body = 'msr -rp . --nd "' + skipFoldersPattern + '" -f "' + filePattern + '" ' + extraOption;
        body += skipPattern + searchPattern;
        commands.push(getCommandAlias(cmdName, body, true));
    });

    // find-all-def
    const findAllDef_FilePattern = getOverrideConfigByPriority([projectKey, 'default'], 'codeFilesPlusUI');
    const findAllDef_ExtraOption = addFullPathHideWarningOption(getOverrideConfigByPriority([projectKey, 'default'], 'extraOptions'));
    // Use UI definition search pattern for `find-all-def`
    const findAllDef_SkipPattern = getOverrideConfigByPriority([projectKey, 'ui', 'default'], 'skip.definition');
    const findAllDef_SearchPattern = getOverrideConfigByPriority([projectKey, 'default'], 'definition');
    const findAllDef_body = 'msr -rp . --nd "' + skipFoldersPattern + '" -f "' + findAllDef_FilePattern + '" ' + findAllDef_ExtraOption
        + (findAllDef_SearchPattern.length > 0 ? ' -t "' + findAllDef_SearchPattern + '"' : '')
        + (findAllDef_SkipPattern.length > 0 ? ' --nt "' + findAllDef_SkipPattern + '"' : '');
    commands.push(getCommandAlias('find-all-def', findAllDef_body, true));


    // msr.cpp.member.definition msr.py.class.definition msr.default.class.definition msr.default.definition
    const additionalFileTypes = ['allFiles', 'docFiles', 'configFiles', 'scriptFiles'];
    additionalFileTypes.forEach(fp => {
        const filePattern = getOverrideConfigByPriority([projectKey, 'default'], fp);

        // find-all
        const cmdName = 'find-' + fp.replace(/[A-Z]\w*$/, '');

        // msr.definition.extraOptions msr.default.extraOptions
        const extraOption = addFullPathHideWarningOption(getOverrideConfigByPriority([projectKey, 'default'], 'extraOptions'));
        let body = 'msr -rp . --nd "' + skipFoldersPattern + '" -f "' + filePattern + '" ' + extraOption;

        commands.push(getCommandAlias(cmdName, body, true));
    });

    // find-nd find-code find-ndp find-small find-all
    const allCodeFilePattern = getOverrideConfigByPriority([projectKey, 'default', ''], 'codeFilesPlusUI');
    const extraOption = addFullPathHideWarningOption(getOverrideConfigByPriority([projectKey, 'default'], 'extraOptions'));
    commands.push(getCommandAlias('find-nd', 'msr -rp . --nd "' + skipFoldersPattern + '" ', false));
    commands.push(getCommandAlias('find-ndp', 'msr -rp %1 --nd "' + skipFoldersPattern + '" ', false));
    commands.push(getCommandAlias('find-code', 'msr -rp . --nd "' + skipFoldersPattern + '" -f "' + allCodeFilePattern + '" ' + extraOption, false));

    const allSmallFilesOptions = getOverrideConfigByPriority([projectKey, 'default', ''], 'allSmallFiles.extraOptions');
    commands.push(getCommandAlias('find-small', 'msr -rp . --nd "' + skipFoldersPattern + '" ' + allSmallFilesOptions, false));

    const quotedFile = quotePaths(cmdAliasFile);
    if (isWindowsTerminal && !newTerminal) {
        cmdAliasMap.set('alias', 'alias=doskey /macros 2>&1 | msr -PI -t "^($1)" $2 $3 $4 $5 $6 $7 $8 $9');
        cmdAliasMap.set('update-doskeys', 'update-doskeys=msr -p ' + quotedFile + ' -t .+ -o "doskey $0" --nt "\\s+&&?\\s+" -XA $*');
    }

    let allText = '';
    let failureCount = 0;
    const singleScriptFolder = path.join(saveFolder, 'cmdAlias');
    let failedToCreateSingleScriptFolder = false;
    if (outputEveryScriptFile && !fs.existsSync(singleScriptFolder)) {
        try {
            fs.mkdirSync(singleScriptFolder);
        } catch (err) {
            failedToCreateSingleScriptFolder = true;
            outputError('\n' + 'Failed to make single script folder: ' + singleScriptFolder + ' Error: ' + err.toString());
        }
    }

    cmdAliasMap.forEach((value, key, _m) => {
        if (outputEveryScriptFile && !failedToCreateSingleScriptFolder && key.startsWith('find')) {
            const singleScriptPath = path.join(singleScriptFolder, isWindowsTerminal ? key + '.cmd' : key);
            try {
                fs.writeFileSync(singleScriptPath, value.trimRight() + (isWindowsTerminal ? '\r\n' : '\n'));
            } catch (err) {
                failureCount++;
                outputError('\n' + 'Failed to write single command alias script file:' + singleScriptPath + ' Error: ' + err.toString());
            }
        } else {
            allText += value + (isWindowsTerminal ? '\r\n\r\n' : '\n\n');
        }
    });

    if (outputEveryScriptFile) {
        if (failureCount < cmdAliasMap.size && !failedToCreateSingleScriptFolder) {
            outputCmdAliasGuide(saveFolder);
            let setPathCmd = 'msr -z "' + (isWindowsTerminal ? '%PATH%' : '$PATH') + '" -ix "' + singleScriptFolder + '" >' + (isWindowsTerminal ? 'nul' : '/dev/null') + ' && ';
            if (isWindowsTerminal) {
                setPathCmd += 'SET "PATH=%PATH%;' + singleScriptFolder + '"';
            } else {
                setPathCmd += 'export PATH=$PATH:' + singleScriptFolder;
            }

            runCmdInTerminal(setPathCmd, true, false);
            if (isWindowsTerminal) {
                runCmdInTerminal('where find-def.cmd', false, false);
                runCmdInTerminal('where find-def', false, false);
            } else {
                runCmdInTerminal('chmod +x ' + singleScriptFolder + '/find*', false, false);
                runCmdInTerminal('whereis find-def', false, false);
                runCmdInTerminal('whereis find-ref', false, false);
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
            if (!newTerminal) {
                outputCmdAliasGuide('');
                const existingInfo = isWindowsTerminal ? ' (merged existing = ' + oldCmdCount + ')' : '';
                outputKeyInfo('Successfully made ' + commands.length + existingInfo + ' command alias/doskey file and saved at: ' + cmdAliasFile);
                outputKeyInfo('To more freely use them (like in scripts or nested command line pipe): Press `F1` search `msr Cook` and choose cooking script files. (You can make menu `msr.cookCmdAliasFiles` visible).');
            }
        } catch (err) {
            outputError('\n' + 'Failed to save command alias file: ' + cmdAliasFile + ' Error: ' + err.toString());
            return;
        }

        const slashQuotedFile = quotedFile === cmdAliasFile ? cmdAliasFile : '\\"' + cmdAliasFile + '\\"';
        let canRunShowDef = true;
        if (IsWindows) {
            if (newTerminal) {
                let cmd = '';
                // Powershell PSReadLine module is not compatible with doskey
                if (/Powershell/i.test(newTerminal.name + newTerminalShellPath)) {
                    canRunShowDef = false;
                    const quotedFileForPS = quotedFile === cmdAliasFile ? cmdAliasFile : '`"' + cmdAliasFile + '`"';
                    const setEnvCmd = MsrExe === 'msr' ? '' : "$env:Path = $env:Path + ';" + path.dirname(MsrExe) + "'; ";
                    cmd = setEnvCmd + 'cmd /k ' + '"doskey /MACROFILE=' + quotedFileForPS + ' && doskey /macros | msr -t find-def -x msr -e \\s+-+\\w+\\S* -PM'
                        + ' & echo. & echo Type powershell if you want to back to Powershell without ' + commands.length + ' shortcuts like find-all-def. You can disable msr.initProjectCmdAliasForNewTerminals in user settings.'
                        + ' | msr -aPA -e .+ -ix powershell -t find\\S*def^|msr\\S+'
                        + '"';
                    runCmdInTerminal(cmd, true, MsrExe === 'msr');
                } else if (/cmd/i.test(newTerminal.name + newTerminalShellPath)) {
                    checkSetPathBeforeRunDoskeyAlias('doskey /MACROFILE=' + quotedFile, false, false);
                } else if (/bash/i.test(newTerminal.name + newTerminalShellPath)) {
                    // MinGW: "terminal.integrated.shell.windows": "C:\\Program Files\\Git\\bin\\bash.exe"
                    // Cygwin: "terminal.integrated.shell.windows": "D:\\cygwin64\\bin\\bash.exe"
                    const isMinGW = shellExe.includes('Git\\bin\\bash.exe');
                    const isCygwin = /cygwin/i.test(shellExe);
                    if (isMinGW) {
                        function toMinGWPath(winPath: string) {
                            return replaceText(winPath.replace(/^[A-Z]:/i, '/c'), '\\', '/');
                        }
                        const exeFolder = toMinGWPath(MsrExePath).replace(/[^/]+$/, '');
                        const setEnvCmd = 'export PATH=$PATH:' + exeFolder;
                        checkSetPathBeforeRunDoskeyAlias('source ' + quotePaths(toMinGWPath(cmdAliasFile)), false, true, setEnvCmd);
                    } else if (isCygwin) {
                        function toCygwinPath(winPath: string) {
                            return replaceText(winPath.replace(/^([A-Z]):/i, '/cygdrive/$1'), '\\', '/');
                        }
                        const exeFolder = toCygwinPath(MsrExePath).replace(/[^/]+$/, '');
                        const setEnvCmd = 'export PATH=$PATH:' + exeFolder;
                        checkSetPathBeforeRunDoskeyAlias('source ' + quotePaths(toCygwinPath(cmdAliasFile)), false, true, setEnvCmd);
                    }
                } else {
                    outputDebug('\n' + 'Not supported terminal: ' + newTerminal.name + ', shellExe = ' + shellExe);
                    fs.unlinkSync(cmdAliasFile);
                    return;
                }
            }
            else {
                checkSetPathBeforeRunDoskeyAlias('doskey /MACROFILE="' + cmdAliasFile + '"', false, false);
                const regCmd = 'REG ADD "HKEY_CURRENT_USER\\Software\\Microsoft\\Command Processor" /v Autorun /d "DOSKEY /MACROFILE=' + slashQuotedFile + '" /f';
                runCmdInTerminal(regCmd, true, false);
                runCmdInTerminal('alias update', true, false);
            }
        } else {
            checkSetPathBeforeRunDoskeyAlias('source ' + quotedFile, true, true);
            if (!newTerminal) {
                runCmdInTerminal('msr -p ~/.bashrc 2>/dev/null -x ' + quotedFile + ' -M && echo "source ' + slashQuotedFile + '" >> ~/.bashrc');
            }
        }

        if (canRunShowDef || !newTerminal) {
            runCmdInTerminal('echo Now you can use ' + commands.length
                + ' command shortcuts like: find-def find-ref find-all-def find-small find-all and see detail like: alias find-def'
                + ' | msr -aPA -e .+ -x ' + commands.length + ' -t "find-\\S+|(alias \\S+)"', true, false);
        }
    }

    function checkSetPathBeforeRunDoskeyAlias(doskeyOrSourceCmd: string, mergeCmd: boolean, isBash: boolean, setEnvCmd: string = '') {
        if (MsrExe !== 'msr') {
            if (isNullOrEmpty(setEnvCmd)) {
                if (isWindowsTerminal) {
                    setEnvCmd = 'SET "PATH=%PATH%;' + path.dirname(MsrExe) + '"' + (mergeCmd ? ' & ' : '');
                } else {
                    setEnvCmd = 'export PATH=$PATH:' + path.dirname(MsrExe) + (mergeCmd ? '; ' : '');
                }
            }
        }

        if (mergeCmd) {
            runCmdInTerminal(setEnvCmd + doskeyOrSourceCmd, true, MsrExe === 'msr');
        } else {
            if (!isNullOrEmpty(setEnvCmd)) {
                runCmdInTerminal(setEnvCmd, true, true);
            }

            runCmdInTerminal(doskeyOrSourceCmd, true, isNullOrEmpty(setEnvCmd));
        }
    }

    function runCmdInTerminal(cmd: string, showTerminal: boolean = false, clearAtFirst = false) {
        if (newTerminal) {
            sendCmdToTerminal(cmd, newTerminal, showTerminal, clearAtFirst, isLinuxOnWindows);
        } else {
            runCommandInTerminal(cmd, showTerminal, clearAtFirst, isLinuxOnWindows);
        }
    }

    function getCommandAlias(cmdName: string, body: string, useFunction: boolean): string {
        body = enableColorAndHideCommandLine(body);
        // body = replaceTextByRegex(body, /\s+%~?1(\s+|$)/g, '').trimRight();

        const hasSearchTextHolder = /%~?1/.test(body);
        if (hasSearchTextHolder) {
            body = replaceTextByRegex(body.trimRight(), SearchTextHolderReplaceRegex, '$1');
        }

        const tailArgs = hasSearchTextHolder ? '$2 $3 $4 $5 $6 $7 $8 $9' : (isWindowsTerminal ? '$*' : '$@');

        let commandText = '';
        if (isWindowsTerminal) {
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
    outputKeyInfo('find-ref MyOldClassMethodName -o NewName -j : Preview changes');
    outputKeyInfo('find-ref MyOldClassMethodName -o NewName -R : Replace files, add -K to backup');
    outputKeyInfo('alias find -x all -H 9');
    outputKeyInfo('alias "find[\\w-]*ref"');
    outputKeyInfo('alias "^(find\\S+)=(.*)" -o "\\2"');
    outputKeyInfo('Use -W to output full path; Use -I to suppress warnings; Use -o to replace text, -j to preview changes, -R to replace files.');
    outputKeyInfo('See + Use command alias(shortcut) in `MSR-RUN-CMD` on `TERMINAL` tab, or start using in a new command window outside. (In vscode terminals, you can `click` to open search results)');
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

function getExistingCmdAlias(isWindowsTerminal: boolean): Map<string, string> {
    var map = new Map<string, string>();
    if (!isWindowsTerminal) {
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

function mergeSkipFolderPattern(skipFoldersPattern: string) {
    if (!isNullOrEmpty(skipFoldersPattern) && MyConfig.ExcludeFoldersFromSettings.size > 0) {
        try {
            const existedExcludeRegex = new RegExp(skipFoldersPattern);
            const extraExcludeFolders = Array.from(MyConfig.ExcludeFoldersFromSettings).filter(a => !existedExcludeRegex.test(a));
            if (extraExcludeFolders.length > 0) {
                if (skipFoldersPattern.indexOf('|node_modules|') > 0) {
                    skipFoldersPattern = skipFoldersPattern.replace('|node_modules|', '|node_modules|' + extraExcludeFolders.join('|') + '|');
                }
                else if (skipFoldersPattern.indexOf('|Debug|') > 0) {
                    skipFoldersPattern = skipFoldersPattern.replace('|Debug|', '|Debug|' + extraExcludeFolders.join('|') + '|');
                }
                else {
                    skipFoldersPattern += '|^(' + extraExcludeFolders.join('|') + ')$';
                }
            }
        }
        catch (error) {
            outputDebug('Failed to add exclude folder from settings:' + error.toString());
        }
    }
    else if (isNullOrEmpty(skipFoldersPattern) && MyConfig.ExcludeFoldersFromSettings.size > 0) {
        skipFoldersPattern = '^(' + Array.from(MyConfig.ExcludeFoldersFromSettings).join('|') + ')$';
    }

    return skipFoldersPattern;
}
