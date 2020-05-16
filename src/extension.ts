// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { exec, ExecException, ExecOptions } from 'child_process';
import * as vscode from 'vscode';
import { checkSearchToolExists, MsrExe, toRunnableToolPath } from './checkTool';
import { getFindingCommandByCurrentWord, runFindingCommand, runFindingCommandByCurrentWord } from './commands';
import { IsWindows, SearchTextHolderReplaceRegex, SkipJumpOutForHeadResultsRegex } from './constants';
import { cookCmdShortcutsOrFile, FileExtensionToMappedExtensionMap, getConfig, getOverrideConfigByPriority, getRootFolder, getRootFolderExtraOptions, getRootFolderName, getSearchPathOptions, printConfigInfo } from './dynamicConfig';
import { FindCommandType, FindType } from './enums';
import { clearOutputChannel, disposeTerminal, outputDebug, outputDebugOrInfo, outputError, outputInfo, outputResult, outputWarn, RunCmdTerminalName, runCommandInTerminal } from './outputUtils';
import { SearchProperty } from './ranker';
import { escapeRegExp } from './regexUtils';
import { getCurrentWordAndText, isNullOrEmpty, quotePaths, toPath } from './utils';

import ChildProcess = require('child_process');
import path = require('path');


const GetFileLineTextRegex = new RegExp('(.+?):(\\d+):(.*)');

const RemoveCommandLineInfoRegex = / ; Directory = .*/;
const GetSummaryRegex = /^(?:Matched|Replaced) (\d+) /m;
const NotIgnoreErrorRegex = /^(Matched|Replaced) \d+ .*?(Error|error)/;
const CheckMaxSearchDepthRegex = /\s+(-k\s*\d+|--max-depth\s+\d+)/;

// Use bytes/second should be more precise.
const ExpectedMinLinesPerSecond = 16 * 10000;
const ExpectedMaxTimeCostSecond = 3.0;
let SearchToCostSumMap = new Map<FindType, Number>();
let SearchTimesMap = new Map<FindType, Number>();

let lastSearchTime = process.hrtime();
let MyConfig = getConfig();
let RootConfig = MyConfig.RootConfig || vscode.workspace.getConfiguration('msr');
checkSearchToolExists();
// vscode.languages.getLanguages().then((languages: string[]) => { console.log("Known languages: " + languages); });

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (outputLog) and errors (console.error)
	// This line of code will only be executed once when your extension is activated

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	registerExtension(context);

	// Listening to configuration changes
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('msr')) {
			MyConfig = getConfig(true);
			RootConfig = vscode.workspace.getConfiguration('msr');
			printConfigInfo(RootConfig);
		}
	}));
}

