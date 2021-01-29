import path = require('path');
import * as vscode from 'vscode';
import { getConfigValue, getSubConfigValue, RootFolder } from './configUtils';
import { IsLinux, IsWindows, IsWSL } from './constants';
import { cookCmdShortcutsOrFile, mergeSkipFolderPattern } from './cookCommandAlias';
import { FindType, TerminalType } from './enums';
import { GitIgnore } from './gitUtils';
import { clearTerminal, getTerminal, outputDebug, outputInfo } from './outputUtils';
import { createRegex, escapeRegExp } from './regexUtils';
import { SearchConfig } from './searchConfig';
import { DefaultTerminalType, getExtensionNoHeadDot, getUniqueStringSetNoCase, IsLinuxTerminalOnWindows, isLinuxTerminalOnWindows, isNullOrEmpty, nowText, quotePaths, toOsPath, toOsPaths, toOsPathsForText, toWSLPaths } from './utils';

const SplitPathsRegex = /\s*[,;]\s*/;
const SplitPathGroupsRegex = /\s*;\s*/;
const FolderToPathPairRegex = /(\w+\S+?)\s*=\s*(\S+.+)$/;

export let MyConfig: DynamicConfig;

export let GitIgnoreInfo: GitIgnore;

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

export class DynamicConfig {
    public RootConfig: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('msr');

    // Temp toggle enable/disable finding definition and reference
    public IsEnabledFindingDefinition: boolean = true;

    public ClearTerminalBeforeExecutingCommands: boolean = false;
    public ShowInfo: boolean = false;
    public IsQuiet: boolean = false;
    public IsDebug: boolean = false;
    public DescendingSortForConsoleOutput: boolean = false;
    public DescendingSortForVSCode: boolean = false;

    public MaxSearchDepth: number = 16;
    public NeedSortResults: boolean = false;

    public ReRunCmdInTerminalIfCostLessThan: number = 3.3;
    public ReRunSearchInTerminalIfResultsMoreThan: number = 1;
    public OnlyFindDefinitionForKnownLanguages: boolean = true;

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
    public HideWarningsAndExtraInfoWhenCookingCommandAlias: boolean = false;
    public OutputFullPathWhenCookingCommandAlias: boolean = true;
    public OutputRelativePathForLinuxTerminalsOnWindows: boolean = true;
    public UseDefaultFindingClassCheckExtensionRegex: RegExp = new RegExp('to-load');
    public AllSourceFileExtensionRegex: RegExp = new RegExp('to-load');
    public AllFileExtensionMapExtRegex: RegExp[] = [];
    public MaxWaitSecondsForSearchDefinition: number = 36.0;
    public MaxWaitSecondsForAutoReSearchDefinition: number = 60.0;
    private ScriptFileExtensionRegex: RegExp = new RegExp('to-load');
    public UseGitIgnoreFile: boolean = true;
    public OmitGitIgnoreExemptions: boolean = false;
    public SkipDotFolders: boolean = true;

    private TmpToggleEnabledExtensionToValueMap = new Map<string, boolean>();

    public isKnownLanguage(extension: string): boolean {
        return FileExtensionToMappedExtensionMap.has(extension) || this.RootConfig.get(extension) !== undefined;
    }

    public isUnknownFileType(extension: string): boolean {
        const ext = extension.replace(/.*?\.(\w+)$/, '$1');
        if (this.isKnownLanguage(ext)) {
            return false;
        }

        if (this.AllSourceFileExtensionRegex.test(extension)) {
            return false;
        }

        for (let reg of this.AllFileExtensionMapExtRegex) {
            if (extension.match(reg)) {
                return false;
            }
        }

        return true;
    }

    public toggleEnableFindingDefinition(extension: string) {
        const isKnownType = this.isKnownLanguage(extension);
        const mappedExt = FileExtensionToMappedExtensionMap.get(extension) || extension;
        const currentStatus = this.TmpToggleEnabledExtensionToValueMap.get(mappedExt);

        let isEnabled = currentStatus === true;
        if (undefined === currentStatus) {
            if (isKnownType) {
                isEnabled = !this.DisabledFileExtensionRegex.test(extension) && !this.DisableFindDefinitionFileExtensionRegex.test(extension);
            } else {
                isEnabled = !MyConfig.OnlyFindDefinitionForKnownLanguages;
            }
        }

        this.TmpToggleEnabledExtensionToValueMap.set(mappedExt, !isEnabled);
        outputInfo(nowText() + 'Toggle to `' + (isEnabled ? 'disabled' : 'enabled') + '` for `' + mappedExt + '` files to find definition.');
    }

