// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { RunCommandChecker } from './ToolChecker';
import { getFindingCommandByCurrentWord, runFindingCommand } from './commands';
import { getConfigValueByProjectAndExtension, getConfigValueOfActiveProject, getConfigValueOfProject, getPostInitCommands } from './configUtils';
import { DefaultRepoFolderName, DefaultWorkspaceFolder, IsSupportedSystem, IsWindows, RunCmdTerminalName, WorkspaceCount, getDefaultRepoFolderByActiveFile, getRepoFolder, isNullOrEmpty } from './constants';
import { CookAliasArgs, cookCmdShortcutsOrFile } from './cookCommandAlias';
import { DefaultRepoFolder, FileExtensionToMappedExtensionMap, MappedExtToCodeFilePatternMap, MyConfig, WorkspaceToGitIgnoreMap, getConfig, getExtraSearchPaths, getGitIgnore, printConfigInfo } from './dynamicConfig';
import { FindCommandType, FindType, ForceFindType, TerminalType } from './enums';
import { GitIgnore } from './gitUtils';
import { clearOutputChannelByTimes, outputDebugByTime, outputInfoByDebugModeByTime, outputInfoQuietByTime } from './outputUtils';
import { Ranker } from './ranker';
import { disposeTerminal, getRunCmdTerminalWithInfo, sendCommandToTerminal } from './runCommandUtils';
import { SearchChecker } from './searchChecker';
import { Searcher, createCommandSearcher, createSearcher, getCurrentFileSearchInfo, setReRunMark, stopAllSearchers } from './searcher';
import { getRepoFolderFromTerminalCreation, getTerminalInitialPath, getTerminalNameOrShellExeName } from './terminalUtils';
import { MsrExe } from './toolSource';
import { getElapsedSecondsToNow, getRepoFolderName, getRepoFolders, quotePaths, replaceSearchTextHolder, toPath } from './utils';
import path = require('path');

outputDebugByTime('Start loading extension and initialize ...');

// avoid prompting 'cmd.exe exit error'
RunCommandChecker.checkToolAndInitRunCmdTerminal();
updateGitIgnoreUsage();

let RestoredEnvAliasTerminalMap = new Map<vscode.Terminal, boolean>();

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
			updateGitIgnoreUsage();
			cookCmdShortcutsOrFile({ FilePath: DefaultWorkspaceFolder, ForProject: true, SilentAll: true } as CookAliasArgs);
		}
	}));

	context.subscriptions.push(vscode.window.onDidCloseTerminal(terminal => {
		if (terminal.name === RunCmdTerminalName) {
			disposeTerminal();
		}
	}));

	const terminalNameToTypeMap = new Map<string, TerminalType>()
		.set('cmd', TerminalType.CMD)
		.set('powershell', TerminalType.PowerShell)
		.set('pwsh', TerminalType.Pwsh)
		.set('bash', TerminalType.LinuxBash)
		.set('wsl', TerminalType.WslBash)
		.set('mingw', TerminalType.MinGWBash)
		.set('cygwin', TerminalType.CygwinBash)
		;

	// Process terminal restore event from vscode (when vscode show message "History restored"):
	context.subscriptions.push(vscode.window.onDidChangeActiveTerminal((terminal => {
		if (terminal && !isNullOrEmpty(terminal.name) && terminal.name.match(MyConfig.AutoRestoreEnvAliasTerminalNameRegex)) {
			if (!RestoredEnvAliasTerminalMap.get(terminal)) {
				RestoredEnvAliasTerminalMap.set(terminal, true);
				let terminalType = terminalNameToTypeMap.get(terminal.name.toLowerCase().replace(/\..*$/, ''));
				if (!terminalType) {
					terminalType = IsWindows ? TerminalType.CMD : TerminalType.LinuxBash;
				}
				const postInitCommand = getPostInitCommands(terminalType, DefaultRepoFolderName);
				sendCommandToTerminal(postInitCommand, terminal);
				sendCommandToTerminal("use-this-alias || echo Please open a new same terminal to auto cook alias if not found.", terminal);
			}
		}
	})));

	// Process new terminal event:
	context.subscriptions.push(vscode.window.onDidOpenTerminal(terminal => {
		RestoredEnvAliasTerminalMap.set(terminal, true);
		if (terminal.name === RunCmdTerminalName) {
			return;
		}

		const initialPath = getTerminalInitialPath(terminal);
		const workspaceFolder = getRepoFolderFromTerminalCreation(terminal) || getDefaultRepoFolderByActiveFile()
			|| initialPath || DefaultWorkspaceFolder;
		const exeNameByInitPath = isNullOrEmpty(initialPath) ? '' : path.basename(initialPath);
		const terminalName = !isNullOrEmpty(exeNameByInitPath) ? exeNameByInitPath : getTerminalNameOrShellExeName(terminal);
		const terminalTitle = !isNullOrEmpty(terminal.name) ? terminal.name : terminalName;

		if (MyConfig.SkipInitCmdAliasForNewTerminalTitleRegex.test(terminalTitle)) {
			outputInfoQuietByTime(`Skip cooking alias: terminalTitle = ${terminalTitle} , regex = ${MyConfig.SkipInitCmdAliasForNewTerminalTitleRegex.source}`)
			return;
		}

		const matchNameRegex = /^(PowerShell|CMD|Command(\s+Prompt)?)|bash|\w*sh.exe$|cmd.exe|wsl.exe/i;
		if (MyConfig.InitProjectCmdAliasForNewTerminals
			&& !initialPath.endsWith('/pwsh') // skip PowerShell on Linux/MacOS
			&& (
				initialPath === workspaceFolder // default shell, no value set.
				|| (!IsWindows || isNullOrEmpty(terminalName) || matchNameRegex.test(terminalName) || matchNameRegex.test(initialPath))
			)) {
			cookCmdShortcutsOrFile({ FilePath: workspaceFolder || '.', ForProject: true, Terminal: terminal, IsNewlyCreated: true } as CookAliasArgs);
		} else {
			outputInfoQuietByTime(`Skip cooking alias: terminalName = ${terminalName}, title = ${terminalTitle}, initialPath = ${initialPath}, matchNameRegex = ${matchNameRegex.source}`);
		}
	}));
}

