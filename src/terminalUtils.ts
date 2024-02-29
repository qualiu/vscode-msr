import * as vscode from 'vscode';
import { Terminal } from 'vscode';
import { getTipGuideFileName, HomeFolder, InitLinuxTerminalFileName, IsLinux, isNullOrEmpty, IsWindows, IsWSL, TempStorageFolder } from './constants';
import { TerminalType } from './enums';
import { outputDebugByTime, outputErrorByTime } from './outputUtils';
import { getErrorMessage, MatchWindowsDiskRegex, quotePaths, replaceToForwardSlash, runCommandGetOutput } from './utils';
import fs = require('fs');
import path = require('path');
import os = require('os');
import ChildProcess = require('child_process');

export function getTerminalExeFromVsCodeSettings(): string {
  const shellConfig = vscode.workspace.getConfiguration('terminal.integrated.shell');
  const exePath = shellConfig.get(IsWindows ? 'windows' : 'linux') as string || '';
  return exePath;
}

export function getCmdAliasScriptFolder(): string {
  const folder = vscode.workspace.getConfiguration('msr').get('cmdAlias.saveFolder') as string;
  return isNullOrEmpty(folder) ? HomeFolder : folder.trim();
}

// return ~/cmdAlias/ or ~/cmdAlias/cygwin/ or /tmp/
export function getCmdAliasSaveFolder(isMultipleScripts: boolean, isForProjectCmdAlias: boolean, terminalType: TerminalType): string {
  // avoid random folder in Darwin like: '/var/folders/7m/f0z72nfn3nn6_mnb_0000gn/T'
  const terminalTypeText = TerminalType[terminalType].toLowerCase()
    .replace(/bash$/i, '')
    .replace(/PowerShell$/i, 'cmd');

  const generalFolder = toStoragePath(getCmdAliasScriptFolder());
  const isNativeTerminal = isWindowsTerminalOnWindows(terminalType) || !IsWindows;
  if (isNativeTerminal && !isMultipleScripts && !isForProjectCmdAlias) {
    return generalFolder;
  }

  const parentFolder = isForProjectCmdAlias && !isMultipleScripts ? TempStorageFolder : path.join(generalFolder, 'cmdAlias');
  const shouldSeparate = isLinuxTerminalOnWindows(terminalType) || (isMultipleScripts && (IsWSL || IsWindows));

  return shouldSeparate
    ? path.join(parentFolder, terminalTypeText)
    : parentFolder;
}

export function getTipFileStoragePath(terminalType: TerminalType): string {
  const isWindowsTerminal = isWindowsTerminalOnWindows(terminalType);
  const tmpAliasStorageFolder = getCmdAliasSaveFolder(false, true, terminalType);
  return toStoragePath(path.join(tmpAliasStorageFolder, getTipGuideFileName(isWindowsTerminal)));
}

export function getTipFileDisplayPath(terminalType: TerminalType): string {
  const displayPath = toTerminalPath(getTipFileStoragePath(terminalType));
  return isWindowsTerminalOnWindows(terminalType)
    ? displayPath.replace(TempStorageFolder, '%TMP%')
    : displayPath;
}

export function getInitLinuxScriptStoragePath(terminalType: TerminalType,): string {
  const folder = path.dirname(getTipFileStoragePath(terminalType));
  return path.join(folder, InitLinuxTerminalFileName);
}

export function getInitLinuxScriptDisplayPath(terminalType: TerminalType): string {
  const storagePath = getInitLinuxScriptStoragePath(terminalType);
  return toTerminalPath(storagePath, terminalType);
}

