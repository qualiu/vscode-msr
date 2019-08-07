'use strict';

import * as vscode from 'vscode';
export const TrimSearchTextRegex = /^[^\w\.-]+|[^\w\.-]+$/g;

export function getCurrentWordAndText(document: vscode.TextDocument, position: vscode.Position): [string, vscode.Range | undefined, string] {
    if (document.languageId === 'code-runner-output' || document.fileName.startsWith('extension-output-#')) {
        return ['', undefined, ''];
    }

    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) {
        return ['', undefined, ''];
    }

    const currentText = document.lineAt(position.line).text;
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