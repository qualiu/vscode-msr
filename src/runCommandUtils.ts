import { execSync } from 'child_process';
import * as vscode from 'vscode';
import { getPostInitCommands } from './configUtils';
import { DefaultRepoFolderName, IsMacOS, IsWindows, RunCmdTerminalName, getDefaultRepoFolderByActiveFile, isNullOrEmpty } from './constants';
import { TerminalType } from './enums';
import { ShellPath, UsePowershell, enableColorAndHideCommandLine, outputDebugByTime } from "./outputUtils";
import { DefaultTerminalType, IsLinuxTerminalOnWindows, IsWindowsTerminalOnWindows, getTipFileDisplayPath, getTipFileStoragePath, isLinuxTerminalOnWindows, isWindowsTerminalOnWindows } from './terminalUtils';
import { quotePaths } from './utils';
import os = require('os');
import fs = require('fs');

const ClearCmd = IsWindows && !UsePowershell ? 'cls' : "clear";

// Queue for newly created Pwsh terminals: collects commands instead of sending them immediately.
// This avoids PSReadLine paste detection which concatenates rapid multiple sendText() calls into one line.
// See: https://github.com/microsoft/vscode/issues/236397 ("PSReadLine is swallowing the \r")
const PendingPwshCommands = new Map<vscode.Terminal, string[]>();

// Enable deferred send mode for a newly created Pwsh terminal.
// All subsequent sendCommandToTerminal() calls for this terminal will queue commands instead of sending.
export function enablePwshDeferredSend(terminal: vscode.Terminal): void {
  PendingPwshCommands.set(terminal, []);
}

// Flush all queued commands: combine with ' ; ' and send as ONE sendText() call.
// Single sendText() avoids PSReadLine paste detection that would concatenate multiple rapid sends.
export function flushPwshDeferredCommands(terminal: vscode.Terminal): void {
  const commands = PendingPwshCommands.get(terminal);
  PendingPwshCommands.delete(terminal);
  if (commands && commands.length > 0) {
    const combinedCmd = commands.join(' ; ');
    outputDebugByTime(`Flushing ${commands.length} deferred Pwsh commands: ${combinedCmd.substring(0, 200)}...`);
    terminal.sendText(combinedCmd, true);
  }
}

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

export function runPostInitCommands(terminal: vscode.Terminal | null | undefined, terminalType: TerminalType, repoFolderName: string) {
  if (!terminal) {
    return;
  }
  const postInitCommand = getPostInitCommands(terminalType, repoFolderName);
  if (isNullOrEmpty(postInitCommand)) {
    return;
  }
  sendCommandToTerminal(postInitCommand, terminal, true, false, isLinuxTerminalOnWindows(terminalType));
}

function checkInitRunCommandTerminal(): vscode.Terminal {
  const [terminal, isNewTerminal] = getRunCmdTerminalWithInfo();
  if (isNewTerminal) {
    // User closed MSR-RUN-CMD terminal + use menu search which triggers a new MSR-RUN-CMD terminal
    const defaultRepoFolder = getDefaultRepoFolderByActiveFile(true);
    if (isNullOrEmpty(defaultRepoFolder)) {
      if (terminal.name === RunCmdTerminalName) {
        const tipFilePath = getTipFileStoragePath(DefaultTerminalType);
        if (fs.existsSync(tipFilePath)) {
          const commandHead = isWindowsTerminalOnWindows(DefaultTerminalType) ? "call " : "bash ";
          const tipCmd = commandHead + quotePaths(getTipFileDisplayPath(DefaultTerminalType));
          sendCommandToTerminal(tipCmd, terminal);
        }
      }
    } else {
      sendCommandToTerminal(`use-this-alias`, terminal);
    }
    // const postInitCommand = getPostInitCommands(, DefaultRepoFolderName);
    runPostInitCommands(terminal, IsWindowsTerminalOnWindows ? TerminalType.CMD : TerminalType.LinuxBash, DefaultRepoFolderName)
  }
  return terminal;
}

export function runCommandInTerminal(command: string, showTerminal = false, clearAtFirst = false, isLinuxOnWindows = IsLinuxTerminalOnWindows) {
  command = enableColorAndHideCommandLine(command);
  sendCommandToTerminal(command, checkInitRunCommandTerminal(), showTerminal, clearAtFirst, isLinuxOnWindows);
}

export function runRawCommandInTerminal(command: string, showTerminal = true, clearAtFirst = false, isLinuxOnWindows = IsLinuxTerminalOnWindows) {
  sendCommandToTerminal(command, checkInitRunCommandTerminal(), showTerminal, clearAtFirst, isLinuxOnWindows);
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

  const trimmedCmd = command.trim();

  // If this terminal has deferred mode enabled (newly created Pwsh), queue instead of sending
  if (PendingPwshCommands.has(terminal)) {
    if (trimmedCmd.length > 0) {
      PendingPwshCommands.get(terminal)!.push(trimmedCmd);
      outputDebugByTime(`Queued deferred Pwsh command: ${trimmedCmd.substring(0, 120)}`);
    }
    return;
  }

  const cmdSuffix = (!IsWindows || isLinuxOnWindows) && !trimmedCmd.endsWith(';') ? ' ;' : '';
  terminal.sendText(trimmedCmd + cmdSuffix + os.EOL, true);
  if (IsMacOS) { // MacOS terminal will break if sending command lines to fast.
    try {
      const sleepMilliseconds = command.trim().length / 1000;
      execSync('sleep ' + sleepMilliseconds);
    } catch (error) {
      console.log(error);
    }
  }
}
