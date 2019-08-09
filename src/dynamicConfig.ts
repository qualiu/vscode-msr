'use strict';

import * as vscode from 'vscode';
import path = require('path');
import { isNullOrUndefined } from 'util';
import { outputDebug } from './outputUtils';
import { IsWindows } from './checkTool';
import { stringify } from 'querystring';
import { getNoDuplicateStringSet } from './utils';
import { EmptyRegex } from './regexUtils';

export const IsDebugMode = process.execArgv && process.execArgv.length > 0 && process.execArgv.some((arg) => /^--debug=?/.test(arg) || /^--(debug|inspect)-brk=?/.test(arg));
export const ShouldQuotePathRegex = IsWindows ? /[^\w\.,\\/:-]/ : /[^\w\.,\\/-]/;
export const SearchTextHolder = '%1';
export const SearchTextHolderReplaceRegex = /%~?1/g;

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
    public DisabledFileExtensionRegex : RegExp = new RegExp('to-load');
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
    const disabledExtensionPatterns = (RootConfig.get('disable.extensionPatterns') as string).trim() || '';
    MyConfig.DisabledFileExtensionRegex = disabledExtensionPatterns.length > 0 ? new RegExp(disabledExtensionPatterns) : EmptyRegex;
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

export function getSearchPathOptions(mappedExt: string, isFindingDefinition: boolean, useExtraSearchPaths: boolean = true): string {
    const RootPath = vscode.workspace.rootPath || '.';
    const skipFolders = getOverrideOrDefaultConfig(mappedExt, '.skipFolders', false);
    const skipFolderOptions = skipFolders.length > 1 ? ' --nd "' + skipFolders + '"' : '';
    if (!useExtraSearchPaths) {
        return '-rp ' + RootPath + skipFolderOptions;
    }

    const parsedPath = path.parse(RootPath);
    const folderName = parsedPath.base;

    const extraSearchPathSet = getExtraSearchPathsOrFileLists('default.extraSearchPaths', folderName);
    const extraSearchPathFileListSet = getExtraSearchPathsOrFileLists('default.extraSearchPathListFiles', folderName);

    const thisTypeExtraSearchPaths = !isFindingDefinition ? new Set<string>() : getExtraSearchPathsOrFileLists(mappedExt + '.extraSearchPaths', folderName);
    const thisTypeExtraSearchPathListFiles = !isFindingDefinition ? new Set<string>() : getExtraSearchPathsOrFileLists(mappedExt + '.extraSearchPathListFiles', folderName);

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
    const RootConfig = getConfig().RootConfig || vscode.workspace.getConfiguration('msr');
    const extraSearchPathGroups = (RootConfig.get(configKey) as string || '').trim().split(SplitPathGroupsRegex).filter(a => a.length > 0);

    let extraSearchPaths = new Set<string>();
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
    specificPaths.split(SplitPathsRegex).forEach(a => {
        extraSearchPaths.add(a.trim());
    });

    extraSearchPaths = getNoDuplicateStringSet(extraSearchPaths);
    return extraSearchPaths;
}
