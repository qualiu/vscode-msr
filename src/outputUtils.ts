import * as vscode from 'vscode';
import { getConfig } from './dynamicConfig';
import { replaceTextByRegex } from './utils';
import { IsWindows } from './constants';

export const RunCmdTerminalName = 'MSR-RUN-CMD';
const OutputChannelName = 'MSR-Def-Ref';

// When searching plain text, powershell requires extra escaping (like '$').
const UsePowershell = false;
const WindowsShell = UsePowershell ? 'powershell' : 'cmd.exe';
const ShellPath = IsWindows ? WindowsShell : 'bash';
const ClearCmd = IsWindows && !UsePowershell ? 'cls' : "clear";

const ShowColorHideCmdRegex = /\s+-[Cc](\s+|$)/g;

export enum MessageLevel {
	DEBUG = 0,
	INFO = 1,
	WARN = 2,
	ERROR = 3,
	FATAL = 4
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

let _channel: vscode.OutputChannel;
let _terminal: vscode.Terminal | undefined;

export function getTerminal(): vscode.Terminal {
	if (!_terminal) {
		_terminal = vscode.window.createTerminal(RunCmdTerminalName, ShellPath);
	}

	return _terminal;
}

export function disposeTerminal() {
	_terminal = undefined;
}

export function runCommandInTerminal(cmd: string, mustShowTerminal: boolean = false, clearTerminalAtFirst = true) {
	cmd = enableColorAndHideCommandLine(cmd);
	// cmd += ' -M '; // to hide summary.
	showTerminal(mustShowTerminal);
	if (clearTerminalAtFirst) {
		// vscode.commands.executeCommand('workbench.action.terminal.clear');
		getTerminal().sendText(ClearCmd);
	} else {
		getTerminal().sendText('\n');
	}

	getTerminal().sendText(cmd);
	showTerminal(mustShowTerminal);
}

export function outputWarn(message: string, showWindow: boolean = true) {
	getOutputChannel().appendLine(message);
	showOutputChannel(showWindow);
}

export function outputError(message: string, showWindow: boolean = true) {
	getOutputChannel().appendLine(message);
	showOutputChannel(showWindow);
}

export function outputResult(text: string, showWindow: boolean = true) {
	getOutputChannel().appendLine(text);
	showOutputChannel(showWindow);
}

export function outputKeyInfo(text: string) {
	getOutputChannel().appendLine(text);
	showOutputChannel(true, true);
}

export function outputInfo(message: string, showWindow: boolean = true) {
	if (getConfig().ShowInfo && !getConfig().IsQuiet) {
		getOutputChannel().appendLine(message);
		showOutputChannel(showWindow);
	}
}

export function outputDebugOrInfo(isDebug: boolean, message: string, showWindow: boolean = true) {
	if (isDebug) {
		outputDebug(message, showWindow);
	} else {
		outputInfo(message, showWindow);
	}
}

export function outputDebug(message: string, showWindow: boolean = true) {
	if (getConfig().IsDebug) {
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
		text = replaceTextByRegex(text, /\s+Search\s+%~?1[\s\w]*/, ' ');
	}

	return text.replace(/\s+Search\s*$/, '');
}

function showTerminal(mustShowTerminal: boolean = false) {
	if (mustShowTerminal || !getConfig().IsQuiet) {
		getTerminal().show(true);
	}
}

function showOutputChannel(showWindow: boolean = true, ignoreQuiet: boolean = false) {
	if (showWindow && (ignoreQuiet || !getConfig().IsQuiet)) {
		getOutputChannel().show(true);
	}
}

function getOutputChannel(): vscode.OutputChannel {
	if (!_channel) {
		_channel = vscode.window.createOutputChannel(OutputChannelName);
	}

	return _channel;
}
