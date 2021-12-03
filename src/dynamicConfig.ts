import path = require('path');
import * as vscode from 'vscode';
import { GetConfigPriorityPrefixes, getConfigValue, getConfigValueByRoot, getOverrideConfigByPriority, getOverrideOrDefaultConfig, getSubConfigValue } from './configUtils';
import { IsLinux, IsSupportedSystem, IsWindows, IsWSL } from './constants';
import { cookCmdShortcutsOrFile, mergeSkipFolderPattern } from './cookCommandAlias';
import { FindType, TerminalType } from './enums';
import { GitIgnore } from './gitUtils';
import { getRunCmdTerminal, outputDebug, outputError, outputInfo, outputInfoClear } from './outputUtils';
import { createRegex, escapeRegExp } from './regexUtils';
import { SearchConfig } from './searchConfig';
import { DefaultTerminalType, getDefaultRootFolderByActiveFile, getDefaultRootFolderName, getExtensionNoHeadDot, getRootFolder, getRootFolderName, getRootFolders, getUniqueStringSetNoCase, IsLinuxTerminalOnWindows, isLinuxTerminalOnWindows, isNullOrEmpty, IsWindowsTerminalOnWindows, nowText, quotePaths, toOsPath, toOsPaths, toOsPathsForText, toWSLPaths } from './utils';

const SplitPathsRegex = /\s*[,;]\s*/;
const SplitPathGroupsRegex = /\s*;\s*/;
const FolderToPathPairRegex = /(\w+\S+?)\s*=\s*(\S+.+)$/;

export const DefaultRootFolder = getDefaultRootFolderByActiveFile(true);

export let MyConfig: DynamicConfig;

export let WorkspaceToGitIgnoreMap = new Map<string, GitIgnore>();

export let FileExtensionToMappedExtensionMap = new Map<string, string>();
// 	.set('cxx', 'cpp')
// 	.set('hpp', 'cpp')
// 	.set('scala', 'java')
// 	;

export let MappedExtToCodeFilePatternMap = new Map<string, string>()
    // .set('java', RootConfig.get('java.codeFiles') as string)
    // .set('ui', RootConfig.get('ui.codeFiles') as string)
    // .set('cpp', RootConfig.get('cpp.codeFiles') as string)
    .set('', 'default')
    ;

export function removeSearchTextForCommandLine(cmd: string): string {
    return cmd.replace(/(\s+-c)\s+Search\s+%~?1/, '$1');
}

export function getGitIgnore(currentPath: string): GitIgnore {
    const rootFolder = getRootFolder(currentPath);
    const gitIgnore = WorkspaceToGitIgnoreMap.get(rootFolder);
    return gitIgnore || new GitIgnore('');
}

export function updateGitIgnoreUsage() {
    WorkspaceToGitIgnoreMap.clear();

    if (!IsSupportedSystem || !vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length < 1) {
        return;
    }

    for (let k = 0; k < vscode.workspace.workspaceFolders.length; k++) {
        const workspaceFolder = vscode.workspace.workspaceFolders[k].uri.fsPath;
        const rootFolder = getRootFolder(workspaceFolder);
        const projectName = path.basename(rootFolder);
        const useGitIgnoreFile = getOverrideOrDefaultConfig(projectName, 'useGitIgnoreFile') === 'true';
        const omitGitIgnoreExemptions = getOverrideOrDefaultConfig(projectName, 'omitGitIgnoreExemptions') === 'true';
        const skipDotFolders = getOverrideOrDefaultConfig(projectName, 'skipDotFoldersIfUseGitIgnoreFile') === 'true';
        const gitIgnore = new GitIgnore(path.join(rootFolder, '.gitignore'), useGitIgnoreFile, omitGitIgnoreExemptions, skipDotFolders);
        WorkspaceToGitIgnoreMap.set(rootFolder, gitIgnore);
        const canInitGitIgnore = workspaceFolder === DefaultRootFolder;
        function actionWhenSuccessfullyParsedGitIgnore() {
            if (!canInitGitIgnore) {
                return;
            }

            MyConfig.setChangePowerShellToCmdOnWindows(gitIgnore.ExemptionCount < 1);
            const terminal = getRunCmdTerminal();
            // clearTerminal(terminal, IsLinuxTerminalOnWindows);
            cookCmdShortcutsOrFile(false, DefaultRootFolder, true, false, terminal, false);
            const autoCompare = getConfigValue('autoCompareFileListsIfUsedGitIgnore') === 'true';
            if (autoCompare) {
                gitIgnore.compareFileList();
            }
        }

        function actionWhenFailedToParseGitIgnore() {
            cookCmdShortcutsOrFile(false, DefaultRootFolder, true, false, getRunCmdTerminal(), false);
            MyConfig.setChangePowerShellToCmdOnWindows(false);
        }

        gitIgnore.parse(actionWhenSuccessfullyParsedGitIgnore, actionWhenFailedToParseGitIgnore);
    }
}

