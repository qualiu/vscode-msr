import { execSync } from 'child_process';
import * as vscode from 'vscode';
import { IsDebugMode, IsWindows, OutputChannelName, RunCmdTerminalName } from './constants';
import { cookCmdShortcutsOrFile, CookCmdTimesForRunCmdTerminal } from './cookCommandAlias';
import { getConfig } from './dynamicConfig';
import { getDefaultRootFolder, getDefaultRootFolderByActiveFile, IsLinuxTerminalOnWindows, nowText, replaceTextByRegex } from './utils';

export let RunCmdTerminalRootFolder = '';

// When searching plain text, powershell requires extra escaping (like '$').
const UsePowershell = false;
const WindowsShell = UsePowershell ? 'powershell' : 'cmd.exe';
export const ShellPath = IsWindows ? WindowsShell : 'bash';
const ClearCmd = IsWindows && !UsePowershell ? 'cls' : "clear";

const ShowColorHideCmdRegex = /\s+-[Cc](\s+|$)/g;

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
		outputMessage(errorOutputLevel, '\n' + err.toString());
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
let _messageChannel: vscode.OutputChannel;

// MSR-RUN-CMD terminal
let _runCmdTerminal: vscode.Terminal | undefined;

export function getRunCmdTerminal(): vscode.Terminal {
	if (!_runCmdTerminal) {
		_runCmdTerminal = vscode.window.createTerminal(RunCmdTerminalName, ShellPath);
		if (vscode.workspace.getConfiguration('msr').get('initProjectCmdAliasForNewTerminals') as boolean) {
			const rootFolder = getDefaultRootFolderByActiveFile() || getDefaultRootFolder();
			RunCmdTerminalRootFolder = rootFolder.includes('/') ? rootFolder + '/' : rootFolder + '\\';
			if (CookCmdTimesForRunCmdTerminal < 1) {
				cookCmdShortcutsOrFile(rootFolder, true, false, _runCmdTerminal);
			}
		}
	}

	return _runCmdTerminal;
}

export function disposeTerminal() {
	_runCmdTerminal = undefined;
}

export function runCommandInTerminal(cmd: string, showTerminal = false, clearAtFirst = true, isLinuxOnWindows = IsLinuxTerminalOnWindows) {
	cmd = enableColorAndHideCommandLine(cmd);
	sendCmdToTerminal(cmd, getRunCmdTerminal(), showTerminal, clearAtFirst, isLinuxOnWindows);
}

export function runRawCommandInTerminal(cmd: string, showTerminal = true, clearAtFirst = false, isLinuxOnWindows = IsLinuxTerminalOnWindows) {
	sendCmdToTerminal(cmd, getRunCmdTerminal(), showTerminal, clearAtFirst, isLinuxOnWindows);
}

export function sendCmdToTerminal(cmd: string, terminal: vscode.Terminal, showTerminal = false, clearAtFirst = true, isLinuxOnWindows = IsLinuxTerminalOnWindows) {
	const searchAndListPattern = /\s+(-i?[tx]|-l)\s+/;
	if (cmd.startsWith("msr") && !cmd.match(searchAndListPattern)) {
		outputDebug(nowText() + "Skip running command due to not found none of matching names of -x or -t, command = " + cmd);
		return;
	}

	if (showTerminal) {
		terminal.show();
	}

	if (clearAtFirst) {
		clearTerminal(terminal, isLinuxOnWindows);
	} else {
		terminal.sendText('\n');
	}

	terminal.sendText(cmd);
}

export function clearTerminal(terminal: vscode.Terminal, isLinuxOnWindows = IsLinuxTerminalOnWindows) {
	// vscode.commands.executeCommand('workbench.action.terminal.clear');
	terminal.sendText(isLinuxOnWindows ? 'clear' : ClearCmd);
}

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
	if (getConfig().ShowInfo) {
		getOutputChannel().appendLine(message);
		showOutputChannel(showWindow);
	}
}

export function outputInfoQuiet(message: string, showWindow: boolean = false) {
	if (getConfig().ShowInfo) {
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
		text = text.replace(/\s+Search\s+%~?1[\s\w]*/, ' ');
	}

	return text.replace(/\s+Search\s*$/, '');
}

export function showOutputChannel(showWindow: boolean = true, ignoreQuiet: boolean = false) {
	if (showWindow && (ignoreQuiet || !getConfig().IsQuiet)) {
		getOutputChannel().show(true);
	}
}

function getOutputChannel(): vscode.OutputChannel {
	if (!_messageChannel) {
		_messageChannel = vscode.window.createOutputChannel(OutputChannelName);
	}

	return _messageChannel;
}