export function registerExtension(context: vscode.ExtensionContext) {
	RootConfig = vscode.workspace.getConfiguration('msr');
	const selector = {
		languageId: '*',
		scheme: 'file',
	};

	context.subscriptions.push(vscode.languages.registerDefinitionProvider(selector, new DefinitionFinder));
	context.subscriptions.push(vscode.languages.registerReferenceProvider(selector, new ReferenceFinder));

	context.subscriptions.push(vscode.window.onDidOpenTerminal(terminal => {
		const matchNameRegex = /^(Powershell|CMD|Command(\s+Prompt)?|PowerShell Integrated Console)$|bash/i;
		if (MyConfig.InitProjectCmdAliasForNewTerminals && (!IsWindows || matchNameRegex.test(terminal.name))) {
			const folders = vscode.workspace.workspaceFolders;
			const currentPath = folders && folders.length > 0 ? folders[0].uri.fsPath : '.';
			cookCmdShortcutsOrFile(currentPath, true, false, terminal);
		}
	}));

	context.subscriptions.push(vscode.window.onDidCloseTerminal(terminal => {
		if (terminal.name === RunCmdTerminalName) {
			disposeTerminal();
		}
	}));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.regexFindDefinitionInCodeFiles',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.RegexFindDefinitionInCodeFiles, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.regexFindDefinitionInCurrentFile',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.RegexFindDefinitionInCurrentFile, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.regexFindReferencesInCurrentFile',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.RegexFindReferencesInCurrentFile, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.regexFindReferenceInCodeFiles',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.RegexFindReferencesInCodeFiles, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.regexFindPureReferenceInCodeFiles',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.RegexFindPureReferencesInCodeFiles, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.regexFindReferencesInDocs',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.RegexFindReferencesInDocs, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.regexFindReferencesInConfigFiles',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.RegexFindReferencesInConfigFiles, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.regexFindInAllProjectFiles',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.RegexFindReferencesInAllProjectFiles, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.regexFindReferencesInCodeAndConfig',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.RegexFindReferencesInCodeAndConfig, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.regexFindInAllSmallFiles',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.RegexFindReferencesInAllSmallFiles, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.findSelectedPlainTextInCodeFiles',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.FindPlainTextInCodeFiles, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.findSelectedPlainTextInConfigFiles',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.FindPlainTextInConfigFiles, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.findSelectedPlainTextInDocFiles',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.FindPlainTextInDocFiles, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.findSelectedPlainTextInCodeAndConfigFiles',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.FindPlainTextInConfigAndConfigFiles, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.findSelectedPlainTextInAllProjectFiles',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.FindPlainTextInAllProjectFiles, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.findSelectedPlainTextInAllSmallFiles',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.FindPlainTextInAllSmallFiles, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.sortProjectFilesBySize',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.SortProjectFilesBySize, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.sortProjectFilesByTime',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.SortProjectFilesByTime, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.sortAllFilesBySize',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.SortAllFilesBySize, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.sortAllFilesByTime',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.SortAllFilesByTime, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.cookCmdAlias',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			cookCmdShortcutsOrFile(textEditor.document.uri.fsPath, false, false)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.cookCmdAliasByProject',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			cookCmdShortcutsOrFile(textEditor.document.uri.fsPath, true, false)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.cookCmdAliasFiles',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			cookCmdShortcutsOrFile(textEditor.document.uri.fsPath, false, true)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.cookCmdAliasFilesByProject',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			cookCmdShortcutsOrFile(textEditor.document.uri.fsPath, true, true)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.cookCmdAliasDumpWithOthersToFiles',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			cookCmdShortcutsOrFile(textEditor.document.uri.fsPath, false, true, undefined, '', true)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.cookCmdAliasDumpWithOthersToFilesByProject',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			cookCmdShortcutsOrFile(textEditor.document.uri.fsPath, true, true, undefined, '', true)));

	context.subscriptions.push(vscode.commands.registerCommand('msr.tmpToggleEnableForFindDefinitionAndReference',
		(...args: any[]) => {
			getConfig().toggleEnableFindingDefinitionAndReference();
		}));
}

// this method is called when your extension is deactivated
export function deactivate() { }

export class DefinitionFinder implements vscode.DefinitionProvider {
	public async provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Location[] | null> {
		if (MyConfig.IsFindDefinitionEnabled) {
			const onlySearchCurrentFileValues = [true, false];
			for (let k = 0; k < onlySearchCurrentFileValues.length; k++) {
				const allResults = await searchMatchedWords(FindType.Definition, document, position, token, true, onlySearchCurrentFileValues[k]);
				if (allResults && allResults.length > 0) {
					return Promise.resolve(allResults);
				}
			}

			return searchDefinitionInCurrentFile(document, position, token).then(currentFileResults => {
				if (currentFileResults && currentFileResults.length > 0) {
					return Promise.resolve(currentFileResults);
				}
				else {
					return Promise.resolve(searchLocalVariableDefinitionInCurrentFile(document, position, token));
				}
			});
		} else {
			outputDebug('Your extension "vscode-msr": Finding definition is disabled by setting of `msr.enable.definition`'
				+ ' or temporarily toggled enable/disable by `msr.tmpToggleEnableForFindDefinitionAndReference`.');
			return Promise.reject(null);
		}
	}
}

export class ReferenceFinder implements vscode.ReferenceProvider {
	public async provideReferences(document: vscode.TextDocument, position: vscode.Position, context: vscode.ReferenceContext, token: vscode.CancellationToken): Promise<vscode.Location[] | null> {
		if (MyConfig.IsFindReferencesEnabled) {
			return searchMatchedWords(FindType.Reference, document, position, token, false);
		} else {
			outputDebug('Your extension "vscode-msr": Finding reference is disabled by setting of `msr.enable.reference`'
				+ ' or temporarily toggled enable/disable by `msr.tmpToggleEnableForFindDefinitionAndReference`.');
			return Promise.reject(null);
		}
	}
}

