'use strict';

import * as vscode from 'vscode';
import { getConfig } from './dynamicConfig';
import { IsWindows } from './checkTool';
import { replaceTextByRegex } from './utils';

export const RunCmdTerminalName = 'MSR-RUN-CMD';
const OutputChannelName = 'MSR-Def-Ref';

// When searching plain text, powershell requires extra escaping (like '$').
const UsePowershell = false;
const WindowsShell = UsePowershell ? 'powershell' : 'cmd.exe';
const ShellPath = IsWindows ? WindowsShell : 'bash';
const ClearCmd = IsWindows && !UsePowershell ? 'cls' : "clear";

const ShowColorHideCmdRegex = /\s+-[Cc](\s+|$)/g;

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

export function runCommandInTerminal(cmd: string, mustShowTerminal: boolean = false) {
	cmd = enableColorAndHideCommandline(cmd);
	// cmd += ' -M '; // to hide summary.
	showTerminal(mustShowTerminal);
	//vscode.commands.executeCommand('workbench.action.terminal.clear');
	getTerminal().sendText(ClearCmd);
	getTerminal().sendText(cmd);
	showTerminal(mustShowTerminal);
}

export function outputWarn(message: string) {
	getOutputChannel().appendLine(message);
	showOutputChannel();
}

export function outputError(message: string) {
	getOutputChannel().appendLine(message);
	showOutputChannel();
}

export function outputResult(text: string) {
	getOutputChannel().appendLine(text);
	showOutputChannel();
}

export function outputInfo(message: string) {
	if (getConfig().ShowInfo && !getConfig().IsQuiet) {
		getOutputChannel().appendLine(message);
		showOutputChannel();
	}
}

export function outputDebugOrInfo(isDebug: boolean, message: string) {
	if (isDebug) {
		outputDebug(message);
	} else {
		outputInfo(message);
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

export function enableColorAndHideCommandline(cmd: string): string {
	return replaceTextByRegex(cmd, ShowColorHideCmdRegex, '$1');
}

function showTerminal(mustShowTerminal: boolean = false) {
	if (mustShowTerminal || !getConfig().IsQuiet) {
		getTerminal().show(true);
	}
}

function showOutputChannel(showWindow: boolean = true) {
	if (showWindow && !getConfig().IsQuiet) {
		getOutputChannel().show(true);
	}
}

function getOutputChannel(): vscode.OutputChannel {
	if (!_channel) {
		_channel = vscode.window.createOutputChannel(OutputChannelName);
	}

	return _channel;
}
