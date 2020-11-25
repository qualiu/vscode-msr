// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { exec, ExecException, ExecOptions } from 'child_process';
import * as vscode from 'vscode';
import { MsrExe, ToolChecker } from './checkTool';
import { getFindingCommandByCurrentWord, runFindingCommand, runFindingCommandByCurrentWord } from './commands';
import { IsWindows, SearchTextHolderReplaceRegex, SkipJumpOutForHeadResultsRegex } from './constants';
import { cookCmdShortcutsOrFile, FileExtensionToMappedExtensionMap, getConfig, getConfigValue, getRootFolder, getRootFolderExtraOptions, getRootFolderName, getSearchPathOptions, getSubConfigValue, printConfigInfo } from './dynamicConfig';
import { FindCommandType, FindType, TerminalType } from './enums';
import { clearOutputChannel, disposeTerminal, outputDebug, outputDebugOrInfo, outputError, outputInfo, outputResult, outputWarn, RunCmdTerminalName, runCommandInTerminal } from './outputUtils';
import { SearchProperty } from './ranker';
import { escapeRegExp } from './regexUtils';
import { ResultType, ScoreTypeResult } from './ScoreTypeResult';
import { changeFindingCommandForLinuxTerminalOnWindows, DefaultTerminalType, getCurrentWordAndText, getExtensionNoHeadDot, getTimeCostToNow, IsLinuxTerminalOnWindows, isNullOrEmpty, nowText, quotePaths, toPath } from './utils';
import ChildProcess = require('child_process');
import path = require('path');

const trackBeginLoadTime = new Date();
outputDebug(nowText() + 'Start loading extension and initialize ...');

const GetFileLineTextRegex = new RegExp('(.+?):(\\d+):(.*)');

const RemoveCommandLineInfoRegex = / ; Directory = .*/;
const GetSummaryRegex = /^(?:Matched|Replaced) (\d+) /m;
const NotIgnorableError = 'Please check your command with directory';
const CheckMaxSearchDepthRegex = /\s+(-k\s*\d+|--max-depth\s+\d+)/;

// Use bytes/second should be more precise.
const ExpectedMinLinesPerSecond = 16 * 10000;
const ExpectedMaxTimeCostSecond = 3.0;
let SearchToCostSumMap = new Map<FindType, Number>();
let SearchTimesMap = new Map<FindType, Number>();

let MyConfig = getConfig();
let RootConfig = MyConfig.RootConfig || vscode.workspace.getConfiguration('msr');

const LinuxToolChecker = new ToolChecker(DefaultTerminalType, false);
if (IsLinuxTerminalOnWindows && TerminalType.CygwinBash === DefaultTerminalType) {
	LinuxToolChecker.checkSearchToolExists();
}

const PlatformToolChecker = new ToolChecker(IsWindows ? TerminalType.CMD : TerminalType.LinuxBash);
PlatformToolChecker.checkSearchToolExists();
PlatformToolChecker.checkAndDownloadTool('nin');

const RunCommandChecker = TerminalType.CygwinBash === DefaultTerminalType ? LinuxToolChecker : PlatformToolChecker;

