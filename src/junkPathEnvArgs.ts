import path = require('path');
import ChildProcess = require('child_process');
import { GitListFileRecursiveArg, getConfigValueOfProject } from './configUtils';
import { GitFileListExpirationTimeEnvName, GitRepoEnvName, SearchGitSubModuleEnvName, SkipJunkPathEnvArgName, SkipJunkPathEnvArgValue, TmpGitFileListExpiration, WorkspaceCount, getEnvNameRef, getProjectFolderKey, isNullOrEmpty } from './constants';
import { getGitIgnore, mergeSkipFolderPattern } from './dynamicConfig';
import { TerminalType } from './enums';
import { isWindowsTerminalOnWindows } from './terminalUtils';
import { getSetToolEnvCommand } from './toolSource';
import { getRepoFolderName } from './utils';

export function getSearchGitSubModuleEnvName(isWindowsTerminal: boolean): string {
  return getEnvNameRef(SearchGitSubModuleEnvName, isWindowsTerminal);
}

export function getTrimmedGitRepoEnvName(isWindowsTerminal: boolean): string {
  return getEnvNameRef(GitRepoEnvName, isWindowsTerminal);
}

function getJunkPathEnvValue(repoFolder: string, isForProjectCmdAlias: boolean): [string, string] {
  if (isForProjectCmdAlias && !isNullOrEmpty(repoFolder)) {
    const gitIgnoreInfo = getGitIgnore(repoFolder);
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

function getJunkFolderValue(projectKey: string, isForProjectCmdAlias: boolean): string {
  let skipFoldersPattern = getConfigValueOfProject(projectKey, 'skipFolders');
  if (isForProjectCmdAlias) {
    skipFoldersPattern = mergeSkipFolderPattern(skipFoldersPattern);
  }
  return skipFoldersPattern;
}

function getSetEnvCommand(isWindowsTerminal: boolean, name: string, value: string, permanent: boolean, addCheck: boolean = true): string {
  const setEnvCmd = !isWindowsTerminal
    ? `export ${name}='${value}'`
    : (permanent
      ? `SETX ${name} "${value}"`
      : `SET "${name}=${value}"`
    );

  if (!addCheck) {
    return setEnvCmd;
  }

  const checkCmd = isWindowsTerminal
    ? `if not defined ${name} `
    : `[ -z "$${name}" ] && `;

  return checkCmd + setEnvCmd;
}

export function getJunkEnvCommandForTipFile(isWindowsTerminal: boolean, asyncRunning = false) {
  if (!isWindowsTerminal) {
    return '';
  }

  const permanent = asyncRunning;
  const addCheck = !asyncRunning;
  const newLine = isWindowsTerminal ? "\r\n" : "\n";
  const [name, value] = getJunkPathEnvValue('', false);
  const command = getSetEnvCommand(true, SkipJunkPathEnvArgName, name, permanent, addCheck) + newLine
    + getSetEnvCommand(true, SkipJunkPathEnvArgValue, value, permanent, addCheck) + newLine
    + getSetEnvCommand(true, GitRepoEnvName, 'tmp-list', permanent, addCheck) + newLine
    + getSetEnvCommand(true, SearchGitSubModuleEnvName, '--recurse-submodules', permanent, addCheck) + newLine
    + getSetEnvCommand(true, GitFileListExpirationTimeEnvName, TmpGitFileListExpiration, permanent, addCheck);
  return command;
}

export function asyncSetJunkEnvForWindows() {
  const commands = getJunkEnvCommandForTipFile(true, true).split("\r\n");
  commands.forEach(cmd => {
    ChildProcess.exec(cmd);
  });
}

export function getSkipJunkPathEnvCommand(terminalType: TerminalType, repoFolder: string, isForProjectCmdAlias: boolean, generalScriptFilesFolder: string): string {
  const isWindowsTerminal = isWindowsTerminalOnWindows(terminalType);
  if (isWindowsTerminal && !isForProjectCmdAlias) {
    // Async setting env for common values on Windows at other place
    return '';
  }

  const [name, value] = getJunkPathEnvValue(repoFolder, isForProjectCmdAlias);
  const trimmedRepoName = !isForProjectCmdAlias || isNullOrEmpty(repoFolder) ? 'tmp-list' : getProjectFolderKey(path.basename(repoFolder));
  const newLine = isWindowsTerminal ? "\r\n" : "\n";
  const searchSubModuleArg = GitListFileRecursiveArg(isForProjectCmdAlias ? getRepoFolderName(repoFolder) : '');
  const repoFolderName = path.basename(repoFolder);
  const expirationTime = isForProjectCmdAlias ? getConfigValueOfProject(repoFolderName, "refreshTmpGitFileListDuration") : TmpGitFileListExpiration;

  let setEnvCommandLines = getSetEnvCommand(isWindowsTerminal, SkipJunkPathEnvArgName, name, false, !isForProjectCmdAlias)
    + newLine + getSetEnvCommand(isWindowsTerminal, SkipJunkPathEnvArgValue, value, false, !isForProjectCmdAlias)
    + newLine + getSetEnvCommand(isWindowsTerminal, GitRepoEnvName, trimmedRepoName, false, !isForProjectCmdAlias)
    + newLine + getSetEnvCommand(isWindowsTerminal, SearchGitSubModuleEnvName, searchSubModuleArg, false, !isForProjectCmdAlias)
    + newLine + getSetEnvCommand(isWindowsTerminal, GitFileListExpirationTimeEnvName, expirationTime, false, !isForProjectCmdAlias)
    + newLine;

  if (isWindowsTerminal && isForProjectCmdAlias) {
    const setToolAliasEnvCmd = getSetToolEnvCommand(terminalType, [generalScriptFilesFolder]);
    setEnvCommandLines = "@echo off" + newLine + setToolAliasEnvCmd + newLine + setEnvCommandLines
  }

  if (WorkspaceCount > 1 && isForProjectCmdAlias) {
    const changeDirCmd = isWindowsTerminal ? `cd /d "${repoFolder}"` : `cd "${repoFolder}"`;
    setEnvCommandLines += changeDirCmd + newLine;
  }

  return setEnvCommandLines;
}

export function getResetJunkPathEnvCommand(isWindowsTerminal: boolean): string {
  const [name, value] = getJunkPathEnvValue('', false);
  const command = isWindowsTerminal
    ?
    `set "${SkipJunkPathEnvArgName}=${name}" 
    && set "${SkipJunkPathEnvArgValue}=${value}" 
    && set "${GitRepoEnvName}=tmp-list" 
    && set "${SearchGitSubModuleEnvName}=--recurse-submodules"
    && set "${GitFileListExpirationTimeEnvName}=${TmpGitFileListExpiration}"`
    : `export ${SkipJunkPathEnvArgName}="${name}" 
    && export ${SkipJunkPathEnvArgValue}="${value}" 
    && export ${GitRepoEnvName}=tmp-list 
    && export ${SearchGitSubModuleEnvName}='--recurse-submodules'
    && export ${GitFileListExpirationTimeEnvName}=${TmpGitFileListExpiration}`
    ;
  return command.replace(/\s*[\r\n]+\s*/g, ' ');
}

