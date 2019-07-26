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

export function enableColorAndHideSummary(cmd: string): string {
	return cmd.replace(ShowColorHideCmdRegex, ' ').replace(ShowColorHideCmdRegex, ' ');
}

export function runCommandInTerminal(cmd: string) {
	cmd = enableColorAndHideSummary(cmd);
	// cmd += ' -M '; // to hide summary.
	getTerminal().show(true);
	//vscode.commands.executeCommand('workbench.action.terminal.clear');
	getTerminal().sendText(ClearCmd);
	getTerminal().sendText(cmd);
	getTerminal().show(true);
}

function getOutputChannel(): vscode.OutputChannel {
	if (!_channel) {
		_channel = vscode.window.createOutputChannel('MSR-Def-Ref');
	}

	return _channel;
}

export function outputWarn(message: string) {
	getOutputChannel().appendLine(message);
	getOutputChannel().show(true);
}

export function outputError(message: string) {
	getOutputChannel().appendLine(message);
	getOutputChannel().show(true);
}

export function outputInfo(message: string) {
	getOutputChannel().appendLine(message);
	getOutputChannel().show(true);
}

export function outputLogInfo(message: string) {
	if (getConfig().ShowInfo) {
		getOutputChannel().appendLine(message);
		getOutputChannel().show(true);
	}
}

export function clearOutputChannel() {
	getOutputChannel().clear();
}

export function outDebug(message: string) {
	if (getConfig().IsDebug) {
		getOutputChannel().appendLine(message);
		getOutputChannel().show(true);
	}
}