export function addExtensionToPattern(ext: string, fileExtensionsRegex: RegExp) {
    if (fileExtensionsRegex.test('\.' + ext)) {
        return fileExtensionsRegex;
    }

    const firstMatch = /\|(cpp|cs|java|py|go|rs|vue|tsx?|php|bat|cmd|ps1|sh|ini|xml|json|yaml)\|/i.exec(fileExtensionsRegex.source)
        || /\|\w+\|/.exec(fileExtensionsRegex.source);

    const newPattern = firstMatch
        ? fileExtensionsRegex.source.substring(0, firstMatch.index) + '|' + ext.replace('.', '\\.') + fileExtensionsRegex.source.substring(firstMatch.index)
        : fileExtensionsRegex.source + '|\\.' + ext + '$';

    try {
        fileExtensionsRegex = new RegExp(newPattern, 'i');
    } catch (err) {
        outputError(nowText() + 'Failed to add extension: "' + ext + '" to AllFilesRegex, error: ' + err);
    }

    return fileExtensionsRegex;
}

export class DynamicConfig {
    public RootConfig: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('msr');

    public ChangePowerShellTerminalToCmdOrBash: boolean = false;
    private ChangePowerShellTerminalToCmdOrBashConfig: string = "auto";

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

    public GetSearchTextHolderInCommandLine: RegExp = /\s+-c\s+.*?%~?1/;
    public DisabledFileExtensionRegex: RegExp = new RegExp('to-load');
    public DisabledRootFolderNameRegex: RegExp = new RegExp('to-load');
    public DisableFindDefinitionFileExtensionRegex: RegExp = new RegExp('to-load');
    public DisableFindReferenceFileExtensionRegex: RegExp = new RegExp('to-load');

    public ExcludeFoldersFromSettings: Set<string> = new Set<string>();

    public InitProjectCmdAliasForNewTerminals: boolean = true;
    public SkipInitCmdAliasForNewTerminalTitleRegex: RegExp = new RegExp('to-load');
    public OverwriteProjectCmdAliasForNewTerminals: boolean = true;
    public AutoMergeSkipFolders: boolean = true;

    public HideWarningsAndExtraInfoWhenCookingCommandAlias: boolean = false;
    public OutputFullPathWhenCookingCommandAlias: boolean = false;
    public OutputFullPathWhenCookAndDumpingAliasFiles: boolean = true;
    public OutputRelativePathForLinuxTerminalsOnWindows: boolean = true;
    public AddEchoOffWhenCookingWindowsCommandAlias: string = '';
    public SetVariablesToLocalScopeWhenCookingWindowsCommandAlias: string = '';
    public DefaultConstantsRegex: RegExp = new RegExp('to-load');
    public UseDefaultFindingClassCheckExtensionRegex: RegExp = new RegExp('to-load');
    public MaxWaitSecondsForSearchDefinition: number = 36.0;
    public MaxWaitSecondsForAutoReSearchDefinition: number = 60.0;

    public UseGitIgnoreFile: boolean = true;
    public OmitGitIgnoreExemptions: boolean = false;
    public SkipDotFolders: boolean = true;

