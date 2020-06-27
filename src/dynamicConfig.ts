import fs = require('fs');
import os = require('os');
import path = require('path');
import { isNullOrUndefined } from 'util';
import * as vscode from 'vscode';
import { getDownloadCommandForNewTerminal, GetSetToolEnvCommand, MsrExePath } from './checkTool';
import { getFindTopDistributionCommand, getSortCommandText } from './commands';
import { HomeFolder, IsLinux, IsWindows, IsWSL, SearchTextHolderReplaceRegex } from './constants';
import { FindCommandType, FindType, TerminalType } from './enums';
import { clearOutputChannel, enableColorAndHideCommandLine, MessageLevel, outputDebug, outputError, outputInfo, outputInfoQuiet, RunCmdTerminalName, runCommandGetInfo, runCommandInTerminal, sendCmdToTerminal } from './outputUtils';
import { createRegex, escapeRegExp } from './regexUtils';
import { DefaultTerminalType, getExtensionNoHeadDot, getTimeCostToNow, getUniqueStringSetNoCase, isNullOrEmpty, isWindowsTerminalType, nowText, quotePaths, replaceText, replaceTextByRegex, toOsPath, toOsPaths, toOsPathsForText, toWSLPath, toWSLPaths } from './utils';

const SplitPathsRegex = /\s*[,;]\s*/;
const SplitPathGroupsRegex = /\s*;\s*/;
const FolderToPathPairRegex = /(\w+\S+?)\s*=\s*(\S+.+)$/;

const CookCmdDocUrl = 'https://github.com/qualiu/vscode-msr/blob/master/README.md#command-shortcuts';

let MyConfig: DynamicConfig;

export let FileExtensionToMappedExtensionMap = new Map<string, string>();
// 	.set('cxx', 'cpp')
// 	.set('hpp', 'cpp')
// 	.set('scala', 'java')
// 	;

export let MappedExtToCodeFilePatternMap = new Map<string, string>()
    // .set('java', RootConfig.get('java.codeFiles') as string)
    // .set('ui', RootConfig.get('ui.codeFiles') as string)
    // .set('cpp', RootConfig.get('cpp.codeFiles') as string)
    .set('default', '')
    ;

export function removeSearchTextForCommandLine(cmd: string): string {
    return cmd.replace(/(\s+-c)\s+Search\s+%~?1/, '$1');
}

export function getSubConfigValue(rootFolderName: string, extension: string, mappedExt: string, subKeyName: string, configTailKey: string, allowEmpty = false): string {
    let prefixSet = new Set<string>([
        rootFolderName + '.' + extension + '.' + subKeyName,
        rootFolderName + '.' + mappedExt + '.' + subKeyName,
        rootFolderName + '.' + extension,
        rootFolderName + '.' + mappedExt,
        rootFolderName + '.' + subKeyName,
        rootFolderName,
        extension + '.' + subKeyName,
        mappedExt + '.' + subKeyName,
        extension,
        mappedExt,
        subKeyName,
        'default',
        ''
    ]);

    if (isNullOrEmpty(rootFolderName)) {
        prefixSet.delete('');
    }
    const prefixList = Array.from(prefixSet).filter(a => !a.startsWith('.'));
    return getOverrideConfigByPriority(prefixList, configTailKey, allowEmpty);
}

export function GetConfigPriorityPrefixes(rootFolderName: string, extension: string, mappedExt: string, addDefault: boolean = true): string[] {
    let prefixSet = new Set<string>([
        rootFolderName + '.' + extension,
        rootFolderName + '.' + mappedExt,
        rootFolderName,
        extension,
        mappedExt,
        'default',
        ''
    ]);

    if (isNullOrEmpty(rootFolderName)) {
        prefixSet.delete('');
    }

    if (!addDefault) {
        prefixSet.delete('default');
        prefixSet.delete('');
    }

    return Array.from(prefixSet).filter(a => !a.startsWith('.'));
}

export function getConfigValue(rootFolderName: string, extension: string, mappedExt: string, configTailKey: string, allowEmpty = false, addDefault: boolean = true): string {
    const prefixSet = GetConfigPriorityPrefixes(rootFolderName, extension, mappedExt, addDefault);
    return getOverrideConfigByPriority(prefixSet, configTailKey, allowEmpty);
}

export class DynamicConfig {
    public RootConfig: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('msr');
    public RootFolder: string = ".";

    // Temp toggle enable/disable finding definition and reference
    public IsEnabledFindingDefinitionAndReference: boolean = true;

    public ClearTerminalBeforeExecutingCommands: boolean = false;
    public ShowInfo: boolean = false;
    public IsQuiet: boolean = false;
    public IsDebug: boolean = false;
    public DescendingSortForConsoleOutput: boolean = false;
    public DescendingSortForVSCode: boolean = false;

    public DefaultMaxSearchDepth: number = 16;
    public NeedSortResults: boolean = false;

    public ReRunCmdInTerminalIfCostLessThan: number = 3.3;
    public ReRunSearchInTerminalIfResultsMoreThan: number = 1;
    public OnlyFindDefinitionAndReferenceForKnownLanguages: boolean = true;

    public ConfigAndDocFilesRegex: RegExp = new RegExp('to-load');
    public CodeAndConfigAndDocFilesRegex: RegExp = new RegExp('to-load');
    public DefaultConstantsRegex: RegExp = new RegExp('to-load');
    public SearchAllFilesWhenFindingReferences: boolean = false;
    public SearchAllFilesWhenFindingDefinitions: boolean = false;
    public GetSearchTextHolderInCommandLine: RegExp = /\s+-c\s+.*?%~?1/;
    public DisabledFileExtensionRegex: RegExp = new RegExp('to-load');
    public DisabledRootFolderNameRegex: RegExp = new RegExp('to-load');
    public DisableFindDefinitionFileExtensionRegex: RegExp = new RegExp('to-load');
    public DisableFindReferenceFileExtensionRegex: RegExp = new RegExp('to-load');
    public FindDefinitionInAllFolders: boolean = true;
    public FindReferencesInAllRootFolders: boolean = true;

    public ExcludeFoldersFromSettings: Set<string> = new Set<string>();

    public InitProjectCmdAliasForNewTerminals: boolean = true;
    public SkipInitCmdAliasForNewTerminalTitleRegex: RegExp = new RegExp('to-load');
    public OverwriteProjectCmdAliasForNewTerminals: boolean = true;
    public AutoMergeSkipFolders: boolean = true;

    public UseExtraPathsToFindReferences: boolean = false;
    public UseExtraPathsToFindDefinition: boolean = true;

    private TmpToggleEnabledExtensionToValueMap = new Map<string, boolean>();

    public isKnownLanguage(extension: string): boolean {
        return FileExtensionToMappedExtensionMap.has(extension) || this.RootConfig.get(extension) !== undefined;
    }

    public toggleEnableFindingDefinitionAndReference(extension: string) {
        const isKnownType = this.isKnownLanguage(extension);
        const mappedExt = FileExtensionToMappedExtensionMap.get(extension) || extension;
        const currentStatus = this.TmpToggleEnabledExtensionToValueMap.get(mappedExt);

        let isEnabled = currentStatus === true;
        if (undefined === currentStatus) {
            if (isKnownType) {
                isEnabled = !this.DisabledFileExtensionRegex.test(extension) && !this.DisableFindDefinitionFileExtensionRegex.test(extension);
            } else {
                isEnabled = !MyConfig.OnlyFindDefinitionAndReferenceForKnownLanguages;
            }
        }

        this.TmpToggleEnabledExtensionToValueMap.set(mappedExt, !isEnabled);
        outputInfo(nowText() + 'Toggle to `' + (isEnabled ? 'disabled' : 'enabled') + '` for `' + mappedExt + '` files to find definition/references.');
    }

    private getConfigValue(configTailKey: string): string {
        return getOverrideConfigByPriority([this.RootFolder, 'default', ''], configTailKey);
    }

    public update() {
        this.RootConfig = vscode.workspace.getConfiguration('msr');

        const fileExtensionMapInConfig = this.RootConfig.get('fileExtensionMap') as {};
        if (fileExtensionMapInConfig) {
            Object.keys(fileExtensionMapInConfig).forEach((mapExt) => {
                const extensions = (this.RootConfig.get('fileExtensionMap.' + mapExt) as string).split(/\s+/);
                const regexExtensions = extensions.map(ext => escapeRegExp(ext));
                MappedExtToCodeFilePatternMap.set(mapExt, '\\.(' + regexExtensions.join('|') + ')$');
                extensions.forEach((ext) => {
                    FileExtensionToMappedExtensionMap.set(ext, mapExt);
                });
            });
        }

        this.OnlyFindDefinitionAndReferenceForKnownLanguages = this.getConfigValue('enable.onlyFindDefinitionAndReferenceForKnownLanguages') === 'true';
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            this.RootFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
        }

