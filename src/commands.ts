import * as vscode from 'vscode';
import { MsrExe } from './checkTool';
import { SearchTextHolderReplaceRegex, SkipJumpOutForHeadResultsRegex } from './constants';
import { FileExtensionToMappedExtensionMap, getConfig, getOverrideConfigByPriority, getRootFolderExtraOptions, getRootFolderName, getSearchPathOptions, MappedExtToCodeFilePatternMap, removeSearchTextForCommandLine, getSubConfigValue, getConfigValue } from './dynamicConfig';
import { FindCommandType } from './enums';
import { enableColorAndHideCommandLine, outputDebug, runCommandInTerminal } from './outputUtils';
import { SearchProperty } from './ranker';
import { escapeRegExp, NormalTextRegex } from './regexUtils';
import { getCurrentWordAndText, quotePaths, toPath } from './utils';
import path = require('path');


export function runFindingCommand(findCmd: FindCommandType, textEditor: vscode.TextEditor) {
    const RootConfig = vscode.workspace.getConfiguration('msr');
    if (RootConfig.get('enable.findingCommands') as boolean !== true) {
        outputDebug('Your extension "vscode-msr": finding-commands is disabled by setting of `msr.enable.findingCommands`.');
    }

    const findCmdText = FindCommandType[findCmd];
    const [currentWord] = getCurrentWordAndText(textEditor.document, textEditor.selection.active, textEditor);
    const rawSearchText = currentWord;
    const searchText = findCmdText.match(/Regex/i) ? escapeRegExp(rawSearchText) : rawSearchText;

    const parsedFile = path.parse(textEditor.document.fileName);
    const command = getFindingCommandByCurrentWord(findCmd, searchText, parsedFile, rawSearchText, undefined);
    runCommandInTerminal(command, true, getConfig().ClearTerminalBeforeExecutingCommands);
}

export function runFindingCommandByCurrentWord(findCmd: FindCommandType, searchText: string, parsedFile: path.ParsedPath, rawSearchText: string = '') {
    const command = getFindingCommandByCurrentWord(findCmd, searchText, parsedFile, rawSearchText, undefined);
    runCommandInTerminal(command, !getConfig().IsQuiet, getConfig().ClearTerminalBeforeExecutingCommands);
}

