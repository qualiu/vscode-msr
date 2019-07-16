// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import { exec, ExecOptions, ExecException } from 'child_process';
import { stringify } from 'querystring';
import { isNullOrUndefined } from 'util';
import * as stream from "stream";
import ChildProcess = require('child_process');
import path = require('path');
import fs = require('fs');
import os = require('os');
import { ParsedPath } from 'path';
import { createConnection } from 'net';
import { window } from 'vscode';

const GetFileLineTextRegex = new RegExp('(.+?):(\\d+):(.*)');
const GetSummaryRegex = /^(?:Matched|Replaced) (\d+) /m;
const NotIgnoreErrorRegex = /^(Matched|Replaced) \d+ .*?(Error|error)/;
const CheckMaxSearchDepthRegex = /\s+(-k\s*\d+|--max-depth\s+\d+)/;
const RootConfig = vscode.workspace.getConfiguration('msr');
const RootPath = vscode.workspace.rootPath || '.';
const IsVerbose = RootConfig.get('verbose') as boolean;
const IsDebug = RootConfig.get('debug') as boolean;
const ConfigAndDocFilesRegex = new RegExp(RootConfig.get('default.configAndDocs') as string || '\\.(json|xml|ini|ya?ml|md)|readme', 'i');
const CodeAndConfigAndDocFilesRegex = new RegExp(RootConfig.get('default.codeAndConfigDocs') as string || '\\.(cs\\w*|nuspec|config|c[px]*|h[px]*|java|scala|py|vue|tsx?|jsx?|json|ya?ml|xml|ini|md)$|readme', 'i');
const SearchTextHolder = RootConfig.get('searchTextHolder') as string || '%~1';
const SearchTextHolderReplaceRegex = new RegExp(SearchTextHolder, 'g');
const TrimSearchTextRegex = /^\W+|\W+$/g;
const DescendingSortForConsoleOutput = RootConfig.get('descendingSortForConsoleOutput') as boolean || false;
const DescendingSortForVSCode = RootConfig.get('descendingSortForVSCode') as boolean || true;

const FileExtensionToConfigExtMap = new Map<string, string>()
	.set('cxx', 'cpp')
	.set('hpp', 'cpp')
	.set('h', 'cpp')
	.set('scala', 'java')
	.set('vue', 'ui')
	.set('js', 'ui')
	.set('ts', 'ui')
	.set('jsx', 'ui')
	.set('tsx', 'ui')
	;

const MappedExtToCodeFileNamePatternMap = new Map<string, string>()
	.set('java', RootConfig.get('java.codeFiles') as string)
	.set('ui', RootConfig.get('ui.codeFiles') as string)
	.set('cpp', RootConfig.get('cpp.codeFiles') as string)
	.set('default', '.?')
	;

const DefaultMaxSearchDepth = parseInt(RootConfig.get('default.maxSearchDepth') || '0');
const SearchAllFilesWhenFindingReferences = RootConfig.get('default.searchAllFilesForReferences') as boolean;
const SearchAllFilesWhenFindingDefinitions = RootConfig.get('default.searchAllFilesForDefinitions') as boolean;
const NeedSortResults = RootConfig.get('default.sortResults') as boolean;

const AlphaNumber = "[a-z0-9A-Z]";
const HeaderBoundary = "(?<!" + AlphaNumber + ")";
const TailBoundary = "(?!" + AlphaNumber + ")";

const IsWindows = /(win32|windows)/i.test(process.platform);
// const MsrExePaths = (process.env.Path || '').split(/\s*;\s*/).map(a => path.join(a, 'msr.exe')).filter(a => fs.existsSync(a));
// const MsrExePath = MsrExePaths.length > 0 ? MsrExePaths[0] : 'msr.exe';
const ShouldQuotePathRegex = IsWindows ? /[^\w\.,\\/:-]/ : /[^\w\.,\\/-]/;

