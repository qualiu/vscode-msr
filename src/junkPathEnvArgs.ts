import path = require('path');
import ChildProcess = require('child_process');
import { GitListFileRecursiveArg, getConfigValueOfProject } from './configUtils';
import { GitRepoEnvName, SearchGitSubModuleEnvName, SkipJunkPathEnvArgName, SkipJunkPathEnvArgValue, WorkspaceCount, getEnvNameRef, getProjectFolderKey, isNullOrEmpty } from './constants';
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

function getSetEnvCommand(isWindowsTerminal: boolean, name: string, value: string, permanent: boolean, hideCommand: boolean = true, addCheck: boolean = true): string {
  const head = hideCommand && isWindowsTerminal ? "@" : "";
  const setEnvCmd = !isWindowsTerminal
    ? `export ${name}='${value}'`
    : (permanent
      ? `SETX ${name} "${value}" > nul`
      : `SET "${name}=${value}"`
    );

  if (!addCheck) {
    return head + setEnvCmd;
  }

  const checkCmd = isWindowsTerminal
    ? `if not defined ${name} `
    : `[ -z "$${name}" ] && `;

  return head + checkCmd + setEnvCmd;
}

export function getJunkEnvCommandForTipFile(isWindowsTerminal: boolean, asyncRunning = false) {
  if (!isWindowsTerminal) {
    return '';
  }

  const newLine = isWindowsTerminal ? "\r\n" : "\n";
  const [name, value] = getJunkPathEnvValue('', false);
  const permanent = asyncRunning;
  const hideCommand = !asyncRunning;
  const addCheck = !asyncRunning;
  const command = getSetEnvCommand(true, SkipJunkPathEnvArgName, name, permanent, hideCommand, addCheck) + newLine
    + getSetEnvCommand(true, SkipJunkPathEnvArgValue, value, permanent, hideCommand, addCheck) + newLine
    + getSetEnvCommand(true, GitRepoEnvName, 'tmp-list', permanent, hideCommand, addCheck) + newLine
    + getSetEnvCommand(true, SearchGitSubModuleEnvName, '--recurse-submodules', permanent, hideCommand, addCheck);
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

  // Sync update row numbers (search getRunTipFileCommand) whenever added/removed command line count below:
  let setEnvCommandLines = getSetEnvCommand(isWindowsTerminal, SkipJunkPathEnvArgName, name, false, false, !isForProjectCmdAlias)
    + newLine + getSetEnvCommand(isWindowsTerminal, SkipJunkPathEnvArgValue, value, false, false, !isForProjectCmdAlias)
    + newLine + getSetEnvCommand(isWindowsTerminal, GitRepoEnvName, trimmedRepoName, false, false, !isForProjectCmdAlias)
    + newLine + getSetEnvCommand(isWindowsTerminal, SearchGitSubModuleEnvName, searchSubModuleArg, false, false, !isForProjectCmdAlias)
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
  if (isWindowsTerminal) {
    return `set "${SkipJunkPathEnvArgName}=${name}" && set "${SkipJunkPathEnvArgValue}=${value}" && set "${GitRepoEnvName}=tmp-list" && set "${SearchGitSubModuleEnvName}=--recurse-submodules"`;
  } else {
    return `export ${SkipJunkPathEnvArgName}="${name}" && export ${SkipJunkPathEnvArgValue}="${value}" && export ${GitRepoEnvName}=tmp-list && export ${SearchGitSubModuleEnvName}='--recurse-submodules'`;
  }
}