function updateGitIgnoreUsage() {
	WorkspaceToGitIgnoreMap.clear();

	if (!IsSupportedSystem || WorkspaceCount < 1 || !vscode.workspace.workspaceFolders) {
		return;
	}

	for (let k = 0; k < WorkspaceCount; k++) {
		const workspaceFolder = vscode.workspace.workspaceFolders[k].uri.fsPath;
		const repoFolder = getRepoFolder(workspaceFolder);
		const projectName = path.basename(repoFolder);
		const useGitIgnoreFile = getConfigValueOfProject(projectName, 'useGitIgnoreFile') === 'true';
		const omitGitIgnoreExemptions = getConfigValueOfProject(projectName, 'omitGitIgnoreExemptions') === 'true';
		const ignorableDotFolderNamePattern = getConfigValueOfProject(projectName, 'ignorableDotFolderNameRegex') || '';
		const gitIgnore = new GitIgnore(path.join(repoFolder, '.gitignore'), useGitIgnoreFile, omitGitIgnoreExemptions, ignorableDotFolderNamePattern);
		WorkspaceToGitIgnoreMap.set(repoFolder, gitIgnore);

		// TODD: record in file or env when creating terminal
		const canInitGitIgnore = workspaceFolder === DefaultRepoFolder;
		const onlyCookFile = !canInitGitIgnore;
		gitIgnore.parse(actionWhenSuccessfullyParsedGitIgnore, actionWhenFailedToParseGitIgnore);

		function actionWhenSuccessfullyParsedGitIgnore() {
			if (!canInitGitIgnore) {
				return;
			}

			MyConfig.setGitIgnoreStatus(repoFolder, gitIgnore.ExemptionCount < 1);
			const [runCmdTerminal, isNewlyCreated] = getRunCmdTerminalWithInfo();
			cookCmdShortcutsOrFile({ FilePath: repoFolder, ForProject: true, Terminal: runCmdTerminal, OnlyCookFile: onlyCookFile, GitCheckSucceeded: true, IsNewlyCreated: isNewlyCreated } as CookAliasArgs);
			const autoCompare = getConfigValueOfActiveProject('autoCompareFileListsIfUsedGitIgnore') === 'true';
			if (autoCompare) {
				gitIgnore.compareFileList();
			}
			cookCmdShortcutsOrFile({ FilePath: repoFolder, Terminal: runCmdTerminal, IsNewlyCreated: isNewlyCreated } as CookAliasArgs);
		}

		function actionWhenFailedToParseGitIgnore() {
			const [runCmdTerminal, isNewlyCreated] = getRunCmdTerminalWithInfo();
			cookCmdShortcutsOrFile({ FilePath: repoFolder, ForProject: true, Terminal: runCmdTerminal, OnlyCookFile: onlyCookFile, GitCheckFailed: true, IsNewlyCreated: isNewlyCreated } as CookAliasArgs);
			MyConfig.setGitIgnoreStatus(repoFolder, false);
		}

	}
}