const TerminalExePath = getTerminalExeFromVsCodeSettings();
function getTerminalTypeFromExePath(terminalExePath: string = TerminalExePath): TerminalType {
  if (IsLinux) {
    return TerminalType.LinuxBash;
  } else if (IsWSL) {
    return TerminalType.WslBash;
  } else if (/cmd.exe$/i.test(terminalExePath)) {
    return TerminalType.CMD;
  } else if (/PowerShell.exe$/i.test(terminalExePath)) {
    return TerminalType.PowerShell;
  } else if (/Cygwin.*?bash.exe$/i.test(terminalExePath)) {
    return TerminalType.CygwinBash;
  } else if (/System(32)?.bash.exe$/i.test(terminalExePath)) {
    return TerminalType.WslBash;
  } else if (/MinGW.*?bash.exe$/i.test(terminalExePath) || /Git.*?bin.*?bash.exe$/i.test(terminalExePath)) {
    return TerminalType.MinGWBash;
  } else if (/bash.exe$/.test(terminalExePath)) {
    return TerminalType.WslBash;
  } else if (IsWindows) {
    return TerminalType.PowerShell; // TerminalType.CMD;
  } else {
    return TerminalType.LinuxBash;
  }
}

// Must copy/update extension + Restart vscode if using WSL terminal on Windows:
export const DefaultTerminalType = getTerminalTypeFromExePath();
const GetInputPathsRegex: RegExp = /^(msr\s+-[r\s]*-?p)\s+("[^\"]+"|\S+)/;
let HasMountPrefixForWSL: boolean | undefined = undefined;

export function isWindowsTerminalOnWindows(terminalType = DefaultTerminalType): boolean {
  return (TerminalType.CMD === terminalType || TerminalType.PowerShell === terminalType);
}

export function isPowerShellTerminal(terminalType: TerminalType): boolean {
  return TerminalType.PowerShell === terminalType || TerminalType.Pwsh === terminalType;
}

export function isLinuxTerminalOnWindows(terminalType: TerminalType = DefaultTerminalType): boolean {
  return IsWindows && !isWindowsTerminalOnWindows(terminalType);
}

export function isTerminalUsingWindowsUtils(terminalType: TerminalType = DefaultTerminalType): boolean {
  return IsWindows && (isWindowsTerminalOnWindows(terminalType) || TerminalType.MinGWBash === terminalType || TerminalType.CygwinBash === terminalType);
}

export const IsWindowsTerminalOnWindows: boolean = isWindowsTerminalOnWindows(DefaultTerminalType);

// Must copy/update extension + Restart vscode if using WSL terminal on Windows:
export const IsLinuxTerminalOnWindows: boolean = isLinuxTerminalOnWindows(DefaultTerminalType);

export function isBashTerminalType(terminalType: TerminalType) {
  return TerminalType.CygwinBash === terminalType || TerminalType.LinuxBash === terminalType || TerminalType.WslBash === terminalType || TerminalType.MinGWBash === terminalType;
}

let BashExePath = '';
let PowershellExePath = '';
export function getTerminalInitialPath(terminal: vscode.Terminal | null | undefined): string {
  if (!terminal) {
    return '';
  }

  const creationOptions = Reflect.get(terminal, 'creationOptions');
  const terminalCwd = Reflect.get(creationOptions, 'cwd');
  let fsPath = '';
  let shellPath = '';
  try {
    fsPath = !terminalCwd ? '' : Reflect.get(terminalCwd, 'fsPath') as string || '';
  } catch { }

  try {
    shellPath = !creationOptions ? '' : Reflect.get(creationOptions, 'shellPath') as string || '';
  } catch { }

  const terminalPath = fsPath && fsPath.match(/bash$|\w+\.exe$/i) ? fsPath : (shellPath ? shellPath : fsPath);
  return terminalPath;
}

export function getRepoFolderFromTerminalCreation(terminal: Terminal): string {
  try {
    const creationOptions = Reflect.get(terminal, 'creationOptions');
    const terminalCwd = Reflect.get(creationOptions, 'cwd');
    if (!isNullOrEmpty(terminalCwd) && (terminalCwd instanceof String || typeof terminalCwd === typeof 'a')) {
      return terminalCwd.toString();
    }
    const fsPath = !terminalCwd ? '' : Reflect.get(terminalCwd, 'fsPath') as string || '';
    return fsPath;
  } catch (err) {
    console.error('Cannot get creationOptions.cwd.fsPath from terminal: ' + terminal.name + ' in getRepoFolderFromTerminalCreation.');
    return '';
  }
}

