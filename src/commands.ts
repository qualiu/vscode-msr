'use strict';

import * as vscode from 'vscode';
import path = require('path');

import { getSearchPathOptions, SearchTextHolderReplaceRegex, removeSearchTextForCommandLine, getOverrideOrDefaultConfig, ShouldQuotePathRegex, GitFolderName, getOverrideConfigByPriority, getConfig } from './dynamicConfig';
import { runCommandInTerminal, enableColorAndHideCommandline, outputDebug } from './outputUtils';
import { getCurrentWordAndText } from './utils';
import { FileExtensionToConfigExtMap, SearchProperty } from './ranker';
import { escapeRegExp, NormalTextRegex } from './regexUtils';
import { MsrExe } from './checkTool';

export const SkipJumpOutForHeadResultsRegex = /\s+(-J\s+-H|-J?H)\s*\d+(\s+-J)?(\s+|$)/;

export enum FindCommandType {
    RegexFindDefinitionInCodeFiles,
    RegexFindDefinitionInCurrentFile,
    RegexFindReferencesInCurrentFile,
    RegexFindReferencesInCodeFiles,
    RegexFindPureReferencesInCodeFiles,
    RegexFindReferencesInConfigFiles,
    RegexFindReferencesInDocs,
    RegexFindReferencesInAllProjectFiles,
    RegexFindReferencesInAllSmallFiles,
    RegexFindReferencesInCodeAndConfig,
    FindPlainTextInCodeFiles,
    FindPlainTextInConfigFiles,
    FindPlainTextInDocFiles,
    FindPlainTextInConfigAndConfigFiles,
    FindPlainTextInAllProjectFiles,
    FindPlainTextInAllSmallFiles,
    SortProjectFilesBySize,
    SortProjectFilesByTime,
    SortAllFilesBySize,
    SortAllFilesByTime,
}

export function runFindingCommand(findCmd: FindCommandType, textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) {
    const RootConfig = vscode.workspace.getConfiguration('msr');
    if (RootConfig.get('enable.findingCommands') as boolean !== true) {
        outputDebug('Your extension "vscode-msr": finding-commands is disabled by setting of `msr.enable.findingCommands`.');
    }

    const findCmdText = FindCommandType[findCmd];
    const [currentWord] = getCurrentWordAndText(textEditor.document, textEditor.selection.active, textEditor);
    const rawSearchText = currentWord;
    const searchText = findCmdText.match(/Regex/i) ? escapeRegExp(rawSearchText) : rawSearchText;

    const parsedFile = path.parse(textEditor.document.fileName);
    runFindingCommandByCurrentWord(findCmd, searchText, parsedFile, rawSearchText);
}

export function runFindingCommandByCurrentWord(findCmd: FindCommandType, searchText: string, parsedFile: path.ParsedPath, rawSearchText: string = '') {
    const command = getFindingCommandByCurrentWord(findCmd, searchText, parsedFile, rawSearchText, undefined);
    runCommandInTerminal(command, true);
}

