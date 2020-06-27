import { ParsedPath } from 'path';
import { isNullOrUndefined } from 'util';
import * as vscode from 'vscode';
import { IsLinux, IsWindows, IsWSL, ShouldQuotePathRegex, TrimSearchTextRegex } from './constants';
import { TerminalType } from './enums';
import path = require('path');
import fs = require('fs');

export const MatchWindowsDiskRegex = /^([A-Z]):/i;
export const TerminalExePath = vscode.workspace.getConfiguration('terminal.integrated.shell').get(IsWindows ? 'windows' : 'linux') as string || '';

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

export const DefaultTerminalType = getDefaultTerminalType();

export function isWindowsTerminalType(terminalType: TerminalType): boolean {
    return IsWindows && (TerminalType.CMD === terminalType || TerminalType.PowerShell === terminalType);
}

export function quotePaths(paths: string) {
    if (ShouldQuotePathRegex.test(paths)) {
        return '"' + paths + '"';
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

export function toOsPath(windowsPath: string, terminalType: TerminalType): string {
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
    return isNullOrUndefined(obj) || obj.length === 0;
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
    if (isNullOrUndefined(extension) || isNullOrEmpty(extension)) {
        return defaultValue;
    }

    return extension.replace(/^\./, '').toLowerCase();
}