    // allFiles codeFiles codeFilesPlusUI codeAndConfig codeAndConfigDocs
    public AllFileExtensionMappingRegexList: RegExp[] = [];
    public CodeFileExtensionMappingTypesRegex: RegExp = new RegExp('to-load msr.codeFileExtensionMappingTypes');
    public AllFilesRegex: RegExp = new RegExp('to-load msr.default.allFiles');
    public AllFilesDefaultRegex: RegExp = new RegExp('to-load msr.default.allFiles');
    public CodeFilesRegex: RegExp = new RegExp('to-load msr.default.codeFiles');
    public CodeFilesDefaultRegex: RegExp = new RegExp('to-load msr.default.codeFiles');
    public CodeFilesPlusUIRegex: RegExp = new RegExp('to-load msr.default.codeFilesPlusUI');
    public CodeFilesPlusUIDefaultRegex: RegExp = new RegExp('to-load msr.default.codeFilesPlusUI');
    public CodeAndConfigRegex: RegExp = new RegExp('to-load msr.default.codeAndConfig');
    public CodeAndConfigDefaultRegex: RegExp = new RegExp('to-load msr.default.codeAndConfig');
    public CodeAndConfigDocsRegex: RegExp = new RegExp('to-load msr.default.codeAndConfigDocs');
    public CodeAndConfigDocsDefaultRegex: RegExp = new RegExp('to-load msr.default.codeAndConfigDocs');

    public ScriptFileExtensionRegex: RegExp = new RegExp('to-load msr.default.scriptFiles');
    public ConfigAndDocFilesRegex: RegExp = new RegExp('to-load msr.default.configAndDocs');

    private TmpToggleEnabledExtensionToValueMap = new Map<string, boolean>();

    public isKnownLanguage(extension: string): boolean {
        return FileExtensionToMappedExtensionMap.has(extension) || this.RootConfig.get(extension) !== undefined;
    }