// Cannot avoid too frequent searching by mouse hover + click, because `Visual Studio Code` will not effect. So let VSCode solve this bug.
function isTooFrequentSearch() {
	const elapse = process.hrtime(lastSearchTime);
	const ms = elapse[0] * 1000 + elapse[1] / 1000000;
	lastSearchTime = process.hrtime();
	return ms < 900;
}

function getCurrentFileSearchInfo(findType: FindType, document: vscode.TextDocument, position: vscode.Position, escapeTextForRegex: boolean = true): [path.ParsedPath, string, string, vscode.Range, string] {
	const parsedFile = path.parse(document.fileName);
	const extension = parsedFile.ext.replace(/^\./, '').toLowerCase() || 'default';
	let [currentWord, currentWordRange, currentText] = getCurrentWordAndText(document, position);
	if (currentWord.length < 2 || !currentWordRange || !checkSearchToolExists()) {
		return [parsedFile, extension, '', new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0)), ''];
	}

	const isPowershell = /psm?1$/.exec(extension);
	if (isPowershell && currentText.indexOf('$' + currentWord) >= 0) {
		currentWord = '$' + currentWord;
	}

	const searchText = escapeTextForRegex ? escapeRegExp(currentWord) : currentWord;
	return [parsedFile, extension, searchText, currentWordRange, currentText];
}

function searchMatchedWords(findType: FindType, document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, skipTestPathFiles: boolean, onlyCurrentFile = false): Thenable<vscode.Location[]> {
	try {
		if (MyConfig.shouldSkipFinding(findType, document.uri.fsPath)) {
			return Promise.reject();
		}

		const [parsedFile, extension, currentWord, currentWordRange, currentText] = getCurrentFileSearchInfo(findType, document, position);
		if (!checkSearchToolExists() || token.isCancellationRequested || currentWord.length < 2 || !currentWordRange) {
			return Promise.reject('Please check search word length: ' + currentWord);
		}

		clearOutputChannel();

		const rootFolderName = getRootFolderName(document.uri.fsPath) || '';

		const mappedExt = FileExtensionToMappedExtensionMap.get(extension) || extension;
		if (MyConfig.IsDebug) {
			outputDebug('mappedExt = ' + mappedExt + ' , languageId = ' + document.languageId + ' , file = ' + document.fileName);
		}

		let ranker = new SearchProperty(findType, currentWord, currentWordRange, currentText, parsedFile, mappedExt, onlyCurrentFile);

		const configKeyName = FindType.Definition === findType ? 'definition' : 'reference';
		const [filePattern, searchOptions] = ranker.getFileNamePatternAndSearchOption(extension, configKeyName, parsedFile);
		if (filePattern.length < 1 || searchOptions.length < 1) {
			return Promise.reject('Failed to get filePattern or searchOptions when search: ' + currentWord);
		}

		let extraOptions = '';
		if (onlyCurrentFile) {
			extraOptions = "-I -C";
		} else {
			extraOptions = getRootFolderExtraOptions(rootFolderName) + getOverrideConfigByPriority([rootFolderName + '.' + configKeyName, configKeyName, mappedExt, 'default'], 'extraOptions');
			if (skipTestPathFiles && /test/i.test(document.fileName) === false && /\s+--np\s+/.test(extraOptions) === false) {
				extraOptions = '--np test ' + extraOptions;
			}
		}

		const isFindDefinition = FindType.Definition === findType;
		const useExtraSearchPathsForReference = 'true' === getOverrideConfigByPriority([rootFolderName + '.' + mappedExt, rootFolderName, ''], 'findReference.useExtraPaths');
		const useExtraSearchPathsForDefinition = 'true' === getOverrideConfigByPriority([rootFolderName + '.' + mappedExt, rootFolderName, ''], 'findDefinition.useExtraPaths');

		const searchPathOptions = onlyCurrentFile ? '-p ' + quotePaths(document.uri.fsPath) : getSearchPathOptions(document.uri.fsPath, mappedExt, isFindDefinition, useExtraSearchPathsForReference, useExtraSearchPathsForDefinition);
		let commandLine = 'msr ' + searchPathOptions;
		if (!onlyCurrentFile) {
			commandLine += ' -f ' + filePattern;
		}

		if (!onlyCurrentFile && MyConfig.DefaultMaxSearchDepth > 0 && !CheckMaxSearchDepthRegex.test(commandLine)) {
			extraOptions = extraOptions.trimRight() + ' -k ' + MyConfig.DefaultMaxSearchDepth.toString();
		}

		if (FindType.Definition === findType) {
			commandLine += ' ' + searchOptions + ' ' + extraOptions;
		} else {
			commandLine += ' ' + extraOptions + ' ' + searchOptions;
		}

		commandLine = commandLine.trim().replace(SearchTextHolderReplaceRegex, currentWord);
		outputInfo('\n' + commandLine + '\n');

		return getMatchedLocationsAsync(findType, commandLine, ranker, token);
	} catch (e) {
		outputError(e.stack.toString());
		outputError(e.toString());
		throw e;
	}
}