outputDebug(nowText() + 'Finished to load extension and initialize. Cost ' + getTimeCostToNow(trackBeginLoadTime) + ' seconds.');

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
		if (MyConfig.SkipInitCmdAliasForNewTerminalTitleRegex.test(terminal.name) || terminal.name === 'MSR-RUN-CMD') {
			return;
		}

		const matchNameRegex = /^(Powershell|CMD|Command(\s+Prompt)?)$|bash/i;
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
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			runFindingCommand(FindCommandType.RegexFindDefinitionInCodeFiles, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.regexFindDefinitionInCurrentFile',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			runFindingCommand(FindCommandType.RegexFindDefinitionInCurrentFile, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.regexFindReferencesInCurrentFile',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			runFindingCommand(FindCommandType.RegexFindReferencesInCurrentFile, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.regexFindReferencesInCodeFiles',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			runFindingCommand(FindCommandType.RegexFindReferencesInCodeFiles, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.regexFindPureReferencesInCodeFiles',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			runFindingCommand(FindCommandType.RegexFindPureReferencesInCodeFiles, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.regexFindPureReferencesInAllSourceFiles',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			runFindingCommand(FindCommandType.RegexFindPureReferencesInAllSourceFiles, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.regexFindReferencesInDocs',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			runFindingCommand(FindCommandType.RegexFindReferencesInDocs, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.regexFindReferencesInConfigFiles',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			runFindingCommand(FindCommandType.RegexFindReferencesInConfigFiles, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.regexFindInAllSourceFiles',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			runFindingCommand(FindCommandType.RegexFindReferencesInAllSourceFiles, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.regexFindReferencesInCodeAndConfig',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			runFindingCommand(FindCommandType.RegexFindReferencesInCodeAndConfig, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.regexFindInAllSmallFiles',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			runFindingCommand(FindCommandType.RegexFindReferencesInAllSmallFiles, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.findSelectedPlainTextInCodeFiles',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			runFindingCommand(FindCommandType.FindPlainTextInCodeFiles, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.findSelectedPlainTextInConfigFiles',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			runFindingCommand(FindCommandType.FindPlainTextInConfigFiles, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.findSelectedPlainTextInDocFiles',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			runFindingCommand(FindCommandType.FindPlainTextInDocFiles, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.findSelectedPlainTextInCodeAndConfigFiles',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			runFindingCommand(FindCommandType.FindPlainTextInConfigAndConfigFiles, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.findSelectedPlainTextInAllSourceFiles',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			runFindingCommand(FindCommandType.FindPlainTextInAllSourceFiles, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.findSelectedPlainTextInAllSmallFiles',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			runFindingCommand(FindCommandType.FindPlainTextInAllSmallFiles, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.sortSourceBySize',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			runFindingCommand(FindCommandType.SortSourceBySize, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.sortSourceByTime',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			runFindingCommand(FindCommandType.SortSourceByTime, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.sortBySize',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			runFindingCommand(FindCommandType.SortBySize, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.sortByTime',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			runFindingCommand(FindCommandType.SortByTime, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.sortCodeBySize',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			runFindingCommand(FindCommandType.SortCodeBySize, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.sortCodeByTime',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			runFindingCommand(FindCommandType.SortCodeByTime, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.cookCmdAlias',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			cookCmdShortcutsOrFile(textEditor.document.uri.fsPath, false, false)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.cookCmdAliasByProject',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			cookCmdShortcutsOrFile(textEditor.document.uri.fsPath, true, false)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.cookCmdAliasFiles',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			cookCmdShortcutsOrFile(textEditor.document.uri.fsPath, false, true)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.cookCmdAliasFilesByProject',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			cookCmdShortcutsOrFile(textEditor.document.uri.fsPath, true, true)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.cookCmdAliasDumpWithOthersToFiles',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			cookCmdShortcutsOrFile(textEditor.document.uri.fsPath, false, true, undefined, true)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.cookCmdAliasDumpWithOthersToFilesByProject',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			cookCmdShortcutsOrFile(textEditor.document.uri.fsPath, true, true, undefined, true)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.tmpToggleEnableFindingDefinition',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) => {
			const extension = getExtensionNoHeadDot(path.parse(textEditor.document.uri.fsPath).ext);
			getConfig().toggleEnableFindingDefinition(extension);
		}));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.findTopFolder',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			runFindingCommand(FindCommandType.FindTopFolder, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.findTopType',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			runFindingCommand(FindCommandType.FindTopType, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.findTopSourceFolder',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			runFindingCommand(FindCommandType.FindTopSourceFolder, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.findTopSourceType',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			runFindingCommand(FindCommandType.FindTopSourceType, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.findTopCodeFolder',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			runFindingCommand(FindCommandType.FindTopCodeFolder, textEditor)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.findTopCodeType',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			runFindingCommand(FindCommandType.FindTopCodeType, textEditor)));
}

// this method is called when your extension is deactivated
export function deactivate() { }

export class DefinitionFinder implements vscode.DefinitionProvider {
	public async provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Location[] | null> {
		if (MyConfig.shouldSkipFinding(FindType.Definition, document.fileName)) {
			return Promise.resolve([]);
		}

		const forceSetSearchPaths = [document.fileName, path.parse(document.fileName).dir, ''];
		for (let k = 0; k < forceSetSearchPaths.length; k++) {
			const allResults = await searchMatchedWords(FindType.Definition, document, position, token, forceSetSearchPaths[k]);
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
	}
}

export class ReferenceFinder implements vscode.ReferenceProvider {
	public async provideReferences(document: vscode.TextDocument, position: vscode.Position, _context: vscode.ReferenceContext, token: vscode.CancellationToken): Promise<vscode.Location[] | null> {
		if (MyConfig.shouldSkipFinding(FindType.Reference, document.fileName)) {
			return Promise.resolve([]);
		}

		return searchMatchedWords(FindType.Reference, document, position, token);
	}
}

// Cannot avoid too frequent searching by mouse hover + click, because `Visual Studio Code` will not effect. So let VSCode solve this bug.

function getCurrentFileSearchInfo(document: vscode.TextDocument, position: vscode.Position, escapeTextForRegex: boolean = true): [path.ParsedPath, string, string, vscode.Range, string] {
	const parsedFile = path.parse(document.fileName);
	const extension = getExtensionNoHeadDot(parsedFile.ext);
	let [currentWord, currentWordRange, currentText] = getCurrentWordAndText(document, position);
	if (currentWord.length < 2 || !currentWordRange || !PlatformToolChecker.checkSearchToolExists()) {
		return [parsedFile, extension, '', new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0)), ''];
	}

	const isPowershell = /psm?1$/.exec(extension);
	if (isPowershell && currentText.indexOf('$' + currentWord) >= 0) {
		currentWord = '$' + currentWord;
	}

	const searchText = escapeTextForRegex ? escapeRegExp(currentWord) : currentWord;
	return [parsedFile, extension, searchText, currentWordRange, currentText];
}

function searchMatchedWords(findType: FindType, document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, forceSetSearchPath: string = ''): Thenable<vscode.Location[]> {
	try {
		const [parsedFile, extension, currentWord, currentWordRange, currentText] = getCurrentFileSearchInfo(document, position);
		if (!PlatformToolChecker.checkSearchToolExists() || token.isCancellationRequested || currentWord.length < 2 || !currentWordRange) {
			return Promise.resolve([]);
		}

		clearOutputChannel();

		const rootFolderName = getRootFolderName(document.uri.fsPath);

		const mappedExt = FileExtensionToMappedExtensionMap.get(extension) || extension;
		if (MyConfig.IsDebug) {
			outputDebug('mappedExt = ' + mappedExt + ' , languageId = ' + document.languageId + ' , file = ' + document.fileName);
		}

		const currentFilePath = toPath(parsedFile);
		const isSearchOneFile = forceSetSearchPath === currentFilePath;
		const isSearchCurrentFileFolder = forceSetSearchPath === parsedFile.dir;
		let ranker = new SearchProperty(findType, currentWord, currentWordRange, currentText, parsedFile, mappedExt, isSearchOneFile || isSearchCurrentFileFolder);

		const configKeyName = FindType.Definition === findType ? 'definition' : 'reference';
		const [filePattern, searchOptions] = ranker.getFileNamePatternAndSearchOption(extension, configKeyName, parsedFile);
		if (filePattern.length < 1 || searchOptions.length < 1) {
			outputError(nowText() + 'Failed to get filePattern or searchOptions when search: ' + currentWord + ', filePattern = ' + filePattern + ', searchOptions = ' + searchOptions);
			return Promise.resolve([]);
		}

		const isFindDefinition = FindType.Definition === findType;

		let extraOptions = '';
		if (isSearchOneFile) {
			extraOptions = "-I -C " + (isFindDefinition ? '-J -H 60' : '-J -H 360');
		} else {
			extraOptions = getRootFolderExtraOptions(rootFolderName) + ' ' + getSubConfigValue(rootFolderName, extension, mappedExt, configKeyName, 'extraOptions');
			// if (skipTestPathFiles && /test/i.test(document.fileName) === false && /\s+--np\s+/.test(extraOptions) === false) {
			// 	extraOptions = '--np test ' + extraOptions;
			// }
		}

		const useExtraSearchPathsForReference = 'true' === getConfigValue(rootFolderName, extension, mappedExt, 'findReference.useExtraPaths');
		const useExtraSearchPathsForDefinition = 'true' === getConfigValue(rootFolderName, extension, mappedExt, 'findDefinition.useExtraPaths');

		const searchPathOptions = isNullOrEmpty(forceSetSearchPath)
			? getSearchPathOptions(false, false, document.uri.fsPath, mappedExt, isFindDefinition, useExtraSearchPathsForReference, useExtraSearchPathsForDefinition)
			: '-p ' + quotePaths(forceSetSearchPath);

		let commandLine = 'msr ' + searchPathOptions;
		if (!isSearchOneFile) {
			commandLine += ' -f ' + filePattern;
		}

		if (isNullOrEmpty(forceSetSearchPath) && MyConfig.DefaultMaxSearchDepth > 0 && !CheckMaxSearchDepthRegex.test(commandLine)) {
			extraOptions = extraOptions.trimRight() + ' -k ' + MyConfig.DefaultMaxSearchDepth.toString();
		}

		if (FindType.Definition === findType) {
			commandLine += ' ' + searchOptions + ' ' + extraOptions.trim();
		} else {
			commandLine += ' ' + extraOptions + ' ' + searchOptions.trim();
		}

		commandLine = commandLine.trim().replace(SearchTextHolderReplaceRegex, currentWord);
		outputInfo('\n' + nowText() + commandLine + '\n');
		return getMatchedLocationsAsync(findType, commandLine, ranker, token);
	} catch (e) {
		outputError(nowText() + e.stack.toString());
		outputError(nowText() + e.toString());
		return Promise.resolve([]);
	}
}

function searchDefinitionInCurrentFile(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Location[]> {
	const [parsedFile, extension, currentWord, currentWordRange, currentText] = getCurrentFileSearchInfo(document, position);
	if (!PlatformToolChecker.checkSearchToolExists() || token.isCancellationRequested || currentWord.length < 2 || !currentWordRange) {
		return Promise.resolve([]);
	}

	const mappedExt = FileExtensionToMappedExtensionMap.get(extension) || extension;
	let ranker = new SearchProperty(FindType.Definition, currentWord, currentWordRange, currentText, parsedFile, mappedExt, true);

	let command = getFindingCommandByCurrentWord(false, FindCommandType.RegexFindDefinitionInCurrentFile, currentWord, parsedFile, '', ranker);
	if (/\s+-[A-Zc]*?I[A-Zc]*(\s+|$)/.test(command) === false) {
		command = command.trim() + ' -I';
	}

	if (/\s+-[A-Zc]*?C[A-Zc]*(\s+|$)/.test(command) === false) {
		command = command.trim() + ' -C';
	}

	if (MyConfig.IsDebug && /\s+-[A-Z]*?c[A-Z]*(\s+|$)/.test(command) === false) {
		command = command.trim() + ' -c';
	}

	outputDebug('\n' + nowText() + command + '\n');
	return getMatchedLocationsAsync(FindType.Definition, command, ranker, token);
}

function searchLocalVariableDefinitionInCurrentFile(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Location[]> {
	const [parsedFile, extension, currentWord, currentWordRange, currentText] = getCurrentFileSearchInfo(document, position);
	if (!PlatformToolChecker.checkSearchToolExists() || token.isCancellationRequested || currentWord.length < 2 || !currentWordRange) {
		return Promise.resolve([]);
	}

	const mappedExt = FileExtensionToMappedExtensionMap.get(extension) || extension;
	let ranker = new SearchProperty(FindType.Definition, currentWord, currentWordRange, currentText, parsedFile, mappedExt, true);

	const pattern = '\\w+\\s+(' + currentWord + ')\\s*=' + '|'
		+ '\\([\\w\\s]*?' + currentWord + '\\s*(in|:)\\s*\\w+';

	const filePath = quotePaths(document.fileName);
	let command = MsrExe + ' -p ' + filePath + ' -t "' + pattern + '" -N ' + Math.max(0, position.line - 1) + ' -T 1 -I -C';
	outputDebug('\n' + nowText() + command + '\n');
	return getMatchedLocationsAsync(FindType.Definition, command, ranker, token);
}

function getMatchedLocationsAsync(findType: FindType, cmd: string, ranker: SearchProperty, token: vscode.CancellationToken): Thenable<vscode.Location[]> {
	const options: ExecOptions = {
		cwd: getRootFolder(toPath(ranker.currentFile), true) || ranker.currentFile.dir,
		timeout: 60 * 1000,
		maxBuffer: 10240000,
	};

	return new Promise<vscode.Location[]>((resolve, _reject) => {
		const process = exec(cmd, options, (error: | ExecException | null, stdout: string, stderr: string) => {
			if (error) {
				const hasSummary = GetSummaryRegex.test(error.message);
				if (error.message.includes(NotIgnorableError)) {
					outputError(nowText() + error.message);
				}
				if (hasSummary) {
					console.info('False error message: ' + error.message);
				} else if (error.message.startsWith('Command fail')) {
					if (!error.message.trimRight().endsWith(cmd)) {
						// Check if previous searching not completed. Try again or wait.
						console.warn('Got error message: ' + error.message);
					}
				} else {
					console.warn(error.message); // outDebug(error.message);
				}
			}

			const allResults: vscode.Location[] = isNullOrEmpty(stdout) ? [] : parseCommandOutput(stdout, findType, cmd, ranker);

			if (stderr) {
				if (!findAndProcessSummary(false, stderr, findType, cmd, ranker)) {
					if (/\bmsr\b.*?\s+not\s+/.test(stderr)) {
						PlatformToolChecker.checkSearchToolExists(true, false);
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
			outputDebug('\n' + nowText() + summaryText.replace(/^([\r\n]+)/, 'WARN: '));
		} else {
			outputError('\n' + nowText() + summaryText.replace(/^([\r\n]+)/, 'ERROR: '));
		}
	}

	if (!summaryMatch) {
		return false;
	}

	const match = /^Matched (\d+) lines.*?read (\d+) lines.*?Used (\d+\.\d*) s/.exec(summaryText);
	const matchCount = match ? parseInt(match[1]) : 0;
	const outputSummary = '\n' + (MyConfig.IsDebug ? summaryText : summaryText.replace(RemoveCommandLineInfoRegex, ''));
	outputDebugOrInfo(matchCount < 1, matchCount > 0 ? outputSummary : outputSummary.trim());

	if (match) {
		const lineCount = parseInt(match[2]);
		const costSeconds = parseFloat(match[3]);
		outputDebug(nowText() + 'Got matched count = ' + matchCount + ' and time cost = ' + costSeconds + ' from summary, search word = ' + ranker.currentWord);
		sumTimeCost(findType, costSeconds, lineCount);
		if (matchCount < 1 && RootConfig.get('enable.useGeneralFindingWhenNoResults') as boolean) {
			const findCmd = findType === FindType.Definition ? FindCommandType.RegexFindDefinitionInCodeFiles : FindCommandType.RegexFindDefinitionInCodeFiles;
			if (!ranker.isOneFileOrFolder) {
				runFindingCommandByCurrentWord(findCmd, ranker.currentWord, ranker.currentFile);
				outputInfo(nowText() + 'Will run general search, please check results in `MSR-RUN-CMD` in `TERMINAL` tab. Set `msr.quiet` to avoid switching tabs; Disable `msr.enable.useGeneralFindingWhenNoResults` to disable re-running.');
				outputInfo(nowText() + 'Try extensive search if still no results. Use context menu or: Click a word or select a text  --> Press `F12` --> Type `msr` + `find` and choose to search.');
			}
		}
		else if (matchCount > MyConfig.ReRunSearchInTerminalIfResultsMoreThan && costSeconds <= MyConfig.ReRunCmdInTerminalIfCostLessThan) {
			outputInfo(nowText() + 'Will re-run and show clickable + colorful results in `MSR-RUN-CMD` in `TERMINAL` tab. Set `msr.quiet` to avoid switching tabs; Decrease `msr.reRunSearchInTerminalIfCostLessThan` value for re-running.');
			cmd = changeFindingCommandForLinuxTerminalOnWindows(cmd);
			runCommandInTerminal(RunCommandChecker.toRunnableToolPath(cmd).replace(SkipJumpOutForHeadResultsRegex, ' ').trim(), false, getConfig().ClearTerminalBeforeExecutingCommands);
		}
	} else if (!ranker.isOneFileOrFolder) {
		outputDebug(nowText() + 'Failed to get time cost in summary. Search word = ' + ranker.currentWord);
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
		outputWarn(nowText() + message + ' If CPU and disk are not busy, try to be faster: https://github.com/qualiu/vscode-msr/blob/master/README.md#avoid-security-software-downgrade-search-performance');
	} else {
		outputDebug(nowText() + message);
	}
}

function parseCommandOutput(stdout: string, findType: FindType, cmd: string, ranker: SearchProperty): vscode.Location[] {
	let matchedFileLines = stdout.trimRight().split(/\r\n|\n\r|\n|\r/);
	const summaryText = matchedFileLines.length > 0 && GetSummaryRegex.test(matchedFileLines[matchedFileLines.length - 1]) ? matchedFileLines[matchedFileLines.length - 1] : '';
	if (summaryText.length > 0) {
		matchedFileLines.pop();
	}

	if (ranker.isOneFileOrFolder && matchedFileLines.length > 0) {
		outputInfo('');
	}

	let allResults: vscode.Location[] = [];
	if (!MyConfig.NeedSortResults || matchedFileLines.length < 2) {
		matchedFileLines.map(line => {
			const scoreTypeResult = parseMatchedText(line, ranker);
			if (scoreTypeResult) {
				allResults.push(scoreTypeResult.Location);
				let sc = scoreTypeResult.Location.range.start;
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

	const rootFolderName = getRootFolderName(toPath(ranker.currentFile));
	const removeLowScoreResultsFactor = Number(getConfigValue(rootFolderName, ranker.extension, ranker.mappedExt, 'removeLowScoreResultsFactor') || 0.8);
	const keepHighScoreResultCount = Number(getConfigValue(rootFolderName, ranker.extension, ranker.mappedExt, 'keepHighScoreResultCount') || -1);

	let scoreSum = 0;
	let scoreList: Number[] = [];
	let scoreToListMap = new Map<Number, [string, vscode.Location][]>();
	let typeToResultsMap = new Map<ResultType, ScoreTypeResult[]>();
	matchedFileLines.map(line => {
		const scoreTypeResult = parseMatchedText(line, ranker);
		if (!scoreTypeResult) {
			return;
		}

		let resultList = typeToResultsMap.get(scoreTypeResult.Type);
		if (!resultList) {
			resultList = [];
			typeToResultsMap.set(scoreTypeResult.Type, resultList);
		}
		resultList.push(scoreTypeResult);
	});

	typeToResultsMap.forEach((v, type) => {
		outputDebug(nowText() + ResultType[type] + ' count = ' + v.length + ', search word = ' + ranker.currentWord);
	});

	let highValueResults = [...typeToResultsMap.get(ResultType.Class) || [], ...typeToResultsMap.get(ResultType.Enum) || []];

	[ResultType.Interface, ResultType.Method, ResultType.Other].forEach((type) => {
		if (highValueResults.length < 1) {
			highValueResults = typeToResultsMap.get(type) || [];
		}
	});

	highValueResults.forEach((value) => {
		const score = value.Score;
		const location = value.Location;
		scoreSum += score.valueOf();
		scoreList.push(score);

		if (!scoreToListMap.has(score)) {
			scoreToListMap.set(score, []);
		}

		if (location) {
			let sc = location.range.start;
			let fileRowColumn = value.ResultText.replace(':' + (sc.line + 1) + ':', ':' + (sc.line + 1) + ':' + sc.character);
			(scoreToListMap.get(score) || []).push([fileRowColumn, location]);
		}
	});


	scoreList.sort((a, b) => a.valueOf() - b.valueOf());
	const averageScore = scoreSum / scoreList.length;
	const removeThreshold = ranker.isOneFileOrFolder && findType === FindType.Definition ? averageScore : averageScore * removeLowScoreResultsFactor;

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

function parseMatchedText(text: string, ranker: SearchProperty): ScoreTypeResult | null {
	let m;
	if ((m = GetFileLineTextRegex.exec(text)) !== null) {
		const uri = vscode.Uri.file(m[1]);
		const wm = ranker.currentWordRegex.exec(m[3]);
		if (wm !== null) {
			const row = parseInt(m[2]);
			const begin = new vscode.Position(row - 1, Math.max(0, wm.index - 1));
			// some official extension may return whole function block.
			// const end = new vscode.Position(row - 1, wm.index - 1 + ranker.currentWord.length - 1);
			const [type, score] = MyConfig.NeedSortResults ? ranker.getTypeAndScore(m[1], m[3]) : [ResultType.Other, 1];
			if (!MyConfig.NeedSortResults) {
				console.log('Score = ' + score + ': ' + text);
			}

			return new ScoreTypeResult(score, type, text, new vscode.Location(uri, begin));
		}
		else {
			outputError(nowText() + 'Failed to match words by Regex = "' + ranker.currentWordRegex + '" from matched result: ' + m[3]);
		}
	}
	else {
		outputError(nowText() + 'Failed to match GetFileLineTextRegex = "' + GetFileLineTextRegex.source + '" from matched result: ' + text);
	}

	return null;
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
