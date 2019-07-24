'use strict';

import * as vscode from 'vscode';
export const TrimSearchTextRegex = /^[^\w\.-]+|[^\w\.-]+$/g;

export function getCurrentWordAndText(document: vscode.TextDocument, position: vscode.Position): [string, string] {
    if (document.languageId === 'code-runner-output' || document.fileName.startsWith('extension-output-#')) {
        return ['', ''];
    }

    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) {
        return ['', ''];
    }

    const currentText = document.lineAt(position.line).text;
    const currentWord: string = currentText.slice(wordRange.start.character, wordRange.end.character).replace(TrimSearchTextRegex, '');
    return [currentWord, currentText];
}
