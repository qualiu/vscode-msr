import { ParsedPath } from 'path';
import { isNullOrUndefined } from 'util';
import * as vscode from 'vscode';
import { IsWSL, ShouldQuotePathRegex, TrimSearchTextRegex } from './constants';
import path = require('path');
import fs = require('fs');

export const MatchWindowsDiskRegex = /^([A-Z]):/i;

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
    return '/' + match[1].toLowerCase() + replaceText(winPath.substring(match.length), '\\', '/');
}

export function toCygwinPath(winPath: string) {
    const match = MatchWindowsDiskRegex.exec(winPath);
    if (!match) {
        return replaceText(winPath, '\\', '/');
    }
    return '/cygdrive/' + match[1].toLowerCase() + replaceText(winPath.substring(match.length), '\\', '/');
}

export function toLinuxPathOnWindows(windowsPath: string, isCygwin: boolean, isMinGW: boolean): string {
    if (isCygwin) {
        return toCygwinPath(windowsPath);
    } else if (isMinGW) {
        return toMinGWPath(windowsPath);
    } else {
        return windowsPath;
    }
}

export function toLinuxPathsOnWindows(windowsPaths: string, isCygwin: boolean, isMinGW: boolean): string {
    const paths = windowsPaths.split(/\s*[,;]/).map((p, _index, _a) => toLinuxPathOnWindows(p, isCygwin, isMinGW));
    return paths.join(",");
}

export function toPath(parsedPath: ParsedPath) {
    return path.join(parsedPath.dir, parsedPath.base);
}

export function toWSLPath(winPath: string) {
    const match = MatchWindowsDiskRegex.exec(winPath);
    if (!match) {
        return winPath;
    }

    const disk = match[1].toLowerCase();
    const tail = replaceText(winPath.substring(match.length), '\\', '/');
    const shortPath = '/' + disk + tail;
    if (fs.existsSync(shortPath)) {
        return shortPath;
    }

    return '/mnt/' + disk + tail;
}

export function toWSLPaths(winPaths: Set<string>): Set<string> {
    if (!IsWSL) {
        return winPaths;
    }

    let pathSet = new Set<string>();
    winPaths.forEach(p => {
        pathSet.add(toWSLPath(p));
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

export function getNoDuplicateStringSet(textSet: Set<string>, deleteEmpty: boolean = true): Set<string> {
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
