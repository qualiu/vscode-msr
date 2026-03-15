import * as vscode from 'vscode';
import { calculateAliasHash, hasAliasChanged, saveAliasHash } from './aliasHashUtils';
import { RunCommandChecker, ToolChecker, setNotCheckInputPathInCommandLine, setOutputColumnIndexInCommandLine } from './ToolChecker';
import { ProjectToGitFindFileExtraOptionsMap, getFindTopDistributionCommand, getSortCommandText } from "./commands";
import { getCommandAliasText, getCommonAliasMap, HasPwshExeOnWindows, replaceArgForLinuxCmdAlias, replaceArgForWindowsCmdAlias, replaceForLoopVariableForWindowsScript, replacePowerShellVarsForLinuxAlias } from './commonAlias';
import { getConfigValueByPriorityList, getConfigValueByProjectAndExtension, getConfigValueOfActiveProject, getConfigValueOfProject, shouldGenerateDefinitionAlias } from "./configUtils";
import { DefaultRepoFolderName, GitRepoEnvName, GitTmpListFilePrefix, HomeFolder, IsDebugMode, IsWSL, IsWindows, RunCmdTerminalName, TempStorageFolder, TrimProjectNameRegex, WslCheckingCommand, getAliasFileName, getBashFileHeader, getEnvNameRefRegex, getProjectFolderKey, getRepoFolder, getSkipJunkPathArgs, getTipInfoTemplate, isNullOrEmpty } from "./constants";
import { AdditionalFileExtensionMapNames, DefaultRepoFolder, MappedExtToCodeFilePatternMap, MyConfig } from "./dynamicConfig";
import { FindCommandType, TerminalType } from "./enums";
import { createDirectory, readTextFile, saveTextToFile } from './fileUtils';
import { asyncSetJunkEnvForWindows, getJunkEnvCommandForTipFile, getResetJunkPathEnvCommand, getSkipJunkPathEnvCommand } from './junkPathEnvArgs';
import { outputDebug, outputDebugByTime, outputErrorByTime, outputInfo, outputInfoByDebugModeByTime, outputInfoQuiet, outputInfoQuietByTime, outputWarn, outputWarnByTime, outputWarnQuietByTime } from "./outputUtils";
import { EmptyRegex, escapeRegExp } from "./regexUtils";
import { enablePwshDeferredSend, flushPwshDeferredCommands, getRunCmdTerminal, runCommandInTerminal, runPostInitCommands, sendCommandToTerminal } from './runCommandUtils';
import { DefaultTerminalType, getCmdAliasSaveFolder, getInitLinuxScriptDisplayPath, getInitLinuxScriptStoragePath, getTerminalInitialPath, getTerminalNameOrShellExeName, getTerminalShellExePath, getTipFileStoragePath, isBashTerminalType, isLinuxTerminalOnWindows, isPowerShellTerminal, isWindowsTerminalOnWindows, toStoragePath, toTerminalPath } from './terminalUtils';
import { getSetToolEnvCommand, getToolExportFolder } from "./toolSource";
import { getElapsedSecondsToNow, getLoadAliasFileCommand, getPowerShellName, getRepoFolderName, getUniqueStringSetNoCase, isPowerShellCommand, isWeeklyCheckTime, quotePaths, replaceTextByRegex } from "./utils";
import { FindJavaSpringReferenceByPowerShellAlias } from './wordReferenceUtils';
import ChildProcess = require('child_process');
import fs = require('fs');
import os = require('os');
import path = require('path');

const CookCmdDocUrl = 'https://marketplace.visualstudio.com/items?itemName=qualiu.vscode-msr#command-shortcuts';

// Constants for git hash based cache validation
const GitHashFilePrefix = "git-hash-";

// Script name for centralized cache logic
const UpdateRepoPathsScriptName = "update-repo-paths";

// Generate update-repo-paths script: detect git repo, get repo name, validate cache by hash
// Sets MSR_REPO_PATHS_FILE and MSR_REPO_ROOT env vars via EndLocal trick for Windows CMD
// Exports MSR_REPO_PATHS_FILE and MSR_REPO_ROOT for Linux/bash callers
function getUpdateRepoPathsScriptContent(isWindowsTerminal: boolean): string {
  if (isWindowsTerminal) {
    // Windows CMD script - use git hash check with relative paths
    // Uses SetLocal/EndLocal trick to export env vars to caller's environment
    // Note: Only the first line needs '@' prefix. After 'echo off', subsequent commands are not echoed.
    // Note: msr uses (.+) with $1 for capture groups, not .+ with \0
    // Note: Must nest for /f loops to use %%a directly instead of !gitRoot! to avoid delayed expansion conflict
    // Call use-this-alias BEFORE SetLocal to set Skip_Junk_Name/Skip_Junk_Paths env vars in caller's scope.
    // These env vars survive EndLocal since they were set before SetLocal.
    // gfind-xxx.cmd uses %Skip_Junk_Name% "%Skip_Junk_Paths%" which need to be resolved at parse time.
    return `@echo off
call use-this-alias >nul 2>&1
git rev-parse --is-inside-work-tree >nul 2>&1 || (
  echo Not in a git repo or git not found: %CD% | msr -t .+ --colors Red --to-stderr --keep-color -aPA
  exit /b 1
)
SetLocal EnableDelayedExpansion
for /f "tokens=*" %%a in ('git rev-parse --show-toplevel 2^>nul') do (
  set "gitRoot=%%a"
  for /f "tokens=*" %%b in ('msr -z "%%a" -t ".*?([^\\\\/]+?)\\s*$" -o "\\1" -aPAC ^| msr -t "${TrimProjectNameRegex.source}" -o "-" -aPAC') do set "repoName=%%b"
)
if not defined repoName set "repoName=tmp"
set "tmpPathsFile=%tmp%\\${GitTmpListFilePrefix}!repoName!"
set "hashFile=%tmp%\\${GitHashFilePrefix}!repoName!"
for /f "tokens=*" %%h in ('git rev-parse HEAD 2^>nul') do set "curHash=%%h"
if exist "!hashFile!" set /p savedHash=<"!hashFile!"
if "!curHash!" NEQ "!savedHash!" goto :UpdatePaths
if not exist "!tmpPathsFile!" goto :UpdatePaths
goto :SkipUpdate
:UpdatePaths
git -C "!gitRoot!" ls-files %Git_List_Args% > "!tmpPathsFile!"
echo !curHash!>"!hashFile!"
echo Updated repo file paths into !tmpPathsFile! | msr -e .+ -aMP -v dmt --to-stderr --keep-color --exit 0
:SkipUpdate
EndLocal & set "MSR_REPO_PATHS_FILE=%tmpPathsFile%" & set "MSR_REPO_ROOT=%gitRoot%"
`;
  } else {
    // Linux/Bash script - use git hash check with relative paths
    // Exports MSR_REPO_PATHS_FILE and MSR_REPO_ROOT for callers to use
    // Call use-this-alias to set Skip_Junk_Name/Skip_Junk_Paths env vars for gfind-xxx.
    return `#!/bin/bash
source use-this-alias >/dev/null 2>&1
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  echo "Not in a git repo or git not found: $PWD" | msr -t .+ --colors Red --to-stderr --keep-color -aPA
  return 1 2>/dev/null || exit 1
}
gitRoot=$(git rev-parse --show-toplevel 2>/dev/null)
repoName=$(echo "$gitRoot" | msr -t ".*?([^/]+?)\\s*$" -o "\\1" -aPAC | msr -t "${TrimProjectNameRegex.source}" -o "-" -aPAC)
[ -z "$repoName" ] && repoName="tmp"
tmpPathsFile="/tmp/${GitTmpListFilePrefix}$repoName"
hashFile="/tmp/${GitHashFilePrefix}$repoName"
curHash=$(git rev-parse HEAD 2>/dev/null)
savedHash=$(cat "$hashFile" 2>/dev/null)
if [ "$curHash" != "$savedHash" ] || [ ! -f "$tmpPathsFile" ]; then
  git -C "$gitRoot" ls-files $Git_List_Args > "$tmpPathsFile"
  echo "$curHash" > "$hashFile"
  echo "Updated repo file paths into $tmpPathsFile" | msr -e .+ -aMP -v dmt --to-stderr --keep-color --exit 0
fi
export MSR_REPO_PATHS_FILE="$tmpPathsFile"
export MSR_REPO_ROOT="$gitRoot"
`;
  }
}

// Generate call command for update-repo-paths:
// Windows: simple 'call' since the script exports env vars via EndLocal trick
// Linux: 'source' to run in same shell and inherit exported vars
function getUpdateRepoPathsCallCommand(isWindowsTerminal: boolean, scriptFolder: string, writeToEachFile: boolean): string {
  if (isWindowsTerminal) {
    // The script sets MSR_REPO_PATHS_FILE and MSR_REPO_ROOT via EndLocal & set trick
    // Script files: multi-line with error check (exit if not in git repo)
    // Doskey: single line with && (naturally skips rest if call fails)
    const scriptName = UpdateRepoPathsScriptName + '.cmd';
    return writeToEachFile
      ? `call ${scriptName} || exit /b 1\n`
      : `call ${scriptName} && `;
  } else {
    // For script files: use source with newline; for alias: use source with && (single line)
    return writeToEachFile
      ? `source "${scriptFolder}/${UpdateRepoPathsScriptName}" || exit 1\n`
      : `source "${scriptFolder}/${UpdateRepoPathsScriptName}" && `;
  }
}

// Get env var ref for tmp repo paths file
// Windows doskey: !VAR! for delayed expansion inside cmd /v:on subprocess
// Windows scripts: %VAR% since each line is parsed separately after call update-repo-paths.cmd
// Linux: $MSR_REPO_PATHS_FILE
function getTmpRepoPathsEnvRef(isWindowsTerminal: boolean): string {
  if (isWindowsTerminal) {
    // Both doskey and script files use cmd /v:on /c with !VAR! delayed expansion
    return '"!MSR_REPO_PATHS_FILE!"';
  }
  return '"$MSR_REPO_PATHS_FILE"';
}

// Get env var ref for git root path
// Windows doskey: !VAR! for delayed expansion inside cmd /v:on subprocess
// Windows scripts: %VAR% since each line is parsed separately after call update-repo-paths.cmd
// Linux: $MSR_REPO_ROOT
function getGitRootEnvRef(isWindowsTerminal: boolean): string {
  if (isWindowsTerminal) {
    // Both doskey and script files use cmd /v:on /c with !VAR! delayed expansion
    return '"!MSR_REPO_ROOT!"';
  }
  return '"$MSR_REPO_ROOT"';
}

function getGeneralCmdAliasFilePath(terminalType: TerminalType) {
  const isWindowsTerminal = isWindowsTerminalOnWindows(terminalType);
  const saveAliasFolder = getCmdAliasSaveFolder(false, false, terminalType);
  const fileName = getAliasFileName(isWindowsTerminal);

  // if is WSL and first time, which read Windows settings.
  if (IsWSL && saveAliasFolder.match(/^[A-Z]:/i)) {
    return path.join(HomeFolder, fileName);
  }

  return path.join(saveAliasFolder, fileName);
}

function getDisplayPathForBash(filePath: string, replaceTo: string = '~'): string {
  const homeValue = process.env['HOME'] || '';
  const pattern = isNullOrEmpty(homeValue)
    ? /^(~|\$HOME)/
    : new RegExp('^(~|\$HOME|' + homeValue + '\\b)');
  return filePath.replace(pattern, replaceTo);
}

function getShellExeAndTerminalType(terminal: vscode.Terminal | undefined, isNewlyCreated = false): [string, TerminalType] {
  const initialPath = getTerminalInitialPath(terminal) || '';
  const shellExe = initialPath.match(/\.exe$|\w*sh$|(Cygwin\S*\.(cmd|bat)$)/i) ? initialPath : getTerminalShellExePath();
  const terminalOrShellName = getTerminalNameOrShellExeName(terminal);
  const exeNameByInitPath = isNullOrEmpty(initialPath) ? '' : path.basename(initialPath);
  const terminalName = !isNullOrEmpty(exeNameByInitPath) ? exeNameByInitPath : terminalOrShellName;

  if (!terminal || terminalName === RunCmdTerminalName) {
    // Avoid error in reloading CMD terminal.
    const terminalType = IsWindows && !isNewlyCreated ? TerminalType.CMD : DefaultTerminalType;
    return [shellExe, terminalType];
  }

  if (IsWindows) {
    if (isNullOrEmpty(shellExe)) {
      if (/PowerShell/i.test(terminalName)) {
        return [shellExe, TerminalType.PowerShell];
      } else if (/bash/i.test(terminalName)) {
        return [shellExe, TerminalType.WslBash];
      } else if (/CMD|Command/i.test(terminalName)) {
        return [shellExe, TerminalType.CMD];
      } else {
        return [shellExe, TerminalType.PowerShell];
      }
    } else {
      if (/cmd.exe$|^Command Prompt/i.test(terminalName || shellExe)) {
        return [shellExe, TerminalType.CMD];
      } else if (/PowerShell.exe$|^PowerShell$/i.test(terminalName || shellExe)) {
        return [shellExe, TerminalType.PowerShell];
      } else if (/Cygwin.*?bin\\bash.exe$|^Cygwin/i.test(shellExe) || /Cygwin\S*\.(bat|cmd)$/i.test(shellExe)) {
        return ['bash', TerminalType.CygwinBash];
      } else if (/System(32)?.bash.exe$|wsl.exe$|^WSL/i.test(shellExe)) {
        return [shellExe, TerminalType.WslBash];
      } else if (/Git\S+bash.exe$|^Git Bash/i.test(shellExe)) { // (shellExe.includes('Git\\bin\\bash.exe'))
        return [shellExe, TerminalType.MinGWBash];
      } else {
        return [shellExe, TerminalType.PowerShell];
      }
    }
  } else {
    if (/PowerShell|pwsh/i.test(terminalName)) {
      return [shellExe, TerminalType.Pwsh];
    } else {
      return [shellExe, TerminalType.LinuxBash];
    }
  }
}

