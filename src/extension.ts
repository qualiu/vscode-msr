// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { IsForwardingSlashSupportedOnWindows, MsrExe } from './checkTool';
import { getFindingCommandByCurrentWord, runFindingCommand } from './commands';
import { getConfigValueByRoot } from './configUtils';
import { IsWindows, SearchTextHolderReplaceRegex } from './constants';
import { cookCmdShortcutsOrFile } from './cookCommandAlias';
import { FileExtensionToMappedExtensionMap, getConfig, getRootFolder, getRootFolderName, MyConfig, printConfigInfo } from './dynamicConfig';
import { FindCommandType, FindType, TerminalType } from './enums';
import { clearOutputChannel, disposeTerminal, outputDebug, RunCmdTerminalName, runCommandInTerminal } from './outputUtils';
import { ForceSetting, Ranker } from './ranker';
import { createCommandSearcher, createSearcher, getCurrentFileSearchInfo, PlatformToolChecker, Searcher } from './searcher';
import { DefaultTerminalType, getExtensionNoHeadDot, IsLinuxTerminalOnWindows, isNullOrEmpty, nowText, quotePaths, toPath } from './utils';
import path = require('path');

outputDebug(nowText() + 'Start loading extension and initialize ...');

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
			getConfig(true);
			const config = vscode.workspace.getConfiguration('msr');
			printConfigInfo(config);
		}
	}));
}

