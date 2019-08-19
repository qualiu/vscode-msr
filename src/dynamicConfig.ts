'use strict';

import * as vscode from 'vscode';
import path = require('path');
import { isNullOrUndefined } from 'util';
import { outputDebug } from './outputUtils';
import { IsWindows } from './checkTool';
import { stringify } from 'querystring';
import { getNoDuplicateStringSet } from './utils';
import { EmptyRegex, createRegex } from './regexUtils';

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
    return cmd.replace(/(\s+-c\s+.*?)\s*%~?1/, '$1');
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
}

export function getConfig(reload: boolean = false): DynamicConfig {
    if (MyConfig && !reload) {
        return MyConfig;
    }

    MyConfig = new DynamicConfig();
    MyConfig.RootConfig = vscode.workspace.getConfiguration('msr');
    const RootConfig = MyConfig.RootConfig;

    MyConfig.RootPath = vscode.workspace.rootPath || '.';
    MyConfig.ShowInfo = RootConfig.get('showInfo') as boolean;
    MyConfig.IsQuiet = RootConfig.get('quiet') as boolean;
    MyConfig.IsDebug = IsDebugMode || RootConfig.get('debug') as boolean;
    MyConfig.DescendingSortForConsoleOutput = RootConfig.get('descendingSortForConsoleOutput') as boolean || false;
    MyConfig.DescendingSortForVSCode = RootConfig.get('descendingSortForVSCode') as boolean || true;
    MyConfig.DefaultMaxSearchDepth = parseInt(RootConfig.get('default.maxSearchDepth') || '0');
    MyConfig.NeedSortResults = RootConfig.get('default.sortResults') as boolean;
    MyConfig.ReRunCmdInTerminalIfCostLessThan = RootConfig.get('reRunSearchInTerminalIfCostLessThan') as number || 3.3;
    MyConfig.ConfigAndDocFilesRegex = new RegExp(RootConfig.get('default.configAndDocs') as string || '\\.(json|xml|ini|ya?ml|md)|readme', 'i');
    MyConfig.CodeAndConfigAndDocFilesRegex = new RegExp(RootConfig.get('default.codeAndConfigDocs') as string || '\\.(cs\\w*|nuspec|config|c[px]*|h[px]*|java|scala|py|go|php|vue|tsx?|jsx?|json|ya?ml|xml|ini|md)$|readme', 'i');
    MyConfig.DefaultConstantsRegex = new RegExp(RootConfig.get('default.isConstant') as string);
    MyConfig.SearchAllFilesWhenFindingReferences = RootConfig.get('default.searchAllFilesForReferences') as boolean;
    MyConfig.SearchAllFilesWhenFindingDefinitions = RootConfig.get('default.searchAllFilesForDefinitions') as boolean;
    MyConfig.DisabledFileExtensionRegex = createRegex(RootConfig.get('disable.extensionPattern') as string, 'i');
    MyConfig.DisabledGitRootFolderNameRegex = createRegex(RootConfig.get('disable.projectRootFolderNamePattern') as string);

    outputDebug('vscode-msr configuration loaded.');
    return MyConfig;
}

export function getOverrideOrDefaultConfig(mappedExt: string, suffix: string, allowEmpty: boolean = true): string {
    const RootConfig = getConfig().RootConfig || vscode.workspace.getConfiguration('msr');
    let overwriteValue = RootConfig.get(mappedExt + suffix);
    if (overwriteValue !== undefined) {
        if (allowEmpty || (overwriteValue && String(overwriteValue).length > 0)) {
            return !overwriteValue ? '' : String(overwriteValue);
        }
    }

    const defaultValue = RootConfig.get('default' + suffix);
    return !defaultValue ? '' : String(defaultValue);
}

export function getSearchPathOptions(mappedExt: string,
    isFindingDefinition: boolean,
    useExtraSearchPathsForReference: boolean = true,
    useExtraSearchPathsForDefinition: boolean = true): string {

    const RootConfig = getConfig().RootConfig;
    const RootPath = vscode.workspace.rootPath || '.';
    const commonSkipFolders = getOverrideOrDefaultConfig(mappedExt, '.skipFolders', false).trim();
    const projectSkipFolders = (RootConfig.get(GitFolderName + '.skipFolders') as string || '').trim();
    let skipFolderPatternSet: Set<string> = new Set<string>().add(projectSkipFolders.length > 0 ? projectSkipFolders : commonSkipFolders);
    skipFolderPatternSet.delete('');
    const skipFoldersPattern = Array.from(skipFolderPatternSet).join('|');
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
