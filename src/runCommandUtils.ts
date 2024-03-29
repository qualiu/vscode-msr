import { execSync } from 'child_process';
import * as vscode from 'vscode';
import { IsMacOS, IsWindows, RunCmdTerminalName, getDefaultRepoFolderByActiveFile, isNullOrEmpty } from './constants';
import { ShellPath, UsePowershell, enableColorAndHideCommandLine, outputDebugByTime } from "./outputUtils";
import { IsLinuxTerminalOnWindows } from './terminalUtils';
import os = require('os');

const ClearCmd = IsWindows && !UsePowershell ? 'cls' : "clear";

// MSR-RUN-CMD terminal
let RunCmdTerminal: vscode.Terminal | undefined;

export function getRunCmdTerminal(): vscode.Terminal {
  const [terminal] = getRunCmdTerminalWithInfo();
  return terminal;
}

export function getRunCmdTerminalWithInfo(): [vscode.Terminal, boolean] {
  if (RunCmdTerminal) {
    return [RunCmdTerminal, false];
  }

  if (vscode.window.terminals && vscode.window.terminals.length > 0) {
    for (let k = 0; k < vscode.window.terminals.length; k++) {
      if (vscode.window.terminals[k].name === RunCmdTerminalName) {
        RunCmdTerminal = vscode.window.terminals[k];
        return [RunCmdTerminal, false];
      }
    }
  }

  const currentProjectFolder = getDefaultRepoFolderByActiveFile(true);
  const option: vscode.TerminalOptions = {
    shellPath: ShellPath,
    name: RunCmdTerminalName,
    cwd: currentProjectFolder
  }

  RunCmdTerminal = vscode.window.createTerminal(option);
  return [RunCmdTerminal, true];
}

export function disposeTerminal() {
  RunCmdTerminal = undefined;
}

export function runCommandInTerminal(command: string, showTerminal = false, clearAtFirst = false, isLinuxOnWindows = IsLinuxTerminalOnWindows) {
  command = enableColorAndHideCommandLine(command);
  sendCommandToTerminal(command, getRunCmdTerminal(), showTerminal, clearAtFirst, isLinuxOnWindows);
}

export function runRawCommandInTerminal(command: string, showTerminal = true, clearAtFirst = false, isLinuxOnWindows = IsLinuxTerminalOnWindows) {
  sendCommandToTerminal(command, getRunCmdTerminal(), showTerminal, clearAtFirst, isLinuxOnWindows);
}

export function sendCommandToTerminal(command: string, terminal: vscode.Terminal, showTerminal = false, clearAtFirst = false, isLinuxOnWindows = IsLinuxTerminalOnWindows) {
  if (isNullOrEmpty(command)) {
    return;
  }

  const searchAndListPattern = /\s+(-i?[tx]|-l)\s+/;
  if (command.startsWith("msr") && !command.match(searchAndListPattern)) {
    outputDebugByTime("Skip running command due to not found none of matching names of -x or -t, command = " + command);
    return;
  }

  if (showTerminal) {
    terminal.show();
  }
  if (clearAtFirst) {
    // vscode.commands.executeCommand('workbench.action.terminal.clear');
    terminal.sendText((isLinuxOnWindows || IsMacOS ? 'clear' : ClearCmd) + os.EOL, true);
  }

  terminal.sendText(command.trim() + os.EOL, true);
  if (IsMacOS) { // MacOS terminal will break if sending command lines to fast.
    try {
      const sleepMilliseconds = command.trim().length / 1000;
      execSync('sleep ' + sleepMilliseconds);
    } catch (error) {
      console.log(error);
    }
  }
}
