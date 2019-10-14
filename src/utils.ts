import * as vscode from 'vscode';
import { execSync } from 'child_process';
import path = require('path');
import { ParsedPath } from 'path';
import { outputMessage, MessageLevel } from './outputUtils';
import { ShouldQuotePathRegex, TrimSearchTextRegex } from './constants';

export function quotePaths(paths: string) {
    if (ShouldQuotePathRegex.test(paths)) {
        return '"' + paths + '"';
    } else {
        return paths;
    }
}

export function toPath(parsedPath: ParsedPath) {
    return path.join(parsedPath.dir, parsedPath.base);
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

export function runCommandGetInfo(command: string, showCmdLevel: MessageLevel = MessageLevel.INFO, errorOutputLevel: MessageLevel = MessageLevel.ERROR, outputLevel: MessageLevel = MessageLevel.INFO): [string, any] {
    try {
        outputMessage(showCmdLevel, command);
        const output = execSync(command).toString();
        if (output.length > 0) {
            outputMessage(outputLevel, output);
        }
        return [output, null];
    } catch (err) {
        outputMessage(errorOutputLevel, '\n' + err.toString());
        return ['', err];
    }
}