    public update() {
        this.RootConfig = vscode.workspace.getConfiguration('msr');
        this.AllFileExtensionMapExtRegex = [];
        const fileExtensionMapInConfig = this.RootConfig.get('fileExtensionMap') as {};
        if (fileExtensionMapInConfig) {
            Object.keys(fileExtensionMapInConfig).forEach((mapExt) => {
                const extensions = (this.RootConfig.get('fileExtensionMap.' + mapExt) as string).split(/\s+/);
                const regexExtensions = extensions.map(ext => escapeRegExp(ext));
                const extensionsRegex = new RegExp('\\.(' + regexExtensions.join('|') + ')$', 'i');
                this.AllFileExtensionMapExtRegex.push(extensionsRegex);
                MappedExtToCodeFilePatternMap.set(mapExt, extensionsRegex.source);
                extensions.forEach((ext) => {
                    FileExtensionToMappedExtensionMap.set(ext, mapExt);
                });
            });
        }

        this.OnlyFindDefinitionForKnownLanguages = getConfigValue('enable.onlyFindDefinitionForKnownLanguages') === 'true';
        this.UseExtraPathsToFindDefinition = getConfigValue('findDefinition.useExtraPaths') === "true";
        this.UseExtraPathsToFindReferences = getConfigValue('findReference.useExtraPaths') === "true";
        this.FindDefinitionInAllFolders = getConfigValue('definition.searchAllRootFolders') === "true";
        this.FindReferencesInAllRootFolders = getConfigValue('reference.searchAllRootFolders') === "true";

        this.ClearTerminalBeforeExecutingCommands = getConfigValue('clearTerminalBeforeExecutingCommands') === 'true';
        this.InitProjectCmdAliasForNewTerminals = getConfigValue('initProjectCmdAliasForNewTerminals') === 'true';
        this.SkipInitCmdAliasForNewTerminalTitleRegex = createRegex(getConfigValue('skipInitCmdAliasForNewTerminalTitleRegex'), 'i');
        this.OverwriteProjectCmdAliasForNewTerminals = getConfigValue('overwriteProjectCmdAliasForNewTerminals') === 'true';
        this.AutoMergeSkipFolders = getConfigValue('autoMergeSkipFolders') === 'true';
        this.ShowInfo = getConfigValue('showInfo') === 'true';
        this.IsQuiet = getConfigValue('quiet') === 'true';
        this.IsDebug = getConfigValue('debug') === 'true';
        this.DescendingSortForConsoleOutput = getConfigValue('descendingSortForConsoleOutput') === 'true';
        this.DescendingSortForVSCode = getConfigValue('descendingSortForVSCode') === 'true';
        this.MaxSearchDepth = parseInt(getConfigValue('maxSearchDepth') || '0');
        this.NeedSortResults = getConfigValue('sortResults') === 'true';
        this.ReRunCmdInTerminalIfCostLessThan = Number(getConfigValue('reRunSearchInTerminalIfCostLessThan') || '3.3');
        this.ReRunSearchInTerminalIfResultsMoreThan = Number(getConfigValue('reRunSearchInTerminalIfResultsMoreThan') || '1');
        this.ConfigAndDocFilesRegex = new RegExp(getConfigValue('configAndDocs') || '\\.(json|xml|ini|ya?ml|md)|readme', 'i');
        this.CodeAndConfigAndDocFilesRegex = new RegExp(getConfigValue('codeAndConfigDocs') || '\\.(cs\\w*|nuspec|config|c[px]*|h[px]*|java|scala|py|go|php|vue|tsx?|jsx?|json|ya?ml|xml|ini|md)$|readme', 'i');
        this.DefaultConstantsRegex = new RegExp(getConfigValue('isFindConstant'));
        this.SearchAllFilesWhenFindingReferences = getConfigValue('searchAllFilesForReferences') === 'true';
        this.SearchAllFilesWhenFindingDefinitions = getConfigValue('searchAllFilesForDefinitions') === 'true';
        this.DisabledRootFolderNameRegex = createRegex(getConfigValue('disable.projectRootFolderNamePattern'));

        this.DisabledFileExtensionRegex = createRegex(getConfigValue('disable.extensionPattern'), 'i', true);
        this.DisableFindDefinitionFileExtensionRegex = createRegex(getConfigValue('disable.findDef.extensionPattern'), 'i', true);
        this.DisableFindReferenceFileExtensionRegex = createRegex(getConfigValue('disable.findRef.extensionPattern'), 'i', true);

        this.HideWarningsAndExtraInfoWhenCookingCommandAlias = getConfigValue('cookCmdAlias.hideWarningsAndExtraInfo') === 'true';
        this.OutputFullPathWhenCookingCommandAlias = getConfigValue('cookCmdAlias.outputFullPath') === 'true';
        this.OutputRelativePathForLinuxTerminalsOnWindows = getConfigValue('cookCmdAlias.outputRelativePathForLinuxTerminalsOnWindows') === 'true';

        this.UseDefaultFindingClassCheckExtensionRegex = createRegex(getConfigValue('useDefaultFindingClass.extensions'));
        this.AllSourceFileExtensionRegex = createRegex(getConfigValue('allFiles'));

        this.MaxWaitSecondsForSearchDefinition = Number(getConfigValue('searchDefinition.timeoutSeconds'));
        this.MaxWaitSecondsForAutoReSearchDefinition = Number(getConfigValue('autoRunSearchDefinition.timeoutSeconds'));
        this.ScriptFileExtensionRegex = createRegex(getConfigValue('scriptFiles'));
        this.UseGitIgnoreFile = getConfigValue('useGitIgnoreFile') === 'true';
        this.OmitGitIgnoreExemptions = getConfigValue('omitGitIgnoreExemptions') === 'true';
        this.SkipDotFolders = getConfigValue('skipDotFoldersIfUseGitIgnoreFile') === 'true';

        SearchConfig.reload();

        this.ExcludeFoldersFromSettings.clear();
        if (this.AutoMergeSkipFolders) {
            this.ExcludeFoldersFromSettings = this.getExcludeFolders('search');
            this.getExcludeFolders('files').forEach(a => this.ExcludeFoldersFromSettings.add(a));
        }
    }

