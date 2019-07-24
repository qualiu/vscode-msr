// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import { exec, ExecOptions, ExecException } from 'child_process';
import { stringify } from 'querystring';
import { isNullOrUndefined } from 'util';
import * as stream from "stream";
import ChildProcess = require('child_process');
import path = require('path');

import { getSearchPathOptions, getConfig, getOverrideOrDefaultConfig } from './dynamicConfig';
import { outputError, outputWarn, outputInfo, outputLogInfo, clearOutputChannel, runCommandInTerminal, outDebug } from './outputUtils';
import { FindType, SearchProperty, FileExtensionToConfigExtMap } from './ranker';
import { checkSearchToolExists, IsWindows } from './checkTool';
import { getCurrentWordAndText } from './utils';
import { FindCommands, runFindingCommand, runFindingCommandByCurrentWord } from './commands';

const GetFileLineTextRegex = new RegExp('(.+?):(\\d+):(.*)');
const GetSummaryRegex = /^(?:Matched|Replaced) (\d+) /m;
const NotIgnoreErrorRegex = /^(Matched|Replaced) \d+ .*?(Error|error)/;
const CheckMaxSearchDepthRegex = /\s+(-k\s*\d+|--max-depth\s+\d+)/;

// const MsrExePaths = (process.env.Path || '').split(/\s*;\s*/).map(a => path.join(a, 'msr.exe')).filter(a => fs.existsSync(a));
// const MsrExePath = MsrExePaths.length > 0 ? MsrExePaths[0] : 'msr.exe';

let MyConfig = getConfig();
let RootConfig = getConfig().RootConfig || vscode.workspace.getConfiguration('msr');
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
			getConfig(true);
			RootConfig = vscode.workspace.getConfiguration('msr');
			outDebug('msr.enable.definition = ' + RootConfig.get('enable.definition'));
			outDebug('msr.enable.reference = ' + RootConfig.get('enable.reference'));
			outDebug('msr.enable.findingCommands = ' + RootConfig.get('enable.findingCommands'));
		}
	}));
}

export function registerExtension(context: vscode.ExtensionContext) {
	RootConfig = vscode.workspace.getConfiguration('msr');
	context.subscriptions.push(vscode.languages.registerDefinitionProvider('*', new DefinitionFinder));
	context.subscriptions.push(vscode.languages.registerReferenceProvider('*', new ReferenceFinder));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.findall',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommands.FindReferencesInAllFiles, textEditor, edit, args)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.finddef',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommands.FindDefinitionInCodeFiles, textEditor, edit, args)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.findref',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommands.FindReferencesInCodeFiles, textEditor, edit, args)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.finddoc',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommands.FindReferencesInDocs, textEditor, edit, args)));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('msr.findcfg',
		(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) =>
			runFindingCommand(FindCommands.FindReferencesInConfigFiles, textEditor, edit, args)));
}

// this method is called when your extension is deactivated
export function deactivate() { }

export class DefinitionFinder implements vscode.DefinitionProvider {
	public provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Location[] | null> {
		if (RootConfig.get('enable.definition') as boolean) {
			return searchMatchedWords(FindType.Definition, document, position, token, 'definition', true);
		} else {
			outDebug('Your extension "vscode-msr": find definition is disabled by setting of `msr.enable.definition`.');
			return Promise.reject(null);
		}
	}
}

export class ReferenceFinder implements vscode.ReferenceProvider {
	public provideReferences(document: vscode.TextDocument, position: vscode.Position, context: vscode.ReferenceContext, token: vscode.CancellationToken): Thenable<vscode.Location[] | null> {
		if (RootConfig.get('enable.reference') as boolean) {
			return searchMatchedWords(FindType.Reference, document, position, token, 'reference', false);
		} else {
			outDebug('Your extension "vscode-msr": find reference is disabled by setting of `msr.enable.reference`.');
			return Promise.reject(null);
		}
	}
}

function searchMatchedWords(findType: FindType, document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, configKeyName: string, checkSkipTestPath: boolean) {
	try {
		const [currentWord, currentText] = getCurrentWordAndText(document, position);
		if (!checkSearchToolExists() || token.isCancellationRequested || currentWord.length < 2) {
			return Promise.resolve(null);
		}

		clearOutputChannel();
		const parsedFile = path.parse(document.fileName);
		const extension = parsedFile.ext.substring(1).toLowerCase() || 'default';
		const mappedExt = FileExtensionToConfigExtMap.get(extension) || extension;

		let ranker = new SearchProperty(findType, currentWord, currentText, position, parsedFile, mappedExt);

		const [filePattern, searchOptions] = ranker.getFileNamePatternAndSearchOption(ranker, extension, configKeyName, parsedFile);
		if (filePattern.length < 1 || searchOptions.length < 1) {
			return Promise.reject('Failed to get filePattern or searchOptions.');
		}

		let extraOptions = getOverrideOrDefaultConfig(configKeyName, '.extraOptions', false);
		if (checkSkipTestPath && /test/i.test(document.fileName) === false) {
			extraOptions = '--np test ' + extraOptions;
		}

		const searchPathOptions = getSearchPathOptions(mappedExt, FindType.Definition === findType, true);
		let commandLine = 'msr ' + searchPathOptions + ' -f ' + filePattern + ' ' + searchOptions + ' ' + extraOptions;
		if (MyConfig.DefaultMaxSearchDepth > 0 && !CheckMaxSearchDepthRegex.test(commandLine)) {
			commandLine = commandLine.trim() + ' -k ' + MyConfig.DefaultMaxSearchDepth.toString();
		} else {
			commandLine = commandLine.trim();
		}

		commandLine = commandLine.replace(MyConfig.SearchTextHolderReplaceRegex, currentWord);

		if (MyConfig.IsDebug) {
			commandLine += " languageId = " + document.languageId; // + " fileName = " + document.fileName;
		}

		outputLogInfo('\n' + commandLine + '\n');

		return getMatchedLocationsAsync(findType, commandLine, ranker, token);
	} catch (e) {
		outputError(e.stack.toString());
		outputError(e.toString());
		throw e;
	}
}