// Extract single words (exclude "_")  which will split camel case and combination of word and numbers, like cases:
const SingleWordMatchingPattern =
	HeaderBoundary + "[A-Z]+[0-9]+[A-Z]?" + TailBoundary + "|"         // Get 'RL28D' 'OFFICE365'
	+ "[A-Z]?[a-z]+[0-9]+" + "|"                                       // Get 'Office365' 'office365'
	+ "[A-Z]+[a-z]" + "(?=[\\b_A-Z])" + "|"                            // Get 'IDEAs' from 'IDEAsOlsTest'
	+ "[A-Z][0-9][A-Z]" + "(?=[\\b_0-9]|[A-Z][a-z0-9])" + "|"          // Get 'U2D' from 'U2DUtils'
	+ "[A-Z]+[0-9]+[A-Z]" + "(?=[\\b_0-9]|[A-Z][a-z0-9])" + "|"        // Get 'RL28D' from 'RL28D_Office'
	+ "[A-Z]+[0-9]+" + "|"                                             // Get 'RL28' from 'RL28DEF'
	+ "[A-Z]+" + "(?=[A-Z][a-z]+)" + "|"                               // Get 'OFFICE' from 'OFFICEData'
	+ "[A-Z][a-z]+" + "|"                                              // Get 'Office'
	+ "[a-z][0-9][a-z]" + "(?=[\\b_A-Z0-9])" + "|"                     // Get 'u2d'
	+ "[0-9]+[A-Z]" + "(?=\\b|[A-Z])" + "|"                            // Get '3D' from '3DTest' '3DTEST'
	+ "[0-9]+" + "|" + "[A-Z]+" + "|" + "[a-z]+"                       // Get normal successive number or letters
	;
const SingleWordMatchingRegex = new RegExp(SingleWordMatchingPattern, 'g');

export function getAllSingleWords(text: string, ignoreCase: boolean = true): Set<string> {
	let s = new Set<string>();
	let m;
	do {
		m = SingleWordMatchingRegex.exec(text);
		if (m) {
			s.add(ignoreCase ? m[0].toLowerCase() : m[0]);
		}
	} while (m);

	return s;
}

let _channel: vscode.OutputChannel;
function getOutputChannel(): vscode.OutputChannel {
	if (!_channel) {
		_channel = vscode.window.createOutputChannel('MSR-Def-Ref');
	}
	return _channel;
}

function outputWarn(message: string) {
	getOutputChannel().appendLine(message);
	getOutputChannel().show(true);
}

function outputError(message: string) {
	getOutputChannel().appendLine(message);
	getOutputChannel().show(true);
}

function outputInfo(message: string) {
	getOutputChannel().appendLine(message);
	getOutputChannel().show(true);
}

function outputLog(message: string) {
	getOutputChannel().appendLine(message);
	getOutputChannel().show(true);
}

function clearOutputChannel() {
	getOutputChannel().clear();
}

let isExeExists = true;
const whereCmd = IsWindows ? 'where msr' : 'whereis msr';
try {
	ChildProcess.execSync(whereCmd).toString();
} catch (err) {
	console.warn(err);
	outputError('Not found `msr` in PATH by command: ' + whereCmd);
	outputError('Please take less than 1 minute follow: https://github.com/qualiu/vscode-msr/blob/master/README.md#Requirements');
	isExeExists = false;
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	if (!isExeExists) {
		return;
	}

	// Use the console to output diagnostic information (outputLog) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	const isEnabled = RootConfig.get('enabled') as boolean;
	if (isEnabled) {
		console.log('Congratulations, your extension "vscode-msr" is now active!');
	} else {
		console.warn('Your extension "vscode-msr" is disabled, please change the configuration if you want.');
		return;
	}

	// vscode.languages.getLanguages().then((languages: string[]) => { console.log("Known languages: " + languages); });

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	if (RootConfig.get('enable.findDef') as boolean) {
		context.subscriptions.push(vscode.languages.registerDefinitionProvider('*', new DefinitionFinder));
	} else {
		console.warn('Your extension "vscode-msr": find definition is disabled.');
	}

	if (RootConfig.get('enable.findRef') as boolean) {
		context.subscriptions.push(vscode.languages.registerReferenceProvider('*', new ReferenceFinder));
	} else {
		console.warn('Your extension "vscode-msr": find reference is disabled.');
	}
}

