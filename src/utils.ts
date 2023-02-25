import { ParsedPath } from 'path';
import * as vscode from 'vscode';
import { IsWindows, ShouldQuotePathRegex, TrimSearchTextRegex } from './constants';
import { TerminalType } from './enums';
import path = require('path');
import os = require('os');
import ChildProcess = require('child_process');

export const PathEnvName = IsWindows ? '%PATH%' : '$PATH';
export const MatchWindowsDiskRegex = /^([A-Z]):/i;

export function runCommandGetOutput(command: string): string {
    try {
        return ChildProcess.execSync(command).toString();
    } catch (err) {
        return '';
    }
}

export function getSearchPathInCommand(commandLine: string, matchRegex: RegExp = /\s+(-r?p)\s+(".+?"|\S+)/): string {
    const match = matchRegex.exec(commandLine);
    return match ? match[2] : '';
}

export function setSearchPathInCommand(commandLine: string, newSearchPaths: string, matchRegex: RegExp = /\s+(-r?p)\s+(".+?"|\S+)/): string {
    const match = matchRegex.exec(commandLine);
    if (!match) {
        return commandLine;
    }

    return commandLine.substring(0, match.index) + ' ' + match[1] + ' ' + quotePaths(newSearchPaths) + commandLine.substring(match.index + match[0].length);
}

export function removeQuotesForPath(paths: string) {
    if (paths.startsWith('"') || paths.startsWith("'")) {
        return paths.substring(1, paths.length - 2);
    } else {
        return paths;
    }
}

export function quotePaths(paths: string, quote = '"') {
    paths = removeQuotesForPath(paths);
    if (ShouldQuotePathRegex.test(paths)) {
        return quote + paths + quote;
    } else {
        return paths;
    }
}

export function toPath(parsedPath: ParsedPath): string {
    return path.join(parsedPath.dir, parsedPath.base);
}

export function nowText(tailText: string = ' '): string {
    return new Date().toISOString() + tailText;
}

export function getElapsedSeconds(begin: Date, end: Date): number {
    return (end.valueOf() - begin.valueOf()) / 1000;
}

export function getElapsedSecondsToNow(begin: Date): number {
    return (Date.now() - begin.valueOf()) / 1000;
}

export function isNullOrEmpty(obj: string | undefined): boolean {
    return obj === null || obj === undefined || obj.length === 0;
}

export function getCurrentWordAndText(document: vscode.TextDocument, position: vscode.Position, textEditor: vscode.TextEditor | undefined = undefined)
    : [string, vscode.Range | undefined, string] {

    if (document.languageId === 'code-runner-output' || document.fileName.startsWith('extension-output-#')) {
        return ['', undefined, ''];
    }

    const currentText = document.lineAt(position.line).text;
    if (!textEditor) {
        textEditor = vscode.window.activeTextEditor;
    }

    if (textEditor) {
        const selectedText = textEditor.document.getText(textEditor.selection);
        const isValidSelect = selectedText.length > 2 && /\w+/.test(selectedText);
        if (isValidSelect) {
            return [selectedText, textEditor.selection, currentText];
        }
    }

    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) {
        return ['', undefined, ''];
    }

    const currentWord: string = currentText.slice(wordRange.start.character, wordRange.end.character).replace(TrimSearchTextRegex, '');
    return [currentWord, wordRange, currentText];
}

export function getUniqueStringSetNoCase(textSet: Set<string>, deleteEmpty: boolean = true): Set<string> {
    let noCaseSet = new Set<string>();
    let newSet = new Set<string>();
    textSet.forEach(a => {
        const lowerCase = a.toLowerCase();
        const preSize = noCaseSet.size;
        noCaseSet.add(lowerCase);
        if (noCaseSet.size > preSize) {
            newSet.add(a);
        }
    });

    if (deleteEmpty) {
        newSet.delete('');
    }

    return newSet;
}

export function replaceToForwardSlash(sourceText: string): string {
    return sourceText.replace(/\\/g, '/');
}


