import { ParsedPath } from 'path';
import * as vscode from 'vscode';
import { IsLinux, IsWindows, IsWSL, ShouldQuotePathRegex, TrimSearchTextRegex } from './constants';
import { TerminalType } from './enums';
import path = require('path');
import fs = require('fs');
import ChildProcess = require('child_process');

export const PathEnvName = IsWindows ? '%PATH%' : '$PATH';
export const MatchWindowsDiskRegex = /^([A-Z]):/i;
const GetInputPathsRegex: RegExp = /^(msr\s+-[r\s]*-?p)\s+("[^\"]+"|\S+)/;

let HasMountPrefixForWSL: boolean | undefined = undefined;

export function getTerminalExeFromVsCodeSettings(): string {
    const shellConfig = vscode.workspace.getConfiguration('terminal.integrated.shell');
    const exePath = shellConfig.get(IsWindows ? 'windows' : 'linux') as string || '';
    return exePath;
}

export const TerminalExePath = getTerminalExeFromVsCodeSettings();
export function getTerminalTypeFromExePath(terminalExePath: string = TerminalExePath): TerminalType {
    if (IsLinux) {
        return TerminalType.LinuxBash;
    } else if (IsWSL) {
        return TerminalType.WslBash;
    } else if (/cmd.exe$/i.test(terminalExePath)) {
        return TerminalType.CMD;
    } else if (/PowerShell.exe$/i.test(terminalExePath)) {
        return TerminalType.PowerShell;
    } else if (/Cygwin.*?bash.exe$/i.test(terminalExePath)) {
        return TerminalType.CygwinBash;
    } else if (/System(32)?.bash.exe$/i.test(terminalExePath)) {
        return TerminalType.WslBash;
    } else if (/MinGW.*?bash.exe$/i.test(terminalExePath) || /Git.*?bin.*?bash.exe$/i.test(terminalExePath)) {
        return TerminalType.MinGWBash;
    } else if (/bash.exe$/.test(terminalExePath)) {
        return TerminalType.WslBash;
    } else {
        return TerminalType.PowerShell; // TerminalType.CMD;
    }
}

// Must copy/update extension + Restart vscode if using WSL terminal on Windows:
export const DefaultTerminalType = getTerminalTypeFromExePath();

export function isWindowsTerminalOnWindows(terminalType = DefaultTerminalType) {
    return TerminalType.CMD === terminalType || (TerminalType.PowerShell === terminalType && IsWindows);
}

export function isWindowsTerminalType(terminalType: TerminalType): boolean {
    return IsWindows && (TerminalType.CMD === terminalType || TerminalType.PowerShell === terminalType);
}

export function isLinuxTerminalOnWindows(terminalType: TerminalType = DefaultTerminalType): boolean {
    return IsWindows && !isWindowsTerminalType(terminalType);
}

export const IsWindowsTerminalOnWindows: boolean = isWindowsTerminalOnWindows(DefaultTerminalType);

// Must copy/update extension + Restart vscode if using WSL terminal on Windows:
export const IsLinuxTerminalOnWindows: boolean = isLinuxTerminalOnWindows(DefaultTerminalType);

export function runCommandGetOutput(command: string): string {
    try {
        return ChildProcess.execSync(command).toString();
    } catch (err) {
        return '';
    }
}

export function changeFindingCommandForLinuxTerminalOnWindows(command: string): string {
    if (!IsLinuxTerminalOnWindows) {
        return command;
    }

    const match = GetInputPathsRegex.exec(command);
    if (!match) {
        return command;
    }

    const paths = match[1].startsWith('"') ? match[2].substr(1, match[2].length - 2) : match[2];
    const newPaths = paths.split(/\s*[,;]/)
        .map((p, _index, _a) => toOsPath(p)
        );

    return match[1] + ' ' + quotePaths(newPaths.join(',')) + command.substring(match[0].length);
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

    return commandLine.substr(0, match.index) + ' ' + match[1] + ' ' + quotePaths(newSearchPaths) + commandLine.substring(match.index + match[0].length);
}

export function getPathEnvSeparator(terminalType: TerminalType) {
    return isWindowsTerminalOnWindows(terminalType) ? ";" : ":";
}

export function checkAddFolderToPath(exeFolder: string, terminalType: TerminalType, prepend = true) {
    const oldPathValue = process.env['PATH'] || (IsWindows ? '%PATH%' : '$PATH');
    const paths = oldPathValue.split(IsWindows ? ';' : ':');
    const trimTailRegex = IsWindows ? new RegExp('[\\s\\\\]+$') : new RegExp('/$');
    const foundFolders = IsWindows
        ? paths.filter(a => a.trim().replace(trimTailRegex, '').toLowerCase() === exeFolder.toLowerCase())
        : paths.filter(a => a.replace(trimTailRegex, '') === exeFolder);

    if (foundFolders.length > 0) {
        return false;
    }

    const separator = getPathEnvSeparator(terminalType);
    const newValue = prepend
        ? exeFolder + separator + oldPathValue
        : oldPathValue + separator + exeFolder;

    process.env['PATH'] = newValue;

    return true;
}