export function registerExtension(context: vscode.ExtensionContext) {
	const selector = {
		languageId: '*',
		scheme: 'file',
	};

	context.subscriptions.push(vscode.languages.registerDefinitionProvider(selector, new DefinitionFinder));

	if (!MyConfig.DisableFindReferenceFileExtensionRegex.source.match(/(^|\|)\.\*/)) {
		context.subscriptions.push(vscode.languages.registerReferenceProvider(selector, new ReferenceFinder));
	}

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

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.regexFindAsClassOrMethodDefinitionInCodeFiles',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			runFindingCommand(FindCommandType.RegexFindAsClassOrMethodDefinitionInCodeFiles, textEditor)));

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

// Reduce duplicate search: Peek + Go-To definition by mouse-click.
class SearchTimeInfo {
	public Document: vscode.TextDocument;
	public Position: vscode.Position;
	public Time: Date;
	public AsyncResult: Promise<vscode.Location[] | null> = Promise.resolve(null);
	public Result: vscode.Location[] | null = null;

	constructor(document: vscode.TextDocument, position: vscode.Position, time = new Date()) {
		this.Document = document;
		this.Position = position;
		this.Time = time;
	}

	public isCloseAndSameSearch(other: SearchTimeInfo) {
		const useLast = other && this && this.Position.line === other.Position.line && this.Position.character === other.Position.character
			&& Math.abs(this.Time.getTime() - other.Time.getTime()) <= 800
			&& this.Document.uri === other.Document.uri && this.Document.fileName === other.Document.fileName;
		if (this && other) {
			outputDebug(nowText() + "UseLastSearch = " + useLast + ": this time = " + this.Time.toISOString() + ", other time = " + other.Time.toISOString() + ", diff = " + (this.Time.getTime() - other.Time.getTime()) + " ms.");
		}
		return useLast;
	}
}

let LastSearchInfo: SearchTimeInfo | null = null;

// to ease running command later (like: using git-ignore to export/set variables)
runCommandInTerminal('echo TerminalType = ' + TerminalType[DefaultTerminalType] + ', Universal slash = ' + IsForwardingSlashSupportedOnWindows, true, false, IsLinuxTerminalOnWindows);

export class DefinitionFinder implements vscode.DefinitionProvider {
	public async provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Location[] | null> {
		if (MyConfig.shouldSkipFinding(FindType.Definition, document.fileName)) {
			return Promise.resolve([]);
		}

		let thisSearch = new SearchTimeInfo(document, position);
		if (LastSearchInfo && thisSearch.isCloseAndSameSearch(LastSearchInfo)) {
			return LastSearchInfo.AsyncResult;
		}

		const [parsedFile, extension, currentWord, currentWordRange, currentText] = getCurrentFileSearchInfo(document, position);
		if (!PlatformToolChecker.checkSearchToolExists() || currentWord.length < 2 || !currentWordRange) {
			return Promise.resolve([]);
		}

		LastSearchInfo = new SearchTimeInfo(document, position);
		clearOutputChannel();

		const mappedExt = FileExtensionToMappedExtensionMap.get(extension) || extension;
		// rootFolder is empty for external file:
		const rootFolder = getRootFolder(document.fileName);
		const isExternalFile = isNullOrEmpty(rootFolder);
		const sourceFileFolder = path.parse(document.fileName).dir;

		const isScriptFile = MyConfig.isScriptFile(extension);
		const currentFileDefinitionSearcher = getCommandToSearchDefinitionInCurrentFile(document, position);
		const currentFileVariableDefinitionSearcher = getCommandToSearchLocalVariableOrConstant(document, position);
		const currentFileVariableInitSearcher = getCommandToSearchLocalVariableOrConstant(document, position, true);

		let currentFileSearchers = [
			createSearcher("Search-Current-File-Class", document.fileName, false, FindType.Definition, document, position, -1, 1, new ForceSetting(true)),
			createSearcher("Search-Current-File-Method", document.fileName, false, FindType.Definition, document, position, -1, 1, new ForceSetting(false, true)),
			createSearcher("Search-Current-File", document.fileName, false, FindType.Definition, document, position, -1, 1)
		];

		if (/^[_a-z]/.test(currentWord) && (isScriptFile || new RegExp(currentWord + '\\s*=').test(currentText))) {
			currentFileSearchers.push(currentFileVariableDefinitionSearcher);
			currentFileSearchers.push(currentFileVariableInitSearcher);
		}

		let currentFolderSearchers = [
			createSearcher("Search-Current-Folder-Class-Method", sourceFileFolder, false, FindType.Definition, document, position, -1, 1, new ForceSetting(true, true)),
			createSearcher("Search-Current-Folder", sourceFileFolder, false, FindType.Definition, document, position, -1, 1)
		];

		let slowSearchers: (Searcher | null)[] = [];
		slowSearchers.push(createSearcher("Search-Current-Folder-Recursively", sourceFileFolder, true, FindType.Definition, document, position, 9, 7));

		const parentFolder = path.dirname(sourceFileFolder);
		const parentFolders = Array.from(new Set<string>([parentFolder, path.dirname(parentFolder)]));
		const diskRegex = IsWindows ? /^[A-Z]:\\.+?\\\w+/i : new RegExp('^/[^/]+/[^/]+$');
		for (let k = 0; k < parentFolders.length; k++) {
			// avoid searching disk root for external files + avoid out of repo folder for internal files.
			if (isExternalFile && parentFolders[k].match(diskRegex) || !isExternalFile && parentFolders[k].startsWith(rootFolder)) {
				slowSearchers.push(createSearcher("Search-Parent-Up-" + (k + 1), parentFolders[k], true, FindType.Definition, document, position, 16, 9));
			}
		}

		const testFolderMatch = document.fileName.match(new RegExp('[\\\\/]test[\\\\/]'));
		if (testFolderMatch) {
			const testParentFolder = document.fileName.substring(0, testFolderMatch.index);
			slowSearchers.push(createSearcher('Search-Test-Parent-Folder', testParentFolder, true, FindType.Definition, document, position));
		}

		const repoSearcher = isNullOrEmpty(rootFolder) ? null : createSearcher("Search-This-Repo", rootFolder, true, FindType.Definition, document, position);
		slowSearchers.push(repoSearcher);

		const fullSearcher = createSearcher("Search-Repo-With-Extra-Paths", '', true, FindType.Definition, document, position);
		if (fullSearcher && (!repoSearcher || fullSearcher.CommandLine !== repoSearcher.CommandLine)) {
			fullSearcher.CommandLine = fullSearcher.CommandLine.replace(rootFolder + ',', '');
			slowSearchers.push(fullSearcher);
		}

		async function runSearchers(searchers: (Searcher | null)[]): Promise<vscode.Location[]> {
			if (!searchers || searchers.length < 1) {
				return Promise.resolve([]);
			}

			let results: Thenable<vscode.Location[]>[] = [];
			searchers.forEach(a => {
				if (a) {
					results.push(a.searchMatchedWords(token));
				}
			});

			async function returnSearcherResult(index: number): Promise<vscode.Location[]> {
				const currentResults = await results[index];
				if (currentResults && currentResults.length > 0) {
					if (searchers) {
						searchers.forEach(a => {
							if (a && a === searchers[index]) {
								outputDebug(nowText() + "Found by searcher: " + a.toString());
							}

							if (a && a !== searchers[index]) {
								a.stop();
							}
						});
					}
					return Promise.resolve(currentResults);
				} else if (index + 1 < results.length) {
					return Promise.resolve(returnSearcherResult(index + 1));
				} else {
					return Promise.resolve([]);
				}
			}

			return returnSearcherResult(0);
		}

		function enableLastSearcherToRunCommand(searchers: (Searcher | null)[]): boolean {
			if (!searchers || searchers.length < 1) {
				return false;
			}

			for (let k = searchers.length - 1; k >= 0; k--) {
				let searcher = searchers[k];
				if (searcher) {
					searcher.Ranker.canRunCommandInTerminal = true;
					return true;
				}
			}
			return false;
		}

		if (!enableLastSearcherToRunCommand(slowSearchers)) {
			enableLastSearcherToRunCommand(currentFileSearchers);
		}

		let group1 = isScriptFile ? [currentFileDefinitionSearcher] : [];
		let group2 = isScriptFile ? [currentFileVariableDefinitionSearcher] : [];
		let finalGroup = [currentFileDefinitionSearcher, currentFileVariableDefinitionSearcher, currentFileVariableInitSearcher];
		if (/[^A-Z]/.test(currentWord) && new RegExp('[\\.:]' + currentWord + '\\b').test(currentText) && repoSearcher && repoSearcher.CommandLine) {
			const ranker = new Ranker(document, FindType.Definition, position, currentWord, currentWordRange, currentText, parsedFile, mappedExt, true, new ForceSetting(false, false, true));
			let command = repoSearcher.CommandLine;
			let match = /\s+-t (\S+|"[^"]+")\s+/.exec(command);
			if (match) {
				command = command.substring(0, match.index) + ' -t "' + getSearchPatternForLocalVairableOrConstant(currentWord) + '" ' + command.substring(match.index + match[0].length);
				const constSearcher = createCommandSearcher('Search-Constant', rootFolder, command, ranker);
				finalGroup.push(constSearcher);
			}
		}

		const searcherGroups = [group1, group2, currentFileSearchers, currentFolderSearchers, slowSearchers, finalGroup]
			.filter(g => g
				.filter(a => a !== null).length > 0
			);

		async function returnGroupSearchResult(index: number): Promise<vscode.Location[]> {
			return runSearchers(searcherGroups[index]).then(results => {
				if (results.length > 0) {
					return Promise.resolve(results);
				} else if (index + 1 < searcherGroups.length) {
					return returnGroupSearchResult(index + 1);
				} else {
					return Promise.resolve([]);
				}
			});
		}

		LastSearchInfo.Time = new Date();
		LastSearchInfo.AsyncResult = returnGroupSearchResult(0);
		return LastSearchInfo.AsyncResult;
	}
}

export class ReferenceFinder implements vscode.ReferenceProvider {
	public async provideReferences(document: vscode.TextDocument, position: vscode.Position, _context: vscode.ReferenceContext, token: vscode.CancellationToken): Promise<vscode.Location[] | null> {
		if (MyConfig.shouldSkipFinding(FindType.Reference, document.fileName)) {
			return Promise.resolve([]);
		}

		const searcher = createSearcher('Search-Reference', '', true, FindType.Definition, document, position);
		if (!searcher) {
			return Promise.resolve([]);
		}

		return searcher.searchMatchedWords(token);
	}
}

function getCommandToSearchDefinitionInCurrentFile(document: vscode.TextDocument, position: vscode.Position): Searcher {
	const [parsedFile, extension, currentWord, currentWordRange, currentText] = getCurrentFileSearchInfo(document, position);
	const mappedExt = FileExtensionToMappedExtensionMap.get(extension) || extension;
	let ranker = new Ranker(document, FindType.Definition, position, currentWord, currentWordRange, currentText, parsedFile, mappedExt, true);

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

	return createCommandSearcher('Search-Definition-In-Current-File', toPath(parsedFile), command, ranker);
}

function getSearchPatternForLocalVairableOrConstant(currentWord: string) {
	return '^\\s*' + currentWord + '\\s*=\\s*\\S+' + '|' + '\\w+\\s+(' + currentWord + ')\\s*=' + '|' + '\\([\\w\\s]*?' + currentWord + '\\s*(in|:)\\s*\\w+';
}

function getCommandToSearchLocalVariableOrConstant(document: vscode.TextDocument, position: vscode.Position, isVariableInit = false): Searcher {
	const [parsedFile, extension, currentWord, currentWordRange, currentText] = getCurrentFileSearchInfo(document, position);
	const mappedExt = FileExtensionToMappedExtensionMap.get(extension) || extension;
	let ranker = new Ranker(document, FindType.Definition, position, currentWord, currentWordRange, currentText, parsedFile, mappedExt, true, new ForceSetting(false, false, true));
	const pattern = isVariableInit
		? getSearchPatternForLocalVairableOrConstant(currentWord)
		: getConfigValueByRoot(getRootFolderName(document.fileName), extension, mappedExt, 'definition') + '|^\\w*[^;]{0,120}\\s+' + currentWord + '\\s*;\\s*$';

	const filePath = quotePaths(document.fileName);
	let command = MsrExe + ' -p ' + filePath + ' -t "' + pattern + '"' + ' -N ' + position.line + ' -T 1 -I -C';
	command = command.replace(SearchTextHolderReplaceRegex, currentWord).trim();
	return createCommandSearcher('Search-Local-Variable-Definition-In-Current-File', toPath(parsedFile), command, ranker);
}
