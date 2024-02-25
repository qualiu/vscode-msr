import path = require('path');
import ChildProcess = require('child_process');
import os = require('os');
import * as vscode from 'vscode';

export function GetCommandOutput(command: string): string {
  try {
    const output = ChildProcess.execSync(command);
    return !output ? '' : output.toString().trim();
  } catch (error) {
    return '';
  }
}

export const RunCmdTerminalName = 'MSR-RUN-CMD';
export const OutputChannelName = 'MSR-Def-Ref';

export const IsDebugMode = process.execArgv && process.execArgv.length > 0 && process.execArgv.some((arg) => /^--debug=?/.test(arg) || /^--(debug|inspect)-brk=?/.test(arg));
export const WorkspaceCount = !vscode.workspace.workspaceFolders ? 0 : vscode.workspace.workspaceFolders.length;
export const DefaultWorkspaceFolder: string = getDefaultRepoFolderByActiveFile(true);
export const DefaultRepoFolderName: string = path.basename(DefaultWorkspaceFolder);

export const Is64BitOS = process.arch.includes('64');
export const IsWindows = /Win32|Windows/i.test(process.platform);
const SystemInfo = IsWindows ? '' : GetCommandOutput('uname -smr');
export const IsWSL = !IsWindows && /Microsoft/i.test(SystemInfo) && /WSL/i.test(SystemInfo);

export const IsDarwinArm64 = !IsWindows && /^Darwin/i.test(process.platform) && process.arch === 'arm64';
export const IsMacOS = IsDarwinArm64 || (!IsWindows && /Darwin|Mac|\biOS\b|macOS|Apple/.test(SystemInfo));

export const IsLinuxArm64 = !IsWindows && !IsMacOS && !IsWSL && /aarch64/i.test(SystemInfo) && /Linux/i.test(SystemInfo);
export const IsLinux86x64 = !IsWindows && !IsMacOS && !IsWSL && !IsLinuxArm64 && /x86_64/.test(SystemInfo) && /Linux/i.test(SystemInfo);
export const IsLinux = IsLinuxArm64 || IsLinux86x64;

export const IsSupportedSystem = /Win32|Windows|Linux/i.test(process.platform) || IsDarwinArm64;

export const SearchTextHolder = '%1';
export const SkipJumpOutForHeadResultsRegex = /\s+(-J\s+-H|-J?H)\s*\d+(\s+-J)?(\s+|$)/;
export const RemoveJumpRegex = /\s+-J(\s+|$)/;
export const TrimSearchTextRegex = /^[^\w\.-]+|[^\w\.-]+$/g;
export const TrimProjectNameRegex: RegExp = /[^\w\.-]/g;

export const ShouldQuotePathRegex = IsWindows ? /[^\w,\.\\/:~-]/ : /[^\w,\.\\/~-]/;
export const HomeFolder = IsWindows ? path.join(process.env['USERPROFILE'] || '.') : process.env['HOME'] || '.';
export const SystemBinFolder = IsWindows ? (process.env['SystemRoot'] || String.raw`C:\WINDOWS\system32`) : (IsMacOS ? '/usr/local/bin/' : '/usr/bin/');
export const TempStorageFolder = IsWindows ? os.tmpdir() : '/tmp/';
export const InitLinuxTerminalFileName = 'init-linux-terminal.sh';
export const CheckReCookAliasFileSeconds = 3600; // mitigate alias file inconsistency especially for Linux terminals on Windows.

// Environment variable names
export const SkipJunkPathEnvArgName: string = "Skip_Junk_Name";
export const SkipJunkPathEnvArgValue: string = "Skip_Junk_Paths";
export const SearchGitSubModuleEnvName: string = "Git_List_Args";
export const GitRepoEnvName: string = "GitRepoTmpName";

export const ReplaceJunkPattern = new RegExp(String.raw`msr -rp \S+\s+\W+${SkipJunkPathEnvArgName}\W*\s+\W+${SkipJunkPathEnvArgValue}\S*`, 'g');

const GitInfoTemplate = "Skip_Junk_Paths length = $L. Parsed $P of $T patterns, omitted $E errors, ignored $X exemptions: see MSR-Def-Ref in OUTPUT tab.";
const FinalTipTemplate = `echo Auto disable self finding $M definition = $D. Uniform slash = $U. Faster gfind-xxx = $F. Auto update search tool = $A.`
  + String.raw` | msr -t "%[A-Z]% |\$[A-Z]\b " -o "" -aPAC` // Trim case like %M%
  + ` | msr -aPA -i -e true -t "false|Auto.*?(disable).*?definition"`;

export function getEnvNameRef(envName: string, isWindowsTerminal: boolean): string {
  return isWindowsTerminal ? `%${envName}%` : `$${envName}`;
}

