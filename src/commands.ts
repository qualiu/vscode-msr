'use strict';

import * as vscode from 'vscode';
import path = require('path');

import { getConfig, getSearchPathOptions, SearchTextHolderReplaceRegex, removeSearchTextForCommandLine } from './dynamicConfig';
import { runCommandInTerminal, enableColorAndHideSummary, outputDebug } from './outputUtils';
import { getCurrentWordAndText } from './utils';
import { FileExtensionToConfigExtMap } from './ranker';
import { escapeRegExp, NormalTextRegex } from './regexUtils';
import { stringify } from 'querystring';

const SkipJumpOutForHeadResultsRegex = /\s+(-J\s+-H|-J?H)\s*\d+(\s+-J)?(\s+|$)/;

export enum MyCommandType {
    RegexFindDefinitionInCodeFiles,
    RegexFindReferencesInCodeFiles,
    RegexFindReferencesInConfigFiles,
    RegexFindReferencesInDocs,
    RegexFindReferencesInAllProjectFiles,
    RegexFindReferencesInAllSmallFiles,
    RegexFindReferencesInCodeAndConfig,
    FindPlainTextInAllProjectFiles,
    FindPlainTextInAllSmallFiles,
    SortProjectFilesBySize,
    SortProjectFilesByTime,
    SortAllFilesBySize,
    SortAllFilesByTime,
}

export function runFindingCommand(findCmd: MyCommandType, textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) {
    const RootConfig = vscode.workspace.getConfiguration('msr');
    if (RootConfig.get('enable.findingCommands') as boolean !== true) {
        outputDebug('Your extension "vscode-msr": finding-commands is disabled by setting of `msr.enable.findingCommands`.');
    }

    const findCmdText = MyCommandType[findCmd];
    const selectedText = textEditor.document.getText(textEditor.selection);
    const isValidSelect = selectedText.length > 2 && /\w+/.test(selectedText);
    const [currentWord] = getCurrentWordAndText(textEditor.document, textEditor.selection.active);
    const rawSearchText = isValidSelect ? selectedText : currentWord;
    const searchText = findCmdText.match(/Regex/i) ? escapeRegExp(rawSearchText) : rawSearchText;

    const parsedFile = path.parse(textEditor.document.fileName);
    runFindingCommandByCurrentWord(findCmd, searchText, parsedFile, rawSearchText);
}

export function runFindingCommandByCurrentWord(findCmd: MyCommandType, searchText: string, parsedFile: path.ParsedPath, rawSearchText: string = '') {
    const findCmdText = MyCommandType[findCmd];
    const isSorting = findCmdText.match(/Sort/i);

    if (!isSorting && searchText.length < 2) {
        return;
    }

    const RootConfig = vscode.workspace.getConfiguration('msr');
    const isFindDefinition = MyCommandType.RegexFindDefinitionInCodeFiles === findCmd;
    let extraOptions = isFindDefinition
        ? RootConfig.get('definition.extraOptions') || RootConfig.get('default.extraOptions')
        : RootConfig.get('reference.extraOptions') || RootConfig.get('default.extraOptions');

    let filePattern = '';
    let searchPattern = isFindDefinition
        ? RootConfig.get('default.definition') as string
        : RootConfig.get('default.reference') as string;

    let skipTextPattern = isFindDefinition
        ? RootConfig.get('default.skip.definition') as string || ''
        : RootConfig.get('default.skip.reference') as string || '';

    rawSearchText = rawSearchText.length < 1 ? searchText : rawSearchText;

    switch (findCmd) {
        case MyCommandType.RegexFindDefinitionInCodeFiles:
        case MyCommandType.RegexFindReferencesInCodeFiles:
            filePattern = RootConfig.get('default.codeFilesPlusUI') as string;
            break;

        case MyCommandType.RegexFindReferencesInDocs:
            filePattern = RootConfig.get('default.docFiles') as string;
            break;

        case MyCommandType.RegexFindReferencesInConfigFiles:
            filePattern = RootConfig.get('default.configFiles') as string;
            break;

        case MyCommandType.RegexFindReferencesInCodeAndConfig:
            filePattern = RootConfig.get('default.codeAndConfig') as string;
            break;

        case MyCommandType.SortAllFilesBySize:
        case MyCommandType.SortAllFilesByTime:
            filePattern = '';
            break;

        case MyCommandType.RegexFindReferencesInAllProjectFiles:
        case MyCommandType.FindPlainTextInAllProjectFiles:
        case MyCommandType.SortProjectFilesBySize:
        case MyCommandType.SortProjectFilesByTime:
            filePattern = RootConfig.get('default.allFiles') as string;
            break;

        case MyCommandType.RegexFindReferencesInAllSmallFiles:
        case MyCommandType.FindPlainTextInAllSmallFiles:
        default:
            filePattern = '';
            extraOptions = RootConfig.get('allSmallFiles.extraOptions');
            break;
    }

    if (isSorting) {
        searchPattern = '';
        skipTextPattern = '';
        extraOptions = RootConfig.get('default.listSortingFilesOptions') as string || '-l -H 10 -T 10';
        extraOptions = ' ' + (extraOptions as string).trim() + ' ' + (findCmdText.match(/BySize/i) ? '--sz --wt' : '--wt --sz');
    } else if (findCmdText.match(/Plain/i)) {
        searchPattern = ' -x "' + rawSearchText.replace(/"/g, '\\"') + '"';
        skipTextPattern = '';
    } else if (searchPattern.length > 0) {
        searchPattern = ' -t "' + searchPattern + '"';
    }

    const extension = parsedFile.ext.substring(1).toLowerCase() || 'default';
    const mappedExt = FileExtensionToConfigExtMap.get(extension) || extension;
    const useExtraPaths = !isSorting && RootConfig.get('findingCommands.useExtraPaths') as boolean;
    const searchPathsOptions = getSearchPathOptions(mappedExt, MyCommandType.RegexFindDefinitionInCodeFiles === findCmd, useExtraPaths);
    if (filePattern.length > 0) {
        filePattern = ' -f "' + filePattern + '"';
    }

    let command = 'msr ' + searchPathsOptions + filePattern + searchPattern;
    if (skipTextPattern && skipTextPattern.length > 1) {
        command += ' --nt "' + skipTextPattern + '"';
    }

    command += ' ' + extraOptions as string;

    if (!NormalTextRegex.test(rawSearchText)) {
        command = removeSearchTextForCommandLine(command);
    }

    command = command.replace(SearchTextHolderReplaceRegex, searchText).trim();
    if (findCmd === MyCommandType.RegexFindDefinitionInCodeFiles && NormalTextRegex.test(rawSearchText)) {
        command = command.replace('Search ' + searchText, 'Search ' + searchText + ' roughly');
    }

    if (!isSorting) {
        command = command.replace(SkipJumpOutForHeadResultsRegex, ' ').trim();
    }

    command = enableColorAndHideSummary(command);

    runCommandInTerminal(command, true);
}