    public isUnknownFileType(extension: string): boolean {
        const ext = extension.replace(/.*?\.(\w+)$/, '$1');
        if (this.isKnownLanguage(ext)) {
            return false;
        }

        if (this.AllFilesRegex.test(extension) || this.AllFilesDefaultRegex.test(extension)) {
            return false;
        }

        for (let reg of this.AllFileExtensionMappingRegexList) {
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
        const rootFolderName = getDefaultRootFolderName();
        this.ConfigAndDocFilesRegex = new RegExp(getOverrideConfigByPriority([rootFolderName, '', 'default'], 'configAndDocs') || '\\.(json|xml|ini|ya?ml|md)|readme', 'i');

        const codeFileExtensionMappingTypes = getOverrideConfigByPriority([rootFolderName, '', 'default'], 'codeFileExtensionMappingTypes') || '^(cpp|cs|java|py|go|rs|ui)$';
        this.CodeFileExtensionMappingTypesRegex = new RegExp(codeFileExtensionMappingTypes.trim(), 'i');

        this.AllFilesRegex = new RegExp(getOverrideConfigByPriority([rootFolderName, '', 'default'], 'allFiles') || '\.(cp*|hp*|cs|java|scala|py|go|tsx?)$', 'i');
        this.AllFilesDefaultRegex = new RegExp(getOverrideConfigByPriority(['', 'default'], 'allFiles') || '\.(cp*|hp*|cs|java|scala|py|go|tsx?)$', 'i');
        this.CodeFilesRegex = new RegExp(getOverrideConfigByPriority([rootFolderName, '', 'default'], 'codeFiles') || '\.(cp*|hp*|cs|java|scala|py|go)$', 'i');
        this.CodeFilesDefaultRegex = new RegExp(getOverrideConfigByPriority(['', 'default'], 'codeFiles') || '\.(cp*|hp*|cs|java|scala|py|go)$', 'i');
        this.CodeAndConfigRegex = new RegExp(getOverrideConfigByPriority([rootFolderName, '', 'default'], 'codeAndConfig') || '\.(cp*|hp*|cs|java|scala|py|go|md)$', 'i');
        this.CodeAndConfigDefaultRegex = new RegExp(getOverrideConfigByPriority(['', 'default'], 'codeAndConfig') || '\.(cp*|hp*|cs|java|scala|py|go|md)$', 'i');
        this.CodeFilesPlusUIRegex = new RegExp(getOverrideConfigByPriority([rootFolderName, '', 'default'], 'codeFilesPlusUI') || '\.(cp*|hp*|cs|java|scala|py|go|tsx?)$', 'i');
        this.CodeFilesPlusUIDefaultRegex = new RegExp(getOverrideConfigByPriority(['', 'default'], 'codeFilesPlusUI') || '\.(cp*|hp*|cs|java|scala|py|go|tsx?)$', 'i');
        this.CodeAndConfigDocsRegex = new RegExp(getOverrideConfigByPriority([rootFolderName, '', 'default'], 'codeAndConfigDocs') || '\\.(cs\\w*|nuspec|config|c[px]*|h[px]*|java|scala|py|go|php|vue|tsx?|jsx?|json|ya?ml|xml|ini|md)$|readme', 'i');
        this.CodeAndConfigDocsDefaultRegex = new RegExp(getOverrideConfigByPriority(['', 'default'], 'codeAndConfigDocs') || '\\.(cs\\w*|nuspec|config|c[px]*|h[px]*|java|scala|py|go|php|vue|tsx?|jsx?|json|ya?ml|xml|ini|md)$|readme', 'i');

        this.AllFileExtensionMappingRegexList = [];
        const fileExtensionMapInConfig = this.RootConfig.get('fileExtensionMap') as {};
        if (fileExtensionMapInConfig) {
            Object.keys(fileExtensionMapInConfig).forEach((mapExt) => {
                const extensions = (this.RootConfig.get('fileExtensionMap.' + mapExt) as string).split(/\s+/);
                const regexExtensions = extensions.map(ext => escapeRegExp(ext));
                const extensionsRegex = new RegExp('\\.(' + regexExtensions.join('|') + ')$', 'i');
                this.AllFileExtensionMappingRegexList.push(extensionsRegex);
                MappedExtToCodeFilePatternMap.set(mapExt, extensionsRegex.source);
                extensions.forEach((ext) => {
                    FileExtensionToMappedExtensionMap.set(ext, mapExt);
                    this.AllFilesRegex = addExtensionToPattern(ext, this.AllFilesRegex);
                    this.AllFilesDefaultRegex = addExtensionToPattern(ext, this.AllFilesDefaultRegex);
                    if (this.CodeFileExtensionMappingTypesRegex.test(mapExt)) {
                        this.CodeFilesRegex = addExtensionToPattern(ext, this.CodeFilesRegex);
                        this.CodeFilesDefaultRegex = addExtensionToPattern(ext, this.CodeFilesDefaultRegex);
                        this.CodeAndConfigRegex = addExtensionToPattern(ext, this.CodeAndConfigRegex);
                        this.CodeAndConfigDefaultRegex = addExtensionToPattern(ext, this.CodeAndConfigDefaultRegex);
                        this.CodeFilesPlusUIRegex = addExtensionToPattern(ext, this.CodeFilesPlusUIRegex);
                        this.CodeFilesPlusUIDefaultRegex = addExtensionToPattern(ext, this.CodeFilesPlusUIDefaultRegex);
                        this.CodeAndConfigDocsRegex = addExtensionToPattern(ext, this.CodeAndConfigDocsRegex);
                        this.CodeAndConfigDocsDefaultRegex = addExtensionToPattern(ext, this.CodeAndConfigDocsDefaultRegex);
                    }
                });
            });
        }

        this.OnlyFindDefinitionForKnownLanguages = getConfigValue('enable.onlyFindDefinitionForKnownLanguages') === 'true';
        this.ClearTerminalBeforeExecutingCommands = getConfigValue('clearTerminalBeforeExecutingCommands') === 'true';
        this.InitProjectCmdAliasForNewTerminals = getConfigValue('initProjectCmdAliasForNewTerminals') === 'true';
        this.ChangePowerShellTerminalToCmdOrBashConfig = getConfigValue('changePowerShellTerminalToCmdOrBash');
        this.ChangePowerShellTerminalToCmdOrBash = /auto|true/i.test(this.ChangePowerShellTerminalToCmdOrBashConfig);
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
        this.DefaultConstantsRegex = new RegExp(getConfigValue('isFindConstant'));

        this.DisabledRootFolderNameRegex = createRegex(getConfigValue('disable.projectRootFolderNamePattern'));

        this.DisabledFileExtensionRegex = createRegex(getConfigValue('disable.extensionPattern'), 'i', true);
        this.DisableFindDefinitionFileExtensionRegex = createRegex(getConfigValue('disable.findDef.extensionPattern'), 'i', true);
        this.DisableFindReferenceFileExtensionRegex = createRegex(getConfigValue('disable.findRef.extensionPattern'), 'i', true);

        this.HideWarningsAndExtraInfoWhenCookingCommandAlias = getConfigValue('cookCmdAlias.hideWarningsAndExtraInfo') === 'true';
        this.OutputFullPathWhenCookingCommandAlias = getConfigValue('cookCmdAlias.outputFullPath') === 'true';
        this.OutputFullPathWhenCookAndDumpingAliasFiles = getConfigValue('cookCmdAlias.outputFullPathForDumpingScriptFiles') === 'true';
        this.OutputRelativePathForLinuxTerminalsOnWindows = getConfigValue('cookCmdAlias.outputRelativePathForLinuxTerminalsOnWindows') === 'true';
        this.AddEchoOffWhenCookingWindowsCommandAlias = getConfigValue('cookCmdAlias.addEchoOff', true);
        this.SetVariablesToLocalScopeWhenCookingWindowsCommandAlias = getConfigValue('cookCmdAlias.setVariablesToLocalScope', true);

        this.UseDefaultFindingClassCheckExtensionRegex = createRegex(getConfigValue('useDefaultFindingClass.extensions'));

        this.MaxWaitSecondsForSearchDefinition = Number(getConfigValue('searchDefinition.timeoutSeconds'));
        this.MaxWaitSecondsForAutoReSearchDefinition = Number(getConfigValue('autoRunSearchDefinition.timeoutSeconds'));
        this.ScriptFileExtensionRegex = createRegex(this.RootConfig.get('default.scriptFiles') || '\\.(bat|cmd|psm?1|sh|bash|[kzct]sh)$', 'i');
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

    // If has git-exemptions, should not use git-ignore and thus better to use PowerShell (general search).
    public setChangePowerShellToCmdOnWindows(shouldChange: boolean) {
        if (/auto/i.test(MyConfig.ChangePowerShellTerminalToCmdOrBashConfig)) {
            MyConfig.ChangePowerShellTerminalToCmdOrBash = shouldChange;
        }
    }

    public isScriptFile(extension: string): boolean {
        return this.ScriptFileExtensionRegex.test(extension.startsWith('.') ? extension : '.' + extension);
    }

    public isCodeFiles(extension: string): boolean {
        return this.CodeFilesRegex.test(extension.startsWith('.') ? extension : '.' + extension) && !this.isScriptFile(extension);
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
            outputInfoClear(nowText() + 'Toggle status = ' + status + ' for ' + findTypeText + ' because menu or hot key of `msr.tmpToggleEnableFindingDefinition` had been triggered.');
            return false === toggleStatus;
        }

        if (this.OnlyFindDefinitionForKnownLanguages) {
            if (isNullOrEmpty(mappedExt) || !this.isKnownLanguage(extension)) {
                outputInfoClear(nowText() + 'Disabled ' + findTypeText + '` files due to `msr.enable.onlyFindDefinitionForKnownLanguages` = true'
                    + ' + Not exist `msr.fileExtensionMap.' + extension + '` nor `msr.' + extension + '.xxx`. ' + toggleTip);
                return true;
            }
        }

        const checkRegex = FindType.Definition === findType
            ? this.DisableFindDefinitionFileExtensionRegex
            : this.DisableFindReferenceFileExtensionRegex;

        if (MyConfig.DisabledFileExtensionRegex.test(extension)) {
            outputInfoClear(nowText() + 'Disabled ' + findTypeText + ' by `msr.disable.extensionPattern` = "' + this.DisabledFileExtensionRegex.source + '". ' + toggleTip);
            return true;
        }

        if (checkRegex.test(extension)) {
            const configName = FindType.Definition === findType ? 'disable.findDef.extensionPattern' : 'disable.findRef.extensionPattern';
            outputInfoClear(nowText() + 'Disabled ' + findTypeText + '` by `' + configName + '` = "' + this.RootConfig.get(configName) + '". ' + toggleTip);
            return true;
        }

        const rootFolderName = getRootFolderName(currentFilePath, true);
        if (MyConfig.DisabledRootFolderNameRegex.test(rootFolderName)) {
            outputInfoClear(nowText() + 'Disabled ' + findTypeText + ' by `msr.disable.projectRootFolderNamePattern` = "' + MyConfig.DisabledRootFolderNameRegex.source + '". ' + toggleTip);
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
            outputDebug(nowText() + 'Failed to get exclude folder from `' + keyName + '.exclude`: ' + error);
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

    updateGitIgnoreUsage();

    return MyConfig;
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
    useExtraSearchPathsForReference: boolean = false,
    useExtraSearchPathsForDefinition: boolean = true,
    useSkipFolders: boolean = true,
    usePathListFiles: boolean = true,
    forceSetSearchPath: string = '',
    isRecursive: boolean = true): string {
    const allRootFolders = getRootFolders(codeFilePath);
    const rootFolder = allRootFolders.includes(forceSetSearchPath) ? getRootFolder(forceSetSearchPath) : getRootFolder(codeFilePath);
    const extension = getExtensionNoHeadDot(path.parse(codeFilePath).ext, '');
    const rootFolderName = getRootFolderName(codeFilePath, true);
    const findDefinitionInAllFolders = getConfigValueByRoot(rootFolderName, extension, mappedExt, 'definition.searchAllRootFolders') === "true";
    const findReferencesInAllRootFolders = getConfigValueByRoot(rootFolderName, extension, mappedExt, 'reference.searchAllRootFolders') === "true";
    const findAllFolders = isFindingDefinition ? findDefinitionInAllFolders : findReferencesInAllRootFolders;
    const rootPaths = !isNullOrEmpty(forceSetSearchPath)
        ? forceSetSearchPath
        : (findAllFolders ? getRootFolders(codeFilePath).join(',') : getRootFolder(codeFilePath));

    const recursiveOption = isRecursive || isNullOrEmpty(rootPaths) ? '-rp ' : '-p ';
    const folderKey = useProjectSpecific ? rootFolderName : '';

    const subName = isFindingDefinition ? 'definition' : 'reference';
    let skipFoldersPattern = getSubConfigValue(folderKey, extension, mappedExt, subName, 'skipFolders');
    skipFoldersPattern = mergeSkipFolderPattern(skipFoldersPattern);

    const terminalType = !toRunInTerminal && isLinuxTerminalOnWindows() ? TerminalType.CMD : DefaultTerminalType;
    const gitIgnoreInfo = getGitIgnore(rootFolder);
    const skipFolderOptions = useProjectSpecific && gitIgnoreInfo.Valid && (!toRunInTerminal || allRootFolders.length < 2)
        ? gitIgnoreInfo.getSkipPathRegexPattern(toRunInTerminal)
        : (useSkipFolders && skipFoldersPattern.length > 1 ? ' --nd "' + skipFoldersPattern + '"' : '');

    const shouldSearchExtraPaths = isFindingDefinition && useExtraSearchPathsForDefinition || !isFindingDefinition && useExtraSearchPathsForReference;
    if (!shouldSearchExtraPaths) {
        if (isNullOrEmpty(rootPaths)) { // files not in project
            const searchPaths = quotePaths(isFindingDefinition ? toOsPath(replaceToRelativeSearchPath(toRunInTerminal, path.dirname(codeFilePath), rootFolder), terminalType) : codeFilePath);
            return '-p ' + searchPaths;
        } else {
            const searchPaths = quotePaths(toOsPathsForText(replaceToRelativeSearchPath(toRunInTerminal, rootPaths, rootFolder), terminalType));
            return recursiveOption + searchPaths + skipFolderOptions;
        }
    }

    const [extraSearchPathSet, extraSearchPathFileListSet] = shouldSearchExtraPaths
        ? getExtraSearchPaths(folderKey, extension, mappedExt)
        : [new Set<string>(), new Set<string>()];

    let searchPathSet = new Set<string>((rootPaths || (isFindingDefinition ? path.dirname(codeFilePath) : codeFilePath)).split(','));
    extraSearchPathSet.forEach(a => searchPathSet.add(a));
    searchPathSet = toOsPaths(getUniqueStringSetNoCase(searchPathSet), terminalType);

    let pathsText = Array.from(searchPathSet).join(',').replace(/"/g, '');
    pathsText = quotePaths(pathsText);
    if (isNullOrEmpty(pathsText)) {
        pathsText = '.';
    }

    const pathListFileSet = toOsPaths(getUniqueStringSetNoCase(extraSearchPathFileListSet), terminalType);
    let pathFilesText = Array.from(pathListFileSet).join(',').replace(/"/g, '');
    pathFilesText = quotePaths(pathFilesText);

    const readPathListOptions = usePathListFiles && pathListFileSet.size > 0 ? ' -w "' + pathFilesText + '"' : '';
    const searchPaths = replaceToRelativeSearchPath(toRunInTerminal, pathsText, rootFolder);
    const otherOptions = isNullOrEmpty(rootPaths) ? '' : readPathListOptions + skipFolderOptions;
    return recursiveOption + quotePaths(searchPaths) + otherOptions;
}

export function getExtraSearchPaths(folderKey: string, extension: string, mappedExt: string): [Set<string>, Set<string>] {
    let extraSearchPathSet = getExtraSearchPathsOrFileLists('extraSearchPaths', folderKey, extension, mappedExt);
    getExtraSearchPathsOrFileLists('extraSearchPathGroups', folderKey, extension, mappedExt)
        .forEach(a => extraSearchPathSet.add(a));

    let extraSearchPathFileListSet = getExtraSearchPathsOrFileLists('extraSearchPathListFiles', folderKey, extension, mappedExt);
    getExtraSearchPathsOrFileLists('extraSearchPathListFileGroups', folderKey, extension, mappedExt)
        .forEach(a => extraSearchPathFileListSet.add(a));

    return [extraSearchPathSet, extraSearchPathFileListSet];
}

export function getExtraSearchPathsOrFileLists(configKeyTailName: string, rootFolderName: string, extension: string, mappedExt: string): Set<string> {
    let extraSearchPaths = new Set<string>();
    let extraSearchPathGroups: string[] = [];
    const prefixSet = GetConfigPriorityPrefixes(rootFolderName, extension, mappedExt);
    for (let k = 0; k < prefixSet.length; k++) {
        const configKey = prefixSet[k] + '.' + configKeyTailName;
        const extraPathObject = MyConfig.RootConfig.get(configKey);
        if (extraPathObject === undefined || extraPathObject === null) {
            continue;
        }

        const valueType = typeof extraPathObject;

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

        break;
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

    const specificPaths = folderNameToPathMap.get(rootFolderName) || '';
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
    outputDebug(`IsWindows = ${IsWindows}, IsWSL = ${IsWSL}, IsLinux = ${IsLinux}, DefaultTerminalType = ${TerminalType[DefaultTerminalType]}`);
    outputDebug(`IsWindowsTerminalOnWindows = ${IsWindowsTerminalOnWindows}, IsLinuxTerminalOnWindows = ${IsLinuxTerminalOnWindows}`);
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