export function getTerminalShellExePath(): string {
  // https://code.visualstudio.com/docs/editor/integrated-terminal#_configuration
  const suffix = IsWindows ? 'windows' : 'linux';
  const oldShellConfig = vscode.workspace.getConfiguration('terminal.integrated.shell').get(suffix);
  const oldShellExePath = !oldShellConfig ? '' : oldShellConfig as string || '';

  const newDefaultConfig = vscode.workspace.getConfiguration('terminal.integrated.defaultProfile');
  const newDefaultValue = !newDefaultConfig ? '' : newDefaultConfig.get(suffix) as string || '';
  const newConfig = vscode.workspace.getConfiguration('terminal.integrated.profiles');
  let newShellExePath = '';
  if (!isNullOrEmpty(newDefaultValue) && newConfig) {
    const newShellExePathObj = newConfig.get(suffix + '.' + newDefaultValue);
    if (newShellExePathObj) {
      try {
        const pathValueObj = Reflect.get(newShellExePathObj as any, 'path');
        const valueType = typeof pathValueObj;
        const text = valueType === 'string' ? '' : JSON.stringify(pathValueObj);
        newShellExePath = text.startsWith('[') || valueType !== 'string' && valueType.length > 0 ? pathValueObj[0] : pathValueObj;
      } catch (err) {
        console.log(err);
        outputErrorByTime('Failed to get path value from terminal.integrated.profiles.' + suffix + '.path , error: ' + err);
      }
    }
  }

  if (isNullOrEmpty(newShellExePath)) {
    newShellExePath = newDefaultValue;
  }

  const pathRegex = IsWindows ? /\\\w+.*?\\\w+.*?\.exe$/i : /[/]\w+$/;
  const shellExePath = oldShellExePath.match(pathRegex) ? oldShellExePath : newShellExePath;

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

  const initialPath = getTerminalInitialPath(terminal) || '';
  const shellExePath = !isNullOrEmpty(initialPath) ? initialPath : getTerminalShellExePath();
  return path.basename(shellExePath);
}

export function getHomeFolderForLinuxTerminalOnWindows(): string {
  const shellExePath = getTerminalShellExePath();
  const folder = path.dirname(shellExePath);
  const home = path.join(path.dirname(folder), 'home', os.userInfo().username);
  return home;
}

export function isToolExistsInPath(exeToolName: string, terminalType: TerminalType = DefaultTerminalType): [boolean, string] {
  const whereCmd = (IsWindows ? 'where' : 'which') + ' ' + exeToolName;
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
        outputErrorByTime('Not found any of: ' + binExe + ' + ' + homeExe + ' for ' + TerminalType[terminalType] + ' terminal.');
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
    outputDebugByTime(getErrorMessage(err));
  }

  return [false, ''];
}

export function changeFindingCommandForLinuxTerminalOnWindows(command: string): string {
  if (!IsLinuxTerminalOnWindows) {
    return command;
  }

  const match = GetInputPathsRegex.exec(command);
  if (!match) {
    return command;
  }

  const paths = match[1].startsWith('"') ? match[2].substring(1, match[2].length - 2) : match[2];
  const newPaths = paths.split(/\s*[,;]/)
    .map((p, _index, _a) => toTerminalPath(p)
    );

  return match[1] + ' ' + quotePaths(newPaths.join(',')) + command.substring(match[0].length);
}

function getPathEnvSeparator(terminalType: TerminalType) {
  return isWindowsTerminalOnWindows(terminalType) ? ";" : ":";
}

