'use strict';

import * as vscode from 'vscode';
import { getConfig } from './dynamicConfig';
import { IsWindows } from './checkTool';

// When searching plain text, powershell requires extra escaping (like '$').
const UsePowershell = false;
const WindowsShell = UsePowershell ? 'powershell' : 'cmd.exe';
const ShellPath = IsWindows ? WindowsShell : 'bash';
const ClearCmd = IsWindows && !UsePowershell ? 'cls' : "clear";

const ShowColorHideCmdRegex = /\s+-[Cc](\s+|$)/g;

let _channel: vscode.OutputChannel;
let _terminal: vscode.Terminal;

export function getTerminal(): vscode.Terminal {
	if (!_terminal) {
		_terminal = vscode.window.createTerminal('MSR-RUN-CMD', ShellPath);
	}

	return _terminal;
}

export function runCommandInTerminal(cmd: string, mustShowTerminal: boolean = false) {
	cmd = enableColorAndHideSummary(cmd);
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

export function outputInfo(message: string) {
	if (getConfig().ShowInfo) {
		getOutputChannel().appendLine(message);
		showOutputChannel();
	}
}

export function outputDebug(message: string) {
	if (getConfig().IsDebug) {
		getOutputChannel().appendLine(message);
		showOutputChannel();
	}
}

export function clearOutputChannel() {
	getOutputChannel().clear();
}

export function enableColorAndHideSummary(cmd: string): string {
	return cmd.replace(ShowColorHideCmdRegex, ' ').replace(ShowColorHideCmdRegex, ' ');
}

function showTerminal(mustShowTerminal: boolean = false) {
	if (mustShowTerminal || getConfig().IsQuiet !== true) {
		getTerminal().show(true);
	}
}

function showOutputChannel() {
	if (getConfig().IsQuiet !== true) {
		getOutputChannel().show(true);
	}
}

function getOutputChannel(): vscode.OutputChannel {
	if (!_channel) {
		_channel = vscode.window.createOutputChannel('MSR-Def-Ref');
	}

	return _channel;
}