        this.UseExtraPathsToFindDefinition = this.getConfigValue('findDefinition.useExtraPaths') === "true";
        this.UseExtraPathsToFindReferences = this.getConfigValue('findReference.useExtraPaths') === "true";
        this.FindDefinitionInAllFolders = this.getConfigValue('definition.searchAllRootFolders') === "true";
        this.FindReferencesInAllRootFolders = this.getConfigValue('reference.searchAllRootFolders') === "true";

        this.ClearTerminalBeforeExecutingCommands = this.getConfigValue('clearTerminalBeforeExecutingCommands') === 'true';
        this.InitProjectCmdAliasForNewTerminals = this.getConfigValue('initProjectCmdAliasForNewTerminals') === 'true';
        this.SkipInitCmdAliasForNewTerminalTitleRegex = createRegex(this.getConfigValue('skipInitCmdAliasForNewTerminalTitleRegex'), 'i');
        this.OverwriteProjectCmdAliasForNewTerminals = this.getConfigValue('overwriteProjectCmdAliasForNewTerminals') === 'true';
        this.AutoMergeSkipFolders = this.getConfigValue('autoMergeSkipFolders') === 'true';
        this.ShowInfo = this.getConfigValue('showInfo') === 'true';
        this.IsQuiet = this.getConfigValue('quiet') === 'true';
        this.IsDebug = this.getConfigValue('debug') === 'true';
        this.DescendingSortForConsoleOutput = this.getConfigValue('descendingSortForConsoleOutput') === 'true';
        this.DescendingSortForVSCode = this.getConfigValue('descendingSortForVSCode') === 'true';
        this.DefaultMaxSearchDepth = parseInt(this.getConfigValue('maxSearchDepth') || '0');
        this.NeedSortResults = this.getConfigValue('sortResults') === 'true';
        this.ReRunCmdInTerminalIfCostLessThan = Number(this.getConfigValue('reRunSearchInTerminalIfCostLessThan') || '3.3');
        this.ReRunSearchInTerminalIfResultsMoreThan = Number(this.getConfigValue('reRunSearchInTerminalIfResultsMoreThan') || '1');
        this.ConfigAndDocFilesRegex = new RegExp(this.getConfigValue('configAndDocs') || '\\.(json|xml|ini|ya?ml|md)|readme', 'i');
        this.CodeAndConfigAndDocFilesRegex = new RegExp(this.getConfigValue('codeAndConfigDocs') || '\\.(cs\\w*|nuspec|config|c[px]*|h[px]*|java|scala|py|go|php|vue|tsx?|jsx?|json|ya?ml|xml|ini|md)$|readme', 'i');
        this.DefaultConstantsRegex = new RegExp(this.getConfigValue('isFindConstant'));
        this.SearchAllFilesWhenFindingReferences = this.getConfigValue('searchAllFilesForReferences') === 'true';
        this.SearchAllFilesWhenFindingDefinitions = this.getConfigValue('searchAllFilesForDefinitions') === 'true';
        this.DisabledRootFolderNameRegex = createRegex(this.getConfigValue('disable.projectRootFolderNamePattern'));

        this.DisabledFileExtensionRegex = createRegex(this.getConfigValue('disable.extensionPattern'), 'i', true);
        this.DisableFindDefinitionFileExtensionRegex = createRegex(this.getConfigValue('disable.findDef.extensionPattern'), 'i', true);
        this.DisableFindReferenceFileExtensionRegex = createRegex(this.getConfigValue('disable.findRef.extensionPattern'), 'i', true);

        this.ExcludeFoldersFromSettings.clear();
        if (this.AutoMergeSkipFolders) {
            this.ExcludeFoldersFromSettings = this.getExcludeFolders('search');
            this.getExcludeFolders('files').forEach(a => this.ExcludeFoldersFromSettings.add(a));
        }
    }

    public shouldSkipFinding(findType: FindType, currentFilePath: string): boolean {
        const parsedFile = path.parse(currentFilePath);
        const extension = getExtensionNoHeadDot(parsedFile.ext);
        const mappedExt = FileExtensionToMappedExtensionMap.get(extension) || extension;

        const findTypeText = 'finding `' + FindType[findType] + '` in `' + mappedExt + '` files';
        const toggleTip = 'Change it or temporarily toggle `enable/disable`.';
        const toggleStatus = this.TmpToggleEnabledExtensionToValueMap.get(mappedExt);
        if (toggleStatus !== undefined) {
            const status = true === toggleStatus ? '`enabled`' : '`disabled`';
            outputInfo(nowText() + 'Toggle status = ' + status + ' for ' + findTypeText + ' because menu or hot key of `msr.tmpToggleEnableForFindDefinitionAndReference` had been triggered.');
            return false === toggleStatus;
        }

        if (this.OnlyFindDefinitionAndReferenceForKnownLanguages) {
            if (isNullOrEmpty(mappedExt) || !this.isKnownLanguage(extension)) {
                outputInfo(nowText() + 'Disabled ' + findTypeText + '` files due to `msr.enable.onlyFindDefinitionAndReferenceForKnownLanguages` = true'
                    + ' + Not exist `msr.fileExtensionMap.' + extension + '` nor `msr.' + extension + '.xxx`. ' + toggleTip);
                return true;
            }
        }

        const checkRegex = FindType.Definition === findType
            ? this.DisableFindDefinitionFileExtensionRegex
            : this.DisableFindReferenceFileExtensionRegex;

        if (MyConfig.DisabledFileExtensionRegex.test(extension)) {
            outputInfo(nowText() + 'Disabled ' + findTypeText + ' by `msr.disable.extensionPattern` = "' + this.DisabledFileExtensionRegex.source + '". ' + toggleTip);
            return true;
        }

        if (checkRegex.test(extension)) {
            const configName = FindType.Definition === findType ? 'msr.disable.findDef.extensionPattern' : 'msr.disable.findRef.extensionPattern';
            outputInfo(nowText() + 'Disabled ' + findTypeText + '` by `' + configName + '` = "' + this.RootConfig.get(configName) + '". ' + toggleTip);
            return true;
        }

        const rootFolderName = getRootFolderName(currentFilePath, true);
        if (MyConfig.DisabledRootFolderNameRegex.test(rootFolderName)) {
            outputInfo(nowText() + 'Disabled ' + findTypeText + ' by `msr.disable.projectRootFolderNamePattern` = "' + MyConfig.DisabledRootFolderNameRegex.source + '". ' + toggleTip);
            return true;
        }

        return false;
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
            outputDebug(nowText() + 'Failed to get exclude folder from `' + keyName + '.exclude`: ' + error.toString());
        }

        outputDebug(nowText() + 'Got ' + textSet.size + ' folders of `' + keyName + '.exclude`: ' + Array.from(textSet).join(' , '));
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

    outputDebug('----- vscode-msr configuration loaded: ' + nowText() + ' -----');
    printConfigInfo(MyConfig.RootConfig);
    return MyConfig;
}

export function getRootFolder(filePath: string, useFirstFolderIfNotFound = false): string {
    const folderUri = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
    if (!folderUri || !folderUri.uri || !folderUri.uri.fsPath) {
        if (useFirstFolderIfNotFound && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            return vscode.workspace.workspaceFolders[0].uri.fsPath;
        }
        return '';
    }

    return folderUri.uri.fsPath;
}

export function getRootFolderName(filePath: string, useFirstFolderIfNotFound = false): string {
    const folder = getRootFolder(filePath, useFirstFolderIfNotFound);
    return isNullOrUndefined(folder) ? '' : path.parse(folder).base;
}

export function getRootFolders(currentFilePath: string): string {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length < 1) {
        return '';
    }

    let rootFolderSet = new Set<string>().add(getRootFolder(currentFilePath));
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
    const prefixes = [mappedExtOrFolderName, 'default'];
    return getOverrideConfigByPriority(prefixes, suffix, allowEmpty);
}

