import { execSync } from 'child_process';
import * as vscode from 'vscode';
import { IsMacOS, IsWindows, RunCmdTerminalName } from './constants';
import { cookCmdShortcutsOrFile } from './cookCommandAlias';
import { WorkspaceToGitIgnoreMap } from './dynamicConfig';
import { enableColorAndHideCommandLine, outputDebugByTime, ShellPath, UsePowershell } from "./outputUtils";
import { IsLinuxTerminalOnWindows } from './terminalUtils';
import { getDefaultRootFolderByActiveFile } from "./utils";
import os = require('os');

const ClearCmd = IsWindows && !UsePowershell ? 'cls' : "clear";

// MSR-RUN-CMD terminal
let RunCmdTerminal: vscode.Terminal | undefined;

export function getRunCmdTerminal(autoInitTerminal: boolean = true): vscode.Terminal {
  const [terminal] = getRunCmdTerminalWithInfo(autoInitTerminal);
  return terminal;
}

export function getRunCmdTerminalWithInfo(autoInitTerminal: boolean = true): [vscode.Terminal, boolean] {
  if (RunCmdTerminal) {
    return [RunCmdTerminal, false];
  }

  if (!RunCmdTerminal && vscode.window.terminals && vscode.window.terminals.length > 0) {
    for (let k = 0; k < vscode.window.terminals.length; k++) {
      if (vscode.window.terminals[k].name === RunCmdTerminalName) {
        RunCmdTerminal = vscode.window.terminals[k];
      }
    }
  }

  // TODO: record terminal folder if workspace count > 1 for reloading/recover.
  const currentProjectFolder = getDefaultRootFolderByActiveFile(true);
  const hasCreated = !RunCmdTerminal;
  if (!RunCmdTerminal) {
    const option: vscode.TerminalOptions = {
      shellPath: ShellPath,
      name: RunCmdTerminalName,
      cwd: currentProjectFolder
    }
    RunCmdTerminal = vscode.window.createTerminal(option);
  }

  if (!autoInitTerminal) { // git ignore loaded for workspaces
    return [RunCmdTerminal, hasCreated];
  }

  // init command alias for MSR-RUN-CMD terminal if it's recovered or just created.
  cookCmdShortcutsOrFile(false, currentProjectFolder, true, false, RunCmdTerminal, hasCreated);
  const gitIgnore = WorkspaceToGitIgnoreMap.get(currentProjectFolder);
  if (gitIgnore) {
    gitIgnore.exportSkipPathVariable(true);
  }

  return [RunCmdTerminal, hasCreated];
}

export function disposeTerminal() {
  RunCmdTerminal = undefined;
}

export function runCommandInTerminal(command: string, showTerminal = false, clearAtFirst = true, isLinuxOnWindows = IsLinuxTerminalOnWindows) {
  command = enableColorAndHideCommandLine(command);
  sendCommandToTerminal(command, getRunCmdTerminal(), showTerminal, clearAtFirst, isLinuxOnWindows);
}

export function runRawCommandInTerminal(command: string, showTerminal = true, clearAtFirst = false, isLinuxOnWindows = IsLinuxTerminalOnWindows) {
  sendCommandToTerminal(command, getRunCmdTerminal(), showTerminal, clearAtFirst, isLinuxOnWindows);
}

export function sendCommandToTerminal(command: string, terminal: vscode.Terminal, showTerminal = false, clearAtFirst = true, isLinuxOnWindows = IsLinuxTerminalOnWindows) {
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