export function removeQuotesForPath(paths: string) {
    if (paths.startsWith('"') || paths.startsWith("'")) {
        return paths.substr(1, paths.length - 2);
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

export function toMinGWPath(winPath: string) {
    const match = MatchWindowsDiskRegex.exec(winPath);
    if (!match) {
        return replaceToForwardSlash(winPath);
    }
    const path = '/' + match[1].toLowerCase() + replaceToForwardSlash(winPath.substring(match.length));
    return path.replace(' ', '\\ ');
}

export function toCygwinPath(winPath: string) {
    const match = MatchWindowsDiskRegex.exec(winPath);
    if (!match) {
        return replaceToForwardSlash(winPath);
    }
    const path = '/cygdrive/' + match[1].toLowerCase() + replaceToForwardSlash(winPath.substring(match.length));
    return path.replace(' ', '\\ ');
}

export function toOsPath(windowsPath: string, terminalType: TerminalType = DefaultTerminalType): string {
    if (IsWSL || TerminalType.WslBash === terminalType) {
        return toWSLPath(windowsPath, TerminalType.WslBash === terminalType);
    } else if (TerminalType.CygwinBash === terminalType) {
        return toCygwinPath(windowsPath);
    } else if (TerminalType.MinGWBash === terminalType) {
        return toMinGWPath(windowsPath);
    } else {
        return windowsPath;
    }
}

export function toOsPathBySetting(windowsPath: string): string {
    return toOsPath(windowsPath, DefaultTerminalType);
}

export function toOsPathsForText(windowsPaths: string, terminalType: TerminalType): string {
    const paths = windowsPaths.split(/\s*[,;]/).map((p, _index, _a) => toOsPath(p, terminalType));
    return paths.join(",");
}

export function toOsPaths(windowsPaths: Set<string>, terminalType: TerminalType): Set<string> {
    if (!IsWSL && TerminalType.WslBash !== terminalType && TerminalType.CygwinBash !== terminalType && TerminalType.MinGWBash !== terminalType) {
        return windowsPaths;
    }

    let pathSet = new Set<string>();
    windowsPaths.forEach(a => {
        const path = toOsPath(a, terminalType);
        pathSet.add(path);
    });

    return pathSet;
}

export function toPath(parsedPath: ParsedPath) {
    return path.join(parsedPath.dir, parsedPath.base);
}

export function toWSLPath(winPath: string, isWslTerminal: boolean = false) {
    if (!IsWSL && !isWslTerminal) {
        return winPath;
    }

    const match = MatchWindowsDiskRegex.exec(winPath);
    if (!match) {
        return winPath;
    }

    const disk = match[1].toLowerCase();
    const tail = replaceToForwardSlash(winPath.substring(match.length));

    // https://docs.microsoft.com/en-us/windows/wsl/wsl-config#configure-per-distro-launch-settings-with-wslconf
    const shortPath = '/' + disk + tail;
    if (HasMountPrefixForWSL === false) {
        return shortPath;
    } else if (HasMountPrefixForWSL === undefined) {
        if (fs.existsSync(shortPath)) {
            HasMountPrefixForWSL = false;
            return shortPath;
        }
    }

    const longPath = '/mnt/' + disk + tail;
    if (fs.existsSync(longPath)) {
        HasMountPrefixForWSL = true;
        return longPath;
    } else {
        HasMountPrefixForWSL = false;
        return shortPath;
    }
}

export function nowText(tailText: string = ' '): string {
    return new Date().toISOString() + tailText;
}

export function getTimeCost(begin: Date, end: Date): number {
    return (end.valueOf() - begin.valueOf()) / 1000;
}

export function getTimeCostToNow(begin: Date): number {
    return (Date.now() - begin.valueOf()) / 1000;
}

export function toWSLPaths(winPaths: Set<string>, isWslTerminal: boolean = false): Set<string> {
    if (!IsWSL && !isWslTerminal) {
        return winPaths;
    }

    let pathSet = new Set<string>();
    winPaths.forEach(p => {
        pathSet.add(toWSLPath(p, isWslTerminal));
    });
    return pathSet;
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

export function getDefaultRootFolderByActiveFile(useDefaultProjectIfEmpty = false) {
    const activePath = getActiveFilePath();
    const folder = isNullOrEmpty(activePath) ? getDefaultRootFolder() : getRootFolder(activePath);
    if (useDefaultProjectIfEmpty && isNullOrEmpty(folder) && !isNullOrEmpty(activePath)) {
        return getDefaultRootFolder();
    } else {
        return folder;
    }
}

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

