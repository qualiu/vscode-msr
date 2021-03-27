import fs = require('fs');
import path = require('path');
import os = require('os');
import ChildProcess = require('child_process');
import * as vscode from 'vscode';
import { IsLinux, IsWindows, IsWSL } from "./constants";
import { TerminalType } from "./enums";
import { outputDebug, outputError, outputInfo } from "./outputUtils";
import { DefaultTerminalType, isNullOrEmpty, IsWindowsTerminalOnWindows, nowText, runCommandGetOutput } from "./utils";

let BashExePath = '';
let PowershellExePath = '';

export function saveTextToFile(filePath: string, text: string, info: string = 'file', tryTimes: number = 3): boolean {
  for (let k = 1; k <= tryTimes; k++) {
    try {
      fs.writeFileSync(filePath, text);
      if (k > 1) {
        outputInfo(nowText() + 'Times-' + k + ': Successfully saved ' + info + ': ' + filePath);
      }
      return true;
    } catch (err) {
      outputError(nowText() + 'Times-' + k + ': Failed to save ' + info + ': ' + filePath + ' Error: ' + err.toString());
      if (k >= tryTimes) {
        return false;
      }
    }
  }

  return false;
}

export function isToolExistsInPath(exeToolName: string, terminalType: TerminalType = DefaultTerminalType): [boolean, string] {
  const whereCmd = (IsWindows ? 'where' : 'whereis') + ' ' + exeToolName;
  try {
    let output = ChildProcess.execSync(whereCmd).toString();
    if (IsWindows) {
      if (TerminalType.CygwinBash === terminalType) {
        const exeTitle = exeToolName.replace(/^(msr|nin).*/, '$1');
        const folder = path.dirname(getTerminalShellExePath());
        const binExe = path.join(folder, exeTitle);
        if (fs.existsSync(binExe)) {
          return [true, binExe];
        }
        const homeExe = path.join(path.dirname(folder), 'home', os.userInfo().username, exeTitle);
        if (fs.existsSync(homeExe)) {
          return [true, homeExe];
        }
        outputError(nowText() + 'Not found any of: ' + binExe + ' + ' + homeExe + ' for ' + TerminalType[terminalType] + ' terminal.');
      } else {
        const exePaths = /\.exe$/i.test(exeToolName)
          ? output.split(/[\r\n]+/)
          : output.split(/[\r\n]+/).filter(a => !/cygwin/i.test(a) && new RegExp('\\b' + exeToolName + '\\.\\w+$', 'i').test(a));

        if (exePaths.length > 0) {
          return [true, exePaths[0]];
        }
      }
    } else {
      const exeMatch = new RegExp('(\\S+/' + exeToolName + ')(\\s+|$)').exec(output);
      if (exeMatch) {
        return [true, exeMatch[1]];
      }
    }
  } catch (err) {
    outputDebug(nowText() + err.toString());
  }

  return [false, ''];
}

export function getTerminalInitialDirectory(terminal: vscode.Terminal | null | undefined): string {
  if (!terminal) {
    return '';
  }

  try {
    const creationOptions = Reflect.get(terminal, 'creationOptions');
    const terminalCwd = Reflect.get(creationOptions, 'cwd');
    const terminalCurrentFolder = Reflect.get(terminalCwd, 'fsPath');
    return terminalCurrentFolder;
  } catch (err) {
    console.error('Cannot get creationOptions.cwd.fsPath from terminal: ' + terminal.name);
    return '';
  }
}

export function getTerminalShellExePath(): string {
  // https://code.visualstudio.com/docs/editor/integrated-terminal#_configuration
  const shellConfig = vscode.workspace.getConfiguration('terminal.integrated.shell');
  const shellExePath = !shellConfig ? '' : shellConfig.get(IsWindows ? 'windows' : 'linux') as string || '';
  if (isNullOrEmpty(shellExePath)) {
    if (IsWSL || IsLinux) {
      if (isNullOrEmpty(BashExePath)) {
        const [, bashPath] = isToolExistsInPath('bash');
        BashExePath = bashPath || '/bin/bash';
      }
      return BashExePath;
    }

    if (IsWindowsTerminalOnWindows) {
      if (isNullOrEmpty(PowershellExePath)) {
        const [isExist, psPath] = isToolExistsInPath('powershell.exe');
        PowershellExePath = isExist ? psPath : runCommandGetOutput('msr -rp C:\\Windows\\System32\\WindowsPowerShell -f "^powershell.exe$" -l -PAC -H 1 -J | findstr /I /C:exe').trim();
        if (isNullOrEmpty(PowershellExePath)) {
          PowershellExePath = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
        }
      }

      return PowershellExePath;
    }
  }

  return shellExePath;
}

export function getTerminalNameOrShellExeName(terminal: vscode.Terminal | null | undefined): string {
  if (!terminal) {
    return '';
  }

  if (!isNullOrEmpty(terminal.name)) {
    return terminal.name;
  }

  const shellExePath = getTerminalShellExePath();
  return path.basename(shellExePath);
}

export function getHomeFolderForLinuxTerminalOnWindows(): string {
  const shellExePath = getTerminalShellExePath();
  const folder = path.dirname(shellExePath);
  const home = path.join(path.dirname(folder), 'home', os.userInfo().username);
  return home;
}
