import { ParsedPath } from 'path';
import * as vscode from 'vscode';
import { IsWindows, ShouldQuotePathRegex, TrimSearchTextRegex, getRepoFolder, isNullOrEmpty } from './constants';
import { TerminalType } from './enums';
import path = require('path');
import ChildProcess = require('child_process');

export const PathEnvName = IsWindows ? '%PATH%' : '$PATH';
export const MatchWindowsDiskRegex = /^([A-Z]):/i;

export function isWeeklyCheckTime(dayInWeek: number = 2, beginHour: number = 7, endHour: number = 12): boolean {
    const now = new Date();
    const hour = now.getHours();
    if (now.getDay() !== dayInWeek || hour < beginHour || hour > endHour) {
        // outputDebugByTime('Skip checking for now. Only check at every Tuesday 07:00 ~ 12:00.');
        return false;
    }
    return true;
}

export function getErrorMessage(error: unknown): string {
    if (!error) {
        return '';
    }

    if (error instanceof Error) {
        return error.message;
    }

    const text = String(error);
    const nonObject = text.replace(/[Object \[\],]+/g, '');
    if (!isNullOrEmpty(nonObject)) {
        return text;
    }
    try {
        return JSON.stringify(error);
    } catch (err) {
        console.log(error);
        console.log('Failed to stringify error message.');
        console.log(err);
        return 'Unknown error';
    }
}

export function runCommandGetOutput(command: string, fetchError = false): string {
    try {
        return ChildProcess.execSync(command).toString();
    } catch (err) {
        if (fetchError && err) {
            const keys = Object.keys(err);
            const stdoutIndex = !keys ? -1 : keys.indexOf('stdout');
            if (stdoutIndex >= 0) {
                const values = Object.values(err);
                const stdout = values[stdoutIndex];
                return !stdout ? '' : String(stdout);
            }
        }
        console.log(err);
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
    return new Date().toISOString() + ' ' + tailText.trimLeft();
}

export function getElapsedSeconds(begin: Date, end: Date): number {
    return (end.valueOf() - begin.valueOf()) / 1000;
}

export function getElapsedSecondsToNow(begin: Date): number {
    return (Date.now() - begin.valueOf()) / 1000;
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

export function changeToForwardSlash(pathString: string, addTailSlash: boolean = true): string {
    let newPath = pathString.replace(/\\/g, '/').replace(/\\$/, '');
    if (addTailSlash && !newPath.endsWith('/')) {
        newPath += '/';
    }
    return newPath;
}

export function getRepoFolderName(filePath: string, useFirstFolderIfNotFound = false): string {
    const folder = getRepoFolder(filePath, useFirstFolderIfNotFound);
    return isNullOrEmpty(folder) ? '' : path.parse(folder).base;
}

export function getRepoFolders(currentFilePath: string): string[] {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length < 1) {
        return [''];
    }

    let repoFolderSet = new Set<string>().add(getRepoFolder(currentFilePath));
    vscode.workspace.workspaceFolders.forEach(a => repoFolderSet.add(a.uri.fsPath));
    repoFolderSet.delete('');
    return Array.from(repoFolderSet);
}

export function getPowerShellName(terminalType: TerminalType, hasPwshExeOnWindows: boolean = false) {
    if (!IsWindows) {
        return "pwsh"; // Linux/Mac always use pwsh
    }
    // Windows system
    switch (terminalType) {
        case TerminalType.WslBash:
            return "pwsh"; // WSL is Linux environment, use pwsh
        case TerminalType.CygwinBash:
        case TerminalType.MinGWBash:
            // Cygwin/MinGW can call Windows executables with .exe suffix
            return hasPwshExeOnWindows ? "pwsh.exe" : "powershell.exe";
        default:
            // CMD/PowerShell terminal on Windows
            return hasPwshExeOnWindows ? "pwsh" : "PowerShell";
    }
}

export function isPowerShellCommand(cmd: string, terminalType: TerminalType, hasPwshExeOnWindows: boolean = false): boolean {
    const powerShellCmd = getPowerShellName(terminalType, hasPwshExeOnWindows) + ' -Command';
    return cmd.includes(powerShellCmd);
}

export function getLoadAliasFileCommand(file: string, isWindowsTerminal: boolean, autoQuote: boolean = true): string {
    const head = isWindowsTerminal
        ? (file.endsWith('doskeys') ? 'doskey /MACROFILE=' : "")
        : 'source ';
    return head + (autoQuote ? quotePaths(file) : file);
}
