// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { MsrExe } from './checkTool';
import { getFindingCommandByCurrentWord, runFindingCommand } from './commands';
import { IsWindows } from './constants';
import { cookCmdShortcutsOrFile, FileExtensionToMappedExtensionMap, getConfig, getRootFolder, MyConfig, printConfigInfo } from './dynamicConfig';
import { FindCommandType, FindType } from './enums';
import { clearOutputChannel, disposeTerminal, outputDebug, RunCmdTerminalName } from './outputUtils';
import { Ranker } from './ranker';
import { createSearcher, getCurrentFileSearchInfo, getMatchedLocationsAsync, PlatformToolChecker, Searcher } from './searcher';
import { getExtensionNoHeadDot, isNullOrEmpty, nowText, quotePaths } from './utils';
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

export class DefinitionFinder implements vscode.DefinitionProvider {
	public async provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Location[] | null> {
		if (MyConfig.shouldSkipFinding(FindType.Definition, document.fileName)) {
			return Promise.resolve([]);
		}

		let thisSearch = new SearchTimeInfo(document, position);
		if (LastSearchInfo && thisSearch.isCloseAndSameSearch(LastSearchInfo)) {
			return LastSearchInfo.AsyncResult;
		}

		LastSearchInfo = new SearchTimeInfo(document, position);
		clearOutputChannel();

		// rootFolder is empty for external file:
		const rootFolder = getRootFolder(document.fileName);
		const isExternalFile = isNullOrEmpty(rootFolder);
		const sourceFileFolder = path.parse(document.fileName).dir;
		let currentFileSearchers = [
			createSearcher("Search-Current-File-Class-Method", document.fileName, false, FindType.Definition, document, position, -1, 1, true, false),
			createSearcher("Search-Current-File", document.fileName, false, FindType.Definition, document, position, -1, 1, false)
		];

		let currentFolderSearchers = [
			createSearcher("Search-Current-Folder-Class-Method", sourceFileFolder, false, FindType.Definition, document, position, -1, 1, true, false),
			createSearcher("Search-Current-Folder", sourceFileFolder, false, FindType.Definition, document, position, -1, 1, false)
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
			slowSearchers.push(fullSearcher);
		}

		async function finalTryToFindDefinition(): Promise<vscode.Location[]> {
			const currentFileResults = await searchDefinitionInCurrentFile(document, position, token);
			if (currentFileResults && currentFileResults.length > 0) {
				return Promise.resolve(currentFileResults);
			}
			else {
				return Promise.resolve(searchLocalVariableDefinitionInCurrentFile(document, position, token));
			}
		}

		async function runSearchers(searchers: (Searcher | null)[], useFinalTry: boolean): Promise<vscode.Location[]> {
			if (!searchers || searchers.length < 1) {
				return Promise.resolve([]);
			}

			let results: Thenable<vscode.Location[]>[] = [];
			searchers.forEach(a => {
				if (a) {
					results.push(a.searchMatchedWords(token));
				}
			});

			async function returnSearcherResult(index: number, useFinalTry: boolean): Promise<vscode.Location[]> {
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
					return Promise.resolve(returnSearcherResult(index + 1, useFinalTry));
				} else if (useFinalTry) {
					return finalTryToFindDefinition();
				} else {
					return Promise.resolve([]);
				}
			}

			return returnSearcherResult(0, useFinalTry);
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

		const searcherGroups = [currentFileSearchers, currentFolderSearchers, slowSearchers]
			.filter(g => g
				.filter(a => a !== null).length > 0
			);

		async function returnGroupSearchResult(index: number): Promise<vscode.Location[]> {
			return runSearchers(searcherGroups[index], index + 1 === searcherGroups.length).then(results => {
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

function searchDefinitionInCurrentFile(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Location[]> {
	const [parsedFile, extension, currentWord, currentWordRange, currentText] = getCurrentFileSearchInfo(document, position);
	if (!PlatformToolChecker.checkSearchToolExists() || token.isCancellationRequested || currentWord.length < 2 || !currentWordRange) {
		return Promise.resolve([]);
	}

	const mappedExt = FileExtensionToMappedExtensionMap.get(extension) || extension;
	let ranker = new Ranker(FindType.Definition, position, currentWord, currentWordRange, currentText, parsedFile, mappedExt, true);

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
	let ranker = new Ranker(FindType.Definition, position, currentWord, currentWordRange, currentText, parsedFile, mappedExt, true);

	const pattern = '\\w+\\s+(' + currentWord + ')\\s*=' + '|'
		+ '\\([\\w\\s]*?' + currentWord + '\\s*(in|:)\\s*\\w+';

	const filePath = quotePaths(document.fileName);
	let command = MsrExe + ' -p ' + filePath + ' -t "' + pattern + '" -N ' + Math.max(0, position.line - 1) + ' -T 1 -I -C';
	outputDebug('\n' + nowText() + command + '\n');
	return getMatchedLocationsAsync(FindType.Definition, command, ranker, token);
}
