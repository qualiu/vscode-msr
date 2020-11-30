import { ParsedPath } from 'path';
import * as vscode from 'vscode';
import { IsLinux, IsWindows, IsWSL, ShouldQuotePathRegex, TrimSearchTextRegex } from './constants';
import { TerminalType } from './enums';
import path = require('path');
import fs = require('fs');
import os = require('os');
import ChildProcess = require('child_process');

export const PathEnvName = IsWindows ? '%PATH%' : '$PATH';
export const MatchWindowsDiskRegex = /^([A-Z]):/i;
export const TerminalExePath = vscode.workspace.getConfiguration('terminal.integrated.shell').get(IsWindows ? 'windows' : 'linux') as string || '';
const GetInputPathsRegex: RegExp = /^(msr\s+-[r\s]*-?p)\s+("[^\"]+"|\S+)/;

let HasMountPrefixForWSL: boolean | undefined = undefined;

function getDefaultTerminalType(): TerminalType {
    if (IsLinux) {
        return TerminalType.LinuxBash;
    } else if (IsWSL) {
        return TerminalType.WslBash;
    } else if (/cmd.exe$/i.test(TerminalExePath)) {
        return TerminalType.CMD;
    } else if (/PowerShell.exe$/i.test(TerminalExePath)) {
        return TerminalType.PowerShell;
    } else if (/Cygwin.*?bash.exe$/i.test(TerminalExePath)) {
        return TerminalType.CygwinBash;
    } else if (/System(32)?.bash.exe$/i.test(TerminalExePath)) {
        return TerminalType.WslBash;
    } else if (/MinGW.*?bash.exe$/i.test(TerminalExePath) || /Git.*?bin.*?bash.exe$/i.test(TerminalExePath)) {
        return TerminalType.MinGWBash;
    } else if (/bash.exe$/.test(TerminalExePath)) {
        return TerminalType.WslBash;
    } else {
        return TerminalType.CMD;
    }
}

// Must copy/update extension + Restart vscode if using WSL terminal on Windows:
export const DefaultTerminalType = getDefaultTerminalType();

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

export function getTerminalShellExePath(): string {
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

export function getHomeFolderForLinuxTerminalOnWindows(): string {
    const shellExePath = getTerminalShellExePath();
    const folder = path.dirname(shellExePath);
    const home = path.join(path.dirname(folder), 'home', os.userInfo().username);
    return home;
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
        return replaceText(winPath, '\\', '/');
    }
    const path = '/' + match[1].toLowerCase() + replaceText(winPath.substring(match.length), '\\', '/');
    return path.replace(' ', '\\ ');
}

export function toCygwinPath(winPath: string) {
    const match = MatchWindowsDiskRegex.exec(winPath);
    if (!match) {
        return replaceText(winPath, '\\', '/');
    }
    const path = '/cygdrive/' + match[1].toLowerCase() + replaceText(winPath.substring(match.length), '\\', '/');
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
    const tail = replaceText(winPath.substring(match.length), '\\', '/');

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

export function replaceText(sourceText: string, toFind: string, replaceTo: string): string {
    let newText = sourceText.replace(toFind, replaceTo);
    while (newText !== sourceText) {
        sourceText = newText;
        newText = newText.replace(toFind, replaceTo);
    }

    return newText;
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