export function getSearchPathOptions(
    useProjectSpecific: boolean,
    codeFilePath: string,
    mappedExt: string,
    isFindingDefinition: boolean,
    useExtraSearchPathsForReference: boolean = true,
    useExtraSearchPathsForDefinition: boolean = true,
    useSkipFolders: boolean = true,
    usePathListFiles: boolean = true): string {

    const rootFolderName = getRootFolderName(codeFilePath, true);
    const rootPaths = MyConfig.FindReferencesInAllRootFolders
        ? getRootFolders(codeFilePath)
        : getRootFolder(codeFilePath);

    const folderKey = useProjectSpecific ? rootFolderName : '';
    const folderKeyDefault = isNullOrEmpty(folderKey) ? 'default' : folderKey;
    const extension = getExtensionNoHeadDot(path.parse(codeFilePath).ext, '');
    const subName = isFindingDefinition ? 'definition' : 'reference';
    let skipFoldersPattern = getSubConfigValue(folderKey, extension, mappedExt, subName, 'skipFolders');
    skipFoldersPattern = mergeSkipFolderPattern(skipFoldersPattern);

    const skipFolderOptions = useSkipFolders && skipFoldersPattern.length > 1 ? ' --nd "' + skipFoldersPattern + '"' : '';
    if ((isFindingDefinition && !useExtraSearchPathsForDefinition) || (!isFindingDefinition && !useExtraSearchPathsForReference)) {
        return isNullOrUndefined(rootPaths) || rootPaths.length === 0
            ? '-p ' + quotePaths(isFindingDefinition ? toOsPath(path.dirname(codeFilePath), DefaultTerminalType) : codeFilePath)
            : '-rp ' + quotePaths(toOsPathsForText(rootPaths, DefaultTerminalType)) + skipFolderOptions;
    }

    let extraSearchPathSet = getExtraSearchPathsOrFileLists('default.extraSearchPaths', folderKeyDefault);
    getExtraSearchPathsOrFileLists('default.extraSearchPathGroups', folderKey).forEach(a => extraSearchPathSet.add(a));
    getExtraSearchPathsOrFileLists(folderKeyDefault + '.extraSearchPaths', '').forEach(a => extraSearchPathSet.add(a));

    let extraSearchPathFileListSet = getExtraSearchPathsOrFileLists('default.extraSearchPathListFiles', folderKeyDefault);
    getExtraSearchPathsOrFileLists('default.extraSearchPathListFileGroups', folderKeyDefault).forEach(a => extraSearchPathFileListSet.add(a));
    getExtraSearchPathsOrFileLists(folderKeyDefault + '.extraSearchPathListFiles', '').forEach(a => extraSearchPathFileListSet.add(a));

    const thisTypeExtraSearchPaths = !isFindingDefinition ? new Set<string>() : getExtraSearchPathsOrFileLists(mappedExt + '.extraSearchPaths', rootFolderName);
    const thisTypeExtraSearchPathListFiles = !isFindingDefinition ? new Set<string>() : getExtraSearchPathsOrFileLists(mappedExt + '.extraSearchPathListFiles', rootFolderName);

    let searchPathSet = new Set<string>();
    (rootPaths || (isFindingDefinition ? path.dirname(codeFilePath) : codeFilePath)).split(',').forEach(a => searchPathSet.add(a));
    thisTypeExtraSearchPaths.forEach(a => searchPathSet.add(a));
    extraSearchPathSet.forEach(a => searchPathSet.add(a));
    searchPathSet = toOsPaths(getUniqueStringSetNoCase(searchPathSet), DefaultTerminalType);

    let pathsText = Array.from(searchPathSet).join(',').replace(/"/g, '');
    pathsText = quotePaths(pathsText);
    if (isNullOrEmpty(pathsText)) {
        pathsText = '.';
    }

    let pathListFileSet = new Set<string>(thisTypeExtraSearchPathListFiles);
    extraSearchPathFileListSet.forEach(a => pathListFileSet.add(a));
    pathListFileSet = toOsPaths(getUniqueStringSetNoCase(extraSearchPathFileListSet), DefaultTerminalType);
    let pathFilesText = Array.from(pathListFileSet).join(',').replace(/"/g, '');
    pathFilesText = quotePaths(pathFilesText);

    const readPathListOptions = usePathListFiles && pathListFileSet.size > 0 ? ' -w "' + pathFilesText + '"' : '';
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
                a.trim().split(SplitPathGroupsRegex)
                    .filter(a => a.length > 0)
                    .forEach(g => extraSearchPathGroups.push(g));
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
    return toWSLPaths(getUniqueStringSetNoCase(extraSearchPaths));
}

function splitPathList(pathListText: string) {
    let extraSearchPaths = new Set<string>();
    if (!pathListText) {
        return extraSearchPaths;
    }

    pathListText.split(SplitPathsRegex).forEach(a => {
        extraSearchPaths.add(a.trim());
    });

    extraSearchPaths = toWSLPaths(getUniqueStringSetNoCase(extraSearchPaths));
    return extraSearchPaths;
}

export function printConfigInfo(config: vscode.WorkspaceConfiguration) {
    outputDebug('IsWindows = ' + IsWindows + ', IsWSL = ' + IsWSL + ', IsLinux = ' + IsLinux + ', DefaultTerminalType = ' + TerminalType[DefaultTerminalType]);
    outputDebug('MsrExePath = ' + MsrExePath);
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


function getTerminalShellExePath(): string {
    // https://code.visualstudio.com/docs/editor/integrated-terminal#_configuration
    const shellConfig = vscode.workspace.getConfiguration('terminal.integrated.shell');
    const shellExePath = !shellConfig ? '' : shellConfig.get(IsWindows ? 'windows' : 'linux') as string || '';
    if (isNullOrEmpty(shellExePath)) {
        if (IsWSL || IsLinux) {
            return 'bash';
        }
    }

    return shellExePath;
}

function getLinuxHomeFolderOnWindows(terminalType: TerminalType): string {
    const shellExeFolder = path.dirname(getTerminalShellExePath());
    if (IsWSL || IsLinux) {
        return "~/";
    }

    let folder = path.join(path.dirname(shellExeFolder), 'home', os.userInfo().username);
    if (TerminalType.MinGWBash === terminalType) {
        const home = process.env['USERPROFILE'] || '';
        if (!isNullOrEmpty(home)) {
            return home;
        }
    }
    return folder.replace(/^home/, '/home');
}

function getCmdAliasSaveFolder(isGeneralCmdAlias: boolean, terminalType: TerminalType): string {
    const rootConfig = getConfig().RootConfig;
    let saveFolder = !isGeneralCmdAlias ? os.tmpdir() : toWSLPath(rootConfig.get('cmdAlias.saveFolder') as string || HomeFolder);
    const linuxHomeFolderOnWindows = getLinuxHomeFolderOnWindows(terminalType);
    if (saveFolder.match(/^[A-Z]:/i) && (IsWSL || TerminalType.CygwinBash === terminalType || TerminalType.MinGWBash === terminalType)) {
        try {
            if (!fs.existsSync(linuxHomeFolderOnWindows)) {
                fs.mkdirSync(linuxHomeFolderOnWindows);
            }
            saveFolder = linuxHomeFolderOnWindows;
        } catch (error) {
            outputDebug('\n' + nowText() + 'Failed to create folder: ' + linuxHomeFolderOnWindows + ' for Linux terminal on Windows.');
        }
    }

    return saveFolder;
}

function getGeneralCmdAliasFilePath(terminalType: TerminalType) {
    const isWindowsTerminal = isWindowsTerminalType(terminalType);
    const saveFolder = getCmdAliasSaveFolder(true, terminalType);
    const fileName = 'msr-cmd-alias' + (isWindowsTerminal ? '.doskeys' : '.bashrc');

    // if is WSL and first time, which read Windows settings.
    if (IsWSL && saveFolder.match(/^[A-Z]:/i)) {
        return path.join(HomeFolder, fileName);
    }

    return path.join(saveFolder, fileName);
}

function getDisplayPathForBash(filePath: string, replaceTo: string = '~'): string {
    const homeValue = process.env['HOME'] || '';
    const pattern = isNullOrEmpty(homeValue)
        ? /^(~|\$HOME)/
        : new RegExp('^(~|\$HOME|' + homeValue + '\\b)');
    return filePath.replace(pattern, replaceTo);
}

export function cookCmdShortcutsOrFile(
    currentFilePath: string,
    useProjectSpecific: boolean,
    writeToEachFile: boolean,
    newTerminal: vscode.Terminal | undefined = undefined,
    dumpOtherCmdAlias: boolean = false) {
    const trackBeginTime = new Date();
    if (!newTerminal) {
        clearOutputChannel();
    }

    outputDebug(nowText() + 'Begin cooking command shortcuts for terminal ' + (newTerminal ? newTerminal.name : ''));
    const isCreatingRunCmdTerminal = newTerminal && newTerminal.name === 'MSR-RUN-CMD';
    const isGeneralCmdAlias = !newTerminal && !useProjectSpecific;

    const shellExe = getTerminalShellExePath();
    const shellExeFolder = path.dirname(shellExe);

    let terminalType: TerminalType = DefaultTerminalType;
    if (newTerminal) {
        if (IsWindows) {
            if (isNullOrEmpty(shellExe)) {
                if (/PowerShell/i.test(newTerminal.name)) {
                    terminalType = TerminalType.PowerShell;
                } else if (/bash/.test(newTerminal.name)) {
                    terminalType = TerminalType.WslBash;
                } else if (/CMD|Command/i.test(newTerminal.name)) {
                    terminalType = TerminalType.CMD;
                }
            } else {
                if (/cmd.exe$/i.test(shellExe)) {
                    terminalType = TerminalType.CMD;
                } else if (/PowerShell.exe$/i.test(shellExe)) {
                    terminalType = TerminalType.PowerShell;
                } else if (/Cygwin.*?bin\\bash.exe/i.test(shellExe)) {
                    terminalType = TerminalType.CygwinBash;
                } else if (/System(32)?.bash.exe/i.test(shellExe)) {
                    terminalType = TerminalType.WslBash;
                } else if (shellExe.includes('Git\\bin\\bash.exe')) {
                    terminalType = TerminalType.MinGWBash;
                }
            }
        } else {
            terminalType = TerminalType.LinuxBash;
        }
    }

    const isWindowsTerminal = isWindowsTerminalType(terminalType);
    const isLinuxTerminalOnWindows = IsWindows && !isWindowsTerminal;
    const saveFolder = getCmdAliasSaveFolder(isGeneralCmdAlias, terminalType);
    const rootFolder = getRootFolder(currentFilePath, useProjectSpecific);
    const rootFolderName = getRootFolderName(rootFolder);
    if (isNullOrEmpty(rootFolderName) && !newTerminal) {
        useProjectSpecific = false;
    }

    const [cmdAliasMap, oldCmdCount, commands] = getCommandAliasMap(terminalType, rootFolderName, useProjectSpecific, writeToEachFile, dumpOtherCmdAlias, newTerminal);
    const fileName = (useProjectSpecific ? rootFolderName + '.' : '') + 'msr-cmd-alias' + (isWindowsTerminal ? '.doskeys' : '.bashrc');
    const cmdAliasFile = toWSLPath(path.join(saveFolder, fileName));
    const quotedCmdAliasFile = quotePaths(cmdAliasFile);
    const defaultCmdAliasFile = getGeneralCmdAliasFilePath(terminalType);
    const quotedDefaultCmdAliasFile = quotePaths(toOsPath(defaultCmdAliasFile, terminalType));
    if (isWindowsTerminal) {
        const aliasBody = 'doskey /macros 2>&1 | msr -PI -t "^(%1)"';
        if (!newTerminal) {
            cmdAliasMap.set('alias', getCommandAliasText('alias', aliasBody, false, true, writeToEachFile));
            const updateDoskeyText = (writeToEachFile ? '' : 'update-doskeys=') + 'doskey /MACROFILE=' + quotedDefaultCmdAliasFile;
            cmdAliasMap.set('update-doskeys', updateDoskeyText);
            const existingOpenDoskey = cmdAliasMap.get('open-doskeys') as string || '';
            const matchTool = /=(\w+\S+|"\w+.*?")/.exec(existingOpenDoskey);
            const toolToOpen = isNullOrEmpty(existingOpenDoskey) || !matchTool ? 'code' : matchTool[1];
            cmdAliasMap.set('open-doskeys', 'open-doskeys=' + toolToOpen + ' ' + quotedDefaultCmdAliasFile);
        }

        cmdAliasMap.set('malias', getCommandAliasText('malias', aliasBody, false, true, writeToEachFile));
    } else if (!isWindowsTerminal) {
        cmdAliasMap.set('malias', getCommandAliasText('malias', 'alias | msr -PI -t "^\\s*alias\\s+($1)"', true, false, writeToEachFile));
    }

    [FindCommandType.FindTopFolder, FindCommandType.FindTopType, FindCommandType.FindTopSourceFolder, FindCommandType.FindTopSourceType, FindCommandType.FindTopCodeFolder, FindCommandType.FindTopCodeType].forEach(findTopCmd => {
        const findTopBody = getFindTopDistributionCommand(useProjectSpecific, true, findTopCmd, rootFolder);
        let aliasName = replaceTextByRegex(FindCommandType[findTopCmd], /([a-z])([A-Z])/, '$1-$2');
        aliasName = replaceTextByRegex(aliasName, /^-|-$/, '').toLowerCase();
        cmdAliasMap.set(aliasName, getCommandAliasText(aliasName, findTopBody, false, isWindowsTerminal, writeToEachFile, false, false));
    });

    [FindCommandType.SortBySize, FindCommandType.SortByTime, FindCommandType.SortSourceBySize, FindCommandType.SortSourceByTime, FindCommandType.SortCodeBySize, FindCommandType.SortCodeByTime].forEach(sortCmd => {
        const sortBody = getSortCommandText(useProjectSpecific, true, sortCmd, rootFolder, true);
        let aliasName = replaceTextByRegex(FindCommandType[sortCmd], /([a-z])([A-Z])/, '$1-$2');
        aliasName = replaceTextByRegex(aliasName, /^-|-$/, '').toLowerCase();
        cmdAliasMap.set(aliasName, getCommandAliasText(aliasName, sortBody, false, isWindowsTerminal, writeToEachFile, false, false));
    });

    const useFullPathsBody = getPathCmdAliasBody(true, cmdAliasFile, false);
    cmdAliasMap.set('use-wp', getCommandAliasText('use-wp', useFullPathsBody, false, isWindowsTerminal, writeToEachFile, false, false));
    const useRelativePathsBody = getPathCmdAliasBody(false, cmdAliasFile, false);
    cmdAliasMap.set('use-rp', getCommandAliasText('use-rp', useRelativePathsBody, false, isWindowsTerminal, writeToEachFile, false, false));

    const outFullPathsBody = getPathCmdAliasBody(true, cmdAliasFile, true, true);
    cmdAliasMap.set('out-fp', getCommandAliasText('out-fp', outFullPathsBody, false, isWindowsTerminal, writeToEachFile, false, false));
    const outRelativePathsBody = getPathCmdAliasBody(false, cmdAliasFile, true, false);
    cmdAliasMap.set('out-rp', getCommandAliasText('out-rp', outRelativePathsBody, false, isWindowsTerminal, writeToEachFile, false, false));

    let skipWritingScriptNames = new Set<string>(['use-wp', 'use-rp', 'out-rp', 'out-fp', 'alias']);
    if (!isWindowsTerminal) {
        skipWritingScriptNames.add('malias');
    }

    const linuxHomeFolderOnWindows = getLinuxHomeFolderOnWindows(terminalType);
    let allText = '';
    let failureCount = 0;
    const singleScriptFolder = toWSLPath(path.join(saveFolder, 'cmdAlias'));
    const singleScriptFolderOsPath = toOsPath(singleScriptFolder.replace(linuxHomeFolderOnWindows, '$HOME'), terminalType);
    let failedToCreateSingleScriptFolder = false;
    if (writeToEachFile && !fs.existsSync(singleScriptFolder)) {
        try {
            fs.mkdirSync(singleScriptFolder);
        } catch (err) {
            failedToCreateSingleScriptFolder = true;
            outputError('\n' + nowText() + 'Failed to make single script folder: ' + singleScriptFolder + ' Error: ' + err.toString());
        }
    }

    const sortedKeys = Array.from(cmdAliasMap.keys()).sort();
    sortedKeys.forEach(key => {
        const value = cmdAliasMap.get(key) || '';
        if (writeToEachFile) {
            if (!failedToCreateSingleScriptFolder && !skipWritingScriptNames.has(key) && (dumpOtherCmdAlias || key.startsWith('find'))) {
                const singleScriptPath = path.join(singleScriptFolder, isWindowsTerminal ? key + '.cmd' : key);
                try {
                    fs.writeFileSync(singleScriptPath, value.trimRight() + (isWindowsTerminal ? '\r\n' : '\n'));
                } catch (err) {
                    failureCount++;
                    outputError('\n' + nowText() + 'Failed to write single command alias script file:' + singleScriptPath + ' Error: ' + err.toString());
                }
            }
        } else {
            allText += value + (isWindowsTerminal ? '\r\n\r\n' : '\n\n');
        }
    });

    if (writeToEachFile) {
        if (!failedToCreateSingleScriptFolder && failureCount < cmdAliasMap.size) {
            outputCmdAliasGuide(isWindowsTerminal, newTerminal ? getGeneralCmdAliasFilePath(terminalType) : cmdAliasFile, saveFolder);
            let setPathCmd = 'msr -z "' + (isWindowsTerminal ? '%PATH%' : '$PATH') + '" -ix "' + singleScriptFolderOsPath + '" >'
                + (isWindowsTerminal ? 'nul' : '/dev/null') + ' && ';
            if (isWindowsTerminal) {
                setPathCmd += 'SET "PATH=%PATH%;' + singleScriptFolder + '"';
            } else {
                setPathCmd += 'export PATH=$PATH:' + singleScriptFolderOsPath;
            }

            runCmdInTerminal(setPathCmd, true);
            if (isWindowsTerminal) {
                runCmdInTerminal('where find-def.cmd', false);
                runCmdInTerminal('where find-def', false);
            } else {
                runCmdInTerminal('chmod +x ' + singleScriptFolderOsPath + (dumpOtherCmdAlias ? '/*' : '/find*'), false);
                const cmdHead = TerminalType.MinGWBash === terminalType ? 'alias ' : 'whereis ';
                runCmdInTerminal(cmdHead + 'find-def', false);
                runCmdInTerminal(cmdHead + 'find-ref', false);
            }
        }

        if (failureCount > 0) {
            outputInfoQuiet(nowText() + 'Total = ' + cmdAliasMap.size + ', failures = ' + failureCount + ', made ' + (cmdAliasMap.size - failureCount) + ' command alias/doskey script files saved in: ' + singleScriptFolder);
        } else {
            outputInfoQuiet(nowText() + 'Successfully made ' + cmdAliasMap.size + ' command alias/doskey script files and saved in: ' + singleScriptFolder);
        }
    } else {
        let existedText = '';
        try {
            if (fs.existsSync(cmdAliasFile)) {
                existedText = fs.readFileSync(cmdAliasFile).toString();
            }
        } catch (err) {
            outputError('\n' + nowText() + 'Failed to read file: ' + cmdAliasFile + ' Error: ' + err.toString());
        }

        const hasChanged = allText !== existedText;
        if (hasChanged) {
            if (!isNullOrEmpty(existedText) && newTerminal && !MyConfig.OverwriteProjectCmdAliasForNewTerminals) {
                outputDebug(nowText() + `Found msr.overwriteProjectCmdAliasForNewTerminals = false, Skip writing temp command shortcuts file: ${cmdAliasFile}`);
            } else {
                try {
                    fs.writeFileSync(cmdAliasFile, allText);
                } catch (err) {
                    outputError('\n' + nowText() + 'Failed to save command alias file: ' + cmdAliasFile + ' Error: ' + err.toString());
                    return;
                }
            }
        }

        if (!newTerminal || (newTerminal.name === RunCmdTerminalName && MyConfig.IsDebug)) {
            outputCmdAliasGuide(isWindowsTerminal, newTerminal ? getGeneralCmdAliasFilePath(terminalType) : cmdAliasFile, '');
            const existingInfo = isWindowsTerminal ? ' (merged existing = ' + oldCmdCount + ')' : '';
            outputInfoQuiet(nowText() + (hasChanged ? 'Successfully made ' : 'Already has same ') + commands.length + existingInfo + ' command alias/doskey file at: ' + cmdAliasFile);
            outputInfoQuiet(nowText() + 'To more freely use them (like in scripts or nested command line pipe): Press `F1` search `msr Cook` and choose cooking script files. (You can make menu `msr.cookCmdAliasFiles` visible).');
        }

        const shortcutsExample = ' shortcuts like find-all-def find-pure-ref find-doc find-small , use-rp use-wp out-fp out-rp , find-top-folder find-top-type sort-code-by-time etc. See detail like: alias find-def or malias find-top or malias use-wp or malias sort-.+?= etc.';
        if (defaultCmdAliasFile !== cmdAliasFile && !fs.existsSync(defaultCmdAliasFile)) {
            fs.copyFileSync(cmdAliasFile, defaultCmdAliasFile);
        }

        const defaultCmdAliasFileForTerminal = toOsPath(defaultCmdAliasFile.replace(linuxHomeFolderOnWindows, '$HOME'), terminalType);
        const slashQuotedDefaultCmdAliasFile = defaultCmdAliasFileForTerminal.includes(' ') ? '\\"' + defaultCmdAliasFileForTerminal + '\\"' : defaultCmdAliasFileForTerminal;

        const createCmdAliasTip = ' You can also create shortcuts in ' + (isWindowsTerminal ? '' : 'other files like ');
        let finalGuide = ' You can disable msr.initProjectCmdAliasForNewTerminals in user settings. More detail: ' + CookCmdDocUrl;
        let canRunShowDef = true;
        if (newTerminal && isWindowsTerminal) {
            let cmd = '';
            // Powershell PSReadLine module is not compatible with doskey
            if (TerminalType.PowerShell === terminalType) {
                finalGuide = createCmdAliasTip + defaultCmdAliasFile + ' .' + finalGuide;
                canRunShowDef = false;
                const quotedFileForPS = quotedCmdAliasFile === cmdAliasFile ? cmdAliasFile : '`"' + cmdAliasFile + '`"';
                const setEnvCmd = GetSetToolEnvCommand(TerminalType.PowerShell, '; ');
                cmd = setEnvCmd + 'cmd /k ' + '"doskey /MACROFILE=' + quotedFileForPS + ' && doskey /macros | msr -t find-def -x msr --nx use- --nt out- -e \\s+-+\\w+\\S* -PM'
                    + ' & echo. & echo Type exit if you want to back to PowerShell without ' + commands.length + shortcutsExample
                    + finalGuide
                    + ' | msr -aPA -e .+ -ix powershell -t m*alias^|find-\\S+^|sort-\\S+^|out-\\S+^|use-\\S+^|msr.init\\S+^|\\S*msr-cmd-alias\\S*'
                    + '"';
                runCmdInTerminal(cmd, true);
            } else if (TerminalType.CMD !== terminalType) {
                outputError('\n' + nowText() + 'Not supported terminal: ' + newTerminal.name + ', shellExe = ' + shellExe);
                fs.unlinkSync(cmdAliasFile);
                return;
            }
        }

        if (isWindowsTerminal) {
            finalGuide = createCmdAliasTip + defaultCmdAliasFile + ' .' + finalGuide;
            const setEnvCmd = GetSetToolEnvCommand(terminalType, '');
            checkSetPathBeforeRunDoskeyAlias('doskey /MACROFILE="' + cmdAliasFile + '"', true, setEnvCmd);
            if (isGeneralCmdAlias) {
                const regCmd = 'REG ADD "HKEY_CURRENT_USER\\Software\\Microsoft\\Command Processor" /v Autorun /d "DOSKEY /MACROFILE=' + slashQuotedDefaultCmdAliasFile + '" /f';
                runCmdInTerminal(regCmd, true);
            }
            runCmdInTerminal('alias "update-doskeys^|open-doskeys" -e "(.:.+)"', true);
        } else {
            if (IsWindows && !isWindowsTerminal) {
                if (isCreatingRunCmdTerminal) {
                    let envPathSet = new Set<string>().add(shellExeFolder);
                    (process.env['PATH'] || '').split(/\\?\s*;\s*/).forEach(a => envPathSet.add(a));
                    envPathSet = getUniqueStringSetNoCase(envPathSet, true);
                    process.env['PATH'] = Array.from(envPathSet).join(';');
                    runCmdInTerminal(quotePaths(shellExe));
                }
                runCmdInTerminal('export PATH=/usr/bin:$PATH');
            }

            prepareEnvForBashOnWindows(terminalType);

            if (isGeneralCmdAlias) {
                const displayPath = getDisplayPathForBash(slashQuotedDefaultCmdAliasFile, '~');
                runCmdInTerminal('ls ~/.bashrc > /dev/null 2>&1 || echo \'source ' + displayPath + '\' >> ~/.bashrc');
                runCmdInTerminal('msr -p ~/.bashrc 2>/dev/null -x \'source ' + displayPath + '\' -M && echo \'source ' + displayPath + '\' >> ~/.bashrc');
            }
        }

        if (canRunShowDef || !newTerminal) {
            runCmdInTerminal('echo Now you can use ' + commands.length + shortcutsExample
                + finalGuide + ' | msr -aPA -e .+ -x ' + commands.length + ' -it "find-\\S+|sort-\\S+|out-\\S+|use-\\S+|msr.init\\S+|other|\\S*msr-cmd-alias\\S*|(m*alias \\w+\\S*)"', true);
        }

        function prepareEnvForBashOnWindows(terminalType: TerminalType) {
            const displayPath = getDisplayPathForBash(toOsPath(defaultCmdAliasFile.replace(linuxHomeFolderOnWindows, '~'), terminalType), '\\~');
            finalGuide = createCmdAliasTip + displayPath + ' .' + finalGuide;
            if (newTerminal) {
                const downloadCommands = [
                    getDownloadCommandForNewTerminal(terminalType, 'msr'),
                    getDownloadCommandForNewTerminal(terminalType, 'nin')
                ];

                downloadCommands.forEach(c => runCmdInTerminal(c));
            }

            let setEnvCmd = GetSetToolEnvCommand(terminalType, '; ');
            const shellExeFolderOsPath = toOsPath(shellExeFolder, terminalType);
            const envPath = process.env['PATH'] || '';
            if (!isNullOrEmpty(envPath) && !envPath.includes(shellExeFolderOsPath) && !isNullOrEmpty(shellExeFolderOsPath)) {
                // Avoid MinGW prior to Cygwin when use Cygwin bash.
                if (isNullOrEmpty(setEnvCmd)) {
                    setEnvCmd = 'export PATH=' + shellExeFolderOsPath + ':$PATH; ';
                } else {
                    setEnvCmd = setEnvCmd.replace('export PATH=', 'export PATH=' + shellExeFolderOsPath + ':');
                }
            }

            // Avoid msr.exe prior to msr.cygwin or msr.gcc48
            if (isNullOrEmpty(setEnvCmd)) {
                setEnvCmd = 'export PATH=~/:$PATH';
            } else {
                setEnvCmd = setEnvCmd.replace('export PATH=', 'export PATH=~/:');
            }

            if (TerminalType.CygwinBash === terminalType) {
                setEnvCmd += 'export CYGWIN_ROOT=' + path.dirname(path.dirname(shellExe)).replace("\\", "\\\\");
            }

            checkSetPathBeforeRunDoskeyAlias('source ' + quotePaths(toOsPath(cmdAliasFile.replace(linuxHomeFolderOnWindows, '$HOME'), terminalType)), false, setEnvCmd);
        }

        outputDebug(nowText() + 'Finished to cook command shortcuts. Cost ' + getTimeCostToNow(trackBeginTime) + ' seconds.');
    }

    function getPathCmdAliasBody(useWorkspacePath: boolean, sourceAliasFile: string, onlyForOutput: boolean = false, outputFullPath: boolean = false, useTmpFile: boolean = false): string {
        let sourceFilePath = toOsPath(sourceAliasFile, terminalType);
        const tmpSaveFile = !useTmpFile ? quotePaths(sourceFilePath) : quotePaths(sourceFilePath + `-${useWorkspacePath ? "full" : "relative"}.tmp`);
        const replaceHead = `msr -p ` + tmpSaveFile;
        const andText = isWindowsTerminal ? " & " : " ; ";
        const copyCmd = (isWindowsTerminal ? `copy /y ` : `cp `) + quotePaths(sourceFilePath) + ` ` + tmpSaveFile;
        const loadCmdAliasCmd = (isWindowsTerminal ? "doskey /MACROFILE=" : "source ") + tmpSaveFile;

        const rootFolder = MyConfig.RootFolder;
        const findDefinitionPathOptions = getSearchPathOptions(useProjectSpecific, rootFolder, "all", true, MyConfig.UseExtraPathsToFindReferences, MyConfig.UseExtraPathsToFindDefinition, false, false);
        const findReferencesPathOptions = getSearchPathOptions(useProjectSpecific, rootFolder, "all", false, MyConfig.UseExtraPathsToFindReferences, MyConfig.UseExtraPathsToFindDefinition, false, false);
        const pathsForDefinition = toOsPathsForText(findDefinitionPathOptions.replace(/\s*-r?p\s+/, ""), terminalType);
        const pathsForOthers = toOsPathsForText(findReferencesPathOptions.replace(/\s*-r?p\s+/, ""), terminalType);
        if (pathsForDefinition.includes(" ") || pathsForOthers.includes(" ")) {
            return "echo Skip due to whitespace found in workspace root paths. | msr -aPA -t .+";
        }

        const commonSkip = ` --nt "use-[wr]p|out-[fr]p|find-ndp"`;
        if (isWindowsTerminal) {
            return getWindowsBody();
        }

        return getLinuxBody(true, true, false) + andText + getLinuxBody(false, false, true);

        function getWindowsBody(): string {
            const headCopyCmd = useTmpFile ? copyCmd + andText : "";
            const tailLoadCmd = andText + loadCmdAliasCmd;
            if (onlyForOutput) {
                if (outputFullPath) {
                    return headCopyCmd
                        + replaceHead
                        + ` -x find-` + ` --nt "use-[wr]p|out-[fr]p|find-ndp|\\s+-W\\s+"`
                        + ` -t "(=msr -rp.*?\\S+)"`
                        + ` -o "\\1 -W"`
                        + ` -R -c Output full path.`
                        + tailLoadCmd;
                } else {
                    return headCopyCmd
                        + replaceHead + ` -x find-`
                        + ` -t "(=msr -rp.*?)\\s+-W\\s+"`
                        + ` -o "\\1 "` + commonSkip
                        + ` -R -c Output relative path.`
                        + tailLoadCmd;
                }
            }

            if (useWorkspacePath) {
                return headCopyCmd
                    + replaceHead + ` -t "find-\\S*def"` + commonSkip
                    + ` -x "msr -rp . "`
                    + ` -o "msr -rp ${pathsForDefinition} "`
                    + ` -R -c Use workspace paths for all find-def + find-xxx-def`
                    + andText + replaceHead + ` -t "find-" --nt "use-[wr]p|out-[fr]p|find-ndp|find-\\S*def" `
                    + ` -x "msr -rp . "`
                    + ` -o "msr -rp ${pathsForOthers} "`
                    + ` -R -c Use workspace paths for others like find-ref or find-doc etc.`
                    + tailLoadCmd;
            } else {
                // Skip case of workspace root path contains whitespace
                // + andText + replaceHead + ` -x find- -t "msr\\s+-rp\\s+(\\.?\\w+\\S+|([\\"']).+?\\2)" -o "msr -rp ." -R -c Use relative paths for all find-xxx`
                return headCopyCmd
                    + replaceHead + commonSkip
                    + ` -x "find-"` + ` -t "msr\\s+-rp\\s+\\S+"`
                    + ` -o "msr -rp ."`
                    + ` -R -c Use relative paths for all find-xxx`
                    + tailLoadCmd;
            }
        }

        function getLinuxBody(forFunction: boolean, copySourceFile: boolean, addLoadCmd: boolean) {
            const headCopyCmd = copySourceFile && useTmpFile ? copyCmd + andText : "";
            const tailLoadCmd = addLoadCmd ? andText + loadCmdAliasCmd : "";
            const functionCondition = ` -b "alias find-.*?=.*?function"` + ` -Q "^\\s*\\}"`;
            if (onlyForOutput) {
                if (outputFullPath) {
                    const findText = forFunction
                        ? functionCondition + ` --nt "use-[wr]p|out-[fr]p|find-ndp|\\s+-W\\s+"` + ` -t "^(\\s*msr -rp.*?\\S+)"`
                        : ` --nt "use-[wr]p|out-[fr]p|find-ndp|\\s+-W\\s+"` + ` -t "(alias find-.*?=.*?msr -rp.*?\\S+)"`;
                    return headCopyCmd
                        + replaceHead + findText + ` -o "\\1 -W"` + ` -R -c Output full path` + (forFunction ? " for functions" : "")
                        + tailLoadCmd;
                } else {
                    const findText = forFunction
                        ? functionCondition + ` --nt "use-[wr]p|out-[fr]p|find-ndp"` + ` -t "^(\\s*msr -rp.*?)\\s+-W\\s+(.*)"`
                        : ` --nt "use-[wr]p|out-[fr]p|find-ndp"` + ` -t "(alias find-.*?=.*?msr -rp.*?)\\s+-W\\s+(.*)"`;
                    return headCopyCmd
                        + replaceHead + findText + ` -o "\\1 \\2"` + ` -R -c Output relative path` + (forFunction ? " for functions" : "")
                        + tailLoadCmd;
                }
            }

            if (useWorkspacePath) {
                if (forFunction) {
                    // for functions on Linux / Cygwin / MinGW
                    return headCopyCmd + replaceHead + functionCondition + ` --nt "use-[wr]p|out-[fr]p|find-ndp"`
                        + ` -t "msr -rp . "`
                        + ` -o "msr -rp ${pathsForDefinition} "`
                        + ` -R -c Use workspace paths for all find-def + find-xxx-def functions`
                        + andText + replaceHead + functionCondition + ` --nt "use-[wr]p|out-[fr]p|find-ndp|find-\\S*def"`
                        + ` -t "msr -rp . "`
                        + ` -o "msr -rp ${pathsForOthers} "`
                        + ` -R -c Use workspace paths for other functions like find-ref or find-doc etc.`
                        + tailLoadCmd;
                }
                else {
                    // for single line alias on Linux / Cygwin / MinGW
                    return headCopyCmd + replaceHead + ` --nt "use-[wr]p|out-[fr]p|find-ndp"`
                        + ` -t "(alias find-\\S*def=.*?)msr -rp . "`
                        + ` -o "\\1msr -rp ${pathsForDefinition} "`
                        + ` -R -c Use workspace paths for all find-def + find-xxx-def`
                        + andText + replaceHead + ` --nt "use-[wr]p|out-[fr]p|find-ndp|find-\\S*def"`
                        + ` -t "(alias find.*?=.*?)msr -rp . " `
                        + ` -o "\\1msr -rp ${pathsForOthers} "`
                        + ` -R -c Use workspace paths for others like find-ref or find-doc etc.`
                        + tailLoadCmd;
                }
            } else {
                // Skip case of workspace root path contains whitespace
                if (forFunction) {
                    // for functions on Linux / Cygwin / MinGW
                    return headCopyCmd + replaceHead + functionCondition + ` --nt "use-[wr]p|out-[fr]p|find-ndp"`
                        + ` -t "^(\\s*)msr\\s+-rp\\s+\\S+" `
                        + ` -o "\\1msr -rp ." `
                        + ` -R -c Use relative paths for all find-xxx functions`
                        + tailLoadCmd;
                }
                else {
                    // for single line alias on Linux / Cygwin / MinGW
                    return headCopyCmd + replaceHead + ` --nt "use-[wr]p|out-[fr]p|find-ndp"`
                        + ` -t "^(\\s*alias find-.*?=.*?)msr\\s+-rp\\s+\\S+"`
                        + ` -o "\\1msr -rp ." `
                        + ` -R -c Use relative paths for all find-xxx`
                        + tailLoadCmd;
                }
            }
        }
    }

    function checkSetPathBeforeRunDoskeyAlias(doskeyOrSourceCmd: string, mergeCmd: boolean, setEnvCmd: string = '') {
        if (mergeCmd) {
            if (!isNullOrEmpty(setEnvCmd)) {
                setEnvCmd += TerminalType.CMD === terminalType ? ' & ' : ' ; ';
            }

            runCmdInTerminal(setEnvCmd + doskeyOrSourceCmd, true);
        } else {
            if (!isNullOrEmpty(setEnvCmd)) {
                runCmdInTerminal(setEnvCmd, true);
            }

            runCmdInTerminal(doskeyOrSourceCmd, true);
        }
    }

    function runCmdInTerminal(cmd: string, showTerminal: boolean = false) {
        const clearAtFirst = MyConfig.ClearTerminalBeforeExecutingCommands;
        if (newTerminal) {
            sendCmdToTerminal(cmd, newTerminal, showTerminal, clearAtFirst, isLinuxTerminalOnWindows);
        } else {
            runCommandInTerminal(cmd, showTerminal, clearAtFirst, isLinuxTerminalOnWindows);
        }
    }
}

function getCommandAliasMap(
    terminalType: TerminalType,
    rootFolderName: string,
    useProjectSpecific: boolean,
    writeToEachFile: boolean,
    dumpOtherCmdAlias: boolean = false,
    newTerminal: vscode.Terminal | undefined = undefined)
    : [Map<string, string>, number, string[]] {

    const isWindowsTerminal = isWindowsTerminalType(terminalType);
    const projectKey = useProjectSpecific ? (rootFolderName || '') : 'notUseProject';
    let skipFoldersPattern = getOverrideConfigByPriority([projectKey, 'default'], 'skipFolders') || '^([\\.\\$]|(Release|Debug|objd?|bin|node_modules|static|dist|target|(Js)?Packages|\\w+-packages?)$|__pycache__)';
    if (useProjectSpecific) {
        skipFoldersPattern = mergeSkipFolderPattern(skipFoldersPattern);
    }

    let fileTypes = Array.from(MappedExtToCodeFilePatternMap.keys());
    if (!fileTypes.includes('py')) {
        fileTypes.push('py');
    }

    const findTypes = ['definition', 'reference'];

    let cmdAliasMap = (writeToEachFile && !dumpOtherCmdAlias)
        ? new Map<string, string>()
        : getExistingCmdAlias(terminalType, writeToEachFile);

    const oldCmdCount = cmdAliasMap.size;

    let commands: string[] = [];
    fileTypes.forEach(ext => {
        if (ext === 'default') {
            return;
        }

        let cmdName = 'find-' + ext.replace(/Files?$/i, '');
        let filePattern = getOverrideConfigByPriority([projectKey + '.' + ext, ext, projectKey], 'codeFiles');
        if (isNullOrEmpty(filePattern)) {
            filePattern = MappedExtToCodeFilePatternMap.get(ext) || '';
        }

        if (isNullOrEmpty(filePattern)) {
            filePattern = '\\.' + escapeRegExp(ext) + '$';
        }

        // msr.definition.extraOptions msr.default.extraOptions
        const extraOption = addFullPathHideWarningOption(getConfigValue(projectKey, ext, ext, 'extraOptions'));

        let body = 'msr -rp . --nd "' + skipFoldersPattern + '" -f "' + filePattern + '" ' + extraOption;
        commands.push(getCommandAlias(cmdName, body, false));

        findTypes.forEach(fd => {
            // msr.cpp.member.definition msr.py.class.definition msr.default.class.definition msr.default.definition
            let searchPattern = getConfigValue(projectKey, ext, ext, fd);

            if (searchPattern.length > 0) {
                searchPattern = ' -t "' + searchPattern + '"';
            }

            // msr.cpp.member.skip.definition  msr.cpp.skip.definition msr.default.skip.definition
            let skipPattern = getConfigValue(projectKey, ext, ext, 'skip.' + fd);
            if (skipPattern.length > 0) {
                skipPattern = ' --nt "' + skipPattern + '"';
            }

            const newBody = body + skipPattern + searchPattern;
            commands.push(getCommandAlias(cmdName + '-' + fd.replace(/^(.{3}).*/, '$1'), newBody, true));
        });
    });

    // find-def find-ref find-all-def find-pure-ref
    [...findTypes, 'all-def', 'pure-ref'].forEach(fd => {
        const findToCmdNameMap = new Map<string, string>()
            .set('pure-ref', 'find-pure-ref')
            .set('all-def', 'find-all-def');
        const findToSearchConfigKeyMap = new Map<string, string>()
            .set('all-def', 'definition')
            .set('pure-ref', 'reference');
        const findToSkipConfigKeyMap = new Map<string, string>()
            .set('all-def', 'definition')
            .set('pure-ref', 'pureReference');

        const configKeyForSkip = findToSkipConfigKeyMap.get(fd) || fd;
        const configKeyForSearch = findToSearchConfigKeyMap.get(fd) || fd;

        const cmdName = findToCmdNameMap.get(fd) || 'find-' + fd.replace(/^(.{3}).*/, '$1');

        // msr.cpp.member.definition msr.py.class.definition msr.default.class.definition msr.default.definition
        let searchPattern = getOverrideConfigByPriority([projectKey, 'default'], configKeyForSearch);

        if (searchPattern.length > 0) {
            searchPattern = ' -t "' + searchPattern + '"';
        }

        // msr.cpp.member.skip.definition  msr.cpp.skip.definition msr.default.skip.definition
        const configNamesForSkip = fd === 'all-def' ? ['ui', 'default'] : [projectKey, 'default'];
        let skipPattern = getOverrideConfigByPriority(configNamesForSkip, 'skip.' + configKeyForSkip);
        if (skipPattern.length > 0) {
            skipPattern = ' --nt "' + skipPattern + '"';
        }

        const filePattern = getOverrideConfigByPriority([projectKey, 'default'], 'allFiles'); // codeFilesPlusUI

        // msr.definition.extraOptions msr.default.extraOptions
        const extraOption = addFullPathHideWarningOption(getOverrideConfigByPriority([projectKey, 'default'], 'extraOptions'));

        let body = 'msr -rp . --nd "' + skipFoldersPattern + '" -f "' + filePattern + '" ' + extraOption;
        body += skipPattern + searchPattern;
        commands.push(getCommandAlias(cmdName, body, true));
    });

    // msr.cpp.member.definition msr.py.class.definition msr.default.class.definition msr.default.definition
    const additionalFileTypes = ['allFiles', 'docFiles', 'configFiles', 'scriptFiles'];
    additionalFileTypes.forEach(fp => {
        const filePattern = getOverrideConfigByPriority([projectKey, 'default'], fp);

        // find-all
        const cmdName = 'find-' + fp.replace(/[A-Z]\w*$/, '');

        // msr.definition.extraOptions msr.default.extraOptions
        let extraOption = addFullPathHideWarningOption(getOverrideConfigByPriority([projectKey, 'default'], 'extraOptions'));
        if (/find-config|find-script/.test(cmdName)) {
            extraOption = extraOption.replace(/(^|\s+)--s2\s+\S+\s*/, ' ');
        }

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

    return [cmdAliasMap, oldCmdCount, commands];

    function getCommandAlias(cmdName: string, body: string, useFunction: boolean): string {
        const text = getCommandAliasText(cmdName, body, useFunction, isWindowsTerminal, writeToEachFile);
        cmdAliasMap.set(cmdName, text);
        return text;
    }
}

function getCommandAliasText(
    cmdName: string,
    cmdBody: string,
    useFunction: boolean,
    isWindowsTerminal: boolean,
    writeToEachFile: boolean,
    addTailArgs: boolean = true,
    hideCmdAddColor: boolean = true): string {
    if (hideCmdAddColor) {
        cmdBody = enableColorAndHideCommandLine(cmdBody);
    }
    // body = replaceTextByRegex(body, /\s+%~?1(\s+|$)/g, '').trimRight();

    const hasSearchTextHolder = isWindowsTerminal ? /%~?1/.test(cmdBody) : /\$1|%~?1/.test(cmdBody);
    if (hasSearchTextHolder) {
        cmdBody = replaceTextByRegex(cmdBody.trimRight(), SearchTextHolderReplaceRegex, '$1');
    }

    const tailArgs = !addTailArgs
        ? ""
        : (hasSearchTextHolder
            ? (isWindowsTerminal ? ' $2 $3 $4 $5 $6 $7 $8 $9' : ' "${@:2}"')
            : (isWindowsTerminal ? ' $*' : ' "$@"')
        );

    let commandText = '';
    if (isWindowsTerminal) {
        if (writeToEachFile) {
            commandText = '@' + cmdBody + tailArgs;
            commandText = replaceTextByRegex(commandText, /(\S+)\$1/, '$1%~1');
            commandText = replaceTextByRegex(commandText, /\$(\d+)/, '%$1');
            commandText = replaceText(commandText, '$*', '%*');
        } else {
            commandText = cmdName + '=' + cmdBody + tailArgs;
        }
    } else {
        if (useFunction) {
            const functionName = '_' + replaceText(cmdName, '-', '_');
            if (writeToEachFile) {
                commandText = cmdBody + tailArgs;
            } else {
                commandText = 'alias ' + cmdName + "='function " + functionName + '() {'
                    + '\n\t' + cmdBody + tailArgs
                    + '\n' + '}; ' + functionName + "'";
            }
        } else {
            if (writeToEachFile) {
                commandText = cmdBody + tailArgs;
            } else {
                commandText = 'alias ' + cmdName + "='" + cmdBody + tailArgs + "'";
            }
        }
    }

    return commandText;
}

function outputCmdAliasGuide(isWindowsTerminal: boolean, cmdAliasFile: string, singleScriptFolder: string = '') {
    if (singleScriptFolder.length > 0) {
        outputInfoQuiet(nowText() + 'Add folder ' + singleScriptFolder + ' to PATH then you can directly call the script name everywhere in/out vscode to search/replace like:');
    } else {
        outputInfoQuiet(nowText() + 'Now you can directly use the command shortcuts in/out-of vscode to search + replace like:');
    }

    outputInfoQuiet('find-ndp dir1,dir2,file1,fileN -t MySearchRegex -x AndPlainText');
    outputInfoQuiet('find-nd -t MySearchRegex -x AndPlainText');
    outputInfoQuiet('find-code -it MySearchRegex -x AndPlainText');
    outputInfoQuiet('find-small -it MySearchRegex -U 5 -D 5 : Show up/down lines.');
    outputInfoQuiet('find-doc -it MySearchRegex -x AndPlainText -l -PAC : Show pure path list.');
    outputInfoQuiet('find-py-def MySearchRegex -x AndPlainText : Search definition in python files.');
    outputInfoQuiet('find-py-ref MySearchRegex -x AndPlainText : Search references in python files.');
    outputInfoQuiet('find-ref "class\\s+MyClass" -x AndPlainText --np "unit|test" --xp src\\ext,src\\common -c show command line.');
    outputInfoQuiet('find-def MyClass -x AndPlainText --np "unit|test" --xp src\\ext,src\\common -c show command line.');
    outputInfoQuiet('find-ref MyClass --pp "test|unit" -U 3 -D 3 -H 20 -T 10 :  Preview Up/Down lines + Set Head/Tail lines in test.');
    outputInfoQuiet('find-ref MyOldClassMethodName -o NewName -j : Just preview changes only.');
    outputInfoQuiet('find-ref MyOldClassMethodName -o NewName -R : Replace files, add -K to backup.');
    outputInfoQuiet('alias find-pure-ref');
    outputInfoQuiet('malias find -x all -H 9');
    outputInfoQuiet('malias "find[\\w-]*ref"');
    outputInfoQuiet('malias ".*?(find-\\S+)=.*" -o "\\2"  :  To see all find-xxx alias/doskeys.');
    outputInfoQuiet("malias use-rp :  To see matched alias/doskeys like 'use-rp', 'out-rp', 'use-wp' and 'out-fp' etc.");
    outputInfoQuiet('use-wp  - Use workspace root paths as input: Root folders of current workspace and extra paths you added.');
    outputInfoQuiet('use-rp  - Use relative path as input: The dynamic current folder.');
    outputInfoQuiet('out-rp  - Output relative path. This will not effect if use-wp which input full paths of current workspace.');
    outputInfoQuiet('out-fp  - Output full path.');
    outputInfoQuiet('Add -W to output full path; -I to suppress warnings; -o to replace text, -j to preview changes, -R to replace files.');
    outputInfoQuiet('You can also create your own command shortcuts in the file: ' + cmdAliasFile);
    const updateCmd = isWindowsTerminal ? 'update-doskeys' : 'source {path}';
    outputInfoQuiet('Every time after changes, auto effect for new console/terminal. For current, run `' + updateCmd + '` to take effect immediately.');
    outputInfoQuiet('See + Use command alias(shortcut) in `MSR-RUN-CMD` on `TERMINAL` tab, or start using in a new command window outside.');
    outputInfoQuiet('(if running `find-xxx` in vscode terminals, you can `click` the search results to open in vscode.)');
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

function getExistingCmdAlias(terminalType: TerminalType, forMultipleFiles: boolean): Map<string, string> {
    var map = new Map<string, string>();
    const isWindowsTerminal = isWindowsTerminalType(terminalType);
    const defaultCmdAliasFile = toOsPath(getGeneralCmdAliasFilePath(terminalType), terminalType);
    const cmdHead = isWindowsTerminal ? "doskey /MACROFILE=" : "source ";
    const cmdTail = isWindowsTerminal ? " >nul 2>&1" : " 2>/dev/null 2>&1";
    const separator = isWindowsTerminal ? ' & ' : ' ; ';
    const refreshAliasCmd = cmdHead + quotePaths(defaultCmdAliasFile) + cmdTail;
    const showAliasCmd = isWindowsTerminal ? 'cmd /c "doskey /MACROS"' : 'alias';
    const isNativeTerminal = isWindowsTerminal || IsLinux;
    let readLatestAliasCmd = refreshAliasCmd + separator + showAliasCmd;
    if (!isNativeTerminal) {
        const shellExePath = quotePaths(getTerminalShellExePath());
        readLatestAliasCmd = shellExePath + ' -c "' + replaceText(readLatestAliasCmd, '"', '\"') + '"';
    }

    const messageHead = 'IsNativeTerminal = ' + isNativeTerminal + ', terminalType = ' + TerminalType[terminalType] + ': ';
    if (isWindowsTerminal) {
        outputDebug(messageHead + 'Will fetch existed command shortcuts: ' + readLatestAliasCmd);
    } else {
        outputDebug(messageHead + 'Skip getting existed command shortcuts: ' + readLatestAliasCmd);
        return map;
    }

    const [output, error] = runCommandGetInfo(readLatestAliasCmd, MessageLevel.DEBUG, MessageLevel.DEBUG, MessageLevel.DEBUG);
    if (!output || error) {
        return map;
    }

    return getCmdAliasMapFromText(output, map, forMultipleFiles);
}

function getCmdAliasMapFromText(output: string, map: Map<string, string>, forMultipleFiles: boolean) {
    const lines = output.split(/[\r\n]+/);
    const reg = /^(\w+[\w\.-]+)=(.+)/;
    lines.forEach(a => {
        const match = reg.exec(a);
        if (match) {
            map.set(match[1], forMultipleFiles ? match[2] : match[0]);
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
            outputDebug(nowText() + 'Failed to add exclude folder from settings:' + error.toString());
        }
    }
    else if (isNullOrEmpty(skipFoldersPattern) && MyConfig.ExcludeFoldersFromSettings.size > 0) {
        skipFoldersPattern = '^(' + Array.from(MyConfig.ExcludeFoldersFromSettings).join('|') + ')$';
    }

    return skipFoldersPattern;
}
