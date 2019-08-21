// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import { exec, ExecOptions, ExecException } from 'child_process';
import ChildProcess = require('child_process');
import path = require('path');

import { getSearchPathOptions, getConfig, getOverrideOrDefaultConfig, SearchTextHolderReplaceRegex, ShouldQuotePathRegex, GitFolderName, printConfigInfo, getOverrideConfigByPriority } from './dynamicConfig';
import { outputError, outputWarn, outputInfo, clearOutputChannel, runCommandInTerminal, outputDebug, RunCmdTerminalName, disposeTerminal, outputDebugOrInfo, outputResult } from './outputUtils';
import { FindType, SearchProperty, FileExtensionToConfigExtMap } from './ranker';
import { checkSearchToolExists, IsWindows, MsrExe, toRunnableToolPath } from './checkTool';
import { getCurrentWordAndText } from './utils';
import { FindCommandType, runFindingCommand, runFindingCommandByCurrentWord, SkipJumpOutForHeadResultsRegex, getFindingCommandByCurrentWord } from './commands';
import { escapeRegExp } from './regexUtils';
import { endianness } from 'os';

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

	context.subscriptions.push(vscode.window.onDidCloseTerminal(terminal => {
		if (terminal.name === RunCmdTerminalName) {
			disposeTerminal();
		}
	}));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.regexFindDefinitionInCodeFiles',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.RegexFindDefinitionInCodeFiles, textEditor, edit, args)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.regexFindDefinitionInCurrentFile',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.RegexFindDefinitionInCurrentFile, textEditor, edit, args)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.regexFindReferencesInCurrentFile',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.RegexFindReferencesInCurrentFile, textEditor, edit, args)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.regexFindReferenceInCodeFiles',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.RegexFindReferencesInCodeFiles, textEditor, edit, args)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.regexFindPureReferenceInCodeFiles',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.RegexFindPureReferencesInCodeFiles, textEditor, edit, args)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.regexFindReferencesInDocs',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.RegexFindReferencesInDocs, textEditor, edit, args)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.regexFindReferencesInConfigFiles',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.RegexFindReferencesInConfigFiles, textEditor, edit, args)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.regexFindInAllProjectFiles',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.RegexFindReferencesInAllProjectFiles, textEditor, edit, args)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.regexFindReferencesInCodeAndConfig',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.RegexFindReferencesInCodeAndConfig, textEditor, edit, args)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.regexFindInAllSmallFiles',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.RegexFindReferencesInAllSmallFiles, textEditor, edit, args)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.findSelectedPlainTextInCodeFiles',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.FindPlainTextInCodeFiles, textEditor, edit, args)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.findSelectedPlainTextInConfigFiles',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.FindPlainTextInConfigFiles, textEditor, edit, args)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.findSelectedPlainTextInDocFiles',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.FindPlainTextInDocFiles, textEditor, edit, args)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.findSelectedPlainTextInCodeAndConfigFiles',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.FindPlainTextInConfigAndConfigFiles, textEditor, edit, args)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.findSelectedPlainTextInAllProjectFiles',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.FindPlainTextInAllProjectFiles, textEditor, edit, args)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.findSelectedPlainTextInAllSmallFiles',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.FindPlainTextInAllSmallFiles, textEditor, edit, args)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.sortProjectFilesBySize',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.SortProjectFilesBySize, textEditor, edit, args)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.sortProjectFilesByTime',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.SortProjectFilesByTime, textEditor, edit, args)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.sortAllFilesBySize',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.SortAllFilesBySize, textEditor, edit, args)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.sortAllFilesByTime',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommandType.SortAllFilesByTime, textEditor, edit, args)));
}

// this method is called when your extension is deactivated
export function deactivate() { }

export class DefinitionFinder implements vscode.DefinitionProvider {
	public provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Location[] | null> {
		if (RootConfig.get('enable.definition') as boolean) {
			return searchMatchedWords(FindType.Definition, document, position, token, true).then(allResults => {
				if (allResults && allResults.length > 0) {
					return Promise.resolve(allResults);
				} else {
					return searchDefinitionInCurrentFile(document, position, token).then(currentFileResults => {
						if (currentFileResults && currentFileResults.length > 0) {
							return Promise.resolve(currentFileResults);
						} else {
							return Promise.resolve(searchLocalVariableDefinitionInCurrentFile(document, position, token));
						}
					});
				}
			});
		} else {
			outputDebug('Your extension "vscode-msr": find definition is disabled by setting of `msr.enable.definition`.');
			return Promise.reject(null);
		}
	}
}

