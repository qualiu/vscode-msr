'use strict';

import * as vscode from 'vscode';
import path = require('path');
import { isNullOrUndefined } from 'util';
import { outDebug } from './outputUtils';
import { IsWindows } from './checkTool';

export const IsDebugMode = process.execArgv && process.execArgv.length > 0 && process.execArgv.some((arg) => /^--debug=?/.test(arg) || /^--(debug|inspect)-brk=?/.test(arg));
export const ShouldQuotePathRegex = IsWindows ? /[^\w\.,\\/:-]/ : /[^\w\.,\\/-]/;
const SplitPathsRegex = /\s*[,;]\s*/;

let MyConfig: DynamicConfig;

export class DynamicConfig {
    public RootConfig: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('msr');
    public RootPath: string = '';
    public ShowInfo: boolean = false;
    public IsDebug: boolean = false;
    public DescendingSortForConsoleOutput: boolean = false;
    public DescendingSortForVSCode: boolean = false;

    public DefaultMaxSearchDepth: number = 16;
    public NeedSortResults: boolean = false;

    public ReRunCmdInTerminalIfCostLessThan: number = 3.3;

    public ConfigAndDocFilesRegex: RegExp = new RegExp('to-load');
    public CodeAndConfigAndDocFilesRegex: RegExp = new RegExp('to-load');
    public DefaultConstantsRegex: RegExp = new RegExp('to-load');
    public SearchTextHolder: string = '';
    public SearchTextHolderReplaceRegex: RegExp = new RegExp('to-load');
    public SearchAllFilesWhenFindingReferences: boolean = false;
    public SearchAllFilesWhenFindingDefinitions: boolean = false;
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
    MyConfig.IsDebug = IsDebugMode || RootConfig.get('debug') as boolean;
    MyConfig.DescendingSortForConsoleOutput = RootConfig.get('descendingSortForConsoleOutput') as boolean || false;
    MyConfig.DescendingSortForVSCode = RootConfig.get('descendingSortForVSCode') as boolean || true;

    MyConfig.DefaultMaxSearchDepth = parseInt(RootConfig.get('default.maxSearchDepth') || '0');
    MyConfig.NeedSortResults = RootConfig.get('default.sortResults') as boolean;

    MyConfig.ReRunCmdInTerminalIfCostLessThan = RootConfig.get('reRunCmdInTerminalIfCostLessThan') as number || 3.3;

    MyConfig.ConfigAndDocFilesRegex = new RegExp(RootConfig.get('default.configAndDocs') as string || '\\.(json|xml|ini|ya?ml|md)|readme', 'i');
    MyConfig.CodeAndConfigAndDocFilesRegex = new RegExp(RootConfig.get('default.codeAndConfigDocs') as string || '\\.(cs\\w*|nuspec|config|c[px]*|h[px]*|java|scala|py|vue|tsx?|jsx?|json|ya?ml|xml|ini|md)$|readme', 'i');
    MyConfig.DefaultConstantsRegex = new RegExp(RootConfig.get('default.isConstant') as string);
    MyConfig.SearchTextHolder = RootConfig.get('searchTextHolder') as string || '%~?1';
    MyConfig.SearchTextHolderReplaceRegex = new RegExp(MyConfig.SearchTextHolder, 'g');
    MyConfig.SearchAllFilesWhenFindingReferences = RootConfig.get('default.searchAllFilesForReferences') as boolean;
    MyConfig.SearchAllFilesWhenFindingDefinitions = RootConfig.get('default.searchAllFilesForDefinitions') as boolean;
    outDebug('vscode-msr configuration loaded.');
    return MyConfig;
}

export function getOverrideOrDefaultConfig(mappedExt: string, suffix: string, allowEmpty: boolean = true): string {
    const RootConfig = getConfig().RootConfig || vscode.workspace.getConfiguration('msr');
    let overwriteValue = RootConfig.get(mappedExt + suffix);
    if (overwriteValue !== undefined) {
        if (allowEmpty || (overwriteValue as string).length > 0) {
            return overwriteValue as string || '';
        }
    }

    return RootConfig.get('default' + suffix) as string || '';
}

export function getSearchPathOptions(mappedExt: string, isFindingDefinition: boolean, useExtraSearchPaths: boolean = true): string {
    const RootPath = vscode.workspace.rootPath || '.';
    if (!useExtraSearchPaths) {
        return '-rp ' + RootPath;
    }

    const parsedPath = path.parse(RootPath);
    const codeFolderName = parsedPath.base;

    const RootConfig = getConfig().RootConfig || vscode.workspace.getConfiguration('msr');
    const specificPaths = (RootConfig.get('extraPaths.' + codeFolderName) as string || '').trim();
    const specificPathListFiles = (RootConfig.get('extraPathListFiles.' + codeFolderName) as string || '').trim();

    const defaultExtraSearchPaths = specificPaths.length > 0 ? '' : (RootConfig.get('default.extraSearchPaths') as string || '').trim();
    const defaultExtraSearchPathListFiles = specificPathListFiles.length > 0 ? '' : (RootConfig.get('default.extraSearchPathListFiles') as string || '').trim();

    const thisTypeExtraSearchPaths = !isFindingDefinition ? '' : (RootConfig.get(mappedExt + '.extraSearchPaths') as string || '').trim();
    const thisTypeExtraSearchPathListFiles = !isFindingDefinition ? '' : (RootConfig.get(mappedExt + '.extraSearchPathListFiles') as string || '').trim();

    const pathList = (RootPath + ',' + specificPaths + ',' + thisTypeExtraSearchPaths + ',' + defaultExtraSearchPaths).split(SplitPathsRegex);
    let searchPathSet = new Set<string>();
    let noCasePathSet = new Set<string>();
    pathList.forEach(a => {
        let lowerPath = a.replace(/[\\/]+$/, '').toLowerCase();
        if (lowerPath.length > 0 && !noCasePathSet.has(lowerPath)) {
            noCasePathSet.add(lowerPath);
            searchPathSet.add(a);
        }
    });

    let searchPathListFileSet = new Set((specificPathListFiles + ',' + thisTypeExtraSearchPathListFiles + ',' + defaultExtraSearchPathListFiles).split(SplitPathsRegex));
    searchPathListFileSet.delete('');

    let pathsText = Array.from(searchPathSet).join(',').replace(/"/g, '');
    if (ShouldQuotePathRegex.test(pathsText)) {
        pathsText = '"' + pathsText + '"';
    }

    let pathFilesText = Array.from(searchPathListFileSet).join(',').replace(/"/g, '');
    if (ShouldQuotePathRegex.test(pathFilesText)) {
        pathFilesText = '"' + pathFilesText + '"';
    }

    const readPathListOptions = searchPathListFileSet.size > 0 ? ' -w "' + pathFilesText + '"' : '';
    const skipFolders = getOverrideOrDefaultConfig(mappedExt, '.skipFolders', false);
    return '-rp ' + pathsText + readPathListOptions + (skipFolders.length > 1 ? ' --nd "' + skipFolders + '"' : '');
}