export function getFindingCommandByCurrentWord(findCmd: FindCommandType, searchText: string, parsedFile: path.ParsedPath, rawSearchText: string = '', ranker: SearchProperty | undefined): string {
    const extension = parsedFile.ext.substring(1).toLowerCase() || 'default';
    const mappedExt = FileExtensionToConfigExtMap.get(extension) || extension;

    const findCmdText = FindCommandType[findCmd];
    const isSorting = findCmdText.match(/Sort/i);

    if (!isSorting && searchText.length < 2) {
        return '';
    }

    rawSearchText = rawSearchText.length < 1 ? searchText : rawSearchText;

    const RootConfig = vscode.workspace.getConfiguration('msr');
    const isFindDefinition = findCmdText.indexOf('Definition') >= 0;
    const isFindReference = findCmdText.indexOf('Reference') >= 0;
    const isFindPlainText = findCmdText.indexOf('FindPlainText') >= 0;

    let extraOptions = isFindDefinition
        ? getOverrideConfigByPriority([mappedExt + '.definition', 'definition', 'default'], 'extraOptions')
        : (isFindReference
            ? getOverrideConfigByPriority([mappedExt + '.reference', 'reference', 'default'], 'extraOptions')
            : getOverrideConfigByPriority([mappedExt, 'default'], 'extraOptions')
        );

    extraOptions = getConfig().RootFolderExtraOptions + extraOptions;

    let searchPattern = isFindDefinition
        ? getOverrideConfigByPriority([mappedExt, 'default'], 'definition')
        : (isFindReference
            ? getOverrideConfigByPriority([mappedExt, 'default'], 'reference')
            : ''
        );

    let skipTextPattern = isFindDefinition
        ? getOverrideConfigByPriority([mappedExt, 'default'], 'skip.definition')
        : (isFindReference
            ? getOverrideConfigByPriority([mappedExt, 'default'], 'skip.reference')
            : ''
        );

    let filePattern = '';

    switch (findCmd) {
        case FindCommandType.RegexFindDefinitionInCurrentFile:
            let definitionPatterns = new Set<string>()
                .add(getOverrideOrDefaultConfig(mappedExt, 'class.definition'))
                .add(getOverrideOrDefaultConfig(mappedExt, 'member.definition'))
                .add(getOverrideOrDefaultConfig(mappedExt, 'constant.definition'))
                .add(getOverrideOrDefaultConfig(mappedExt, 'enum.definition'))
                .add(getOverrideOrDefaultConfig(mappedExt, 'method.definition'));

            definitionPatterns.delete('');

            if (definitionPatterns.size < 1) {
                definitionPatterns.add((RootConfig.get('default.definition') as string || '').trim());
            }

            searchPattern = Array.from(definitionPatterns).join('|');
            skipTextPattern = ranker ? ranker.getSkipPatternForDefinition() : getOverrideOrDefaultConfig(mappedExt, 'skip.definition');
            break;

        case FindCommandType.RegexFindReferencesInCurrentFile:
            searchPattern = '\\b(' + searchText + ')\\b';
            skipTextPattern = '';
            break;

        case FindCommandType.RegexFindDefinitionInCodeFiles:
        case FindCommandType.RegexFindReferencesInCodeFiles:
        case FindCommandType.FindPlainTextInCodeFiles:
        case FindCommandType.RegexFindPureReferencesInCodeFiles:
            filePattern = RootConfig.get('default.codeFilesPlusUI') as string;
            break;

        case FindCommandType.RegexFindReferencesInDocs:
        case FindCommandType.FindPlainTextInDocFiles:
            filePattern = RootConfig.get('default.docFiles') as string;
            break;

        case FindCommandType.RegexFindReferencesInConfigFiles:
        case FindCommandType.FindPlainTextInConfigFiles:
            filePattern = RootConfig.get('default.configFiles') as string;
            break;

        case FindCommandType.RegexFindReferencesInCodeAndConfig:
        case FindCommandType.FindPlainTextInConfigAndConfigFiles:
            filePattern = RootConfig.get('default.codeAndConfig') as string;
            break;

        case FindCommandType.SortAllFilesBySize:
        case FindCommandType.SortAllFilesByTime:
            filePattern = '';
            break;

        case FindCommandType.RegexFindReferencesInAllProjectFiles:
        case FindCommandType.FindPlainTextInAllProjectFiles:
        case FindCommandType.SortProjectFilesBySize:
        case FindCommandType.SortProjectFilesByTime:
            filePattern = RootConfig.get('default.allFiles') as string;
            break;

        case FindCommandType.RegexFindReferencesInAllSmallFiles:
        case FindCommandType.FindPlainTextInAllSmallFiles:
        default:
            filePattern = '';
            extraOptions = getConfig().RootFolderExtraOptions + (RootConfig.get('allSmallFiles.extraOptions') as string || '').trim();
            break;
    }

    if (isSorting) {
        searchPattern = '';
        skipTextPattern = '';
        extraOptions = getConfig().RootFolderExtraOptions + RootConfig.get('default.listSortingFilesOptions') as string || '-l -H 10 -T 10';
        extraOptions = ' ' + (extraOptions as string).trim() + ' ' + (findCmdText.match(/BySize/i) ? '--sz --wt' : '--wt --sz');
    } else if (isFindPlainText) {
        searchPattern = ' -x "' + rawSearchText.replace(/"/g, '\\"') + '"';
        skipTextPattern = '';
    } else if (searchPattern.length > 0) {
        searchPattern = ' -t "' + searchPattern + '"';
    }

    if (findCmd === FindCommandType.RegexFindPureReferencesInCodeFiles) {
        const skipPattern = getOverrideOrDefaultConfig(mappedExt, 'pureReferenceSkip', true).trim();
        if (skipPattern.length > 0 && /\s+--nt\s+/.test(searchPattern) !== true) {
            skipTextPattern = skipPattern;
        }
    }

    const useExtraPaths = !isSorting && 'true' === getOverrideConfigByPriority([GitFolderName + '.' + mappedExt, GitFolderName, ''], 'findingCommands.useExtraPaths');
    const searchPathsOptions = getSearchPathOptions(mappedExt, FindCommandType.RegexFindDefinitionInCodeFiles === findCmd, useExtraPaths, useExtraPaths);
    if (filePattern.length > 0) {
        filePattern = ' -f "' + filePattern + '"';
    }

    let filePath = path.join(parsedFile.dir, parsedFile.base);
    if (ShouldQuotePathRegex.test(filePath)) {
        filePath = '"' + filePath + '"';
    }

    if (skipTextPattern && skipTextPattern.length > 1) {
        skipTextPattern = ' --nt "' + skipTextPattern + '"';
    }

    if (extraOptions && extraOptions.length > 1) {
        extraOptions = ' ' + extraOptions;
    }

    let command = '';
    if (findCmd === FindCommandType.RegexFindDefinitionInCurrentFile) {
        command = MsrExe + ' -p ' + filePath + skipTextPattern + extraOptions + ' ' + searchPattern;
    }
    else if (findCmd === FindCommandType.RegexFindReferencesInCurrentFile) {
        command = MsrExe + ' -p ' + filePath + ' -e "\\b((public)|protected|private|internal|(static)|(readonly|const))\\b"' + skipTextPattern + extraOptions + ' ' + searchPattern;
    } else {
        command = MsrExe + ' ' + searchPathsOptions + filePattern + skipTextPattern + extraOptions + ' ' + searchPattern;
    }

    if (!NormalTextRegex.test(rawSearchText)) {
        command = removeSearchTextForCommandLine(command);
    }

    command = command.replace(SearchTextHolderReplaceRegex, searchText).trim();
    if (findCmd === FindCommandType.RegexFindDefinitionInCodeFiles && NormalTextRegex.test(rawSearchText)) {
        // command = command.replace('Search ' + searchText, 'Search ' + searchText + ' roughly');
    }

    if (!isSorting) {
        command = command.replace(SkipJumpOutForHeadResultsRegex, ' ').trim();
    }

    command = enableColorAndHideCommandline(command);
    return command;
}