function searchDefinitionInCurrentFile(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Location[]> {
	if (MyConfig.shouldSkipFinding(FindType.Definition, document.uri.fsPath)) {
		return Promise.reject();
	}

	const [parsedFile, extension, currentWord, currentWordRange, currentText] = getCurrentFileSearchInfo(FindType.Definition, document, position);
	if (!checkSearchToolExists() || token.isCancellationRequested || currentWord.length < 2 || !currentWordRange) {
		return Promise.reject();
	}

	const mappedExt = FileExtensionToMappedExtensionMap.get(extension) || extension;
	let ranker = new SearchProperty(FindType.Definition, currentWord, currentWordRange, currentText, parsedFile, mappedExt, true);

	let command = getFindingCommandByCurrentWord(FindCommandType.RegexFindDefinitionInCurrentFile, currentWord, parsedFile, '', ranker);
	if (/\s+-[A-Zc]*?I[A-Zc]*(\s+|$)/.test(command) === false) {
		command = command.trim() + ' -I';
	}

	if (/\s+-[A-Zc]*?C[A-Zc]*(\s+|$)/.test(command) === false) {
		command = command.trim() + ' -C';
	}

	if (MyConfig.IsDebug && /\s+-[A-Z]*?c[A-Z]*(\s+|$)/.test(command) === false) {
		command = command.trim() + ' -c';
	}

	outputDebug('\n' + command + '\n');
	return getMatchedLocationsAsync(FindType.Definition, command, ranker, token);
}

function searchLocalVariableDefinitionInCurrentFile(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Location[]> {
	if (MyConfig.shouldSkipFinding(FindType.Reference, document.uri.fsPath)) {
		return Promise.reject();
	}

	const [parsedFile, extension, currentWord, currentWordRange, currentText] = getCurrentFileSearchInfo(FindType.Definition, document, position);
	if (!checkSearchToolExists() || token.isCancellationRequested || currentWord.length < 2 || !currentWordRange) {
		return Promise.reject();
	}

	const mappedExt = FileExtensionToMappedExtensionMap.get(extension) || extension;
	let ranker = new SearchProperty(FindType.Definition, currentWord, currentWordRange, currentText, parsedFile, mappedExt, true);

	const pattern = '\\w+\\s+(' + currentWord + ')\\s*=' + '|'
		+ '\\([\\w\\s]*?' + currentWord + '\\s*(in|:)\\s*\\w+';

	const filePath = quotePaths(document.fileName);
	let command = MsrExe + ' -p ' + filePath + ' -t "' + pattern + '" -N ' + Math.max(0, position.line - 1) + ' -T 1 -I -C';
	outputDebug('\n' + command + '\n');
	return getMatchedLocationsAsync(FindType.Definition, command, ranker, token);
}

function getMatchedLocationsAsync(findType: FindType, cmd: string, ranker: SearchProperty, token: vscode.CancellationToken): Thenable<vscode.Location[]> {
	const options: ExecOptions = {
		cwd: getRootFolder(toPath(ranker.currentFile)) || ranker.currentFile.dir,
		timeout: 60 * 1000,
		maxBuffer: 10240000,
	};

	return new Promise<vscode.Location[]>((resolve, reject) => {
		const process = exec(cmd, options, (error: | ExecException | null, stdout: string, stderr: string) => {
			if (error) {
				const hasSummary = GetSummaryRegex.test(error.message);
				if (error.message.startsWith('Command fail')) {
					if (!error.message.trimRight().endsWith(cmd)) {
						// Check if previous searching not completed. Try again or wait.
						console.warn('Got error message (probably due to return code which is result count not 0): ' + error.message);
					}
				} else if (!hasSummary || NotIgnoreErrorRegex.test(error.message)) {
					outputError(error.message);
				} else {
					console.warn(error.message); // outDebug(error.message);
				}
			}

			// if (!isNullOrEmpty(stdout)) { return Promise.reject(); }
			const allResults: vscode.Location[] = isNullOrEmpty(stdout) ? [] : parseCommandOutput(stdout, findType, cmd, ranker);

			if (stderr) {
				if (!findAndProcessSummary(false, stderr, findType, cmd, ranker)) {
					if (/\bmsr\b.*?\s+not\s+/.test(stderr)) {
						checkSearchToolExists(true, false);
					}
				}
			}

			resolve(allResults);
		});

		token.onCancellationRequested(() => killProcessTree(process.pid));
	});
}

function findAndProcessSummary(skipIfNotMatch: boolean, summaryText: string, findType: FindType, cmd: string, ranker: SearchProperty): boolean {
	const summaryMatch = GetSummaryRegex.exec(summaryText);
	if (!summaryMatch && skipIfNotMatch) {
		return false;
	}

	const matchErrorWarn = /(\s+|\d+m)(WARN|ERROR)\b/.exec(summaryText);
	if (matchErrorWarn) {
		const warnOrError = matchErrorWarn[2];
		if (warnOrError === 'WARN') {
			outputDebug('\n' + summaryText.replace(/^([\r\n]+)/, 'WARN: '));
		} else {
			outputError('\n' + summaryText.replace(/^([\r\n]+)/, 'ERROR: '));
		}
	}

	if (!summaryMatch) {
		return false;
	}

	const match = /^Matched (\d+) lines.*?read (\d+) lines.*?Used (\d+\.\d*) s/.exec(summaryText);
	const matchCount = match ? parseInt(match[1]) : 0;
	const outputSummary = '\n' + (MyConfig.IsDebug ? summaryText : summaryText.replace(RemoveCommandLineInfoRegex, ''));
	outputDebugOrInfo(ranker.isSearchOneFile, matchCount > 0 ? outputSummary : outputSummary.trim());

	if (match) {
		const lineCount = parseInt(match[2]);
		const costSeconds = parseFloat(match[3]);
		outputDebug('Got matched count = ' + matchCount + ' and time cost = ' + costSeconds + ' from summary.');
		sumTimeCost(findType, costSeconds, lineCount);
		if (matchCount < 1 && RootConfig.get('enable.useGeneralFindingWhenNoResults') as boolean) {
			const findCmd = findType === FindType.Definition ? FindCommandType.RegexFindDefinitionInCodeFiles : FindCommandType.RegexFindDefinitionInCodeFiles;
			if (!ranker.isSearchOneFile) {
				runFindingCommandByCurrentWord(findCmd, ranker.currentWord, ranker.currentFile);
				outputInfo('Will run general search, please check results in `MSR-RUN-CMD` in `TERMINAL` tab. Set `msr.quiet` to avoid switching tabs; Disable `msr.enable.useGeneralFindingWhenNoResults` to disable re-running.');
				outputInfo('Try extensive search if still no results. Use context menu or: Click a word or select a text  --> Press `F12` --> Type `msr` + `find` and choose to search.');
			}
		}
		else if (matchCount > 1 && costSeconds <= MyConfig.ReRunCmdInTerminalIfCostLessThan) {
			if (!ranker.isSearchOneFile) {
				outputInfo('Will re-run and show clickable + colorful results in `MSR-RUN-CMD` in `TERMINAL` tab. Set `msr.quiet` to avoid switching tabs; Decrease `msr.reRunSearchInTerminalIfCostLessThan` value for re-running.');
				runCommandInTerminal(toRunnableToolPath(cmd).replace(SkipJumpOutForHeadResultsRegex, ' ').trim(), false, getConfig().ClearTerminalBeforeExecutingCommands);
			}
		}
	} else if (!ranker.isSearchOneFile) {
		outputDebug('Failed to get time cost in summary.');
	}

	return true;
}

function sumTimeCost(findType: FindType, costSeconds: Number, lineCount: Number) {
	const times = 1 + (SearchTimesMap.get(findType) || 0).valueOf();
	SearchTimesMap.set(findType, times);

	const costSum = costSeconds.valueOf() + (SearchToCostSumMap.get(findType) || 0).valueOf();
	SearchToCostSumMap.set(findType, times === 1 ? Math.min(3, costSum) : costSum);

	const speed = lineCount.valueOf() / costSeconds.valueOf();
	const average = costSum / times;
	const message = 'Search-' + FindType[findType] + ' cost ' + costSeconds.toFixed(3) + ' s for ' + lineCount + ' lines, speed = ' + Math.round(speed) + ' lines/s.';

	if (times > 3 && average > ExpectedMaxTimeCostSecond && speed < ExpectedMinLinesPerSecond) {
		outputWarn(message + ' If CPU and disk are not busy, try to be faster: https://github.com/qualiu/vscode-msr/blob/master/README.md#avoid-security-software-downgrade-search-performance');
	} else {
		outputDebug(message);
	}
}

function parseCommandOutput(stdout: string, findType: FindType, cmd: string, ranker: SearchProperty): vscode.Location[] {
	let matchedFileLines = stdout.trimRight().split(/\r\n|\n\r|\n|\r/);
	const summaryText = matchedFileLines.length > 0 && GetSummaryRegex.test(matchedFileLines[matchedFileLines.length - 1]) ? matchedFileLines[matchedFileLines.length - 1] : '';
	if (summaryText.length > 0) {
		matchedFileLines.pop();
	}

	if (ranker.isSearchOneFile && matchedFileLines.length > 0) {
		outputInfo('');
	}

	let allResults: vscode.Location[] = [];
	if (!MyConfig.NeedSortResults || matchedFileLines.length < 2) {
		matchedFileLines.map(line => {
			const [score, location] = parseMatchedText(line, ranker);
			if (location) {
				allResults.push(location);
				let sc = location.range.start;
				let fileRowColumn = line.replace(':' + (sc.line + 1) + ':', ':' + (sc.line + 1) + ':' + sc.character);
				outputResult(fileRowColumn);
			} else {
				outputResult(line);
			}
		});

		if (summaryText.length > 0) {
			findAndProcessSummary(true, summaryText, findType, cmd, ranker);
		}

		return allResults;
	}

	const subName = FindType[findType].toLowerCase();
	const rootFolderName = getRootFolderName(toPath(ranker.currentFile)) || '';
	const priorityList = [rootFolderName + '.' + ranker.mappedExt + '.' + subName, rootFolderName + '.' + subName, rootFolderName, ranker.extension, ranker.mappedExt, 'default'];
	const removeLowScoreResultsFactor = Number(getOverrideConfigByPriority(priorityList, 'removeLowScoreResultsFactor') || 0.8);
	const keepHighScoreResultCount = Number(getOverrideConfigByPriority(priorityList, 'keepHighScoreResultCount') || -1);

	let scoreSum = 0;
	let scoreList: Number[] = [];
	let scoreToListMap = new Map<Number, [string, vscode.Location][]>();
	matchedFileLines.map(line => {
		const [score, location] = parseMatchedText(line, ranker);
		if (!location) {
			return;
		}

		scoreSum += score.valueOf();
		scoreList.push(score);

		if (!scoreToListMap.has(score)) {
			scoreToListMap.set(score, []);
		}

		if (location) {
			let sc = location.range.start;
			let fileRowColumn = line.replace(':' + (sc.line + 1) + ':', ':' + (sc.line + 1) + ':' + sc.character);
			(scoreToListMap.get(score) || []).push([fileRowColumn, location]);
		}
	});

	scoreList.sort((a, b) => a.valueOf() - b.valueOf());
	const averageScore = scoreSum / scoreList.length;
	const removeThreshold = ranker.isSearchOneFile && findType === FindType.Definition ? averageScore : averageScore * removeLowScoreResultsFactor;

	const isDescending = MyConfig.DescendingSortForVSCode;
	const sortedMap = isDescending
		? [...scoreToListMap.entries()].sort((a, b) => b[0].valueOf() - a[0].valueOf())
		: [...scoreToListMap.entries()].sort((a, b) => a[0].valueOf() - b[0].valueOf());

	let outputList: string[] = [];
	let debugList: string[] = [];
	let removedCount = 0;
	const beginAddNumber = keepHighScoreResultCount < 1 ? 0 : (isDescending ? 0 : scoreList.length - keepHighScoreResultCount + 1);
	const endAddNumber = keepHighScoreResultCount < 1 ? scoreList.length : (isDescending ? keepHighScoreResultCount : scoreList.length);
	let eleNumber = 0;
	sortedMap.forEach(list => {
		const currentScore = list[0];
		list[1].forEach(a => {
			eleNumber++;
			if ((isDescending && eleNumber > endAddNumber) || (!isDescending && eleNumber < beginAddNumber)) {
				console.log('Remove non-keep results[' + eleNumber + ']: Score = ' + currentScore + ' : ' + a[0]);
				removedCount++;
				return;
			}

			if (currentScore < removeThreshold && findType === FindType.Definition) {
				removedCount++;
				console.log('Remove low score results[' + eleNumber + ']: Score = ' + currentScore + ' : ' + a[0]);
				return;
			}

			debugList.push('Score = ' + currentScore + ' : ' + a[0]);
			if (MyConfig.DescendingSortForConsoleOutput === MyConfig.DescendingSortForVSCode) {
				outputResult(a[0]);
			} else {
				outputList.push(a[0]);
			}
			allResults.push(a[1]);
		});
	});

	for (let k = outputList.length - 1; k >= 0; k--) {
		outputResult(outputList[k]);
	}

	for (let k = isDescending ? debugList.length - 1 : 0; isDescending ? k >= 0 : k < debugList.length; isDescending ? k-- : k++) {
		console.log(debugList[k]);
	}

	const maxScore = scoreList[scoreList.length - 1];
	const minScore = scoreList[0];
	console.log('Count = ' + scoreList.length + ' , averageScore = ' + averageScore.toFixed(1)
		+ ' , max = ' + maxScore.toFixed(1) + ' , min = ' + minScore.toFixed(1)
		+ (maxScore.valueOf() === 0 ? '' : ' , min/max = ' + (minScore.valueOf() / maxScore.valueOf()).toFixed(2))
		+ ' , removeFactor = ' + removeLowScoreResultsFactor + ' , threshold = ' + removeThreshold.toFixed(1)
		+ ' , removedCount = ' + removedCount + ' , scoreWordsText = ' + ranker.scoreWordsText);

	if (summaryText.length > 0) {
		findAndProcessSummary(true, summaryText, findType, cmd, ranker);
	}

	return allResults;
}

function parseMatchedText(text: string, ranker: SearchProperty): [Number, vscode.Location | null] {
	let m;
	if ((m = GetFileLineTextRegex.exec(text)) !== null) {
		const uri = vscode.Uri.file(m[1]);
		const wm = ranker.currentWordRegex.exec(m[3]);
		if (wm !== null) {
			const row = parseInt(m[2]);
			const pos = new vscode.Position(row - 1, wm.index);
			const score = MyConfig.NeedSortResults ? ranker.getScore(m[1], row, m[3]) : 1;
			if (!MyConfig.NeedSortResults) {
				console.log('Score = ' + score + ': ' + text);
			}

			return [score, new vscode.Location(uri, pos)];
		}
		else {
			outputError('Failed to match words by Regex = "' + ranker.currentWordRegex + '" from matched result: ' + m[3]);
		}
	}
	else {
		outputError('Failed to match GetFileLineTextRegex = "' + GetFileLineTextRegex.source + '" from matched result: ' + text);
	}

	return [0, null];
}

function killProcessTree(processId: number): void {
	const killCommand = IsWindows
		? `taskkill /F /T /PID ` + processId
		: `ps -ef | egrep -ie "msr\\s+-rp\\s+.*-c" | xargs kill -9`; // 'kill -9 ' + processId;
	try {
		console.log('vscode-msr: ' + killCommand);
		ChildProcess.execSync(killCommand);
	} catch (err) {
		console.warn(err);
	}
}