export function registerExtension(context: vscode.ExtensionContext) {
	const selector = {
		languageId: '*',
		scheme: 'file',
	};

	context.subscriptions.push(vscode.languages.registerDefinitionProvider(selector, new DefinitionFinder));

	if (!getConfig().DisableFindReferenceFileExtensionRegex.source.match(/(^|\|)\.\*/)) {
		context.subscriptions.push(vscode.languages.registerReferenceProvider(selector, new ReferenceFinder));
	}

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.myFindOrReplaceSelectedTextCommand',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			runFindingCommand(FindCommandType.MyFindOrReplaceSelectedText, textEditor)));

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

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.regexFindInSameTypeFiles',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			runFindingCommand(FindCommandType.RegexFindReferencesInSameTypeFiles, textEditor)));

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
			cookCmdShortcutsOrFile({ FromMenu: true, FilePath: textEditor.document.uri.fsPath } as CookAliasArgs)
	));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.cookCmdAliasByProject',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			cookCmdShortcutsOrFile({ FromMenu: true, FilePath: textEditor.document.uri.fsPath, ForProject: true } as CookAliasArgs)
	));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.cookCmdAliasFiles',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			cookCmdShortcutsOrFile({ FromMenu: true, FilePath: textEditor.document.uri.fsPath, WriteToEachFile: true } as CookAliasArgs)
	));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.cookCmdAliasFilesByProject',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) =>
			cookCmdShortcutsOrFile({ FromMenu: true, FilePath: textEditor.document.uri.fsPath, ForProject: true, WriteToEachFile: true } as CookAliasArgs)
	));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.cookCmdAliasDumpWithOthersToFiles',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) => {
			// Cook 1 common alias file -> Dump alias to script files -> Cook 1 project alias file to recover settings.
			cookCmdShortcutsOrFile({ FromMenu: true, FilePath: textEditor.document.uri.fsPath, DumpOtherCmdAlias: true, SilentAll: true } as CookAliasArgs);
			cookCmdShortcutsOrFile({ FromMenu: true, FilePath: textEditor.document.uri.fsPath, WriteToEachFile: true, DumpOtherCmdAlias: true } as CookAliasArgs);
			cookCmdShortcutsOrFile({ FromMenu: true, FilePath: textEditor.document.uri.fsPath, ForProject: true, OnlyCookFile: true } as CookAliasArgs);
		}));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.cookCmdAliasDumpWithOthersToFilesByProject',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) => {
			// Cook 1 project related alias file -> Dump alias to script files -> Cook 1 project alias file to recover settings.
			cookCmdShortcutsOrFile({ FromMenu: true, FilePath: textEditor.document.uri.fsPath, ForProject: true, DumpOtherCmdAlias: true, SilentAll: true } as CookAliasArgs);
			cookCmdShortcutsOrFile({ FromMenu: true, FilePath: textEditor.document.uri.fsPath, ForProject: true, WriteToEachFile: true, DumpOtherCmdAlias: true } as CookAliasArgs);
			cookCmdShortcutsOrFile({ FromMenu: true, FilePath: textEditor.document.uri.fsPath, ForProject: true, OnlyCookFile: true } as CookAliasArgs);
		}));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.tmpToggleEnableFindingDefinition',
		(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, ..._args: any[]) => {
			getConfig().toggleEnableFindingDefinition(textEditor.document.uri.fsPath);
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

	context.subscriptions.push(vscode.commands.registerCommand('msr.compareFileListsWithGitIgnore',
		(..._args: any[]) => {
			const gitIgnore = getGitIgnore(getDefaultRepoFolderByActiveFile());
			gitIgnore.compareFileList();
		}));
}

// this method is called when your extension is deactivated
export function deactivate() { }

