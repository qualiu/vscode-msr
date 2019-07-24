'use strict';

import * as vscode from 'vscode';
import { getConfig } from './dynamicConfig';

const ShowColorHideCmdRegex = /\s+-[Cc](\s+|$)/g;

let _channel: vscode.OutputChannel;
let _terminal: vscode.Terminal;

export function getTerminal(): vscode.Terminal {
	if (!_terminal) {
		_terminal = vscode.window.createTerminal('MSR-RUN-CMD'); //, IsWindows ? 'cmd.exe' : 'bash');
	}

	return _terminal;
}

export function enableColorAndHideSummary(cmd: string): string {
	return cmd.replace(ShowColorHideCmdRegex, ' ').replace(ShowColorHideCmdRegex, ' ');
}

export function runCommandInTerminal(cmd: string, showTipOfDisableRunning: boolean = true) {
	cmd = enableColorAndHideSummary(cmd);

	// cmd += ' -M '; // to hide summary.
	getTerminal().show(true);
	//vscode.commands.executeCommand('workbench.action.terminal.clear');
	getTerminal().sendText('clear'); // IsWindows && IsCmd ? 'cls' : 'clear');
	getTerminal().sendText(cmd);
	if (showTipOfDisableRunning) {
		const tip = 'msr -aPA -z "If needless to re-run command here to show color + clickable results, decrease `msr.reRunCmdInTerminalIfCostLessThan` value." -it "((click\\w*)|(msr.\\w+))" -e "(.+)"';
		getTerminal().sendText(tip);
	}

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