function getMatchedLocationsAsync(findType: FindType, cmd: string, ranker: SearchProperty, token: vscode.CancellationToken): Thenable<vscode.Location[]> {
	const options: ExecOptions = {
		cwd: vscode.workspace.rootPath,
		timeout: 60 * 1000,
		maxBuffer: 10240000,
	};

	let allResults: vscode.Location[] = [];
	return new Promise<vscode.Location[]>((resolve, reject) => {
		const process = exec(cmd, options, (error: | ExecException | null, stdout: string, stderr: string) => {
			if (error) {
				if (!GetSummaryRegex.test(error.message) || NotIgnoreErrorRegex.test(error.message)) {
					outputError(error.message);
				} else {
					outDebug(error.message);
				}
			}

			if (stdout) {
				allResults = parseCommandOutput(stdout, ranker);
			}

			if (stderr) {
				const summary = GetSummaryRegex.exec(stderr);
				if (!summary || /(\s+(Error|ERROR|WARN|error|BOM file)\s+|Jumped out)/.test(stderr)) {
					outputWarn('\n' + stderr);
				} else if (summary) {
					outputLogInfo('\n' + stderr);
				}

				if (summary) {
					const match = /^Matched (\d+) .*?Used (\d+\.\d*) s/.exec(stderr);
					if (match) {
						const matchCount = parseInt(match[1]);
						const costSeconds = parseFloat(match[2]);
						outDebug('Got matched count = ' + matchCount + ' and time cost = ' + costSeconds + ' from summary.');
						if (matchCount < 1 && RootConfig.get('enable.useGeneralFindingWhenNoResults') as boolean) {
							const findCmd = findType === FindType.Definition ? FindCommands.FindDefinitionInCodeFiles : FindCommands.FindDefinitionInCodeFiles;
							runFindingCommandByCurrentWord(findCmd, ranker.currentWord, ranker.currentFile);
							outputInfo('Will use general search, please check results of `MSR-RUN-CMD` channel in `TERMINAL` tab. Disable `msr.enable.useGeneralFindingWhenNoResults` if you do not want.');
						}
						else if (matchCount > 1 && costSeconds <= MyConfig.ReRunCmdInTerminalIfCostLessThan) {
							runCommandInTerminal(cmd);
						}
					} else {
						outDebug('Failed to get time cost in summary.');
					}
				}
			}

			resolve(allResults);
		});

		token.onCancellationRequested(() =>
			killProcessTree(process.pid));
	});
}

function parseCommandOutput(stdout: string, ranker: SearchProperty): vscode.Location[] {
	const matchedFileLines = stdout.split(/\r\n|\n\r|\n|\r/);

	let allResults: vscode.Location[] = [];
	if (!MyConfig.NeedSortResults || matchedFileLines.length < 2) {
		matchedFileLines.map(line => {
			outputInfo(line);
			let a = parseMatchedText(line, ranker)[1];
			if (a) {
				allResults.push(a);
			}
		});

		return allResults;
	}

	let maxScore = 0;
	let sum = 0;
	let scoreToListMap = new Map<Number, [string, vscode.Location][]>();
	matchedFileLines.map(line => {
		let scoreLocation = parseMatchedText(line, ranker);
		if (!scoreLocation[1]) {
			return;
		}
		if (maxScore < scoreLocation[0]) {
			maxScore = scoreLocation[0].valueOf();
		}

		sum += scoreLocation[0].valueOf();
		if (!scoreToListMap.has(scoreLocation[0])) {
			scoreToListMap.set(scoreLocation[0], []);
		}

		if (scoreLocation[1]) {
			let sc = scoreLocation[1].range.start;
			let fileRowColumn = line.replace(':' + (sc.line + 1) + ':', ':' + (sc.line + 1) + ':' + sc.character);
			(scoreToListMap.get(scoreLocation[0]) || []).push([fileRowColumn, scoreLocation[1]]);
		}
	});

	const sorted = MyConfig.DescendingSortForVSCode
		? [...scoreToListMap.entries()].sort((a, b) => b[0].valueOf() - a[0].valueOf())
		: [...scoreToListMap.entries()].sort((a, b) => a[0].valueOf() - b[0].valueOf());

	let outList: string[] = [];
	sorted.forEach(list => {
		list[1].forEach(a => {
			if (MyConfig.DescendingSortForConsoleOutput === MyConfig.DescendingSortForVSCode) {
				outputInfo(a[0]);
			} else {
				outList.push(a[0]);
			}
			allResults.push(a[1]);
		});
	});

	for (let k = outList.length - 1; k >= 0; k--) {
		// // https://code.visualstudio.com/docs/editor/command-line#_opening-vs-code-with-urls
		// let link = AddPrefixToResultPaths
		// 	? 'vscode://open?url=file://' + (IsWindows ? '/' + outList[k].replace(/\\/g, '/') : outList[k]).replace(/:(\d+):(\d+)/, '&line=$1&column=$2')
		// 	: outList[k];
		outputInfo(outList[k]);
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
			console.log('Score = ' + score + ': ' + text);
			return [score, new vscode.Location(uri, pos)];
		} else {
			outputError('Failed to match words from matched result: ' + text);
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

function killProcess(p: ChildProcess.ChildProcess) {
	if (p) {
		try {
			p.kill();
		} catch (e) {
			outputWarn('Error killing process: ' + e);
		}
	}
}