export function getEnvNameRefRegex(envName: string, isWindowsTerminal: boolean): RegExp {
  return isWindowsTerminal ? new RegExp(String.raw`%${envName}%`, 'g') : new RegExp(String.raw`\$${envName}\b`, 'g');
}

export function getSkipJunkPathArgs(isWindowsTerminal: boolean): string {
  return `${getEnvNameRef(SkipJunkPathEnvArgName, isWindowsTerminal)} "${getEnvNameRef(SkipJunkPathEnvArgValue, isWindowsTerminal)}"`;
}

export function getProjectFolderKey(repoFolderName: string): string {
  return !repoFolderName ? '' : repoFolderName.replace(TrimProjectNameRegex, '-');
}

export function getLastTipRow(isWindowsTerminal: boolean): number {
  return isWindowsTerminal ? 10 : 9;
}

export function getLastJunkPathTipRow(isWindowsTerminal: boolean): number {
  return isWindowsTerminal ? 9 : 8;
}

export function getTipInfoTemplate(isCmdTerminal: boolean, isFinalTip: boolean): string {
  const tip = isFinalTip ? FinalTipTemplate : GitInfoTemplate;
  return isCmdTerminal ? tip.replace(/\$([A-Z])\b/g, '%$1%') : tip; //.replace(/%([A-Z])%/, '$1')
}

export function getCommandToSetGitInfoVar(isCmdTerminal: boolean, skipGitRegexLength: number, totalPatterns: number, parsedPatterns: number, errors: number, exemptions: number): string {
  return isCmdTerminal
    ? `set L=${skipGitRegexLength} & set T=${totalPatterns} & set P=${parsedPatterns} & set E=${errors} & set X=${exemptions} &`.replace(/ &/g, '&')
    : `export L=${skipGitRegexLength}; export T=${totalPatterns}; export P=${parsedPatterns}; export E=${errors}; export X=${exemptions};`; //.replace(/export ([A-Z])/g, '$1');
}

export function getCommandToSetFinalTipVar(isCmdTerminal: boolean, mappedExt: string, hasDisabledFindDefinition: boolean, isUniversalSlash: boolean, isFastGitFind: boolean, isAutoUpdate: boolean): string {
  return isCmdTerminal
    ? `set M=${mappedExt} & set D=${hasDisabledFindDefinition} & set U=${isUniversalSlash} & set F=${isFastGitFind} & set A=${isAutoUpdate} &`.replace(/ &/g, '&')
    : `export M=${mappedExt}; export D=${hasDisabledFindDefinition}; export U=${isUniversalSlash}; export F=${isFastGitFind}; export A=${isAutoUpdate};`; //.replace(/export ([A-Z])/g, '$1');
}

export function getRunTipFileCommand(tipFileDisplayPath: string, row: number, otherArgs: string): string {
  return `msr -p ${tipFileDisplayPath} ${otherArgs.trim()} -L ${row} -N ${row} -XA`;
}

export function getBashFileHeader(isWindowsTerminal: boolean, addNewLine = "\n"): string {
  return isWindowsTerminal ? "" : "#!/bin/bash" + addNewLine;
}

export function getTipGuideFileName(isWindowsTerminal: boolean): string {
  return 'tip-guide' + (isWindowsTerminal ? '.cmd' : '.sh');
}

export function getAliasFileName(isWindowsTerminal: boolean, isForProjectCmdAlias = false): string {
  return 'msr-cmd-alias' + (isWindowsTerminal ? (isForProjectCmdAlias ? ".cmd" : '.doskeys') : '.bashrc');
}

export function isNullOrEmpty(obj: string | undefined): boolean {
  return obj === null || obj === undefined || obj.length === 0;
}

export function getDefaultRepoFolderByActiveFile(useDefaultProjectIfEmpty = false) {
  const activePath = getActiveFilePath();
  return getRepoFolder(activePath, useDefaultProjectIfEmpty);
}

export function getRepoFolder(filePath: string, useFirstFolderIfNotFound = false): string {
  const folderUri = isNullOrEmpty(filePath) ? '' : vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
  if (!folderUri || !folderUri.uri || !folderUri.uri.fsPath) {
    if (useFirstFolderIfNotFound && WorkspaceCount > 0) {
      return vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : '';
    }
    return '';
  }

  return folderUri.uri.fsPath;
}

export function getActiveFilePath() {
  if (vscode.window.activeTextEditor
    && vscode.window.activeTextEditor.document
    && !isNullOrEmpty(vscode.window.activeTextEditor.document.fileName)) {
    return vscode.window.activeTextEditor.document.fileName;
  } else {
    return '';
  }
}