export function checkAddFolderToPath(exeFolder: string, terminalType: TerminalType, prepend = true) {
  const oldPathValue = process.env['PATH'] || (IsWindows ? '%PATH%' : '$PATH');
  const paths = oldPathValue.split(IsWindows ? ';' : ':');
  const trimTailRegex = IsWindows ? new RegExp('[\\s\\\\]+$') : new RegExp('/$');
  const foundFolders = IsWindows
    ? paths.filter(a => a.trim().replace(trimTailRegex, '').toLowerCase() === exeFolder.toLowerCase())
    : paths.filter(a => a.replace(trimTailRegex, '') === exeFolder);

  if (foundFolders.length > 0) {
    return false;
  }

  const separator = getPathEnvSeparator(terminalType);
  const newValue = prepend
    ? exeFolder + separator + oldPathValue
    : oldPathValue + separator + exeFolder;

  process.env['PATH'] = newValue;

  return true;
}

export function toMinGWPath(path: string): string {
  const match = MatchWindowsDiskRegex.exec(path);
  if (!match) {
    return replaceToForwardSlash(path);
  }
  path = '/' + match[1].toLowerCase() + replaceToForwardSlash(path.substring(match.length));
  return path.replace(' ', '\\ ');
}

export function toCygwinPath(path: string): string {
  const match = MatchWindowsDiskRegex.exec(path);
  if (!match) {
    return replaceToForwardSlash(path);
  }
  path = '/cygdrive/' + match[1].toLowerCase() + replaceToForwardSlash(path.substring(match.length));
  return path.replace(' ', '\\ ');
}

export function toTerminalPath(path: string, terminalType: TerminalType = DefaultTerminalType): string {
  if (IsWSL || TerminalType.WslBash === terminalType) {
    return toWSLPath(path, TerminalType.WslBash === terminalType);
  } else if (TerminalType.CygwinBash === terminalType) {
    return toCygwinPath(path);
  } else if (TerminalType.MinGWBash === terminalType) {
    return toMinGWPath(path);
  } else {
    return path;
  }
}

export function toTerminalPathsText(windowsPaths: string, terminalType: TerminalType): string {
  const paths = windowsPaths.split(/\s*[,;]/).map((p, _index, _a) => toTerminalPath(p, terminalType));
  return paths.join(",");
}

export function toTerminalPaths(windowsPaths: Set<string>, terminalType: TerminalType): Set<string> {
  if (!IsWSL && TerminalType.WslBash !== terminalType && TerminalType.CygwinBash !== terminalType && TerminalType.MinGWBash !== terminalType) {
    return windowsPaths;
  }

  let pathSet = new Set<string>();
  windowsPaths.forEach(a => {
    const path = toTerminalPath(a, terminalType);
    pathSet.add(path);
  });

  return pathSet;
}

export function toStoragePaths(winPaths: Set<string>, isWslTerminal: boolean = IsWSL): Set<string> {
  if (!IsWSL && !isWslTerminal) {
    return winPaths;
  }

  let pathSet = new Set<string>();
  winPaths.forEach(p => {
    pathSet.add(toWSLPath(p, isWslTerminal));
  });
  return pathSet;
}

export function toStoragePath(path: string, isWslTerminal: boolean = IsWSL): string {
  return toWSLPath(path, isWslTerminal);
}

export function toWSLPath(path: string, isWslTerminal: boolean = IsWSL): string {
  if (!IsWSL && !isWslTerminal) {
    return path;
  }

  const match = MatchWindowsDiskRegex.exec(path);
  if (!match) {
    return path;
  }

  const disk = match[1].toLowerCase();
  const tail = replaceToForwardSlash(path.substring(match.length));

  // https://docs.microsoft.com/en-us/windows/wsl/wsl-config#configure-per-distro-launch-settings-with-wslconf
  const shortPath = '/' + disk + tail;
  if (HasMountPrefixForWSL === false) {
    return shortPath;
  } else if (HasMountPrefixForWSL === undefined) {
    if (fs.existsSync(shortPath)) {
      HasMountPrefixForWSL = false;
      return shortPath;
    }
  }

  const longPath = '/mnt/' + disk + tail;
  if (fs.existsSync(longPath)) {
    HasMountPrefixForWSL = true;
    return longPath;
  } else {
    HasMountPrefixForWSL = false;
    return shortPath;
  }
}

