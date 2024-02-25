import * as vscode from 'vscode';
import { IsDebugMode, IsSupportedSystem, IsWindows, OutputChannelName } from './constants';
import { nowText, replaceTextByRegex } from './utils';

// When searching plain text, powershell requires extra escaping (like '$').
export const UsePowershell = false;
const WindowsShell = UsePowershell ? 'powershell' : 'cmd.exe';
export const ShellPath = IsWindows ? WindowsShell : 'bash';
const ShowColorHideCmdRegex: RegExp = /\s+-[Cc](\s+|$)/g;
const SearchRegexList: RegExp[] = [
	/\s+(-t|--text-match)\s+(\w+\S*|'(.+?)'|"(.+?)")/,
	/\s+(-x|--has-text)\s+(\w+\S*|'(.+?)'|"(.+?)")/
];

// MSR-Def-Ref output channel
let MessageChannel: vscode.OutputChannel;

let OutputTimes: number = 0;

export enum MessageLevel {
	None = 0,
	DEBUG = 1,
	INFO = 2,
	WARN = 3,
	ERROR = 4,
	FATAL = 5
}

export const DefaultMessageLevel = IsDebugMode ? MessageLevel.DEBUG : MessageLevel.INFO;
let LogLevel = MessageLevel.INFO;
let IsQuiet = true;

export function updateOutputChannel(messageLevel: MessageLevel = DefaultMessageLevel, isQuiet: boolean = true) {
	LogLevel = messageLevel;
	IsQuiet = isQuiet;
}

export function outputMessage(level: MessageLevel, message: string, showWindow: boolean = true) {
	switch (level) {
		case MessageLevel.DEBUG:
			outputDebug(message, showWindow);
			break;
		case MessageLevel.INFO:
			outputInfo(message, showWindow);
			break;
		case MessageLevel.WARN:
			outputWarn(message, showWindow);
			break;
		case MessageLevel.ERROR:
		case MessageLevel.FATAL:
		default:
			outputError(message, showWindow);
			break;
	}
}

export function outputWarn(message: string, showWindow: boolean = true) {
	if (MessageLevel.WARN >= LogLevel) {
		showOutputChannel(showWindow);
		getOutputChannel().appendLine(message);
	}
}

export function outputWarnByTime(message: string, showWindow: boolean = true) {
	outputWarn(nowText() + message, showWindow);
}

export function outputError(message: string, showWindow: boolean = true) {
	if (MessageLevel.ERROR >= LogLevel) {
		showOutputChannel(showWindow);
		getOutputChannel().appendLine(message);
	}
}

export function outputErrorByTime(message: string, showWindow: boolean = true) {
	outputError(nowText() + message, showWindow);
}

export function outputResult(text: string, showWindow: boolean = true) {
	getOutputChannel().appendLine(text);
	showOutputChannel(showWindow);
}

export function outputKeyInfo(text: string) {
	showOutputChannel(true, true);
	getOutputChannel().appendLine(text);
}

export function outputKeyInfoByTime(text: string) {
	outputKeyInfo(nowText() + text);
}

export function outputInfo(message: string, showWindow: boolean = true) {
	if (MessageLevel.INFO >= LogLevel) {
		getOutputChannel().appendLine(message);
		showOutputChannel(showWindow);
	}
}

export function outputInfoByTime(message: string, showWindow: boolean = true) {
	outputInfo(nowText() + message, showWindow);
}

export function outputInfoClearByTime(message: string, showWindow: boolean = true) {
	if (MessageLevel.INFO >= LogLevel) {
		clearOutputChannelByTimes();
		getOutputChannel().appendLine(nowText() + message);
		showOutputChannel(showWindow);
	}
}

export function outputInfoQuiet(message: string, showWindow: boolean = false) {
	if (MessageLevel.INFO >= LogLevel) {
		getOutputChannel().appendLine(message);
		showOutputChannel(showWindow, false);
	}
}

export function outputInfoQuietByTime(message: string, showWindow: boolean = false) {
	outputInfoQuiet(nowText() + message, showWindow);
}

export function outputDebugOrInfo(isDebug: boolean, message: string, showWindow: boolean = true) {
	if (isDebug) {
		outputDebug(message, showWindow);
	} else {
		outputInfo(message, showWindow);
	}
}

export function outputInfoByDebugMode(message: string, showWindow: boolean = true) {
	outputDebugOrInfo(!IsDebugMode, message, showWindow);
}

export function outputInfoByDebugModeByTime(message: string, showWindow: boolean = true) {
	outputDebugOrInfo(!IsDebugMode, nowText() + message, showWindow);
}

export function outputDebug(message: string, showWindow: boolean = false) {
	if (MessageLevel.DEBUG >= LogLevel) {
		getOutputChannel().appendLine(message);
		showOutputChannel(showWindow);
	}
}

export function outputDebugByTime(message: string, showWindow: boolean = false) {
	outputDebug('\n' + nowText(message), showWindow);
}

function clearOutputChannel() {
	getOutputChannel().clear();
}

export function clearOutputChannelByTimes(circle: number = 1000) {
	if (OutputTimes % circle == 0) {
		clearOutputChannel();
	}
	OutputTimes++;
}

export function enableColorAndHideCommandLine(cmd: string, removeSearchWordHint: boolean = true): string {
	let hasFound = false;
	for (let k = 0; k < SearchRegexList.length; k++) {
		let match = cmd.match(SearchRegexList[k]);
		if (match && match.index !== undefined) {
			hasFound = true;
			const text1 = cmd.substring(0, match.index);
			const text2 = cmd.substring(match.index, match.index + match[0].length);
			const text3 = cmd.substring(match.index + match[0].length);
			cmd = replaceTextByRegex(text1, ShowColorHideCmdRegex, '$1') + text2 + replaceTextByRegex(text3, ShowColorHideCmdRegex, '$1');
		}
	}

	if (!hasFound) {
		cmd = replaceTextByRegex(cmd, ShowColorHideCmdRegex, '$1');
	}

	if (removeSearchWordHint) {
		cmd = cmd.replace(/\s+Search\s+%~?1[\s\w]*/, ' ');
	}

	return cmd.replace(/\s+Search\s*$/, '');
}

export function checkIfSupported(): boolean {
	if (IsSupportedSystem) {
		return true;
	}

	outputErrorByTime('Sorry, "' + process.platform + ' ' + process.arch + ' " is not supported yet.');
	outputErrorByTime('https://github.com/qualiu/vscode-msr/blob/master/README.md');
	return false;
}

function showOutputChannel(showWindow: boolean = true, ignoreQuiet: boolean = false) {
	if (showWindow && (ignoreQuiet || !IsQuiet)) {
		getOutputChannel().show(true);
	}
}

function getOutputChannel(): vscode.OutputChannel {
	if (!MessageChannel) {
		MessageChannel = vscode.window.createOutputChannel(OutputChannelName);
	}

	return MessageChannel;
}