export function getFindingCommandByCurrentWord(findCmd: FindCommandType, searchText: string, parsedFile: path.ParsedPath, rawSearchText: string = '', ranker: SearchProperty | undefined): string {
    const extension = parsedFile.ext.replace(/^\./, '').toLowerCase() || 'default';
    const mappedExt = FileExtensionToMappedExtensionMap.get(extension) || extension;

    const findCmdText = FindCommandType[findCmd];
    const isSorting = findCmdText.match(/Sort/i) !== null;

    if (!isSorting && searchText.length < 2) {
        return '';
    }

    rawSearchText = rawSearchText.length < 1 ? searchText : rawSearchText;

    const RootConfig = vscode.workspace.getConfiguration('msr');
    const isFindDefinition = findCmdText.indexOf('Definition') >= 0;
    const isFindReference = findCmdText.indexOf('Reference') >= 0;
    const isFindPlainText = findCmdText.indexOf('FindPlainText') >= 0;

    const rootFolderName = getRootFolderName(toPath(parsedFile)) || '';

    let extraOptions = isFindDefinition
        ? getSubConfigValue(rootFolderName, extension, mappedExt, 'definition', 'extraOptions')
        : (isFindReference
            ? getSubConfigValue(rootFolderName, extension, mappedExt, 'reference', 'extraOptions')
            : getConfigValue(rootFolderName, extension, mappedExt, 'extraOptions')
        );

    extraOptions = getRootFolderExtraOptions(rootFolderName) + extraOptions;

    let searchPattern = isFindDefinition
        ? getConfigValue(rootFolderName, extension, mappedExt, 'definition')
        : (isFindReference
            ? getConfigValue(rootFolderName, extension, mappedExt, 'reference')
            : ''
        );

    if (isFindReference) {
        if (/^\W/.test(searchText) && searchPattern.startsWith('\\b')) {
            searchPattern = searchPattern.substring(2);
        }

        if (/\W$/.test(searchText) && searchPattern.endsWith('\\b')) {
            searchPattern = searchPattern.substring(0, searchPattern.length - 2);
        }
    }

    let skipTextPattern = isFindDefinition
        ? getConfigValue(rootFolderName, extension, mappedExt, 'skip.definition')
        : (isFindReference
            ? getConfigValue(rootFolderName, extension, mappedExt, 'skip.reference')
            : ''
        );

    let filePattern = '';

    switch (findCmd) {
        case FindCommandType.RegexFindDefinitionInCurrentFile:
            let definitionPatterns = new Set<string>()
                .add(getConfigValue(rootFolderName, extension, mappedExt, 'class.definition'))
                .add(getConfigValue(rootFolderName, extension, mappedExt, 'member.definition'))
                .add(getConfigValue(rootFolderName, extension, mappedExt, 'constant.definition'))
                .add(getConfigValue(rootFolderName, extension, mappedExt, 'enum.definition'))
                .add(getConfigValue(rootFolderName, extension, mappedExt, 'method.definition'));

            definitionPatterns.delete('');

            if (definitionPatterns.size < 1) {
                definitionPatterns.add((getConfigValue(rootFolderName, extension, mappedExt, 'definition') as string || '').trim());
            }

            searchPattern = Array.from(definitionPatterns).join('|');
            skipTextPattern = ranker ? ranker.getSkipPatternForDefinition() : getConfigValue(rootFolderName, extension, mappedExt, 'skip.definition');
            break;

        case FindCommandType.RegexFindReferencesInCurrentFile:
            skipTextPattern = '';
            break;

        case FindCommandType.RegexFindDefinitionInCodeFiles:
        case FindCommandType.RegexFindReferencesInCodeFiles:
        case FindCommandType.FindPlainTextInCodeFiles:
        case FindCommandType.RegexFindPureReferencesInCodeFiles:
            filePattern = getOverrideConfigByPriority([rootFolderName, 'default'], 'codeFilesPlusUI') as string;
            break;

        case FindCommandType.RegexFindReferencesInDocs:
        case FindCommandType.FindPlainTextInDocFiles:
            filePattern = getOverrideConfigByPriority([rootFolderName, 'default'], 'docFiles') as string;
            break;

        case FindCommandType.RegexFindReferencesInConfigFiles:
        case FindCommandType.FindPlainTextInConfigFiles:
            filePattern = getOverrideConfigByPriority([rootFolderName, 'default'], 'configFiles') as string;
            break;

        case FindCommandType.RegexFindReferencesInCodeAndConfig:
        case FindCommandType.FindPlainTextInConfigAndConfigFiles:
            filePattern = getOverrideConfigByPriority([rootFolderName, 'default'], 'codeAndConfig') as string;
            break;

        case FindCommandType.SortAllFilesBySize:
        case FindCommandType.SortAllFilesByTime:
            filePattern = '';
            break;

        case FindCommandType.RegexFindReferencesInAllProjectFiles:
        case FindCommandType.FindPlainTextInAllProjectFiles:
        case FindCommandType.SortProjectFilesBySize:
        case FindCommandType.SortProjectFilesByTime:
            filePattern = getOverrideConfigByPriority([rootFolderName, 'default'], 'allFiles') as string;
            break;

        case FindCommandType.RegexFindReferencesInAllSmallFiles:
        case FindCommandType.FindPlainTextInAllSmallFiles:
        default:
            filePattern = '';
            extraOptions = getRootFolderExtraOptions(rootFolderName) + (RootConfig.get('allSmallFiles.extraOptions') as string || '').trim();
            break;
    }

    if (!isSorting && ('.' + extension).match(new RegExp(getOverrideConfigByPriority([rootFolderName, 'default'], 'scriptFiles') as string))) {
        filePattern = (MappedExtToCodeFilePatternMap.get(mappedExt) || getOverrideConfigByPriority([rootFolderName, 'default'], 'scriptFiles')) as string;
    }

    if (isSorting) {
        searchPattern = '';
        skipTextPattern = '';
        extraOptions = getRootFolderExtraOptions(rootFolderName);
        extraOptions += ' ' + (findCmdText.match(/BySize/i) ? '--sz --wt' : '--wt --sz');
        extraOptions += ' ' + getOverrideConfigByPriority([rootFolderName, 'default'], 'listSortingFilesOptions') as string || '-l -H 10 -T 10';
        extraOptions = extraOptions.trim();
    } else if (isFindPlainText) {
        searchPattern = ' -x "' + rawSearchText.replace(/"/g, '\\"') + '"';
        skipTextPattern = '';
    } else if (searchPattern.length > 0) {
        searchPattern = ' -t "' + searchPattern + '"';
    }

    if (findCmd === FindCommandType.RegexFindPureReferencesInCodeFiles) {
        const skipPattern = getConfigValue(rootFolderName, extension, mappedExt, 'skip.pureReference', true).trim();
        if (skipPattern.length > 0 && /\s+--nt\s+/.test(searchPattern) !== true) {
            skipTextPattern = skipPattern;
        }
    }

    const useExtraPaths = !isSorting && 'true' === getConfigValue(rootFolderName, extension, mappedExt, 'findingCommands.useExtraPaths');
    const searchPathsOptions = getSearchPathOptions(toPath(parsedFile), mappedExt, FindCommandType.RegexFindDefinitionInCodeFiles === findCmd, useExtraPaths, useExtraPaths);
    if (filePattern.length > 0) {
        filePattern = ' -f "' + filePattern + '"';
    }

    const filePath = quotePaths(toPath(parsedFile));

    if (skipTextPattern && skipTextPattern.length > 1) {
        skipTextPattern = ' --nt "' + skipTextPattern + '"';
    }

    if (extraOptions && extraOptions.length > 1) {
        extraOptions = ' ' + extraOptions;
    }

    let command = '';
    if (findCmd === FindCommandType.RegexFindDefinitionInCurrentFile) {
        if (mappedExt === 'ui' && searchPattern.indexOf('|let|') < 0) {
            searchPattern = searchPattern.replace('const|', 'const|let|');
        }

        command = MsrExe + ' -p ' + filePath + skipTextPattern + extraOptions + ' ' + searchPattern;
    }
    else if (findCmd === FindCommandType.RegexFindReferencesInCurrentFile) {
        command = MsrExe + ' -p ' + filePath + ' -e "\\b((public)|protected|private|internal|(static)|(readonly|const|let))\\b"' + skipTextPattern + extraOptions + ' ' + searchPattern;
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

    command = enableColorAndHideCommandLine(command);
    return command;
}