function duplicateSearchFileCmdAlias(_repoFolder: string, terminalType: TerminalType, cmdAliasMap: Map<string, string>, isForProjectCmdAlias: boolean, writeToEachFile: boolean) {
  // Duplicate find-xxx to gfind-xxx (use "git ls-file" + find-xxx), except find-nd / find-ndp
  const isWindowsTerminal = isWindowsTerminalOnWindows(terminalType);
  const powerShellCmdHead = getPowerShellName(terminalType, HasPwshExeOnWindows) + ' -Command';
  const sortedCmdKeys = Array.from(cmdAliasMap.keys()).sort();
  const saveAliasFolder = getCmdAliasSaveFolder(true, false, terminalType);
  // For bash terminals on Windows (WSL/Cygwin/MinGW), convert Windows storage path to terminal path.
  // Without this conversion, backslashes in C:\Users\... are eaten by bash, producing C:Users.../update-repo-paths.
  const saveAliasFolderForTerminal = isWindowsTerminal ? saveAliasFolder : toTerminalPath(saveAliasFolder, terminalType);
  const needReplaceArgForLoop = writeToEachFile && isWindowsTerminalOnWindows(terminalType);
  const allArgs = isWindowsTerminal ? "$*" : '"${@}"';
  const findRepoEnvNameRegex = getEnvNameRefRegex(GitRepoEnvName, isWindowsTerminal);

  // For unified approach: use update-repo-paths script for both alias and script files
  const tmpRepoPathsEnvRef = getTmpRepoPathsEnvRef(isWindowsTerminal);
  const gitRootEnvRef = getGitRootEnvRef(isWindowsTerminal);

  sortedCmdKeys.forEach(key => {
    const findBody = cmdAliasMap.get(key) || '';
    if (key.match(/^(find|sort)-/) && !key.startsWith('find-nd') && /msr(\.exe)? -rp/.test(findBody)) {
      const isPowerShellScript = findBody.includes(powerShellCmdHead); // like find-spring-ref to gfind-spring-ref

      // Unified approach: use MSR_REPO_PATHS_FILE env var set by update-repo-paths script
      // For doskey/alias: same as script files, call update-repo-paths first
      const tmpListFile = tmpRepoPathsEnvRef;

      // No inline cache check needed - update-repo-paths handles everything
      let gitFindBody = findBody.replace(/(msr(\.exe)?) -rp\s+(".+?"|\S+)/, '$1 -w ' + tmpListFile)
        .replace(/\s+(--nd|--np)\s+".+?"\s*/, ' ');

      // Remove -W option for gfind-xxx: we use pushd to cd into gitRoot with relative path cache
      // so output paths will be naturally relative (no need for -W to output full paths)
      gitFindBody = gitFindBody.replace(/\s+-W\b/, ' ');

      gitFindBody = setNotCheckInputPathInCommandLine(gitFindBody);
      if (isForProjectCmdAlias && TerminalType.CygwinBash === terminalType && isPowerShellCommand(gitFindBody, terminalType)) {
        gitFindBody = gitFindBody.replace(/\bmsr (-+\w+)/g, 'msr.exe $1'); // workaround for cygwin PowerShell
      }

      // IMPORTANT: Must rename alias BEFORE prepending updateRepoPathsCall,
      // because the regex ^key won't match after prepending the call prefix
      const gitFindName = 'g' + key;
      // Allow overwriting gfind-xxx aliases (auto-generated) to ensure latest logic (e.g. update-repo-paths source/call) is applied.
      // Even if it exists in the map (loaded from file), we regenerate it from the source 'find-xxx' command.

      if (isWindowsTerminal) {
        gitFindBody = gitFindBody.replace(new RegExp('^' + key), gitFindName);
      } else {
        gitFindBody = gitFindBody.replace(new RegExp('^alias\\s+' + key), 'alias ' + gitFindName)
          .replace(new RegExp("\\b_" + key.replace(/-/g, '_') + "\\b", 'g'), '_' + gitFindName.replace(/-/g, '_')); // [optional]: replace inner function name
      }

      // Prepend update-repo-paths call for both script files and doskey/alias
      // Script files: multi-line format with simple 'call' then use %VAR% on subsequent lines
      // Doskey: 'call && cmd /v:on /c' to use !VAR! delayed expansion in subprocess
      // NOTE: Must be done AFTER alias renaming since doskey format is "name=body"
      // For relative paths: wrap msr command with pushd/popd to cd to gitRoot
      if (!isPowerShellScript) {
        const updateRepoPathsCall = getUpdateRepoPathsCallCommand(isWindowsTerminal, saveAliasFolderForTerminal, writeToEachFile);
        if (isWindowsTerminal && !writeToEachFile) {
          // For Windows doskey: use "cmd /v:on /c" to execute in subprocess with delayed expansion
          // !VAR! refs are NOT expanded by outer shell (no delayed expansion by default)
          // They pass through to subprocess where cmd /v:on enables delayed expansion
          // This avoids popd issue because subprocess auto-returns to original directory after exit
          // and the subprocess exit code (msr's return value) is propagated back to caller
          // NOTE: Without outer quotes, inner quotes stay as-is, but & must be escaped as ^&
          // Format: gfind-xxx=call update-repo-paths.cmd && cmd /v:on /c pushd "!MSR_REPO_ROOT!" ^&^& msr -w "!MSR_REPO_PATHS_FILE!" ...
          const msrCommandMatch = gitFindBody.match(new RegExp('^' + gitFindName + '=(.+)$'));
          if (msrCommandMatch) {
            const msrCommand = msrCommandMatch[1];
            // Escape & as ^& for cmd /v:on /c without outer quotes
            const escapedMsrCommand = msrCommand.replace(/&/g, '^&');
            gitFindBody = `${gitFindName}=${updateRepoPathsCall}cmd /v:on /c pushd ${gitRootEnvRef} ^&^& ${escapedMsrCommand}`;
          }
        } else if (!isWindowsTerminal && !writeToEachFile) {
          // For Linux bash inline aliases: insert source command INSIDE the alias quotes.
          // gitFindBody format: alias gfind-xxx='msr ...' or alias gfind-xxx='function _gfind_xxx() {...}; _gfind_xxx'
          // NOTE: Must save msr exit code before popd, then return it to preserve msr return value
          if (/\bfunction\s+\w+/m.test(gitFindBody) || /=\s*['"]\s*function\b/.test(gitFindBody)) {
            // Insert INSIDE the function body after the opening brace
            // Add pushd/popd wrapper: pushd "$MSR_REPO_ROOT" && ... ; local msrExit=$?; popd; return $msrExit
            gitFindBody = gitFindBody.replace(/(function\s+\w+[\s\S]*?\{\s*)/, `$1${updateRepoPathsCall}pushd ${gitRootEnvRef} >/dev/null && `);
            // Add exit code save before popd, and return it after popd
            // NOTE: In single-quoted alias, $? should NOT be escaped (no backslash needed)
            gitFindBody = gitFindBody.replace(/(\s*\}\s*;\s*\w+)/, ` ; local msrExit=$?; popd >/dev/null; return $msrExit$1`);
          } else {
            // Simple alias without function wrapper - wrap in function with pushd/popd
            // Must use function to properly capture "${@}" arguments and prevent them from leaking to popd
            // Without function wrapper, bash alias text substitution appends args at the END of the expansion,
            // causing args like "-l" to become "popd >/dev/null -l" which fails with "popd: -l: invalid number"
            // Use getCommandAliasText (same proven code path as gfind-md-ref) to ensure correct multi-line formatting
            // NOTE: Save msr exit code before popd, then return it to preserve msr return value
            // NOTE: In single-quoted alias, $? should NOT be escaped (no backslash needed)
            const aliasMatch = gitFindBody.match(/^(alias\s+\S+=)(['"])(.+)\2$/);
            if (aliasMatch) {
              const innerBody = aliasMatch[3]; // the body inside quotes, already has "${@}"
              const wrappedBody = `${updateRepoPathsCall}pushd ${gitRootEnvRef} >/dev/null && ${innerBody} ; local msrExit=$?; popd >/dev/null; return $msrExit`;
              // useFunction=true for function wrapping, addTailArgs=false since innerBody already has "${@}",
              // hideCmdAddColor=false since body was already processed
              gitFindBody = getCommandAliasText(gitFindName, wrappedBody, true, terminalType, writeToEachFile, false, false, false);
            } else {
              // Fallback: log warning and use old approach (has popd bug with trailing args, but works without args)
              outputWarnByTime(`gfind function-wrap regex did not match for ${gitFindName}, using fallback. Body: ${gitFindBody.substring(0, 120)}`);
              gitFindBody = gitFindBody.replace(/(alias\s+\S+=['"])/, `$1${updateRepoPathsCall}pushd ${gitRootEnvRef} >/dev/null && `);
              gitFindBody = gitFindBody.replace(/(['"])$/, ` ; local msrExit=$?; popd >/dev/null; return $msrExit$1`);
            }
          }
        } else {
          // For script files (Windows CMD or Linux bash): prepend to body and wrap with pushd/popd
          // NOTE: Save msr exit code before popd, then return it to preserve msr return value
          if (isWindowsTerminal) {
            // Windows CMD script: same as doskey, use cmd /v:on /c subprocess with delayed expansion
            // Subprocess automatically restores directory on exit and propagates msr exit code
            const escapedBody = gitFindBody.replace(/&/g, '^&');
            gitFindBody = `${updateRepoPathsCall}cmd /v:on /c pushd ${gitRootEnvRef} ^&^& ${escapedBody}`;
          } else {
            // Linux bash script: pushd "$MSR_REPO_ROOT" && ... ; msrExit=$?; popd; exit $msrExit
            gitFindBody = updateRepoPathsCall + `pushd ${gitRootEnvRef} >/dev/null && ${gitFindBody} ; msrExit=$?; popd >/dev/null; exit $msrExit`;
          }
        }
      }

      if (writeToEachFile) {
        gitFindBody = gitFindBody.replace(findRepoEnvNameRegex, 'tmp');
      }
      cmdAliasMap.set(gitFindName, gitFindBody);

      if (key.match(/^(find-top-|sort-\S*by-)/)) {
        return;
      }

      // Duplicate to rgfind-xxx for all terminal types (CMD/PowerShell/WSL/MinGW/Cygwin/Linux/macOS)
      // Check if this extension should generate rgfind-xxx based on msr.cookAlias.recursiveGitFindExtensionPattern
      // Extract extension from key (e.g., 'find-cpp' -> 'cpp', 'find-cs-ref' -> 'cs', 'find-ui-def' -> 'ui')
      // Use non-greedy match to extract extension before optional -ref/-def suffix
      const extMatch = key.match(/^find-(\w+?)(?:-(?:ref|def))?$/);
      const extension = extMatch ? extMatch[1] : '';

      // Only generate rgfind-xxx if extension matches the configured pattern (default empty = disabled for all)
      // rgfind-xxx: Only search subdirectories that are independent git repos (have .git directory)
      // This is the core job of rgfind-xxx - no smart fallback to gfind-xxx for current directory
      // Special case: always generate rgfind-file as a general-purpose alias (no extension filter)
      const isGeneralFindAlias = key === 'find-file';
      if (!isNullOrEmpty(extension) && (isGeneralFindAlias || MyConfig.CookRecursiveGitFindExtensionRegex.test(extension))) {
        const recursiveGitFindName = 'rg' + key;
        let recursiveGitFindBody = isWindowsTerminal
          ? `for /f "tokens=*" %a in ('dir /A:D /B .') do @if exist "%CD%\\%a\\.git" pushd "%CD%\\%a" && ${gitFindName} ${allArgs} -O & popd`
          : `for folder in $(ls -d $PWD/*/); do [ -d "$folder/.git" ] && pushd "$folder" >/dev/null && ${saveAliasFolderForTerminal}/${gitFindName} ${allArgs} -O; popd > /dev/null; done`;
        if (needReplaceArgForLoop) {
          recursiveGitFindBody = replaceForLoopVariableForWindowsScript(recursiveGitFindBody);
        }
        recursiveGitFindBody = getCommandAliasText(recursiveGitFindName, recursiveGitFindBody, true, terminalType, writeToEachFile, false, false);
        cmdAliasMap.set(recursiveGitFindName, recursiveGitFindBody);
      }
    }
  });
}

function addOpenUpdateCmdAlias(cmdAliasMap: Map<string, string>, openFileTool: string, isWindowsTerminal: boolean, writeToEachFile: boolean, aliasFilePath: string, updateName: string = 'update-alias', openName: string = 'open-alias') {
  const loadCmdAliasCommand = getLoadAliasFileCommand(aliasFilePath, isWindowsTerminal);
  const resetJunkPathEnvCommand = updateName.startsWith('update-')
    ? getResetJunkPathEnvCommand(isWindowsTerminal) + ' && '
    : '';

  const updateDoskeyText = isWindowsTerminal
    ? (writeToEachFile ? loadCmdAliasCommand : `${updateName}=${resetJunkPathEnvCommand}${loadCmdAliasCommand}`)
    : (writeToEachFile ? loadCmdAliasCommand : `alias ${updateName}='${resetJunkPathEnvCommand}${loadCmdAliasCommand}'`);

  const openDoskeyText = isWindowsTerminal
    ? (writeToEachFile ? `${openFileTool} ${aliasFilePath}` : `${openName}=${openFileTool} ${aliasFilePath}`)
    : (writeToEachFile ? `${openFileTool} ${aliasFilePath}` : `alias ${openName}='${openFileTool} ${aliasFilePath}'`);

  cmdAliasMap.set(updateName, updateDoskeyText);
  cmdAliasMap.set(openName, openDoskeyText);
}

function getOpenFileToolName(isWindowsTerminal: boolean, writeToEachFile: boolean, cmdAliasMap: Map<string, string>): string {
  let toolToOpen = 'code';
  if (isWindowsTerminal) {
    const aliasBody = 'doskey /macros 2>&1 | msr -PI -t "^(%1)"';
    const existingOpenDoskey = cmdAliasMap.get('open-alias') as string || '';
    const matchTool = /=(\w+\S+|"\w+.*?")/.exec(existingOpenDoskey);
    toolToOpen = isNullOrEmpty(existingOpenDoskey) || !matchTool ? 'code' : matchTool[1];
    cmdAliasMap.set('alias', getCommandAliasText('alias', aliasBody, false, TerminalType.CMD, writeToEachFile));
    cmdAliasMap.set('malias', getCommandAliasText('malias', aliasBody, false, TerminalType.CMD, writeToEachFile));
  } else if (!isWindowsTerminal) {
    cmdAliasMap.set('malias', getCommandAliasText('malias', 'alias | msr -PI -t "^(?:alias\\s+)?($1)"', true, TerminalType.WslBash, writeToEachFile));
  }
  return toolToOpen;
}

function showTipByCommand(terminal: vscode.Terminal | undefined, terminalType: TerminalType, aliasCount: number, initLinuxTerminalCommands = "") {
  // const generalScriptFilesFolder = getCmdAliasSaveFolder(true, false, terminalType);
  // const setToolAliasEnvCmd = getSetToolEnvCommand(terminalType, [generalScriptFilesFolder]);
  const isWindowsTerminal = isWindowsTerminalOnWindows(terminalType);
  const defaultCmdAliasFileStoragePath = getGeneralCmdAliasFilePath(terminalType);
  const defaultCmdAliasFileForTerminal = toTerminalPath(defaultCmdAliasFileStoragePath, terminalType);
  // If use echo command, should use '\\~' instead of '~'
  const defaultAliasPathForBash = getDisplayPathForBash(defaultCmdAliasFileForTerminal, '~'); // '\\~');
  const replaceTipValueArg = `-x S#C -o ${aliasCount}`;
  const finalGuide = `You can create alias in ${defaultAliasPathForBash}${isWindowsTerminal ? '' : ' or ~/.bashrc'}`
    + ` + use S#C alias like find-ref gfind-cpp-ref gfind-doc gfind-file gfind-top-type.`
    + ` Use find-alias / rm-alias to manage alias.`
    + ` Change user settings for all functions:`
    + ` Toggle-Enable/Disable finding definition`
    + ` + Adjust-Color + Fuzzy-Code-Mining + Hide/Show-Menus`
    + ` + Use git-ignore + Git operations: gdm-l / gdm-nt / gdm / gpm / gpc / gpc-sm for gfind-xxx.`
    + ` ${CookCmdDocUrl} for Advanced/Menu/Mouse search + preview->replace.`
    + ` Outside terminals/IDEs: use-this-alias / out-fp / out-rp.`;

  const colorPattern = '~\\S+|\\d+|m*alias|doskey|find-\\S+|sort-\\S+|out-\\S+|gpc-?\\w*|git-\\S+|use-\\S+|msr.skip\\S+|\\S+-alias\\S*|other|mock|mingw'
    + '|Toggle|Enable|Disable|Adjust-Color|Code-Mining|Hide|Show|Preview-|-Replace-|git-ignore|Advanced|Mouse';

  const newLine = isWindowsTerminal ? "\r\n" : "\n";
  const commentHead = newLine + (isWindowsTerminal ? "::" : "#") + " ";
  const colorCmd = ` | msr -aPA -ix ignored -e "\\d+|Skip\\w+|g?find-\\w+|MSR-\\S+"`;
  const gitInfoTemplate = getTipInfoTemplate(isWindowsTerminal, false);

  const tipFileStoragePath = getTipFileStoragePath(terminalType);
  const tipFileDisplayPath = toTerminalPath(tipFileStoragePath, terminalType);

  const bashHeader = getBashFileHeader(isWindowsTerminal);
  let expectedContent = isWindowsTerminal ? "@echo off" + newLine : "";
  if (!isWindowsTerminal && !isNullOrEmpty(initLinuxTerminalCommands)) {
    const initLinuxStoragePath = getInitLinuxScriptStoragePath(terminalType);
    const initLinuxDisplayPath = toTerminalPath(initLinuxStoragePath, terminalType);
    saveTextToFile(initLinuxStoragePath, bashHeader + initLinuxTerminalCommands);
    expectedContent += `source ${initLinuxDisplayPath}` + newLine;
  }

  expectedContent += newLine + getJunkEnvCommandForTipFile(isWindowsTerminal)
    + newLine + `msr -aPA -e "(http\\S+s|Git \\w+|del-this\\S+)|\\w+" -z "${finalGuide}" -it "${colorPattern}" ` + (isWindowsTerminal ? '%*' : '$*')
    + commentHead + gitInfoTemplate + " Free to use gfind-xxx / find-xxx." + colorCmd + ` -t "[1-9]\\d* e\\w+"`
    + commentHead + gitInfoTemplate + " Please use gfind-xxx instead of find-xxx for git-exemptions." + colorCmd + ` -t "[1-9]\\d* e\\w+|MSR-\\S+|\\bfind-\\S+"`
    + commentHead + gitInfoTemplate + " Will not use git-ignore as too long Skip_Junk_Paths." + colorCmd + ` -t "[1-9]\\d* e\\w+|MSR-\\S+|Skip[\\w\\. -]+ = ([89][1-9]\\d{2}|\\d{5,})|(not use \\S+|too long [\\w-]+)"`
    + commentHead + getTipInfoTemplate(isWindowsTerminal, true)
    + newLine;

  expectedContent = expectedContent.replace(/(\r?\n)+/, '$1');
  if (saveTextToFile(tipFileStoragePath, bashHeader + expectedContent)) {
    const command = `${isWindowsTerminal ? "" : "bash"} ${quotePaths(tipFileDisplayPath)} ${replaceTipValueArg}`;
    sendCommandToTerminal(command, terminal || getRunCmdTerminal(), true);
  }
}

function asyncAddUserPathToEnvForWindows(generalScriptFilesFolder: string, rawWindowsPathSet: Set<string>) {
  const toolFolder = getToolExportFolder(TerminalType.CMD);
  const foldersToAdd = isNullOrEmpty(toolFolder) ? [generalScriptFilesFolder] : [generalScriptFilesFolder, toolFolder];
  let foundCount = 0;
  for (let k = 0; k < foldersToAdd.length && foundCount < foldersToAdd.length; k++) {
    foundCount += rawWindowsPathSet.has(foldersToAdd[k]) ? 1 : 0;
  }

  if (foundCount < foldersToAdd.length) {
    const addPathText = foldersToAdd.join(';').trimRight();
    const scriptPath = path.join(generalScriptFilesFolder, `add-user-path.cmd`);
    ChildProcess.exec(`${scriptPath} "${addPathText}"`);
  }
}

function getRegisterDoskeyCommand(isRegister = true, silent = false) {
  const aliasFilePath = getGeneralCmdAliasFilePath(TerminalType.CMD);
  const displayPath = toTerminalPath(aliasFilePath, TerminalType.CMD);
  const refinedPath = displayPath.includes(' ') ? '\\"' + displayPath + '\\"' : displayPath;
  const keyPath = String.raw`"HKEY_CURRENT_USER\Software\Microsoft\Command Processor"`;
  const tail = silent ? " > nul" : "";
  return isRegister
    ? `REG ADD ${keyPath} /v Autorun /d "DOSKEY /MACROFILE=${refinedPath}" /f` + tail
    : `REG DELETE ${keyPath} /v Autorun /f` + tail;
}

export class CookAliasArgs {
  public FromMenu = false; // User clicked mouse/menu to cook alias/doskeys.
  public FilePath = ''; // Used to get repo folder.
  public ForProject = false; // Use project git-ignore and related env settings.
  public WriteToEachFile = false; // Dump each alias to a script file.
  public Terminal: vscode.Terminal | undefined = undefined; // MSR-RUN-CMD or newly created terminal (by user).
  public IsNewlyCreated = false; // New terminals of MSR-RUN-CMD or other Bash/CMD/PowerShell/MinGW/Cygwin terminals.
  public DumpOtherCmdAlias = false; // Alias from this + other file (usually user added alias/doskeys or file ~/.bashrc).
  public IsSelfLoopCalling = false; // Used to cook common alias for Linux terminals (MinGW/Cygwin/WSL) on Windows.
  public OnlyCookFile = false; // Only cook alias/doskey file.
  public GitCheckSucceeded = false; // Passed git-ignore file when using it.
  public GitCheckFailed = false; // Not a git repo or no git-ignore file.
  public SilentAll = false; // Don't show too many messages in MSR-RUN-CMD terminal.
}

export function cookCmdShortcutsOrFile(cookArgs: CookAliasArgs) {
  // 3 cookings of MSR-RUN-CMD: Init-terminal + Load-git-ignore + Tool downloaded.
  if (!RunCommandChecker.IsToolExists) {
    return;
  }

  let args = new CookAliasArgs();
  Object.assign(args, cookArgs);

  const trackBeginTime = new Date();

  // TODO: Refactor to compose-alias + write-files + different-os-terminals
  const isRunCmdTerminal = args.Terminal !== undefined && args.Terminal != null && args.Terminal.name === RunCmdTerminalName;
  const isNewlyCreatedRunCmdTerminal = args.IsNewlyCreated && isRunCmdTerminal;
  outputDebugByTime('Begin cooking command shortcuts for terminal ' + (args.Terminal ? args.Terminal.name : ''));
  const [shellExe, terminalType] = isRunCmdTerminal && !args.IsNewlyCreated && IsWindows
    ? ['cmd.exe', TerminalType.CMD]
    : getShellExeAndTerminalType(args.Terminal, args.IsNewlyCreated);
  const shellExeName = path.basename(shellExe).replace(/\.exe$/i, ''); // Remove .exe for Linux bash on Windows.
  const bashConfigFile = "~/." + (isNullOrEmpty(shellExeName) ? 'bash' : shellExeName).replace('wsl', 'bash') + "rc";
  const shellExeFolder = path.dirname(shellExe);
  const isWindowsTerminal = isWindowsTerminalOnWindows(terminalType);
  const isLinuxTerminalOnWindows = IsWindows && !isWindowsTerminal;
  const generalScriptFilesFolder = getCmdAliasSaveFolder(true, false, terminalType);
  createDirectory(generalScriptFilesFolder);
  const generalAliasFolderForBash = toTerminalPath(generalScriptFilesFolder, terminalType);
  const repoFolder = isRunCmdTerminal && !args.OnlyCookFile ? DefaultRepoFolder : getRepoFolder(args.FilePath, args.ForProject);
  const repoFolderName = getRepoFolderName(repoFolder);

  if (isPowerShellTerminal(terminalType) && MyConfig.canUseGoodGitIgnore(repoFolder)) {
    const testScriptName = isWindowsTerminal && IsWindows ? 'gfind-all.cmd' : 'gfind-all';
    const checkScriptPath = path.join(generalScriptFilesFolder, testScriptName);
    if (!args.IsSelfLoopCalling && !fs.existsSync(checkScriptPath)) {
      cookCmdShortcutsOrFile({ FromMenu: args.FromMenu, FilePath: args.FilePath, WriteToEachFile: true, Terminal: args.Terminal, IsSelfLoopCalling: true } as CookAliasArgs);
    }
  }

  const saveAliasFolder = getCmdAliasSaveFolder(false, args.ForProject, terminalType);
  if (isNullOrEmpty(repoFolderName)) { // && !terminal) {
    args.ForProject = false;
  }

  if (isWindowsTerminal && !args.ForProject && isRunCmdTerminal) {
    asyncSetJunkEnvForWindows();
  }

  const singleScriptsSaveFolder = toStoragePath(generalScriptFilesFolder);
  const singleScriptsFolderForTerminal = toTerminalPath(singleScriptsSaveFolder, terminalType);
  const projectAliasFileSuffix = getAliasFileName(isWindowsTerminal, true);
  const cmdAliasFileNameForProject = getProjectFolderKey(DefaultRepoFolderName) + '.' + projectAliasFileSuffix; // keep same with use-this-alias
  const tmpAliasStorageFolder = getCmdAliasSaveFolder(false, true, terminalType);
  const projectAliasFilePath = toStoragePath(path.join(tmpAliasStorageFolder, cmdAliasFileNameForProject));
  const quotedProjectAliasFileForTerminal = quotePaths(toTerminalPath(projectAliasFilePath, terminalType));
  const defaultCmdAliasFilePath = getGeneralCmdAliasFilePath(terminalType);
  const cmdAliasFileStoragePath = args.ForProject ? projectAliasFilePath : defaultCmdAliasFilePath;
  const defaultCmdAliasFileForTerminal = toTerminalPath(defaultCmdAliasFilePath, terminalType);
  const quotedDefaultAliasFileForTerminal = quotePaths(defaultCmdAliasFileForTerminal);
  const quotedCmdAliasFileForTerminal = quotePaths(toTerminalPath(cmdAliasFileStoragePath, terminalType));

  createDirectory(singleScriptsSaveFolder);
  createDirectory(tmpAliasStorageFolder);

  // TODO: simplify checking tool path: Add tool folder + cmdAlias folder without checking.
  const rawWindowsPathSet = new Set<string>((process.env['PATH'] || '').split(/\\?\s*;\s*/));

  // If use echo command, should use '\\~' instead of '~'
  const defaultAliasPathForBash = getDisplayPathForBash(defaultCmdAliasFileForTerminal, '~'); // '\\~');

  if (args.IsNewlyCreated && isLinuxTerminalOnWindows && isNewlyCreatedRunCmdTerminal) {
    // Calling bash to enter MinGW / Cygwin
    let envPathSet = new Set<string>().add(shellExeFolder);
    rawWindowsPathSet.forEach(a => envPathSet.add(a));
    envPathSet = getUniqueStringSetNoCase(envPathSet, true);
    process.env['PATH'] = Array.from(envPathSet).join(';');
    runCmdInTerminal(quotePaths(shellExe));
  }

  const initLinuxTerminalCommands = getLinuxInitCommandLines(terminalType, bashConfigFile);
  const aliasHeadText = getSkipJunkPathEnvCommand(terminalType, repoFolder, args.ForProject, generalScriptFilesFolder);
  const newLine = isWindowsTerminal ? "\r\n" : "\n";
  let allCmdAliasText = getBashFileHeader(isWindowsTerminal) + aliasHeadText;
  if (args.ForProject && !args.WriteToEachFile) {
    if (isWindowsTerminal) {
      ChildProcess.exec(getRegisterDoskeyCommand());
      // allCmdAliasText += "@REM " + getRegisterDoskeyCommand(false) + newLine;
    } else {
      const initLinuxScriptPath = getInitLinuxScriptDisplayPath(terminalType);
      allCmdAliasText += getLoadAliasFileCommand(initLinuxScriptPath, false) + newLine;
    }

    allCmdAliasText += getLoadAliasFileCommand(defaultCmdAliasFileForTerminal, isWindowsTerminal) + newLine;
    saveTextToFile(projectAliasFilePath, allCmdAliasText, 'temp project alias file');
    if (isRunCmdTerminal && !args.GitCheckFailed) {
      return;
    }
  } else if (!args.WriteToEachFile && !isNullOrEmpty(allCmdAliasText)) {
    allCmdAliasText += newLine;
  }

  const [cmdAliasMap, aliasCountFromFile, _commands] = getCommandAliasMap(terminalType, repoFolder, args.ForProject, args.WriteToEachFile, args.DumpOtherCmdAlias);
  const openFileTool = getOpenFileToolName(isWindowsTerminal, args.WriteToEachFile, cmdAliasMap);
  addOpenUpdateCmdAlias(cmdAliasMap, openFileTool, isWindowsTerminal, args.WriteToEachFile, quotedDefaultAliasFileForTerminal, 'update-alias', 'open-alias');

  const tmpAliasFolderForTerminal = toTerminalPath(getCmdAliasSaveFolder(false, true, terminalType), terminalType);
  const linuxTmpFolder = isLinuxTerminalOnWindows ? tmpAliasFolderForTerminal : '/tmp';
  const useThisAliasBody = isWindowsTerminal
    ? String.raw`@for /f "tokens=*" %a in ('git rev-parse --show-toplevel 2^>nul ^|^| echo "%CD%"') do`
    + String.raw` @for /f "tokens=*" %b in ('msr -z "%a" -t ".*?([^\\/]+?)\s*$" -o "\1" -aPAC ^|`
    + String.raw` msr -t "${TrimProjectNameRegex.source}" -o "-" -aPAC') do`
    + String.raw` @if exist "%tmp%\%b.${projectAliasFileSuffix}" ( call "%tmp%\%b.${projectAliasFileSuffix}" )`
    + String.raw` else ( echo Not found alias file: %tmp%\%b.${projectAliasFileSuffix} - Please open a folder to cook alias. )`
    : String.raw`thisFile=${linuxTmpFolder}/$(echo $(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD") |`
    + String.raw` msr -t ".*?([^/]+?)\s*$" -o "\1" -aPAC | msr -t "${TrimProjectNameRegex.source}" -o "-" -aPAC).${projectAliasFileSuffix};`
    + String.raw` [ -f "$thisFile" ] && source $thisFile || echo "Not found alias file: $thisFile - Please open a folder to cook alias."`;
  cmdAliasMap.set('use-this-alias', getCommandAliasText('use-this-alias', useThisAliasBody, isWindowsTerminal, terminalType, args.WriteToEachFile, false));

  const shouldCheckUpdateAlias = isWeeklyCheckTime() || IsDebugMode;
  ['use-this-alias', 'add-user-path', 'reload-env', 'reset-env'].forEach(name => {
    let scriptBody = cmdAliasMap.get(name) as string;
    if (isNullOrEmpty(scriptBody)) {
      return;
    }
    if (!args.WriteToEachFile) {
      if (isWindowsTerminal) {
        scriptBody = scriptBody.replace(/^\s*\w+[\w-]*=\s*/, '');
      } else {
        scriptBody = scriptBody.replace(/^alias\s+[\w-]+=\s*.function\s+\w+[^\r\n]*\{\s*(.+?)\s*[\r\n]+\s*\}\s*;\s*\w+[^\r\n]*\s*$/, '$1')
          .replace(/^alias\s+[\w-]+=\s*.(.+)\s*\W+\s*$/, '$1');
      }
    }
    const useFunction = name === 'use-this-alias' || name === 'add-user-path';
    const text = getCommandAliasText(name, scriptBody, useFunction, terminalType, true, false);
    writeOneAliasToFile(name, text, shouldCheckUpdateAlias);
  });

  const openThisAliasBody = useThisAliasBody.replace(/doskey\W+MACROFILE=|(@?call|source) /g, 'code ');
  cmdAliasMap.set('open-this-alias', getCommandAliasText('open-this-alias', openThisAliasBody, true, terminalType, args.WriteToEachFile, true));
  if (args.ForProject && !isNullOrEmpty(repoFolderName)) {
    const tmpName = getProjectFolderKey(repoFolderName).toLowerCase();
    addOpenUpdateCmdAlias(cmdAliasMap, openFileTool, isWindowsTerminal, args.WriteToEachFile, quotedCmdAliasFileForTerminal, 'update-' + tmpName + '-alias', 'open-' + tmpName + '-alias');
  }

  // list-alias + use-alias
  // list-alias: without args lists all alias files; with arg "1" lists only the current repo's alias file (like use-this-alias)
  const listAllBody = 'msr -l -M --wt --sz -p ' + quotePaths(tmpAliasFolderForTerminal) + ' --pp "' + projectAliasFileSuffix + '$"';
  let listAliasBody: string;
  if (isWindowsTerminal) {
    listAliasBody = String.raw`@if "$1" == "1" (`
      + String.raw` @for /f "tokens=*" %a in ('git rev-parse --show-toplevel 2^>nul ^|^| echo "%CD%"') do`
      + String.raw` @for /f "tokens=*" %b in ('msr -z "%a" -t ".*?([^\\/]+?)\s*$" -o "\1" -aPAC ^|`
      + String.raw` msr -t "${TrimProjectNameRegex.source}" -o "-" -aPAC') do`
      + String.raw` @if exist "%tmp%\%b.${projectAliasFileSuffix}" (`
      + String.raw` msr -l -M --wt --sz -p "%tmp%\%b.${projectAliasFileSuffix}" $2 $3 $4 $5 $6 $7 $8 $9`
      + String.raw` ) else ( echo Not found alias file: %tmp%\%b.${projectAliasFileSuffix} )`
      + ` ) else ( ${listAllBody} $* )`;
  } else {
    listAliasBody = 'if [ "${1}" = "1" ]; then shift; '
      + String.raw`thisFile=${linuxTmpFolder}/$(echo $(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD") |`
      + String.raw` msr -t ".*?([^/]+?)\s*$" -o "\1" -aPAC | msr -t "${TrimProjectNameRegex.source}" -o "-" -aPAC).${projectAliasFileSuffix}; `
      + 'if [ -f "$thisFile" ]; then msr -l -M --wt --sz -p "$thisFile" "${@}"; else echo "Not found alias file: $thisFile"; fi; '
      + 'else ' + listAllBody + ' "${@}"; fi';
  }
  cmdAliasMap.set('list-alias', getCommandAliasText('list-alias', listAliasBody, true, terminalType, args.WriteToEachFile, false));
  const useBody = isWindowsTerminal ? 'call $1' : 'source $1';
  cmdAliasMap.set('use-alias', getCommandAliasText('use-alias', useBody, true, terminalType, args.WriteToEachFile, false));

  [FindCommandType.FindTopFolder, FindCommandType.FindTopType, FindCommandType.FindTopSourceFolder, FindCommandType.FindTopSourceType, FindCommandType.FindTopCodeFolder, FindCommandType.FindTopCodeType].forEach(findTopCmd => {
    const findTopBody = getFindTopDistributionCommand(true, args.ForProject, true, findTopCmd, repoFolder);
    let aliasName = replaceTextByRegex(FindCommandType[findTopCmd], /([a-z])([A-Z])/g, '$1-$2');
    aliasName = replaceTextByRegex(aliasName, /^-|-$/g, '').toLowerCase();
    cmdAliasMap.set(aliasName, getCommandAliasText(aliasName, findTopBody, false, terminalType, args.WriteToEachFile, false, false));
  });

  [FindCommandType.SortBySize, FindCommandType.SortByTime, FindCommandType.SortSourceBySize, FindCommandType.SortSourceByTime, FindCommandType.SortCodeBySize, FindCommandType.SortCodeByTime].forEach(sortCmd => {
    const sortBody = getSortCommandText(true, args.ForProject, true, sortCmd, repoFolder, true);
    let aliasName = replaceTextByRegex(FindCommandType[sortCmd], /([a-z])([A-Z])/g, '$1-$2');
    aliasName = replaceTextByRegex(aliasName, /^-|-$/g, '').toLowerCase();
    cmdAliasMap.set(aliasName, getCommandAliasText(aliasName, sortBody, false, terminalType, args.WriteToEachFile, false, false));
  });

  duplicateSearchFileCmdAlias(repoFolder, terminalType, cmdAliasMap, args.ForProject, args.WriteToEachFile);
  if (MyConfig.useGitFileList()) {
    const gitFindExtraOptions = (cmdAliasMap.get('gfind-file') || '').replace(/.*?msr -w\s+\S+/, '');
    const optionSet = new Set<string>(gitFindExtraOptions.split(/\s+/).filter(s => s.match(/^--?[a-zA-Z][a-zA-Z0-9-]*$/)));
    if (optionSet.size > 0) {
      const extraOptionPattern = new RegExp('\\s+(' + Array.from(optionSet).join('|') + ")(\\s+|$)", "g");
      ProjectToGitFindFileExtraOptionsMap.set(repoFolderName, extraOptionPattern);
    }
  }

  const skipWritingScriptNames = new Set<string>(['use-fp', 'use-rp', 'out-rp', 'out-fp', 'alias']);
  const canWriteScripts = args.WriteToEachFile && createDirectory(singleScriptsSaveFolder);

  let writeScriptFailureCount = 0;
  const sortedKeys = Array.from(cmdAliasMap.keys()).sort();
  const writeScriptsStartTime = new Date();
  sortedKeys.forEach(key => {
    let scriptContent = cmdAliasMap.get(key) || '';
    if (args.WriteToEachFile) {
      if (canWriteScripts && !skipWritingScriptNames.has(key) && (args.DumpOtherCmdAlias || key.match(/^(r?g?find|sort)-|malias|^(list|use)-alias$/))) {
        // Add use-this-alias prefix for find-xxx/sort-xxx script files (not gfind/rgfind/gsort/rgsort)
        // This loads project-specific Skip_Junk_Paths for precise filtering with <1s overhead
        // CMD scripts parse line-by-line, so call on line 1 sets env vars for %VAR% on line 2
        if (key.match(/^(find|sort)-/) && !key.match(/^(r?g)(find|sort)-/) && /Skip_Junk_Name|Skip_Junk_Paths|msr\s+-rp\b/.test(scriptContent)) {
          if (isWindowsTerminal) {
            scriptContent = `call use-this-alias >nul 2>&1${newLine}${scriptContent}`;
          } else {
            scriptContent = `source "${generalAliasFolderForBash}/use-this-alias" >/dev/null 2>&1${newLine}${scriptContent}`;
          }
        }
        if (!writeOneAliasToFile(key, scriptContent, true)) {
          writeScriptFailureCount++;
        }
      }
    } else if (!args.ForProject) {
      // Add use-this-alias prefix for find-xxx/sort-xxx doskey/alias (not gfind/rgfind/gsort/rgsort)
      // This loads project-specific Skip_Junk_Paths for precise filtering
      // Exclude PowerShell-wrapped commands (find-spring-ref etc.) which have complex quoting
      const isPowerShellBody = /\b(PowerShell|pwsh)\s+-Command\b/i.test(scriptContent);
      const usesJunkPaths = /Skip_Junk_Name|Skip_Junk_Paths|msr\s+-rp\b/.test(scriptContent);
      if (key.match(/^(find|sort)-/) && !key.match(/^(r?g)(find|sort)-/) && !isPowerShellBody && usesJunkPaths) {
        if (isWindowsTerminal) {
          // For Windows doskey: need cmd /v:on /c with delayed expansion
          // Doskey is parsed as single line - %VAR% expanded before call runs
          // Replace %Skip_Junk_Name% and %Skip_Junk_Paths% with !VAR! for delayed expansion
          // Use & (not &&) so find-xxx still runs even if use-this-alias fails (best effort)
          // Format: find-cs=call use-this-alias & cmd /v:on /c msr ... !Skip_Junk_Name! "!Skip_Junk_Paths!" ...
          const doskeyMatch = scriptContent.match(/^([\w-]+)=(.+)$/s);
          if (doskeyMatch) {
            let body = doskeyMatch[2];
            body = body.replace(/%Skip_Junk_Name%/g, '!Skip_Junk_Name!').replace(/%Skip_Junk_Paths%/g, '!Skip_Junk_Paths!');
            body = body.replace(/&/g, '^&');
            scriptContent = `${doskeyMatch[1]}=call use-this-alias & cmd /v:on /c ${body}`;
          }
        } else {
          // For Linux alias: insert source inside the alias quotes
          // $VAR is expanded at execution time, so no delayed expansion needed
          const sourceCmd = `source "${generalAliasFolderForBash}/use-this-alias" 2>/dev/null; `;
          if (/\bfunction\s+\w+/m.test(scriptContent) || /=\s*['"]\s*function\b/.test(scriptContent)) {
            // Function-wrapped alias: insert source after opening brace
            scriptContent = scriptContent.replace(/(function\s+\w+[\s\S]*?\{\s*)/, `$1${sourceCmd}`);
          } else {
            // Simple alias: insert source after opening quote
            scriptContent = scriptContent.replace(/(alias\s+\S+=['"])/, `$1${sourceCmd}`);
          }
        }
      }
      // Remove trailing whitespace from each line to avoid unnecessary diff
      const cleanedContent = scriptContent.replace(/[ \t]+$/gm, '');
      allCmdAliasText += cleanedContent + newLine + newLine;
    }
  });
  if (args.WriteToEachFile && canWriteScripts) {
    // Write update-repo-paths script for centralized cache logic
    const updateRepoPathsScriptPath = path.join(singleScriptsSaveFolder, isWindowsTerminal ? UpdateRepoPathsScriptName + '.cmd' : UpdateRepoPathsScriptName);
    const updateRepoPathsContent = getUpdateRepoPathsScriptContent(isWindowsTerminal);
    if (!saveTextToFile(updateRepoPathsScriptPath, updateRepoPathsContent, 'update-repo-paths script', true)) {
      outputWarnByTime(`Failed to write ${UpdateRepoPathsScriptName} script to: ${updateRepoPathsScriptPath}`);
    }
    outputInfoQuietByTime(`Cost ${getElapsedSecondsToNow(writeScriptsStartTime).toFixed(3)}s to write aliases to files.`);
  }

  // Normalize file content: trim trailing whitespace and ensure single trailing newline
  allCmdAliasText = normalizeFileContent(allCmdAliasText, newLine);

  if (args.WriteToEachFile) {
    if (canWriteScripts && writeScriptFailureCount < cmdAliasMap.size) {
      if (!isWindowsTerminal) {
        if (isLinuxTerminalOnWindows) {
          // MinGW/Cygwin/WSL on Windows: must use terminal command with terminal-specific path
          runCmdInTerminal('chmod 700 ' + singleScriptsFolderForTerminal + '/*');
        } else {
          // Native Linux/macOS: use ChildProcess.exec() to run in background without occupying the terminal
          ChildProcess.exec('chmod 700 ' + singleScriptsSaveFolder + '/*', (err) => {
            if (err) {
              outputWarnQuietByTime(`Failed to chmod scripts in: ${singleScriptsSaveFolder}/*, error: ${err.message}`);
            }
          });
        }
      }
      outputCmdAliasGuide(args.Terminal ? defaultCmdAliasFilePath : cmdAliasFileStoragePath, saveAliasFolder);
    }

    if (writeScriptFailureCount > 0) {
      outputInfoQuietByTime('Total = ' + cmdAliasMap.size + ', failures = ' + writeScriptFailureCount + ', made ' + (cmdAliasMap.size - writeScriptFailureCount) + ' command alias/doskey script files saved in: ' + singleScriptsSaveFolder);
    } else {
      outputInfoQuietByTime('Successfully made ' + cmdAliasMap.size + ' command alias/doskey script files and saved in: ' + singleScriptsSaveFolder);
    }
  } else {
    const isOnlyCookingGeneralCmdAlias = !args.ForProject && args.IsSelfLoopCalling && args.OnlyCookFile;
    const isDumpingGeneralAliasFromMenu = args.FromMenu && !args.ForProject && args.DumpOtherCmdAlias;
    if (!args.ForProject || isOnlyCookingGeneralCmdAlias || isDumpingGeneralAliasFromMenu) {
      saveTextToFile(defaultCmdAliasFilePath, allCmdAliasText, 'common alias file');
    }

    const expectedCount = cmdAliasMap.size - (args.ForProject ? 2 : 0);
    let shouldCheckUpdateCommonAlias = aliasCountFromFile < expectedCount;
    if (!shouldCheckUpdateCommonAlias && !args.IsSelfLoopCalling && (isWeeklyCheckTime() || isLinuxTerminalOnWindows)) {
      shouldCheckUpdateCommonAlias = true;
    }

    if (shouldCheckUpdateCommonAlias) {
      // Cost about 0.02 seconds, worth to check/update common alias, especially for Linux terminals on Windows
      const time1 = new Date();
      cookCmdShortcutsOrFile({ FilePath: '', Terminal: args.Terminal, IsSelfLoopCalling: true, OnlyCookFile: args.OnlyCookFile, SilentAll: true } as CookAliasArgs);
      const elapsedSeconds = getElapsedSecondsToNow(time1);
      outputInfoQuietByTime(`Cost ${elapsedSeconds}s to re-cook/update common alias file: ${defaultCmdAliasFilePath}`);
    }

    if (!args.OnlyCookFile) {
      if (args.ForProject && !args.WriteToEachFile) {
        const allTmpCmdAliasText = readTextFile(projectAliasFilePath);
        if (allTmpCmdAliasText !== allCmdAliasText) {
          saveTextToFile(projectAliasFilePath, allCmdAliasText, 'tmp project alias file');
          if (isRunCmdTerminal && args.GitCheckSucceeded) {
            const command = getLoadAliasFileCommand(quotedCmdAliasFileForTerminal, isWindowsTerminal);
            runCmdInTerminal(command);
          }
        }
      }

      if (args.Terminal && isWindowsTerminal) {
        if (TerminalType.CMD !== terminalType && TerminalType.PowerShell !== terminalType) {
          outputErrorByTime('Not supported terminal: ' + args.Terminal.name + ', shellExe = ' + shellExe);
          runCmdInTerminal('echo Not supported terminal: ' + args.Terminal.name + ', shellExe = ' + shellExe);
          // fs.unlinkSync(cmdAliasFile);
          return;
        }
      }
    }
  }

  if (args.OnlyCookFile) {
    return;
  }

  const useGitIgnore = MyConfig.canUseGoodGitIgnore(repoFolder);
  // For newly created Pwsh terminals: enable deferred send mode at sendCommandToTerminal level.
  // All sendText() calls are queued and later flushed as ONE combined sendText() call.
  // This avoids PSReadLine paste detection which concatenates rapid multiple sendText() calls into one line.
  // See: https://github.com/microsoft/vscode/issues/236397 ("PSReadLine is swallowing the \r")
  const isPwshDeferredInit = TerminalType.Pwsh === terminalType && args.IsNewlyCreated && args.Terminal !== undefined;
  if (isPwshDeferredInit) {
    enablePwshDeferredSend(args.Terminal!);
  }

  if (isPowerShellTerminal(terminalType)) {
    const setEnvPathCmd = getSetToolEnvCommand(terminalType, [generalScriptFilesFolder], true);
    runCmdInTerminal(setEnvPathCmd);
  }

  if (isWindowsTerminal) {
    asyncAddUserPathToEnvForWindows(generalScriptFilesFolder, rawWindowsPathSet);
    if (fs.existsSync(projectAliasFilePath) && !isPowerShellTerminal(terminalType)) { // avoid non-exist error, needless for main terminal which called by use-this-alias later.
      runCmdInTerminal(getLoadAliasFileCommand(quotedProjectAliasFileForTerminal, isWindowsTerminal));
    }
  } else if (TerminalType.Pwsh !== terminalType) {
    runCmdInTerminal(`source ${quotedCmdAliasFileForTerminal}`);
  }

  if (TerminalType.PowerShell === terminalType) { // && !useGitIgnore) { // avoid missing env settings
    //const tipFileDisplayPath = getTipFileDisplayPath(terminalType);
    runPostInitCommands(args.Terminal, terminalType, repoFolderName); // Must be run before 'cmd /k' for PowerShell
    // const quotedFileForPS = (quotedCmdAliasFileForTerminal === cmdAliasFileStoragePath ? cmdAliasFileStoragePath : '`"' + cmdAliasFileStoragePath + '`"').replace(TempStorageFolder, '%TMP%');
    // const loadAliasCmd = getLoadAliasFileCommand(quotedFileForPS, isWindowsTerminal, false);
    // const replaceTipValueArg = `-x S#C -o ${cmdAliasMap.size}`;
    // const cmd = `cmd /k "${loadAliasCmd}`
    //  + ` & ${tipFileDisplayPath.replace(TempStorageFolder, '%TMP%')} ${replaceTipValueArg}`
    //  + ` & echo Type exit to back to PowerShell.| msr -aPA -e .+ -x exit"`;
    // runCmdInTerminal(cmd, true);
  } else if (TerminalType.Pwsh === terminalType && !useGitIgnore) {
    if (!isPwshDeferredInit) {
      runPowerShellShowFindCmdLocation();
    }
    if (!args.SilentAll) {
      showTipByCommand(args.Terminal, terminalType, cmdAliasMap.size);
    }
    // runCmdInTerminal('bash --init-file ' + quotedCmdAliasFileForTerminal);
  } else if (!args.SilentAll) {
    showTipByCommand(args.Terminal, terminalType, cmdAliasMap.size, initLinuxTerminalCommands);
  }

  if (args.WriteToEachFile) {
    runCmdInTerminal(`sft ${quotePaths(singleScriptsFolderForTerminal)} -H 3 -T 3`);
  }
  outputInfoQuietByTime(`Cost ${getElapsedSecondsToNow(trackBeginTime).toFixed(3)}s to cook command shortcuts.`);
  if (!args.ForProject && (isRunCmdTerminal || args.FromMenu) && !isNullOrEmpty(repoFolderName) && !isWindowsTerminal) {
    runCmdInTerminal(getLoadAliasFileCommand(projectAliasFilePath, isWindowsTerminal));
  }

  if (TerminalType.PowerShell !== terminalType && !(TerminalType.Pwsh === terminalType && args.IsNewlyCreated) && !args.SilentAll) {
    runPostInitCommands(args.Terminal, terminalType, repoFolderName);
  }

  // Flush all queued commands as ONE combined sendText() for newly created Pwsh terminals.
  // processId.then() ensures the terminal process is allocated; setTimeout(1500) waits for
  // pwsh startup + PSReadLine initialization. Since we send ONE combined command (not multiple),
  // PSReadLine won't trigger paste detection even if the command arrives before full readiness —
  // the single stdin write will be processed normally when PSReadLine initializes.
  if (isPwshDeferredInit && args.Terminal) {
    const pwshTerminal = args.Terminal;
    pwshTerminal.processId.then(() => {
      setTimeout(() => {
        flushPwshDeferredCommands(pwshTerminal);
      }, 1500);
    });
  }

  function runPowerShellShowFindCmdLocation(searchFileNamePattern = "^g?find-\\w+-def") {
    if (fs.existsSync(generalScriptFilesFolder)) {
      const cmd = 'msr -l --wt --sz -p ' + quotePaths(generalScriptFilesFolder) + ` -f "${searchFileNamePattern}" -H 2 -T2 -M`;
      runCmdInTerminal(cmd);
    } else {
      runCmdInTerminal('echo "Please cook command alias/doskeys (by menu of right-click) to generate and use find-xxx in external IDEs or terminals."');
    }
  }

  function writeOneAliasToFile(name: string, scriptContent: string, checkUpdateAlias: boolean = false): boolean {
    const singleScriptPath = path.join(singleScriptsSaveFolder, isWindowsTerminal ? name + '.cmd' : name);
    if (!checkUpdateAlias && fs.existsSync(singleScriptPath)) {
      return true;
    }

    if (isWindowsTerminal) {
      const head = (MyConfig.AddEchoOffWhenCookingWindowsCommandAlias + os.EOL + MyConfig.SetVariablesToLocalScopeWhenCookingWindowsCommandAlias).trim();
      if (!/^\s*@?echo\s+(off|on)/i.test(scriptContent)) {
        scriptContent = (head.length > 0 ? head + os.EOL : head) + scriptContent;
      }
    } else {
      scriptContent = '#!/bin/bash' + '\n' + scriptContent;
    }

    scriptContent = scriptContent.trim() + (isWindowsTerminal ? '\r\n' : '\n');
    return saveTextToFile(singleScriptPath, scriptContent, 'single command alias script file', true);
  }

  function getLinuxInitCommandLines(terminalType: TerminalType, bashConfigFile: string): string {
    if (isWindowsTerminal) {
      return '';
    }

    const rcName = bashConfigFile; // rcName = '~/.bashrc'; // reduce complexity of bash / zsh / other
    const toolExportFolder = toTerminalPath(getToolExportFolder(terminalType), terminalType);
    const defaultAdding = `${toolExportFolder}:${generalAliasFolderForBash}`.replace(/^\s*:/, '');
    if (TerminalType.Pwsh === terminalType) {
      return `export PATH="$HOME:$PATH:${defaultAdding}"`;
    }

    let initLinuxCommands = "";
    if (args.IsNewlyCreated) {
      if (TerminalType.MinGWBash === terminalType || TerminalType.CygwinBash === terminalType) {
        const bashFolder = path.dirname(path.dirname(shellExe)).replace(/([^\\])(\\{1})([^\\]|$)/g, '$1$2$2$3');
        const getBashFolderCmd = TerminalType.MinGWBash === terminalType
          ? String.raw`$(where bash.exe | head -n 1 | sed 's#[\\/]usr[\\/]bin[\\/].*##' | sed 's#\\$##')`
          : String.raw`$(where bash.exe | head -n 1 | sed 's#[\\/]bin[\\/].*##' | sed 's#\\$##')`;
        const bashFolderValue = isNullOrEmpty(bashFolder) || bashFolder === '.' ? getBashFolderCmd : bashFolder;
        if (TerminalType.CygwinBash === terminalType) {
          initLinuxCommands += `export CYGWIN_ROOT="${bashFolderValue}"` + "\n";
        } else if (TerminalType.MinGWBash === terminalType) {
          initLinuxCommands += `export MINGW_ROOT="${bashFolderValue}"` + "\n";
        }
      }

      // Check existing home folder and download tool
      if (isLinuxTerminalOnWindows) {
        const shouldUseDownload = /^(Git Bash|Cygwin)/i.test(shellExe);
        if (args.Terminal || shouldUseDownload) {
          const downloadCommands = [
            new ToolChecker(terminalType).getCheckDownloadCommandsForLinuxBashOnWindows('msr', shouldUseDownload),
            new ToolChecker(terminalType).getCheckDownloadCommandsForLinuxBashOnWindows('nin', shouldUseDownload)
          ].filter(a => !isNullOrEmpty(a));

          downloadCommands.forEach(c => initLinuxCommands += c + "\n");
        }
      }
    }

    const pathValue = isLinuxTerminalOnWindows ? '/usr/bin/:~:$PATH' : '$PATH:~';
    const simpleCheck = `which msr >/dev/null || export PATH="${pathValue}"`;
    const setEnvPath = `grep -E '^which msr.*?export PATH' ${rcName} >/dev/null || ( echo >> ${rcName} && echo '${simpleCheck}' >> ${rcName} )`;
    initLinuxCommands += setEnvPath + "\n";
    initLinuxCommands += `grep -E '^source ${defaultAliasPathForBash}' ${rcName} >/dev/null`
      + ` || ( echo >> ${rcName} && echo 'source ${defaultAliasPathForBash}' >> ${rcName} )`
      + "\n";

    const checkUseAlias = `which use-this-alias`;
    const setPathCmd = `${checkUseAlias} >/dev/null || export PATH="$PATH:${defaultAdding}"`;
    const checkAddAliasCmd = `grep -E '^${checkUseAlias}' ${rcName} >/dev/null`
      + ` || ( echo >> ${rcName} && echo '${setPathCmd}' >> ${rcName} )`;

    initLinuxCommands += checkAddAliasCmd + "\n";

    if (isLinuxTerminalOnWindows && isBashTerminalType(terminalType)) {
      // Avoid msr.exe prior to msr.cygwin or msr.gcc48
      initLinuxCommands += `echo "$PATH" | grep -E "^/usr/bin/?:" > /dev/null || export PATH="/usr/bin:$PATH"` + "\n";
    }

    initLinuxCommands += `chmod 700 ${generalAliasFolderForBash}/*` + "\n";
    if (bashConfigFile !== '~/.bashrc') {
      initLinuxCommands += `source ~/.bashrc 2>/dev/null` + "\n";
    }

    initLinuxCommands += `source ${rcName}` + "\n";

    if (terminalType === TerminalType.WslBash) {
      initLinuxCommands += WslCheckingCommand + "\n";
    }

    return initLinuxCommands;
  }

  function runCmdInTerminal(cmd: string, showTerminal: boolean = false) {
    const clearAtFirst = MyConfig.ClearTerminalBeforeExecutingCommands;
    if (args.Terminal) {
      sendCommandToTerminal(cmd, args.Terminal, showTerminal, clearAtFirst, isLinuxTerminalOnWindows);
    } else {
      runCommandInTerminal(cmd, showTerminal, clearAtFirst, isLinuxTerminalOnWindows);
    }
  }
}

export function getCommandAliasMap(
  terminalType: TerminalType,
  repoFolder: string,
  isForProjectCmdAlias: boolean,
  writeToEachFile: boolean,
  dumpOtherCmdAlias: boolean = false)
  : [Map<string, string>, number, string[]] {

  const repoFolderName = path.basename(repoFolder);
  const isWindowsTerminal = isWindowsTerminalOnWindows(terminalType);
  const projectKey = isForProjectCmdAlias ? (repoFolderName || '') : 'notUseProject';

  let fileExtensionMapTypes = new Set<string>(MappedExtToCodeFilePatternMap.keys());
  AdditionalFileExtensionMapNames.forEach(ext => fileExtensionMapTypes.add(ext));

  const findTypes = ['definition', 'reference'];
  let aliasCountFromFile = 0;
  let cmdAliasMap: Map<string, string> = new Map();
  if (writeToEachFile && !dumpOtherCmdAlias) {
    cmdAliasMap = getCommonAliasMap(terminalType, writeToEachFile);
  } else {
    cmdAliasMap = getExistingCmdAlias(terminalType, writeToEachFile);
    aliasCountFromFile = cmdAliasMap.size;
  }

  const skipJunkPathArgs = getSkipJunkPathArgs(isWindowsTerminal);

  let commands: string[] = [];
  fileExtensionMapTypes.forEach(ext => {
    if (ext === 'default' || isNullOrEmpty(ext)) {
      return;
    }

    // find-cs find-py find-cpp find-java
    let cmdName = 'find-' + ext.replace(/Files?$/i, '');
    let filePattern = getConfigValueByPriorityList([projectKey + '.' + ext, ext, projectKey], 'codeFiles');
    if (isNullOrEmpty(filePattern)) {
      filePattern = MappedExtToCodeFilePatternMap.get(ext) || '';
    }

    if (isNullOrEmpty(filePattern)) {
      filePattern = '\\.' + escapeRegExp(ext) + '$';
    }

    // msr.definition.extraOptions msr.default.extraOptions
    const extraOption = addFullPathHideWarningOption(getConfigValueByProjectAndExtension(projectKey, ext, ext, 'extraOptions'), writeToEachFile);

    const body = 'msr -rp . ' + skipJunkPathArgs + ' -f "' + filePattern + '" ' + extraOption;
    commands.push(getCommandAlias(cmdName, body, false));

    findTypes.forEach(fd => {
      // Skip generating find-xxx-def alias for extensions without specific definition patterns
      // This avoids creating useless aliases like find-xml-def, find-json-def that fall back to generic patterns
      if (fd === 'definition' && !shouldGenerateDefinitionAlias(projectKey, ext, ext, MyConfig.CookFindDefinitionAliasExtraExtensionRegex)) {
        // Clean up old aliases that may have been loaded from existing alias file
        const defName = cmdName + '-def';
        cmdAliasMap.delete(defName);
        cmdAliasMap.delete('g' + defName);
        cmdAliasMap.delete('rg' + defName);
        return; // Skip this extension for definition alias
      }

      // msr.cpp.member.definition msr.py.class.definition msr.default.class.definition msr.default.definition
      let searchPattern = getConfigValueByProjectAndExtension(projectKey, ext, ext, fd);

      if (searchPattern.length > 0) {
        searchPattern = ' -t "' + searchPattern + '"';
      }

      // msr.cpp.member.skip.definition  msr.cpp.skip.definition msr.default.skip.definition
      let skipPattern = getConfigValueByProjectAndExtension(projectKey, ext, ext, 'skip.' + fd);
      if (skipPattern.length > 0) {
        skipPattern = ' --nt "' + skipPattern + '"';
      }

      const newBody = body + skipPattern + searchPattern;
      // find-cpp-def find-java-def find-py-def
      const newCmdName = cmdName + '-' + fd.replace(/^(.{3}).*/, '$1');
      commands.push(getCommandAlias(newCmdName, newBody, true));
    });
  });

  // find-def find-ref find-all-def find-pure-ref
  [...findTypes, 'all-def', 'pure-ref'].forEach(fd => {
    const findToCmdNameMap = new Map<string, string>()
      .set('pure-ref', 'find-pure-ref')
      .set('all-def', 'find-all-def');
    const findToSearchConfigKeyMap = new Map<string, string>()
      .set('all-def', 'definition')
      .set('pure-ref', 'reference');
    const findToSkipConfigKeyMap = new Map<string, string>()
      .set('all-def', 'definition')
      .set('pure-ref', 'pureReference');

    const configKeyForSkip = findToSkipConfigKeyMap.get(fd) || fd;
    const configKeyForSearch = findToSearchConfigKeyMap.get(fd) || fd;

    const cmdName = findToCmdNameMap.get(fd) || 'find-' + fd.replace(/^(.{3}).*/, '$1');

    // msr.cpp.member.definition msr.py.class.definition msr.default.class.definition msr.default.definition
    let searchPattern = getConfigValueOfProject(projectKey, configKeyForSearch);

    if (searchPattern.length > 0) {
      searchPattern = ' -t "' + searchPattern + '"';
    }

    // msr.cpp.member.skip.definition  msr.cpp.skip.definition msr.default.skip.definition
    const configNamesForSkip = fd === 'all-def' ? ['ui', 'default'] : [projectKey, 'default'];
    let skipPattern = getConfigValueByPriorityList(configNamesForSkip, 'skip.' + configKeyForSkip);
    if (skipPattern.length > 0) {
      skipPattern = ' --nt "' + skipPattern + '"';
    }

    const allFilesPattern = isForProjectCmdAlias ? MyConfig.AllFilesRegex.source : MyConfig.AllFilesDefaultRegex.source;

    // msr.definition.extraOptions msr.default.extraOptions
    const extraOption = addFullPathHideWarningOption(getConfigValueOfProject(projectKey, 'extraOptions'), writeToEachFile);
    const isFindAll = cmdName.match(/^(find-all-?\S*|find-ref|find-pure-ref)$/);
    let body = 'msr -rp . ' + skipJunkPathArgs;
    if (!isFindAll) {
      body += ' -f "' + allFilesPattern + '"';
    }
    body += ' ' + extraOption.trim();
    body += skipPattern + searchPattern;
    commands.push(getCommandAlias(cmdName, body, true));
  });

  // msr.cpp.member.definition msr.py.class.definition msr.default.class.definition msr.default.definition
  const additionalFileTypes = ['allFiles', 'docFiles', 'configFiles', 'scriptFiles'];
  additionalFileTypes.forEach(fp => {
    const filePattern = 'allFiles' === fp
      ? (isForProjectCmdAlias ? MyConfig.AllFilesRegex.source : MyConfig.AllFilesDefaultRegex.source)
      : getConfigValueOfProject(projectKey, fp);

    // find-all
    const cmdName = 'find-' + fp.replace(/[A-Z]\w*$/, '');
    const isFindAll = cmdName.match(/^(find-all-?\S*|find-ref|find-pure-ref)$/);

    // msr.definition.extraOptions msr.default.extraOptions
    let extraOption = addFullPathHideWarningOption(getConfigValueOfProject(projectKey, 'extraOptions'), writeToEachFile);
    if (/find-config|find-script/.test(cmdName)) {
      extraOption = extraOption.replace(/(^|\s+)--s2\s+\S+\s*/, ' ');
    }

    const body = 'msr -rp . ' + skipJunkPathArgs + (isFindAll ? "" : ' -f "' + filePattern + '" ' + extraOption.trim());
    commands.push(getCommandAlias(cmdName, body.trimRight(), true));
    if (cmdName === 'find-all') {
      extraOption = extraOption.replace(/(^|\s+)--s1\s+\S+\s*/g, ' '); // many repo files are empty
      extraOption = extraOption.replace(/(^|\s+)--s2\s+\S+\s*/, ' '); // some repo files are too huge
      extraOption = extraOption.replace(/(^|\s+)-I(\s+|$)/, ' '); // many errors may show up for gfind-all
      const findFileBody = 'msr -rp . ' + skipJunkPathArgs + ' ' + extraOption.trim();
      commands.push(getCommandAlias('find-file', findFileBody.trim(), true));
    }
  });

  // find-nd find-code find-ndp find-small find-all
  const allCodeFilePattern = isForProjectCmdAlias ? MyConfig.CodeFilesPlusUIRegex.source : MyConfig.CodeFilesPlusUIDefaultRegex.source;
  const extraOption = addFullPathHideWarningOption(getConfigValueOfProject(projectKey, 'extraOptions'), writeToEachFile);
  commands.push(getCommandAlias('find-nd', 'msr -rp . ' + skipJunkPathArgs + ' ' + extraOption, false));
  commands.push(getCommandAlias('find-ndp', 'msr -rp %1 ' + skipJunkPathArgs + ' ' + extraOption, true));
  commands.push(getCommandAlias('find-code', 'msr -rp . ' + skipJunkPathArgs + ' -f "' + allCodeFilePattern + '" ' + extraOption, false));

  const allSmallFilesOptions = addFullPathHideWarningOption(getConfigValueOfProject(projectKey, 'allSmallFiles.extraOptions'), writeToEachFile);
  commands.push(getCommandAlias('find-small', 'msr -rp . ' + skipJunkPathArgs + ' ' + allSmallFilesOptions, false));

  // find-class
  const findClassFiles = ' -f "' + MyConfig.CodeFilesRegex.source + '"';
  const findClassPattern = ' -t "\\b(class|struct|enum|interface|trait|^\\s*(object|type))\\s+%1"';
  const skipClassPattern = ' --nt "^\\s*(/|throw|return)|%1\\s*;\\s*$"';
  commands.push(getCommandAlias('find-class', 'msr -rp .' + findClassFiles + findClassPattern + skipClassPattern + ' ' + skipJunkPathArgs + ' ' + extraOption, true));

  // find-spring-ref
  let oneLineCode = FindJavaSpringReferenceByPowerShellAlias.split(/[\r\n]+\s*/).join(' ');
  if (!isWindowsTerminal) {
    oneLineCode = replacePowerShellVarsForLinuxAlias(oneLineCode);
  }

  addFindMemberReferenceCommand('find-cpp-member-ref', 'cpp');
  const findSpringRefCmd = addFindMemberReferenceCommand('find-spring-ref', 'java');
  const findMemberRefCmd = findSpringRefCmd.replace(/\s+-f \S+/, ' ').replace(/find-spring-ref/g, 'find-member-ref').replace(/find_spring_ref/g, 'find_member_ref');
  cmdAliasMap.set('find-member-ref', findMemberRefCmd);
  commands.push(findMemberRefCmd);

  copyAliasForSpecialShortcuts();
  return [cmdAliasMap, aliasCountFromFile, commands];

  function addFindMemberReferenceCommand(aliasName: string, mappedExtension: string, oneRealExtension: string = '') {
    if (isNullOrEmpty(oneRealExtension)) {
      oneRealExtension = mappedExtension;
    }
    const fileExtPattern = MappedExtToCodeFilePatternMap.get(mappedExtension) || `"\.${oneRealExtension}$"`;
    let psCode: string = oneLineCode.replace(/;\s*$/g, '').trim()
      + '; msr -rp . ' + skipJunkPathArgs + " -f '" + fileExtPattern + "'"
      + (isWindowsTerminal ? " -t $pattern " : " -t \\$pattern ") + extraOption;
    if (isWindowsTerminal) {
      psCode = psCode.replace(/"/g, "'").trim();
    } else {
      psCode = psCode.replace(/'/g, '"').replace(/"/g, '\\"').trim();
    }
    let findExtRefCmd = getCommandAliasText(aliasName, psCode, true, terminalType, writeToEachFile, true, true, true);
    if (TerminalType.CygwinBash === terminalType && isPowerShellCommand(findExtRefCmd, terminalType)) { // as workaround of running powershell with exe
      findExtRefCmd = findExtRefCmd.replace(/ msr (-+\w+)/g, ' msr.exe $1');
    }
    cmdAliasMap.set(aliasName, findExtRefCmd);
    commands.push(findExtRefCmd);
    return findExtRefCmd;
  }

  function copyAliasForSpecialShortcuts() {
    // find-ts find-js find-vue
    const specialAddedCmdAliasList = ['find-ts', 'find-js', 'find-vue'];
    specialAddedCmdAliasList.forEach(cmdHead => {
      const configPrefix = cmdHead.replace('find-', '');
      const extensions = MyConfig.RepoConfig.get(`fileExtensionMap.${configPrefix}`) as string;
      if (isNullOrEmpty(extensions)) {
        return;
      }
      const fileExtensionPattern = `\\.(${extensions.split(/\s+/).join('|')})$`;
      const fileFilter = ` -f "${fileExtensionPattern}"`;
      const findUiDef = cmdAliasMap.get('find-ui-def') || '';
      const findUiRef = cmdAliasMap.get('find-ui-ref') || '';
      const defConfig = MyConfig.RepoConfig.get(configPrefix);
      const refConfig = MyConfig.RepoConfig.get(configPrefix);
      if (!defConfig && !isNullOrEmpty(findUiDef)) {
        const name = `${cmdHead}-def`;
        const body = findUiDef.replace(/\b(find-ui-def)\b/g, name)
          .replace(/\b(_?find_ui_def)\b/g, '_' + name.replace(/-/g, '_'))
          .replace(/\s+-f\s+"(.+?)"/, fileFilter);
        cmdAliasMap.set(name, body);
      }
      if (!refConfig && !isNullOrEmpty(findUiRef)) {
        const name = `${cmdHead}-ref`;
        const body = findUiRef.replace(/\b(find-ui-ref)\b/g, name)
          .replace(/\b(_?find_ui_ref)\b/g, '_' + name.replace(/-/g, '_'))
          .replace(/\s+-f\s+"(.+?)"/, fileFilter);
        cmdAliasMap.set(name, body);
      }
    });
  }

  function getCommandAlias(cmdName: string, body: string, useFunction: boolean): string {
    let text = getCommandAliasText(cmdName, body, useFunction, terminalType, writeToEachFile);

    // Workaround for find-def + find-xxx-def
    const hotFixFindDefRegex = /^find(-[\w-]+)?-def$/;
    if (cmdName.match(hotFixFindDefRegex)) {
      text = text.replace('[a-z0-9]+(\\.|->|::)?[A-Z]', '[a-z0-9]+(\\.|->|::)[A-Z]');
    }

    cmdAliasMap.set(cmdName, text);
    return text;
  }
}

function outputCmdAliasGuide(cmdAliasFile: string, singleScriptFolder: string = '') {
  if (singleScriptFolder.length > 0) {
    outputInfoQuietByTime('Add folder ' + singleScriptFolder + ' to PATH then you can directly call the script name everywhere in/out vscode to search/replace like:');
  } else {
    outputInfoQuietByTime('Now you can directly use the command shortcuts in/out-of vscode to search + replace like:');
  }

  outputInfoQuiet('find-ndp path1,path2,pathN -t MySearchRegex -x AndPlainText');
  outputInfoQuiet('find-nd -t MySearchRegex -x AndPlainText');
  outputInfoQuiet('find-code -it MySearchRegex -x AndPlainText');
  outputInfoQuiet('find-small -it MySearchRegex -U 5 -D 5 : Show up/down lines.');
  outputInfoQuiet('find-doc -it MySearchRegex -x AndPlainText -l -PAC : Show pure path list.');
  outputInfoQuiet('find-py-def ClassOrMethod -x AndPlainText : Search definition in python files.');
  outputInfoQuiet('find-py-ref MySearchRegex -x AndPlainText : Search references in python files.');
  outputInfoQuiet('find-cpp-ref "class\\s+MyClass" -x AndPlainText --np "unit|test" --xp src\\ext,src\\common -c show command line.');
  outputInfoQuiet('find-java-def MyClass -x AndPlainText --np "unit|test" --xp src\\ext,src\\common -c show command line.');
  outputInfoQuiet('find-java-ref MyClass --pp "unit|test" -U 3 -D 3 -H 20 -T 10 :  Preview Up/Down lines + Set Head/Tail lines in test.');
  outputInfoQuiet('find-ref OldClassOrMethod -o NewName -j : Just preview changes only.');
  outputInfoQuiet('find-ref OldClassOrMethod -o NewName -R : Replace files.');
  outputInfoQuiet('alias find-pure-ref');
  outputInfoQuiet('malias find- -x ref -H 9');
  outputInfoQuiet('malias "find[\\w-]*ref"');
  outputInfoQuiet('malias ".*?(find-\\S+)=.*" -o "\\2"  :  To see all find-xxx alias/doskeys.');
  outputInfoQuiet('list-alias  - list all alias/doskey files of projects.');
  outputInfoQuiet('update-alias - reload common alias/doskeys.');
  outputInfoQuiet('use-this-alias - reload this project alias/doskeys when in vscode; or load by current folder(project) name (see list-alias).');
  outputInfoQuiet('out-rp  - Output relative path for result files.');
  outputInfoQuiet('out-fp  - Output full path.');
  outputInfoQuiet('Add -W to output full path; -I to suppress warnings; -o to replace text, -j to preview changes, -R to replace files.');
  outputInfoQuiet('You can also create your own command shortcuts in the file: ' + cmdAliasFile);
  outputInfoQuiet("Every time after changes, auto effect for new console/terminal. Run `update-alias` to update current terminal immediately.");
  outputInfoQuiet('See + Use command alias(shortcut) in `MSR-RUN-CMD` on `TERMINAL` tab, or start using in a new command window outside.');
  outputInfoQuiet('(if running `find-xxx` in vscode terminals, you can `click` the search results to open in vscode.)');
}

function addFullPathHideWarningOption(extraOption: string, writeToEachFile: boolean): string {
  const hasFoundOutputFullPath = /(^|\s+)-[PACIGMOZc]*?W/.test(extraOption);
  const isFullByConfig = writeToEachFile ? MyConfig.OutputFullPathWhenCookAndDumpingAliasFiles : MyConfig.OutputFullPathWhenCookingCommandAlias;
  const shouldOutputFullPath = isFullByConfig && (!isLinuxTerminalOnWindows() || !MyConfig.OutputRelativePathForLinuxTerminalsOnWindows);
  if (!hasFoundOutputFullPath && shouldOutputFullPath) {
    extraOption = '-W ' + extraOption.trimLeft();
  } else if (hasFoundOutputFullPath && !shouldOutputFullPath) {
    extraOption = extraOption.replace(/ -W /, ' ');
  }

  const hasFoundNoExtraInfo = /(^|\s+)-[PACWGMOZc]*?I/.test(extraOption);
  if (!hasFoundNoExtraInfo && MyConfig.HideWarningsAndExtraInfoWhenCookingCommandAlias) {
    extraOption = '-I ' + extraOption.trimLeft();
  } else if (hasFoundNoExtraInfo && !MyConfig.HideWarningsAndExtraInfoWhenCookingCommandAlias) {
    extraOption = extraOption.replace(/ -I /, ' ');
  }

  extraOption = setOutputColumnIndexInCommandLine(extraOption);
  return extraOption.trim();
}

function getExistingCmdAlias(terminalType: TerminalType, writeToEachFile: boolean): Map<string, string> {
  var cmdAliasMap = getCommonAliasMap(terminalType, writeToEachFile);
  outputInfoByDebugModeByTime(`Built ${cmdAliasMap.size} common alias.`);
  const isWindowsTerminal = isWindowsTerminalOnWindows(terminalType);
  const defaultCmdAliasFile = getGeneralCmdAliasFilePath(terminalType);
  const defaultCmdAliasFileForTerminal = toTerminalPath(defaultCmdAliasFile, terminalType);
  const cmdAliasText = readTextFile(defaultCmdAliasFile);
  if (isNullOrEmpty(cmdAliasText)) {
    outputWarnByTime(`Not found or read empty file: ${defaultCmdAliasFileForTerminal}`);
    return cmdAliasMap;
  }
  const [inconsistentCount, newCount] = getCmdAliasMapFromText(cmdAliasText, cmdAliasMap, writeToEachFile, isWindowsTerminal);
  if (inconsistentCount > 0) {
    outputInfoQuietByTime(`Found ${inconsistentCount} inconsistent common alias, you can enable 'msr.overwriteInconsistentCommonAliasByExtension'`
      + `, or delete them in file: ${defaultCmdAliasFileForTerminal}`);
  }

  if (isWindowsTerminal && HasPwshExeOnWindows) {
    cmdAliasMap.delete('pwsh');
  }

  // Skip checking and overwrite alias file if for multiple files - the alias body is different with default alias content.
  if (writeToEachFile) {
    if (!isWindowsTerminal) {
      checkAddLinuxBashAliasFile(cmdAliasMap, path.dirname(defaultCmdAliasFile));
    }
    return cmdAliasMap;
  }

  if (newCount > 0) {
    outputInfo(`Found ${newCount} new common alias, will save all ${cmdAliasMap.size} alias to file: ${defaultCmdAliasFileForTerminal}`);
  }

  // Don't save the doskey file here - cookCmdShortcutsOrFile will save the complete version later
  // (with use-this-alias prefix for find-xxx/sort-xxx). Saving here produces an intermediate version
  // without the prefix, causing perpetual "inconsistent" detection for custom find-xxx aliases from settings.json.
  if (newCount > 0 || inconsistentCount > 0) {
    outputInfoQuietByTime(`Found ${newCount} new + ${inconsistentCount} inconsistent alias, total ${cmdAliasMap.size} alias for: ${defaultCmdAliasFileForTerminal}`);
  }

  return cmdAliasMap;
}

function checkAddLinuxBashAliasFile(cmdAliasMap: Map<string, string>, folder: string,) {
  const defaultBashFileName = getConfigValueOfActiveProject('bashrcFileToDumpScripts', true);
  if (isNullOrEmpty(defaultBashFileName)) {
    return;
  }
  const oldCount = cmdAliasMap.size;
  const bashConfigFile = path.join(folder, defaultBashFileName);
  try {
    if (fs.existsSync(bashConfigFile)) {
      const aliasText = readTextFile(bashConfigFile);
      getCmdAliasMapFromText(aliasText, cmdAliasMap, true, false, true);
      outputInfoQuietByTime(`Read ${cmdAliasMap.size - oldCount} alias from ${bashConfigFile}.`);
    }
  } catch (err) {
    outputErrorByTime(`Failed to read alias from file: ${bashConfigFile}`);
  }
}

function getCmdAliasMapFromText(cmdAliasText: string, map: Map<string, string>, writeToEachFile: boolean, isWindowsTerminal: boolean, isBashConfigFile: boolean = false): [number, number] {
  const lines = isWindowsTerminal ? cmdAliasText.split(/[\r\n]+/) : cmdAliasText.split(/(^|[\r\n]+)alias\s+/);
  const getNameBodyRegex = isWindowsTerminal || !writeToEachFile
    ? /^(\w+[\w\.-]+)=(.+)/s
    : /^(\w+[\w\.-]+)=['"](.+)['"]\s*$/s;
  let remainCommonKeys = new Set<string>(map.keys());
  let inconsistentCount = 0;
  lines.forEach(a => {
    if (isNullOrEmpty(a.trim())) {
      return;
    }
    // Workaround to filter out 'export/source xxx' for script files:
    let rawBodyText = isWindowsTerminal ? a.trim() : a.replace(/[\r\n]+(#|[a-z]+\w+).*/s, '').trim();
    if (writeToEachFile && isBashConfigFile) {
      // Extract body if it's a function alias:
      rawBodyText = rawBodyText.replace(/^([\w-]+)=(.)function\s+\w+[^\r\n]*\{\s*(.+?)\s*[\r\n]+\s*\}\s*;\s*\w+[^\r\n]*\s*$/s, "$1=$2$3$2");
    }
    const match = getNameBodyRegex.exec(rawBodyText);
    if (!match) {
      return;
    }

    const name = match[1];
    let body = writeToEachFile
      ? (isWindowsTerminal
        ? replaceArgForWindowsCmdAlias(match[2].trim(), writeToEachFile)
        : replaceArgForLinuxCmdAlias(match[2].trim(), writeToEachFile)
      )
      : (isWindowsTerminal ? '' : 'alias ') + match[0].trim();

    // Trim multi-line head whitespace for script files:
    if (!isWindowsTerminal && writeToEachFile) {
      const headWhitespaceMatch = body.match(/[\r\n]+([ \t]+)/);
      if (headWhitespaceMatch && !isNullOrEmpty(headWhitespaceMatch[1])) {
        body = body.replace(new RegExp(`([\r\n]+)${headWhitespaceMatch[1]}`, 'g'), '$1');
      }
    }

    if (remainCommonKeys.delete(name)) {
      const bodyFromCommon = map.get(name);
      if (bodyFromCommon !== body) {
        inconsistentCount++;
        if (MyConfig.OverwriteInconsistentCommonAliasByExtension) {
          outputInfoQuietByTime(`Overwrite inconsistent alias-${inconsistentCount}: ${name}`);
          return;
        }
        outputWarn(`Found inconsistent alias-${inconsistentCount}: ${name}`);
      } else {
        outputDebug(`Found same common alias: ${name}`);
      }
    }

    map.set(name, body);
  });
  if (isBashConfigFile) {
    remainCommonKeys.forEach(key => outputInfo(`Found new common alias: ${key}`));
  }
  return [inconsistentCount, remainCommonKeys.size];
}

// Normalize: remove trailing whitespace, ensure single trailing newline
function normalizeFileContent(content: string, newLine: string): string {
  content = content.replace(/[ \t]+$/gm, '');
  return content.trimEnd() + newLine;
}

const AutoDumpAliasMinIntervalSeconds = 10;
let autoDumpMarkerFile: string | undefined;

// Check and update script file for terminal type: create if missing, update if content mismatch
function checkAndUpdateScriptFile(
  terminalType: TerminalType,
  scriptName: string,
  getExpectedContent: (isWindowsTerminal: boolean) => string
): boolean {
  const isWindowsTerminal = isWindowsTerminalOnWindows(terminalType);
  const scriptFolder = getCmdAliasSaveFolder(true, false, terminalType);
  const fullScriptName = isWindowsTerminal ? scriptName + '.cmd' : scriptName;
  const scriptPath = path.join(scriptFolder, fullScriptName);

  const expectedContent = getExpectedContent(isWindowsTerminal);

  // File doesn't exist - create it
  if (!fs.existsSync(scriptPath)) {
    outputInfoQuietByTime(`Creating missing script: ${scriptPath}`);
    createDirectory(scriptFolder);
    return saveTextToFile(scriptPath, expectedContent, scriptName, true);
  }

  // Check if content matches
  const existingContent = readTextFile(scriptPath);
  if (existingContent !== expectedContent) {
    outputInfoQuietByTime(`Updating script with new content: ${scriptPath}`);
    return saveTextToFile(scriptPath, expectedContent, scriptName, true);
  }

  return false; // No change needed
}

function getAutoDumpMarkerFilePath(): string {
  if (!autoDumpMarkerFile) {
    autoDumpMarkerFile = path.join(TempStorageFolder, '.vscode-msr-last-auto-dump');
  }
  return autoDumpMarkerFile;
}

// Check multi-window coordination interval
function canAutoUpdateByMarkerFile(): boolean {
  const markerFile = getAutoDumpMarkerFilePath();
  try {
    if (fs.existsSync(markerFile)) {
      const stat = fs.statSync(markerFile);
      const elapsedSeconds = (Date.now() - stat.mtimeMs) / 1000;
      if (elapsedSeconds < AutoDumpAliasMinIntervalSeconds) {
        outputInfoQuietByTime(`Skip auto-dump: only ${elapsedSeconds.toFixed(1)}s since last dump (minInterval=${AutoDumpAliasMinIntervalSeconds}s)`);
        return false;
      }
    }
  } catch (err) {
    outputWarnQuietByTime(`Failed to check marker file: ${err}`);
  }
  return true;
}

function updateAutoDumpMarkerFile(): void {
  const markerFile = getAutoDumpMarkerFilePath();
  try {
    createDirectory(path.dirname(markerFile));
    fs.writeFileSync(markerFile, new Date().toISOString());
    outputDebugByTime(`Updated auto-dump marker file: ${markerFile}`);
  } catch (err) {
    outputDebugByTime(`Failed to update marker file: ${err}`);
  }
}

function getTerminalTypeFromTerminal(terminal: vscode.Terminal | undefined): TerminalType {
  if (!terminal) {
    return DefaultTerminalType;
  }

  const initialPath = getTerminalInitialPath(terminal) || '';
  const terminalName = getTerminalNameOrShellExeName(terminal);

  if (IsWindows) {
    if (/cmd.exe$|^Command Prompt|^CMD/i.test(terminalName || initialPath)) {
      return TerminalType.CMD;
    } else if (/PowerShell.exe$|^PowerShell$/i.test(terminalName || initialPath)) {
      return TerminalType.PowerShell;
    } else if (/Cygwin.*?bin\\bash.exe$|Cygwin/i.test(initialPath)) {
      return TerminalType.CygwinBash;
    } else if (/System(32)?.bash.exe$|wsl.exe$|^WSL/i.test(initialPath)) {
      return TerminalType.WslBash;
    } else if (/Git\S+bash.exe$|^Git Bash|MinGW/i.test(initialPath)) {
      return TerminalType.MinGWBash;
    } else if (/bash/i.test(terminalName)) {
      return TerminalType.WslBash;
    } else {
      return TerminalType.PowerShell;
    }
  } else {
    if (/PowerShell|pwsh/i.test(terminalName)) {
      return TerminalType.Pwsh;
    } else {
      return TerminalType.LinuxBash;
    }
  }
}

function shouldAutoDumpForTerminalType(terminalType: TerminalType): boolean {
  const regex = MyConfig.AutoDumpAliasToFilesByTerminalTypeRegex;
  if (!regex || regex === EmptyRegex) {
    return false;
  }

  const terminalTypeName = TerminalType[terminalType];
  return regex.test(terminalTypeName);
}

// Auto-dump alias to script files if configured and changed. When forceCheckUpdate is true, force check if each alias's script file exists or content matches (update if not exist or mismatch)
export async function asyncCheckAndDumpAliasToFiles(terminal: vscode.Terminal | undefined, forceCheckUpdate: boolean = false): Promise<void> {
  const checkStartTime = new Date();
  const terminalType = getTerminalTypeFromTerminal(terminal);

  // Always check and update the update-repo-paths script for current terminal type
  // This ensures the script exists and is up-to-date even if auto-dump is disabled or hash unchanged
  checkAndUpdateScriptFile(terminalType, UpdateRepoPathsScriptName, getUpdateRepoPathsScriptContent);

  if (!shouldAutoDumpForTerminalType(terminalType)) {
    outputInfoQuietByTime(`Auto-dump disabled for terminal type: ${TerminalType[terminalType]}`);
    return;
  }

  if (!forceCheckUpdate && !canAutoUpdateByMarkerFile()) {
    return;
  }

  const [cmdAliasMap, ,] = getCommandAliasMap(terminalType, DefaultRepoFolder, false, true, true);

  const newHash = calculateAliasHash(cmdAliasMap);
  if (!forceCheckUpdate && !hasAliasChanged(terminalType, newHash)) {
    const elapsedSeconds = getElapsedSecondsToNow(checkStartTime);
    outputInfoQuietByTime(`Cost ${elapsedSeconds.toFixed(3)}s to check alias unchanged for ${TerminalType[terminalType]}, skip auto-dump.`);
    return;
  }

  if (forceCheckUpdate) {
    outputInfoQuietByTime(`Force checking and updating alias scripts for ${TerminalType[terminalType]}...`);
  }

  outputInfoQuietByTime(`Auto-dumping ${cmdAliasMap.size} alias to script files for ${TerminalType[terminalType]}...`);
  updateAutoDumpMarkerFile();

  try {
    cookCmdShortcutsOrFile({
      FilePath: DefaultRepoFolder || '.',
      WriteToEachFile: true,
      DumpOtherCmdAlias: true,
      OnlyCookFile: true,
      SilentAll: true,
      Terminal: terminal
    } as CookAliasArgs);

    await saveAliasHash(terminalType, newHash);
    const totalElapsedSeconds = getElapsedSecondsToNow(checkStartTime);
    outputInfoQuietByTime(`Cost ${totalElapsedSeconds.toFixed(3)}s to auto-dump alias scripts for ${TerminalType[terminalType]}.`);
  } catch (err) {
    outputErrorByTime(`Failed to auto-dump alias scripts: ${err}`);
  }
}