// Reduce duplicate search: Peek + Go-To definition by mouse-click.
class SearchTimeInfo {
	public Document: vscode.TextDocument;
	public Position: vscode.Position;
	public Time: Date;
	public AsyncResult: Promise<vscode.Location[] | null> = Promise.resolve(null);

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
			outputDebugByTime("UseLastSearch = " + useLast + ": this time = " + this.Time.toISOString() + ", other time = " + other.Time.toISOString() + ", diff = " + (this.Time.getTime() - other.Time.getTime()) + " ms.");
		}
		return useLast;
	}
}

let LastSearchInfo: SearchTimeInfo | null = null;

export class DefinitionFinder implements vscode.DefinitionProvider {
	public async provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Location[] | null> {
		setReRunMark(false);
		if (MyConfig.shouldSkipFinding(FindType.Definition, document.fileName)) {
			return Promise.resolve([]);
		}

		let thisSearch = new SearchTimeInfo(document, position);
		if (LastSearchInfo && thisSearch.isCloseAndSameSearch(LastSearchInfo)) {
			return LastSearchInfo.AsyncResult;
		}

		stopAllSearchers();
		const [parsedFile, extension, currentWord, currentWordRange, currentText] = getCurrentFileSearchInfo(document, position);
		if (!RunCommandChecker.checkSearchToolExists() || currentWord.length < 2 || !currentWordRange) {
			return Promise.resolve([]);
		}

		LastSearchInfo = new SearchTimeInfo(document, position);
		clearOutputChannelByTimes();

		const mappedExt = FileExtensionToMappedExtensionMap.get(extension) || extension;

		// repoFolder is empty for external file:
		const repoFolder = getRepoFolder(document.fileName);
		const repoFolderName = isNullOrEmpty(repoFolder) ? path.basename(getDefaultRepoFolderByActiveFile()) : path.basename(repoFolder);
		const defaultRepoFolderName = isNullOrEmpty(repoFolderName) ? path.basename(DefaultWorkspaceFolder) : repoFolderName;
		const [extraSearchPaths] = getExtraSearchPaths(repoFolderName || defaultRepoFolderName, extension, mappedExt);
		const extraRepoSearchPaths = Array.from(extraSearchPaths).filter(a => document.fileName.startsWith(a)).sort((a, b) => a.length - b.length);
		const isExternalFile = isNullOrEmpty(repoFolder) && extraRepoSearchPaths.length < 1;
		const sourceFileFolder = path.parse(document.fileName).dir;

		const searchChecker = new SearchChecker(document, FindType.Definition, position, currentWord, currentWordRange, currentText, parsedFile, mappedExt);
		const defaultForceSettings = searchChecker.getDefaultForceSettings();
		const defaultForceFindClassMethod = defaultForceSettings.getAllFlagsExcept([ForceFindType.FindLocalVariable, ForceFindType.FindMember]);
		const defaultForceFindClassMethodMember = defaultForceSettings.getAllFlagsExcept([ForceFindType.FindLocalVariable]);
		const isFindClassOrMethod = searchChecker.isFindClass || searchChecker.isFindMethod || searchChecker.isFindClassOrMethod;
		const currentFileDefinitionSearcher = getCommandToSearchDefinitionInCurrentFile(searchChecker);
		const currentFileVariableDefinitionSearcher = getCommandToSearchLocalVariableOrConstant(searchChecker);
		const currentFileVariableInitSearcher = getCommandToSearchLocalVariableOrConstant(searchChecker, true);

		let commandLineSet = new Set<string>();
		function canAddSearcher(searcher: Searcher | null): boolean {
			return searcher !== null && !commandLineSet.has(searcher.CommandLine);
		}

		function addSearcher(searchers: (Searcher | null)[], searcher: Searcher | null): Searcher | null {
			if (searcher && canAddSearcher(searcher)) {
				searchers.push(searcher);
				commandLineSet.add(searcher.CommandLine);
				return searcher;
			}
			return null;
		}

		function addClassSearchers(searcherGroup: (Searcher | null)[]): (Searcher | null)[] {
			let classSearchers: (Searcher | null)[] = [];
			searcherGroup.forEach(a => {
				if (a) {
					const searchCommand = a.CommandLine.replace(/\s+-t\s+".+?"/, ' -t "^\\s*[a-z\\s]{0,30}(class|enum|interface)\\s+' + currentWord + '\\b"')
						.replace(/\s+--nt\s+".+?"/, ' ');
					const classSearcher = createCommandSearcher(a.Name + '-Only-Class', a.SourcePath, searchCommand, a.Ranker, MyConfig.MaxSearchDepth, 10);
					classSearchers.push(classSearcher);
					classSearchers.push(a);
				}
			});
			return classSearchers;
		}

		// check and add same name file for class searching:
		const preferSearchingSpeedOverPrecision = getConfigValueByProjectAndExtension(repoFolderName, extension, mappedExt, 'preferSearchingSpeedOverPrecision') === 'true';
		function addClassNameFileSearcher(searcherGroup: (Searcher | null)[], searcherToClone: Searcher | null): Searcher | null {
			if (!preferSearchingSpeedOverPrecision || !searcherToClone || isNullOrEmpty(searchChecker.classFileNamePattern)) {
				return null;
			}

			const extensionPattern = !searchChecker.isCodeFile
				? MyConfig.CodeFilesRegex.source
				: MappedExtToCodeFilePatternMap.get(mappedExt) || `\\.${extension}$`;

			const commandLine = searcherToClone.CommandLine.replace(/\s+-f\s+(".+?"|\S+)/, ` -f "${searchChecker.classFileNamePattern}.*?${extensionPattern}"`);
			const sameNameFileSearcher = createCommandSearcher(searcherToClone.Name + '-By-Class-Name-File', searcherToClone.SourcePath, commandLine, searcherToClone.Ranker);
			addSearcher(searcherGroup, sameNameFileSearcher);
			return sameNameFileSearcher;
		}

		let currentFileSearchers = [
			createSearcher(searchChecker, "Search-Current-File", document.fileName, false, defaultForceFindClassMethod)
		];

		if (!searchChecker.isOnlyFindClass) {
			addSearcher(currentFileSearchers, currentFileDefinitionSearcher);
		}

		if (searchChecker.isFindMember && !isFindClassOrMethod) {
			addSearcher(currentFileSearchers, createSearcher(searchChecker, "Search-Current-File-Member", document.fileName, false, ForceFindType.FindMember));
		}
		else if (searchChecker.maybeFindLocalVariable) {
			addSearcher(currentFileSearchers, createSearcher(searchChecker, "Search-Current-File-LocalMember", document.fileName, false, ForceFindType.FindMember | ForceFindType.FindLocalVariable));
		}

		const shouldFindLocalVariable = /^_?[a-z]\w+/.test(currentWord) && (searchChecker.isScriptFile || new RegExp('\\b' + currentWord + '\\b\\S*\\s*=').test(currentText));
		if (shouldFindLocalVariable) {
			addSearcher(currentFileSearchers, currentFileVariableDefinitionSearcher);
		}

		if (!searchChecker.isOnlyFindClass) {
			addSearcher(currentFileSearchers, currentFileVariableInitSearcher);
		}

		if (searchChecker.isProbablyFindLocalVariable) {
			addSearcher(currentFileSearchers, getCommandToSearchLocalVariableOrConstant(searchChecker, false, true));
		}

		let currentFolderSearchers: (Searcher | null)[] = [];
		addSearcher(currentFolderSearchers, createSearcher(searchChecker, "Search-Current-Folder", sourceFileFolder, false, defaultForceFindClassMethodMember, 1));
		addSearcher(currentFolderSearchers, createSearcher(searchChecker, "Search-Current-Folder-Member", sourceFileFolder, false, defaultForceFindClassMethodMember, 1));

		if (!isExternalFile) {
			addSearcher(currentFolderSearchers, createSearcher(searchChecker, "Search-Current-Folder-Recursively", sourceFileFolder, true, defaultForceFindClassMethodMember, 9, 7));
		}

		function skipTestPathInCommandLine(searcher: Searcher | null): Searcher | null {
			if (searcher) {
				searcher.CommandLine = searcher.CommandLine.replace(/(\s+--n[pd]\s+")/, '$1test|');
			}

			return searcher;
		}

		if (!searchChecker.isInTestPath) {
			for (let k = 0; k < currentFolderSearchers.length; k++) {
				currentFolderSearchers[k] = skipTestPathInCommandLine(currentFolderSearchers[k]);
			}
		}

		let slowSearchers: (Searcher | null)[] = [];
		let classFileNameSearchers: (Searcher | null)[] = [];
		let parentFolder = path.dirname(sourceFileFolder);
		const diskRegex = IsWindows ? /^[A-Z]:\\.+?\\\w+/i : new RegExp('^/[^/]+/[^/]+$');
		for (let k = 0; k < 4; k++) {
			// avoid searching disk root for external files + avoid out of repo folder for internal files.
			if (isNullOrEmpty(repoFolder) || !parentFolder.startsWith(repoFolder) || !parentFolder.match(diskRegex)) {
				break;
			}
			let searcher = createSearcher(searchChecker, "Search-Parent-Up-" + (k + 1), parentFolder, true, defaultForceFindClassMethodMember, 16, 9);
			if (!searchChecker.isInTestPath) {
				searcher = skipTestPathInCommandLine(searcher);
			}
			addClassNameFileSearcher(classFileNameSearchers, searcher);
			addSearcher(slowSearchers, searcher);
			parentFolder = path.dirname(parentFolder);
		}

		// speed up for languages like: Java/Scala
		const testFolderMatch = document.fileName.match(new RegExp('[\\\\/]test[\\\\/]'));
		if (!isExternalFile && testFolderMatch) {
			const testParentFolder = document.fileName.substring(0, testFolderMatch.index);
			addSearcher(slowSearchers, createSearcher(searchChecker, 'Search-Parent-Test-Folder', testParentFolder));
		}

		if (!isNullOrEmpty(searchChecker.classFileNamePattern)) {
			currentFolderSearchers = addClassSearchers(currentFolderSearchers);
			slowSearchers = addClassSearchers(slowSearchers);
		}

		const repoSearcher = isNullOrEmpty(repoFolder) ? null : createSearcher(searchChecker, "Search-This-Repo", repoFolder);
		addClassNameFileSearcher(classFileNameSearchers, createSearcher(searchChecker, "Search-This-Repo", repoFolder));

		addSearcher(slowSearchers, repoSearcher);

		const forbidReRunSearchers = new Set<Searcher | null>();
		function addExtraOtherSearchers(searcherGroup: (Searcher | null)[], repoFolders: string[], isExtra: boolean) {
			repoFolders.forEach(folder => {
				const name = (isExtra ? 'Search-Extra-Path-' : 'Search-Other-Repo-') + path.basename(folder);
				const extraSearcher = createSearcher(searchChecker, name, folder);
				if (extraSearcher) {
					extraSearcher.Ranker.canRunCommandInTerminalWhenNoResult = false;
					extraSearcher.Ranker.canRunCommandInTerminalWhenManyResults = false;
				}

				forbidReRunSearchers.add(addClassNameFileSearcher(searcherGroup, extraSearcher));
				forbidReRunSearchers.add(addSearcher(searcherGroup, extraSearcher));
			});
		}

		const allRepoFolders = getRepoFolders(repoFolder);
		const otherRepoFolders = allRepoFolders.filter(a => a !== repoFolder);
		const extraRepoSearchFolders = Array.from(extraSearchPaths).filter(a => !allRepoFolders.includes(a));

		addExtraOtherSearchers(slowSearchers, extraRepoSearchFolders, true);
		addExtraOtherSearchers(slowSearchers, otherRepoFolders, false);

		if (!enableLastSearcherToRunCommand(slowSearchers)) {
			enableLastSearcherToRunCommand(currentFileSearchers);
		}

		function enableLastSearcherToRunCommand(searchers: (Searcher | null)[]): boolean {
			if (!searchers || searchers.length < 1) {
				return false;
			}

			for (let k = searchers.length - 1; k >= 0; k--) {
				let searcher = searchers[k];
				if (searcher && !forbidReRunSearchers.has(searcher)) {
					searcher.Ranker.canRunCommandInTerminalWhenNoResult = true;
					return true;
				}
			}

			return false;
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
					const resultSearcher = searchers[index];
					outputInfoByDebugModeByTime("Found by searcher: " + resultSearcher);
					const beginStopTime = new Date();
					if (searchers && resultSearcher) {
						searchers.forEach(a => {
							if (a && a.CommandLine !== resultSearcher.CommandLine) {
								a.stop();
							}
						});
					}
					const stopCost = getElapsedSecondsToNow(beginStopTime);
					outputInfoByDebugModeByTime('Cost ' + stopCost + ' s to stop all searchers.');
					return Promise.resolve(currentResults);
				} else if (index + 1 < results.length) {
					return Promise.resolve(returnSearcherResult(index + 1));
				} else {
					return Promise.resolve([]);
				}
			}

			return returnSearcherResult(0);
		}

		let group1 = searchChecker.isScriptFile ? [currentFileDefinitionSearcher] : [];
		let group2 = searchChecker.isScriptFile ? [currentFileVariableDefinitionSearcher] : [];
		let finalGroup = [currentFileDefinitionSearcher, currentFileVariableDefinitionSearcher, currentFileVariableInitSearcher];
		if (/[^A-Z]/.test(currentWord) && new RegExp('[\\.:]' + currentWord + '\\b').test(currentText) && repoSearcher && repoSearcher.CommandLine) {
			const ranker = new Ranker(searchChecker, true, ForceFindType.FindLocalVariable);
			let command = repoSearcher.CommandLine;
			let match = /\s+-t (\S+|"[^"]+")\s+/.exec(command);
			if (match) {
				command = command.substring(0, match.index) + ' -t "' + getSearchPatternForLocalVariableOrConstant(currentWord) + '" ' + command.substring(match.index + match[0].length);
				const constSearcher = createCommandSearcher('Search-Constant', repoFolder, command, ranker);
				finalGroup.push(constSearcher);
			}
		}

		const searcherGroups = [group1, group2, currentFileSearchers, classFileNameSearchers, currentFolderSearchers, slowSearchers, finalGroup]
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

		const [parsedFile, extension, currentWord, currentWordRange, currentText] = getCurrentFileSearchInfo(document, position);
		const mappedExt = FileExtensionToMappedExtensionMap.get(extension) || extension;
		const searchChecker = new SearchChecker(document, FindType.Definition, position, currentWord, currentWordRange, currentText, parsedFile, mappedExt);
		const searcher = createSearcher(searchChecker, 'Search-Reference', '');
		if (!searcher) {
			return Promise.resolve([]);
		}

		return searcher.searchMatchedWords(token);
	}
}

