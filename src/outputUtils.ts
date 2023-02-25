import { execSync } from 'child_process';
import * as vscode from 'vscode';
import { IsDebugMode, IsSupportedSystem, IsWindows, OutputChannelName } from './constants';
import { nowText, replaceTextByRegex } from './utils';

// When searching plain text, powershell requires extra escaping (like '$').
export const UsePowershell = false;
const WindowsShell = UsePowershell ? 'powershell' : 'cmd.exe';
export const ShellPath = IsWindows ? WindowsShell : 'bash';
const ShowColorHideCmdRegex = /\s+-[Cc](\s+|$)/g;

let ShowInfo = true;
let IsQuiet = true;
export function setOutputChannel(showInfo: boolean, isQuiet: boolean) {
	ShowInfo = showInfo;
	IsQuiet = isQuiet;
}

export enum MessageLevel {
	None = 0,
	DEBUG = 1,
	INFO = 2,
	WARN = 3,
	ERROR = 4,
	FATAL = 5
}

export function runCommandGetInfo(command: string, showCmdLevel: MessageLevel = MessageLevel.INFO, errorOutputLevel: MessageLevel = MessageLevel.ERROR, outputLevel: MessageLevel = MessageLevel.INFO): [string, any] {
	try {
		outputMessage(showCmdLevel, command);
		const output = execSync(command).toString();
		if (output.length > 0) {
			outputMessage(outputLevel, output);
		}
		return [output, null];
	} catch (err) {
		outputMessage(errorOutputLevel, '\n' + err);
		return ['', err];
	}
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

// MSR-Def-Ref output channel
let MessageChannel: vscode.OutputChannel;

export function outputWarn(message: string, showWindow: boolean = true) {
	showOutputChannel(showWindow);
	getOutputChannel().appendLine(message);
}

export function outputError(message: string, showWindow: boolean = true) {
	showOutputChannel(showWindow);
	getOutputChannel().appendLine(message);
}

export function outputResult(text: string, showWindow: boolean = true) {
	getOutputChannel().appendLine(text);
	showOutputChannel(showWindow);
}

export function outputKeyInfo(text: string) {
	showOutputChannel(true, true);
	getOutputChannel().appendLine(text);
}

export function outputInfo(message: string, showWindow: boolean = true) {
	if (ShowInfo) {
		getOutputChannel().appendLine(message);
		showOutputChannel(showWindow);
	}
}

export function outputInfoClear(message: string, showWindow: boolean = true) {
	if (ShowInfo) {
		clearOutputChannel();
		getOutputChannel().appendLine(message);
		showOutputChannel(showWindow);
	}
}

export function outputInfoQuiet(message: string, showWindow: boolean = false) {
	if (ShowInfo) {
		getOutputChannel().appendLine(message);
		showOutputChannel(showWindow, false);
	}
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

export function outputDebug(message: string, showWindow: boolean = false) {
	if (ShowInfo) {
		getOutputChannel().appendLine(message);
		showOutputChannel(showWindow);
	}
}

export function clearOutputChannel() {
	getOutputChannel().clear();
}

export function enableColorAndHideCommandLine(cmd: string, removeSearchWordHint: boolean = true): string {
	let text = replaceTextByRegex(cmd, ShowColorHideCmdRegex, '$1');
	if (removeSearchWordHint) {
		text = text.replace(/\s+Search\s+%~?1[\s\w]*/, ' ');
	}

	return text.replace(/\s+Search\s*$/, '');
}

export function checkIfSupported(): boolean {
	if (IsSupportedSystem) {
		return true;
	}

	outputError(nowText() + 'Sorry, "' + process.platform + ' ' + process.arch + ' " is not supported yet: Support 64-bit + 32-bit : Windows + Linux (Ubuntu / CentOS / Fedora which gcc/g++ version >= 4.8).');
	outputError(nowText() + 'https://github.com/qualiu/vscode-msr/blob/master/README.md');
	return false;
}

export function showOutputChannel(showWindow: boolean = true, ignoreQuiet: boolean = false) {
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
