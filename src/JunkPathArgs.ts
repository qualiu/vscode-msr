import path = require('path');
import { getConfigValueByAllParts, getConfigValueOfProject } from './configUtils';
import { TrimProjectNameRegex } from './constants';
import { getGitIgnore, mergeSkipFolderPattern } from './dynamicConfig';
import { TerminalType } from './enums';
import { IsWindowsTerminalOnWindows, isWindowsTerminalOnWindows } from './terminalUtils';
import { getSetToolEnvCommand } from './toolSource';
import { getRootFolderName, isNullOrEmpty } from './utils';

const SkipJunkPathEnvArgName = "Skip_Junk_Name";
const SkipJunkPathEnvArgValue = "Skip_Junk_Paths";
const GitRepoEnvName = "GitRepoTmpName";

export function getTrimmedGitRepoEnvName(isWindowsTerminal: boolean): string {
  return isWindowsTerminal ? `%${GitRepoEnvName}%` : `$${GitRepoEnvName}`;
}

export function getJunkPathEnvValue(rootFolder: string, isForProjectCmdAlias: boolean): [string, string] {
  if (isForProjectCmdAlias && !isNullOrEmpty(rootFolder)) {
    const gitIgnoreInfo = getGitIgnore(rootFolder);
    if (gitIgnoreInfo.Valid) {
      const skipPathRegexPattern = gitIgnoreInfo.getSkipPathRegexPattern(false, true);
      if (!isNullOrEmpty(skipPathRegexPattern)) {
        return ['--np', skipPathRegexPattern];
      }
    }
  }

  const skipFolderValue = getJunkFolderValue('default', false);
  return ['--nd', skipFolderValue];
}

export function getJunkEnvCommandForTipFile(isWindowsTerminal: boolean) {
  const newLine = isWindowsTerminal ? "\r\n" : "\n";
  const [name, value] = getJunkPathEnvValue('', false);
  if (isWindowsTerminal) {
    // Remove '@if not defined' to avoid no permanent settings
    return `@SETX ${SkipJunkPathEnvArgName} "${name}" >nul` + newLine
      + `@SETX ${SkipJunkPathEnvArgValue} "${value}" >nul` + newLine
      + `@SETX ${GitRepoEnvName} "" > nul`;
  } else {
    return '';
  }
}

export function getSkipJunkPathEnvCommand(terminalType: TerminalType, rootFolder: string, isForProjectCmdAlias: boolean, generalScriptFilesFolder: string): string {
  const isWindowsTerminal = isWindowsTerminalOnWindows(terminalType);
  const [name, value] = getJunkPathEnvValue(rootFolder, isForProjectCmdAlias);
  const trimmedRepoName = !isForProjectCmdAlias ? '' : path.basename(rootFolder || '').replace(TrimProjectNameRegex, '-');
  const newLine = isWindowsTerminal ? "\r\n" : "\n";
  if (isWindowsTerminal) {
    const setNameCommand = `set "${SkipJunkPathEnvArgName}=${name}"`;
    const setValueCommand = `set "${SkipJunkPathEnvArgValue}=${value}"`;
    const setGitRepoName = `set "${GitRepoEnvName}=${trimmedRepoName}"`;
    if (isForProjectCmdAlias) {
      const setToolAliasEnvCmd = getSetToolEnvCommand(terminalType, [generalScriptFilesFolder]);
      return "@echo off" + newLine + setToolAliasEnvCmd + newLine + setNameCommand + newLine + setValueCommand + newLine + setGitRepoName + newLine;
    } else {
      return '';
    }
  } else {
    const setNameCommand = `export ${SkipJunkPathEnvArgName}='${name}'`;
    const setValueCommand = `export ${SkipJunkPathEnvArgValue}='${value}'`;
    const setGitRepoName = `export ${GitRepoEnvName}='${trimmedRepoName}'`;
    if (isForProjectCmdAlias) {
      return setNameCommand + newLine + setValueCommand + newLine + setGitRepoName + newLine;
    } else {
      return `[ -z "$${SkipJunkPathEnvArgName}" ] && ${setNameCommand}` + newLine
        + `[ -z "$${SkipJunkPathEnvArgValue}" ] && ${setValueCommand}` + newLine
        + `[ -z "$${GitRepoEnvName}" ] && export ${GitRepoEnvName}=''` + newLine;
    }
  }
}

export function getResetJunkPathEnvCommand(isWindowsTerminal: boolean): string {
  const [name, value] = getJunkPathEnvValue('', false);
  if (isWindowsTerminal) {
    return `set "${SkipJunkPathEnvArgName}=${name}" && set "${SkipJunkPathEnvArgValue}=${value}" && set "${GitRepoEnvName}="`;
  } else {
    return `export ${SkipJunkPathEnvArgName}="${name}" && export ${SkipJunkPathEnvArgValue}="${value}" && unset ${GitRepoEnvName}`;
  }
}

export function getJunkFolderValue(projectKey: string, isForProjectCmdAlias: boolean): string {
  let skipFoldersPattern = getConfigValueOfProject(projectKey, 'skipFolders');
  if (isForProjectCmdAlias) {
    skipFoldersPattern = mergeSkipFolderPattern(skipFoldersPattern);
  }
  return skipFoldersPattern;
}

export function getJunkFolderForProject(projectGitFolder: string, extension: string, mappedExt: string, subName = 'reference'): string {
  const folderName = getRootFolderName(projectGitFolder, true);
  let skipFoldersPattern = getConfigValueByAllParts(folderName, extension, mappedExt, subName, 'skipFolders');
  return mergeSkipFolderPattern(skipFoldersPattern);
}

export function getIgnoreFolderCommand(isWindowsTerminal: boolean): string {
  if (isWindowsTerminal) {
    return `%${SkipJunkPathEnvArgName}% "%${SkipJunkPathEnvArgValue}%"`;
  } else {
    return `$${SkipJunkPathEnvArgName} "$${SkipJunkPathEnvArgValue}"`;
  }
}

export function getSkipFolderCommandOption(rootFolder: string, isForProjectCmdAlias: boolean, useSkipFolders: boolean, toRunInTerminal: boolean, rootFolderCount: number, extension: string, mappedExt: string, subName: string): string {
  if (toRunInTerminal) {
    return getIgnoreFolderCommand(IsWindowsTerminalOnWindows);
  }
  const gitIgnoreInfo = getGitIgnore(rootFolder);
  const skipFoldersPattern = getJunkFolderForProject(isForProjectCmdAlias ? rootFolder : '', extension, mappedExt, subName);
  const skipFolderOptions = isForProjectCmdAlias && gitIgnoreInfo.Valid && (!toRunInTerminal || rootFolderCount < 2)
    ? ' --np "' + gitIgnoreInfo.getSkipPathRegexPattern(toRunInTerminal) + '"'
    : (useSkipFolders && skipFoldersPattern.length > 1 ? ' --nd "' + skipFoldersPattern + '"' : '');
  return skipFolderOptions;
}