function getCommandToSearchDefinitionInCurrentFile(searchChecker: SearchChecker): Searcher {
	const [parsedFile, , currentWord,] = getCurrentFileSearchInfo(searchChecker.Document, searchChecker.Position);
	let ranker = new Ranker(searchChecker, true);

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

function getSearchPatternForLocalVariableOrConstant(currentWord: string, isSimpleDefineAndInit = false) {
	return isSimpleDefineAndInit
		? "^\\s*\\w+\\s+" + currentWord + "\\s*=\\s*\\S+"
		: '^\\s*' + currentWord + '\\s*=\\s*\\S+'
		+ '|' + '\\w+\\s+' + currentWord + '\\s*='
		+ '|' + '\\([\\w\\s]*?' + currentWord + '\\s*(in|:)\\s*\\w+';
}

function getCommandToSearchLocalVariableOrConstant(searchChecker: SearchChecker, isVariableInit = false, isSimpleDefineAndInit = false): Searcher {
	const [parsedFile, extension, currentWord,] = getCurrentFileSearchInfo(searchChecker.Document, searchChecker.Position);
	const mappedExt = FileExtensionToMappedExtensionMap.get(extension) || extension;
	let ranker = new Ranker(searchChecker, true, ForceFindType.FindLocalVariable);
	const pattern = isVariableInit || isSimpleDefineAndInit
		? getSearchPatternForLocalVariableOrConstant(currentWord, isSimpleDefineAndInit)
		: getConfigValueByProjectAndExtension(getRepoFolderName(searchChecker.Document.fileName), extension, mappedExt, 'definition') + '|^\\w*[^;]{0,120}\\s+' + currentWord + '\\s*;\\s*$';

	const filePath = quotePaths(searchChecker.Document.fileName);
	let command = MsrExe + ' -p ' + filePath + ' -t "' + pattern + '"' + ' -N ' + searchChecker.Position.line + ' -T 1 -I -C';
	command = replaceSearchTextHolder(command, currentWord).trim();

	const name = isSimpleDefineAndInit
		? "Search-Local-Tmp-Variable-Definition-Init-In-CurrentFile"
		: (isVariableInit
			? "Search-Local-Variable-Definition-In-Current-File"
			: "Search-Local-Variable-Init-In-Current-File"
		);

	return createCommandSearcher(name, toPath(parsedFile), command, ranker);
}