// this method is called when your extension is deactivated
export function deactivate() { }

export class DefinitionFinder implements vscode.DefinitionProvider {
	public provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Location[] | null> {
		return searchMatchedWords(document, position, token, 'findDef', true);
	}
}

export class ReferenceFinder implements vscode.ReferenceProvider {
	public provideReferences(document: vscode.TextDocument, position: vscode.Position, context: vscode.ReferenceContext, token: vscode.CancellationToken): Thenable<vscode.Location[] | null> {
		return searchMatchedWords(document, position, token, 'findRef', false);
	}
}

function searchMatchedWords(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, configKeyName: string, checkSkipTestPath: boolean) {
	if (token.isCancellationRequested || document.languageId === 'code-runner-output' || document.fileName.startsWith('extension-output-#')) {
		return Promise.resolve(null);
	}

	clearOutputChannel();
	const wordRange = document.getWordRangeAtPosition(position);
	if (!wordRange) {
		return Promise.reject('No word selected.');
	}

	const currentText = document.lineAt(position.line).text;
	let currentWord: string = currentText.slice(wordRange.start.character, wordRange.end.character);
	currentWord = currentWord.replace(TrimSearchTextRegex, '');
	if (currentWord.length < 2) {
		const errorMessage = 'Skip search too short word: "' + currentWord + '".';
		console.log(errorMessage);
		return Promise.reject(errorMessage);
	}

	const parsedFile = path.parse(document.fileName);
	const extension = parsedFile.ext.substring(1).toLowerCase() || 'default';
	const mappedExt = FileExtensionToConfigExtMap.get(extension) || extension;
	const skipFolders = (RootConfig.get(mappedExt + '.skipFolders') || RootConfig.get('default.skipFolders')) as string;
	let searchOption = (RootConfig.get(mappedExt + '.' + configKeyName) || RootConfig.get('default.' + configKeyName)) as string;
	if (searchOption.indexOf(SearchTextHolder) < 0) {
		const errorMessage = 'Not found word-holder: "' + SearchTextHolder + '" in search option, please check configuration of "' + configKeyName + '": ' + searchOption;
		outputError(errorMessage);
		return Promise.reject(errorMessage);
	}

	let extraOptions = (RootConfig.get(configKeyName + '.extraOptions') || RootConfig.get('default.extraOptions')) as string;
	if (checkSkipTestPath && /test/i.test(document.fileName) === false) {
		extraOptions = '--np test ' + extraOptions;
	}

	const [filePattern, searchOptions] = getFileNamePatternAndSearchOption(mappedExt, extension, configKeyName, searchOption, parsedFile);

	const defaultExtraSearchPaths = RootConfig.get('default.extraSearchPaths') as string || '';
	const defaultExtraSearchPathListFiles = RootConfig.get('default.extraSearchPathListFiles') as string || '';
	const thisTypeExtraSearchPaths = RootConfig.get(mappedExt + '.extraSearchPaths') as string || '';
	const thisTypeExtraSearchPathListFiles = RootConfig.get(mappedExt + '.extraSearchPathListFiles') as string || '';

	let searchPathSet = new Set((RootPath + ',' + thisTypeExtraSearchPaths + ',' + defaultExtraSearchPaths).split(/\s*,\s*/));
	searchPathSet.delete('');

	let searchPathListFileSet = new Set((thisTypeExtraSearchPathListFiles + ',' + defaultExtraSearchPathListFiles).split(/\s*,\s*/));
	searchPathListFileSet.delete('');

	let pathsText = Array.from(searchPathSet).join(',').replace(/"/g, '');
	if (ShouldQuotePathRegex.test(pathsText)) {
		pathsText = '"' + pathsText + '"';
	}

	let pathFilesText = Array.from(searchPathListFileSet).join(',').replace(/"/g, '');
	if (ShouldQuotePathRegex.test(pathFilesText)) {
		pathFilesText = '"' + pathFilesText + '"';
	}

	const searchPathOptions = '-rp ' + pathsText;
	const readPathListOptions = searchPathListFileSet.size > 0 ? ' -w "' + pathFilesText + '"' : '';
	let commandLine = 'msr ' + searchPathOptions + readPathListOptions + ' -f ' + filePattern + ' --nd "' + skipFolders + '" ' + searchOptions + ' ' + extraOptions;
	if (DefaultMaxSearchDepth > 0 && !CheckMaxSearchDepthRegex.test(commandLine)) {
		commandLine = commandLine.trim() + ' -k ' + DefaultMaxSearchDepth.toString();
	} else {
		commandLine = commandLine.trim();
	}

	commandLine = commandLine.replace(SearchTextHolderReplaceRegex, currentWord);

	if (IsVerbose) {
		if (IsDebug) {
			commandLine += " languageId = " + document.languageId + " fileName = " + document.fileName;
		}

		outputLog('\n' + commandLine + '\n');
	}

	return getMatchedLocationsAsync(commandLine, currentWord, currentText, parsedFile, token);
}

export function getFileNamePatternAndSearchOption(mappedExt: string, extension: string, configKeyName: string, searchOptions: string, parsedFile: ParsedPath): [string, string] {
	let filePattern = MappedExtToCodeFileNamePatternMap.get(mappedExt) || '\\.' + extension + '$';
	if (SearchAllFilesWhenFindingReferences && configKeyName === 'findRef') {
		filePattern = RootConfig.get('default.allFiles') as string;
		const defaultFindRef = RootConfig.get('default.findRef') as string;
		if (defaultFindRef.length > 1) {
			searchOptions = defaultFindRef;
		}
	} else if (SearchAllFilesWhenFindingDefinitions && configKeyName === 'findDef') {
		const codeFilesKey = mappedExt === 'ui' ? 'default.codeFilesPlusUI' : 'default.codeFiles';
		filePattern = RootConfig.get(codeFilesKey) as string;
		const defaultFindDef = RootConfig.get('default.findDef') as string;
		if (defaultFindDef.length > 1) {
			searchOptions = defaultFindDef;
		}
	} else if (ConfigAndDocFilesRegex.test(parsedFile.base)) {
		filePattern = configKeyName === 'findDef'
			? RootConfig.get('default.codeFiles') as string
			: CodeAndConfigAndDocFilesRegex.source;
	}

	filePattern = '"' + filePattern + '"';
	return [filePattern, searchOptions];
}

export function getMatchedLocationsAsync(cmd: string, currentWord: string, currentText: string, currentFile: ParsedPath, token: vscode.CancellationToken): Thenable<vscode.Location[]> {
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
				}
			}

			if (stdout) {
				allResults = parseCommandOutput(stdout, currentWord, currentText, currentFile);
			}

			if (stderr) {
				const summary = GetSummaryRegex.exec(stderr);
				if (!summary || /(\s+(Error|ERROR|WARN|error|BOM file)\s+|Jumped out)/.test(stderr)) {
					outputWarn('\n' + stderr);
				} else if (IsVerbose && summary) {
					outputInfo('\n' + stderr);
				}
			}

			resolve(allResults);
		});

		token.onCancellationRequested(() =>
			killProcessTree(process.pid));
	});
}