export function replaceSearchTextHolder(command: string, searchText: string): string {
    const searchTextHolderReplaceRegex = /%~?1/g;
    // Regex bug case:
    //      String.raw`-t "%1" -e "%~1"`.replace(searchTextHolderReplaceRegex, String.raw`'\$Macro\$'`);
    // return command.replace(searchTextHolderReplaceRegex, searchText);

    let result = command;
    let match: RegExpExecArray | null = null;
    const maxReplacingTimes = 99;
    const maxIncreasingLength = 20 * command.length;
    for (let k = 0; k < maxReplacingTimes && (match = searchTextHolderReplaceRegex.exec(result)) !== null; k++) {
        const newText = result.substring(0, match.index) + searchText + result.substring(match.index + match[0].length);
        if (newText.length >= maxIncreasingLength || newText === result) {
            break;
        }

        result = newText;
    }

    return result;
}

export function replaceTextByRegex(sourceText: string, toFindRegex: RegExp, replaceTo: string): string {
    let newText = sourceText.replace(toFindRegex, replaceTo);
    while (newText !== sourceText) {
        sourceText = newText;
        newText = newText.replace(toFindRegex, replaceTo);
    }

    return newText;
}

export function getExtensionNoHeadDot(extension: string | undefined, defaultValue: string = 'default'): string {
    if (!extension || isNullOrEmpty(extension)) {
        return defaultValue;
    }

    return extension.replace(/^\./, '').toLowerCase();
}

export function getRootFolder(filePath: string, useFirstFolderIfNotFound = false): string {
    const folderUri = isNullOrEmpty(filePath) ? '' : vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
    if (!folderUri || !folderUri.uri || !folderUri.uri.fsPath) {
        if (useFirstFolderIfNotFound && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            return vscode.workspace.workspaceFolders[0].uri.fsPath;
        }
        return '';
    }

    return folderUri.uri.fsPath;
}

export function getDefaultRootFolder(): string {
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        return vscode.workspace.workspaceFolders[0].uri.fsPath;
    } else {
        return '';
    }
}

export function getDefaultRootFolderName(): string {
    const folder = getDefaultRootFolder();
    return isNullOrEmpty(folder) ? '' : path.basename(folder);
}

export function getActiveFilePath() {
    if (vscode.window.activeTextEditor
        && vscode.window.activeTextEditor.document
        && !isNullOrEmpty(vscode.window.activeTextEditor.document.fileName)) {
        return vscode.window.activeTextEditor.document.fileName;
    } else {
        return '';
    }
}

export function changeToForwardSlash(pathString: string, addTailSlash: boolean = true): string {
    let newPath = pathString.replace(/\\/g, '/').replace(/\\$/, '');
    if (addTailSlash && !newPath.endsWith('/')) {
        newPath += '/';
    }
    return newPath;
}

export function getDefaultRootFolderByActiveFile(useDefaultProjectIfEmpty = false) {
    const activePath = getActiveFilePath();
    let folder = !isNullOrEmpty(activePath) ? getRootFolder(activePath) : getDefaultRootFolder();
    if (useDefaultProjectIfEmpty && isNullOrEmpty(folder) && !isNullOrEmpty(activePath)) {
        folder = getDefaultRootFolder();
    }

    // if (appendSlash && !folder.endsWith(path.sep)) {
    //     folder += path.sep;
    // }

    return folder;
}

export const RunCmdTerminalRootFolder: string = getDefaultRootFolderByActiveFile(true);

export function getRootFolderName(filePath: string, useFirstFolderIfNotFound = false): string {
    const folder = getRootFolder(filePath, useFirstFolderIfNotFound);
    return isNullOrEmpty(folder) ? '' : path.parse(folder).base;
}

export function getRootFolders(currentFilePath: string): string[] {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length < 1) {
        return [''];
    }

    let rootFolderSet = new Set<string>().add(getRootFolder(currentFilePath));
    vscode.workspace.workspaceFolders.forEach(a => rootFolderSet.add(a.uri.fsPath));
    rootFolderSet.delete('');
    return Array.from(rootFolderSet);
}

export function getTempFolder(): string {
    const tmpFolder = os.tmpdir();
    if (IsWindows) {
        return tmpFolder;
    }

    if (tmpFolder.startsWith('/')) {
        return '/tmp/';
    }

    return tmpFolder;
}

export function getPowerShellName(terminalType: TerminalType) {
    return !IsWindows || TerminalType.WslBash == terminalType ? "pwsh" : "PowerShell";
}
