'use strict';

import * as vscode from 'vscode';
import path = require('path');

import { getConfig, getSearchPathOptions } from './dynamicConfig';
import { runCommandInTerminal, enableColorAndHideSummary, outDebug } from './outputUtils';
import { getCurrentWordAndText } from './utils';
import { FileExtensionToConfigExtMap, FindType } from './ranker';

const SkipJumpOutForHeadResultsRegex = /\s+-J?H\s*\d+(\s+|$)/;

export enum FindCommands {
    FindDefinitionInCodeFiles,
    FindReferencesInCodeFiles,
    FindReferencesInConfigFiles,
    FindReferencesInDocs,
    FindReferencesInAllFiles,
}

export function runFindingCommand(findCmd: FindCommands, textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) {
    const RootConfig = vscode.workspace.getConfiguration('msr');
    if (RootConfig.get('enable.findingCommands') as boolean !== true) {
        outDebug('Your extension "vscode-msr": finding-commands is disabled by setting of `msr.enable.findingCommands`.');
    }

    const [currentWord] = getCurrentWordAndText(textEditor.document, textEditor.selection.active);

    const parsedFile = path.parse(textEditor.document.fileName);
    runFindingCommandByCurrentWord(findCmd, currentWord, parsedFile);
}

export function runFindingCommandByCurrentWord(findCmd: FindCommands, currentWord: string, parsedFile: path.ParsedPath) {
    if (currentWord.length < 2) {
        return;
    }

    const RootConfig = vscode.workspace.getConfiguration('msr');
    const MyConfig = getConfig();

    let filePattern = '';
    switch (findCmd) {
        case FindCommands.FindDefinitionInCodeFiles:
        case FindCommands.FindReferencesInCodeFiles:
            filePattern = RootConfig.get('default.codeFiles') as string;
            break;

        case FindCommands.FindReferencesInDocs:
            filePattern = RootConfig.get('default.docFiles') as string;
            break;

        case FindCommands.FindReferencesInConfigFiles:
            filePattern = RootConfig.get('default.configFiles') as string;
            break;

        case FindCommands.FindReferencesInAllFiles:
        default:
            filePattern = RootConfig.get('default.allFiles') as string;
            break;
    }

    const isFindDefinition = FindCommands.FindDefinitionInCodeFiles === findCmd;
    const searchPattern = isFindDefinition
        ? RootConfig.get('default.definition') as string
        : RootConfig.get('default.reference') as string;

    const skipPattern = isFindDefinition
        ? RootConfig.get('default.skip.definition') as string || ''
        : RootConfig.get('default.skip.reference') as string || '';

    const extraOptions = isFindDefinition
        ? RootConfig.get('definition.extraOptions') || RootConfig.get('default.extraOptions')
        : RootConfig.get('reference.extraOptions') || RootConfig.get('default.extraOptions');

    const extension = parsedFile.ext.substring(1).toLowerCase() || 'default';
    const mappedExt = FileExtensionToConfigExtMap.get(extension) || extension;
    const useExtraPaths = RootConfig.get('findingCommands.useExtraPaths') as boolean;
    const searchPathsOptions = getSearchPathOptions(mappedExt, FindCommands.FindDefinitionInCodeFiles === findCmd, useExtraPaths);
    let command = 'msr ' + searchPathsOptions + ' -f "' + filePattern + '"' + ' -t "' + searchPattern + '"';
    if (skipPattern && skipPattern.length > 1) {
        command += ' --nt "' + skipPattern + '"';
    }

    command += ' ' + extraOptions as string;
    command = command.replace(MyConfig.SearchTextHolderReplaceRegex, currentWord).trim();
    if (findCmd === FindCommands.FindDefinitionInCodeFiles) {
        command = command.replace('Search ' + currentWord, 'Search ' + currentWord + ' as a class or method roughly');
    }

    command = command.replace(SkipJumpOutForHeadResultsRegex, ' ').trim();
    command = enableColorAndHideSummary(command);

    runCommandInTerminal(command, false);
}