export function parseCommandOutput(stdout: string, currentWord: string, currentText: string, currentFile: ParsedPath): vscode.Location[] {
	const currentWordRegex = new RegExp('\\b' + currentWord + '\\b');
	const matchedFileLines = stdout.split(/\r\n|\n\r|\n|\r/);

	let allResults: vscode.Location[] = [];
	if (!NeedSortResults || matchedFileLines.length < 2) {
		matchedFileLines.map(line => {
			outputInfo(line);
			let a = parseMatchedText(line, currentWordRegex, currentWord, currentText, currentFile)[1];
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
		let scoreLocation = parseMatchedText(line, currentWordRegex, currentWord, currentText, currentFile);
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

	const sorted = DescendingSortForVSCode
		? [...scoreToListMap.entries()].sort((a, b) => b[0].valueOf() - a[0].valueOf())
		: [...scoreToListMap.entries()].sort((a, b) => a[0].valueOf() - b[0].valueOf());

	let outList: string[] = [];
	sorted.forEach(list => {
		list[1].forEach(a => {
			if (DescendingSortForConsoleOutput === DescendingSortForVSCode) {
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

export function parseMatchedText(text: string, currentWordRegex: RegExp, currentWord: string, currentText: string, currentFile: ParsedPath): [Number, vscode.Location | null] {
	let m;
	if ((m = GetFileLineTextRegex.exec(text)) !== null) {
		const uri = vscode.Uri.file(m[1]);
		const wm = currentWordRegex.exec(m[3]);
		if (wm !== null) {
			const row = parseInt(m[2]);
			const pos = new vscode.Position(row - 1, wm.index);
			const score = NeedSortResults ? getScore(m[1], row, m[3], currentWord, currentText, currentFile) : 1;
			console.log('Score = ' + score + ': ' + text);
			return [score, new vscode.Location(uri, pos)];
		} else {
			outputError('Failed to match words from matched result: ' + text);
		}
	}

	return [0, null];
}

export function getScore(resultFilePath: string, resultRow: Number, resultText: string, currentWord: string, currentText: string, currentFile: ParsedPath): Number {
	let score = 1;
	const parsedResultPath = path.parse(resultFilePath);
	if (!resultText.match('^\\s*(//|#)') && parsedResultPath.name.endsWith('.md')) {
		score += 100;
	}

	if (!resultText.match(/;\s*$/)) {
		score += 20;
	}

	if (!parsedResultPath.name.match(/test/i)) {
		score += 100;
	}

	if (!resultFilePath.match(/test/i)) {
		score += 50;
	}

	if (!parsedResultPath.name.match(/^I[A-Z][a-z]/)) {
		score += 10;
	}

	if (resultText.match(/^\s*public\s+/)) {
		score += 50;
	}

	if (resultText.match(/^\s*(\w+\s+)?static\s+/)) {
		score += 20;
	}

	if (resultText.match(/^\s*(internal|protected|private)\s+/)) {
		score += 10;
	}

	if (!parsedResultPath.name.match(/\.(json|xml|ya?ml|ini|config|md|txt)$|readme/i)) {
		score += 100;
	}

	if (resultText.match(/^\boverride\b/)) {
		score += 50;
	}

	const currentWordSet = getAllSingleWords(currentWord);
	const currentFileNameWordSet = getAllSingleWords(currentFile.name);
	const currentTextWordSet = getAllSingleWords(currentText);

	const resultFileNameWordSet = getAllSingleWords(parsedResultPath.name);
	const resultWordSet = getAllSingleWords(resultText);

	currentWordSet.forEach(a => {
		if (resultFileNameWordSet.has(a)) {
			score += 20;
		}
	});

	currentFileNameWordSet.forEach(a => {
		if (resultFileNameWordSet.has(a)) {
			score += 10;
		}
	});

	currentTextWordSet.forEach(a => {
		if (resultWordSet.has(a)) {
			score += 10;
		}
	});

	return score;
}

export function killProcess(p: ChildProcess.ChildProcess) {
	if (p) {
		try {
			p.kill();
		} catch (e) {
			outputWarn('Error killing process: ' + e);
		}
	}
}

export function killProcessTree(processId: number): void {
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