export class ReferenceFinder implements vscode.ReferenceProvider {
	public provideReferences(document: vscode.TextDocument, position: vscode.Position, context: vscode.ReferenceContext, token: vscode.CancellationToken): Thenable<vscode.Location[] | null> {
		if (RootConfig.get('enable.reference') as boolean) {
			return searchMatchedWords(FindType.Reference, document, position, token, false);
		} else {
			outputDebug('Your extension "vscode-msr": find reference is disabled by setting of `msr.enable.reference`.');
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

function getCurrentFileSearchInfo(document: vscode.TextDocument, position: vscode.Position, escapeTextForRegex: boolean = true): [path.ParsedPath, string, string, vscode.Range, string] {
	const parsedFile = path.parse(document.fileName);
	const extension = parsedFile.ext.replace(/^\./, '').toLowerCase() || 'default';
	let shouldSkip = 0;
	if (MyConfig.DisabledFileExtensionRegex.test('.' + extension)) {
		outputDebug('Disabled for `*.' + extension + '` file in configuration: `msr.disable.extensionPattern`');
		shouldSkip += 1;
	}

	if (MyConfig.DisabledGitRootFolderNameRegex.test(GitFolderName)) {
		outputDebug('Disabled for this git root folder in configuration: `msr.disable.projectRootFolderNamePattern` = ' + MyConfig.DisabledGitRootFolderNameRegex.source);
		shouldSkip += 1;
	}

	const [currentWord, currentWordRange, currentText] = getCurrentWordAndText(document, position);
	if (shouldSkip > 0 || currentWord.length < 2 || !currentWordRange || !checkSearchToolExists()) {
		return [parsedFile, extension, '', new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0)), ''];
	}

	const searchText = escapeTextForRegex ? escapeRegExp(currentWord) : currentWord;
	return [parsedFile, extension, searchText, currentWordRange, currentText];
}

function searchMatchedWords(findType: FindType, document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, skipTestPathFiles: boolean): Thenable<vscode.Location[]> {
	try {
		const [parsedFile, extension, currentWord, currentWordRange, currentText] = getCurrentFileSearchInfo(document, position);
		if (!checkSearchToolExists() || token.isCancellationRequested || currentWord.length < 2 || !currentWordRange) {
			return Promise.reject();
		}

		clearOutputChannel();

		const mappedExt = FileExtensionToConfigExtMap.get(extension) || extension;
		if (MyConfig.IsDebug) {
			outputDebug('mappedExt = ' + mappedExt + ' , languageId = ' + document.languageId + ' , file = ' + document.fileName);
		}

		let ranker = new SearchProperty(findType, currentWord, currentWordRange, currentText, parsedFile, mappedExt);

		const configKeyName = FindType.Definition === findType ? 'definition' : 'reference';
		const [filePattern, searchOptions] = ranker.getFileNamePatternAndSearchOption(extension, configKeyName, parsedFile);
		if (filePattern.length < 1 || searchOptions.length < 1) {
			return Promise.reject('Failed to get filePattern or searchOptions.');
		}

		let extraOptions = getConfig().RootFolderExtraOptions + getOverrideConfigByPriority([GitFolderName + '.' + configKeyName, configKeyName, mappedExt, 'default'], 'extraOptions');
		if (skipTestPathFiles && /test/i.test(document.fileName) === false && /\s+--np\s+/.test(extraOptions) === false) {
			extraOptions = '--np test ' + extraOptions;
		}

		const isFindDefinition = FindType.Definition === findType;
		const useExtraSearchPathsForReference = 'true' === getOverrideConfigByPriority([GitFolderName + '.' + mappedExt, GitFolderName, ''], 'findReference.useExtraPaths');
		const useExtraSearchPathsForDefinition = 'true' === getOverrideConfigByPriority([GitFolderName + '.' + mappedExt, GitFolderName, ''], 'findDefinition.useExtraPaths');

		const searchPathOptions = getSearchPathOptions(mappedExt, isFindDefinition, useExtraSearchPathsForReference, useExtraSearchPathsForDefinition);
		let commandLine = 'msr ' + searchPathOptions + ' -f ' + filePattern + ' ' + searchOptions + ' ' + extraOptions;
		if (MyConfig.DefaultMaxSearchDepth > 0 && !CheckMaxSearchDepthRegex.test(commandLine)) {
			commandLine = commandLine.trim() + ' -k ' + MyConfig.DefaultMaxSearchDepth.toString();
		} else {
			commandLine = commandLine.trim();
		}

		commandLine = commandLine.replace(SearchTextHolderReplaceRegex, currentWord);
		outputInfo('\n' + commandLine + '\n');

		return getMatchedLocationsAsync(findType, commandLine, ranker, token);
	} catch (e) {
		outputError(e.stack.toString());
		outputError(e.toString());
		throw e;
	}
}

function searchDefinitionInCurrentFile(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Location[]> {
	const [parsedFile, extension, currentWord, currentWordRange, currentText] = getCurrentFileSearchInfo(document, position);
	if (!checkSearchToolExists() || token.isCancellationRequested || currentWord.length < 2 || !currentWordRange) {
		return Promise.reject();
	}

	const mappedExt = FileExtensionToConfigExtMap.get(extension) || extension;
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
	const [parsedFile, extension, currentWord, currentWordRange, currentText] = getCurrentFileSearchInfo(document, position);
	if (!checkSearchToolExists() || token.isCancellationRequested || currentWord.length < 2 || !currentWordRange) {
		return Promise.reject();
	}

	const mappedExt = FileExtensionToConfigExtMap.get(extension) || extension;
	let ranker = new SearchProperty(FindType.Definition, currentWord, currentWordRange, currentText, parsedFile, mappedExt, true);

	const pattern = '\\w+\\s+(' + currentWord + ')\\s*=' + '|'
		+ '\\([\\w\\s]*?' + currentWord + '\\s*(in|:)\\s*\\w+';

	const filePath = ShouldQuotePathRegex.test(document.fileName) ? '"' + document.fileName + '"' : document.fileName;
	let command = MsrExe + ' -p ' + filePath + ' -t "' + pattern + '" -N ' + Math.max(0, position.line - 1) + ' -T 1 -I -C';
	outputDebug('\n' + command + '\n');
	return getMatchedLocationsAsync(FindType.Definition, command, ranker, token);
}

function getMatchedLocationsAsync(findType: FindType, cmd: string, ranker: SearchProperty, token: vscode.CancellationToken): Thenable<vscode.Location[]> {
	const options: ExecOptions = {
		cwd: vscode.workspace.rootPath,
		timeout: 60 * 1000,
		maxBuffer: 10240000,
	};

	return new Promise<vscode.Location[]>((resolve, reject) => {
		const process = exec(cmd, options, (error: | ExecException | null, stdout: string, stderr: string) => {
			if (error) {
				const hasSummary = GetSummaryRegex.test(error.message);
				if (error.message.startsWith('Command fail')) {
					if (!error.message.trimRight().endsWith(cmd)) {
						console.error('Previous searching probably not completed. Try again or wait previous `msr` searching process completed: ' + error.message);
					}
				} else if (!hasSummary || NotIgnoreErrorRegex.test(error.message)) {
					outputError(error.message);
				} else {
					console.warn(error.message); // outDebug(error.message);
				}
			}

			let allResults: vscode.Location[] = parseCommandOutput(stdout, findType, cmd, ranker);

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
				outputInfo('Will run general search, please check results of `MSR-RUN-CMD` channel in `TERMINAL` tab. Disable `msr.enable.useGeneralFindingWhenNoResults` if you do not want.');
				outputInfo('Try extensive search if still no results. Use context menu or: Click a word or select a text  --> Press `Ctrl + Shift + P` --> Type `msr` + `find` and choose to search.');
			}
		}
		else if (matchCount > 1 && costSeconds <= MyConfig.ReRunCmdInTerminalIfCostLessThan) {
			if (!ranker.isSearchOneFile) {
				outputInfo('Will re-run and show clickable + colorful results in `MSR-RUN-CMD` channel in `TERMINAL` tab. Decrease `msr.reRunSearchInTerminalIfCostLessThan` value if you do not want.');
				runCommandInTerminal(toRunnableToolPath(cmd).replace(SkipJumpOutForHeadResultsRegex, ' ').trim());
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
	const priorityList = [GitFolderName + '.' + ranker.mappedExt + '.' + subName, GitFolderName + '.' + subName, GitFolderName, ranker.mappedExt, 'default'];
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
			outputError('Failed to match words by Regex = "' + GetFileLineTextRegex.source + '" from matched result: ' + text);
		}
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