    public isScriptFile(extension: string): boolean {
        return this.ScriptFileExtensionRegex.test(extension.startsWith('.') ? extension : '.' + extension);
    }

    public shouldSkipFinding(findType: FindType, currentFilePath: string): boolean {
        const parsedFile = path.parse(currentFilePath);
        const extension = getExtensionNoHeadDot(parsedFile.ext);
        const mappedExt = FileExtensionToMappedExtensionMap.get(extension) || extension;

        const findTypeText = 'finding "' + FindType[findType] + '` in `' + mappedExt + '` files';
        const toggleTip = FindType.Reference === findType ? '' : 'Change it or temporarily toggle `enable/disable`.';
        const toggleStatus = this.TmpToggleEnabledExtensionToValueMap.get(mappedExt);

        // don't enable finding references:
        if (toggleStatus !== undefined && FindType.Reference !== findType) {
            const status = true === toggleStatus ? '`enabled`' : '`disabled`';
            outputInfo(nowText() + 'Toggle status = ' + status + ' for ' + findTypeText + ' because menu or hot key of `msr.tmpToggleEnableFindingDefinition` had been triggered.');
            return false === toggleStatus;
        }

        if (this.OnlyFindDefinitionForKnownLanguages) {
            if (isNullOrEmpty(mappedExt) || !this.isKnownLanguage(extension)) {
                outputInfo(nowText() + 'Disabled ' + findTypeText + '` files due to `msr.enable.onlyFindDefinitionForKnownLanguages` = true'
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
            const configName = FindType.Definition === findType ? 'disable.findDef.extensionPattern' : 'disable.findRef.extensionPattern';
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

        const trimRegex = /^[\s\*/]+|[\s\*/]+$/g;
        try {
            let map = new Map(Object.entries(config.exclude));
            map.forEach((value, key, _m) => {
                if (value) {
                    let text = key.replace(trimRegex, '');
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

    GitIgnoreInfo = new GitIgnore(path.join(RootFolder, '.gitignore'), MyConfig.UseGitIgnoreFile, MyConfig.OmitGitIgnoreExemptions, MyConfig.SkipDotFolders);

    GitIgnoreInfo.parse(() => {
        const terminal = getTerminal();
        clearTerminal(terminal, IsLinuxTerminalOnWindows);
        cookCmdShortcutsOrFile(RootFolder, true, false, terminal, false, true);
        const autoCompare = getConfigValue('autoCompareFileListsIfUsedGitIgnore') === 'true';
        if (autoCompare) {
            GitIgnoreInfo.compareFileList();
        }
    });

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
    return isNullOrEmpty(folder) ? '' : path.parse(folder).base;
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


export function replaceToRelativeSearchPath(toRunInTerminal: boolean, searchPaths: string, rootFolder: string) {
    if (!SearchConfig.shouldUseRelativeSearchPath(toRunInTerminal)
        || isNullOrEmpty(searchPaths) || isNullOrEmpty(rootFolder)
        // || searchPaths.includes(',')
    ) {
        return searchPaths;
    }

    const paths = searchPaths.split(',').map(a => {
        if (a === rootFolder) {
            return ".";
        }
        return IsWindows ? a.replace(rootFolder + '\\', ".\\") : a.replace(rootFolder + "/", "./");
    });

    searchPaths = paths.join(',');
    return searchPaths;
}

export function getSearchPathOptions(
    toRunInTerminal: boolean,
    useProjectSpecific: boolean,
    codeFilePath: string,
    mappedExt: string,
    isFindingDefinition: boolean,
    useExtraSearchPathsForReference: boolean = true,
    useExtraSearchPathsForDefinition: boolean = true,
    useSkipFolders: boolean = true,
    usePathListFiles: boolean = true,
    forceSetSearchPath: string = '',
    isRecursive: boolean = true): string {
    const rootFolder = getRootFolder(codeFilePath);

    const rootFolderName = getRootFolderName(codeFilePath, true);
    const findAllFolders = isFindingDefinition ? MyConfig.FindDefinitionInAllFolders : MyConfig.FindReferencesInAllRootFolders;
    const rootPaths = !isNullOrEmpty(forceSetSearchPath)
        ? forceSetSearchPath
        : (findAllFolders ? getRootFolders(codeFilePath) : getRootFolder(codeFilePath));

    const recursiveOption = isRecursive || isNullOrEmpty(rootPaths) ? '-rp ' : '-p ';
    const folderKey = useProjectSpecific ? rootFolderName : '';
    const folderKeyDefault = isNullOrEmpty(folderKey) ? 'default' : folderKey;
    const extension = getExtensionNoHeadDot(path.parse(codeFilePath).ext, '');
    const subName = isFindingDefinition ? 'definition' : 'reference';
    let skipFoldersPattern = getSubConfigValue(folderKey, extension, mappedExt, subName, 'skipFolders');
    skipFoldersPattern = mergeSkipFolderPattern(skipFoldersPattern);

    const terminalType = !toRunInTerminal && isLinuxTerminalOnWindows() ? TerminalType.CMD : DefaultTerminalType;
    const skipFolderOptions = useProjectSpecific && GitIgnoreInfo.Valid
        ? GitIgnoreInfo.getSkipPathRegexPattern(toRunInTerminal)
        : (useSkipFolders && skipFoldersPattern.length > 1 ? ' --nd "' + skipFoldersPattern + '"' : '');

    if ((isFindingDefinition && !useExtraSearchPathsForDefinition) || (!isFindingDefinition && !useExtraSearchPathsForReference)) {
        if (isNullOrEmpty(rootPaths)) { // files not in project
            const searchPaths = quotePaths(isFindingDefinition ? toOsPath(replaceToRelativeSearchPath(toRunInTerminal, path.dirname(codeFilePath), rootFolder), terminalType) : codeFilePath);
            return '-p ' + searchPaths;
        } else {
            const searchPaths = quotePaths(toOsPathsForText(replaceToRelativeSearchPath(toRunInTerminal, rootPaths, rootFolder), terminalType));
            return recursiveOption + searchPaths + skipFolderOptions;
        }
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
    searchPathSet = toOsPaths(getUniqueStringSetNoCase(searchPathSet), terminalType);

    let pathsText = Array.from(searchPathSet).join(',').replace(/"/g, '');
    pathsText = quotePaths(pathsText);
    if (isNullOrEmpty(pathsText)) {
        pathsText = '.';
    }

    let pathListFileSet = new Set<string>(thisTypeExtraSearchPathListFiles);
    extraSearchPathFileListSet.forEach(a => pathListFileSet.add(a));
    pathListFileSet = toOsPaths(getUniqueStringSetNoCase(extraSearchPathFileListSet), terminalType);
    let pathFilesText = Array.from(pathListFileSet).join(',').replace(/"/g, '');
    pathFilesText = quotePaths(pathFilesText);

    const readPathListOptions = usePathListFiles && pathListFileSet.size > 0 ? ' -w "' + pathFilesText + '"' : '';
    const searchPaths = replaceToRelativeSearchPath(toRunInTerminal, pathsText, rootFolder);
    const otherOptions = isNullOrEmpty(rootPaths) ? '' : readPathListOptions + skipFolderOptions;
    return recursiveOption + quotePaths(searchPaths) + otherOptions;
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
