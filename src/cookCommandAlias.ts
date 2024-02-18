import * as vscode from 'vscode';
import { getIgnoreFolderCommand, getJunkEnvCommandForTipFile, getResetJunkPathEnvCommand, getSkipJunkPathEnvCommand, getTrimmedGitRepoEnvName } from './JunkPathArgs';
import { IsFileTimeOffsetSupported, IsUniformSlashSupported, RunCommandChecker, ToolChecker, setNotCheckInputPathInCommandLine, setOutputColumnIndexInCommandLine } from './ToolChecker';
import { getFindTopDistributionCommand, getSortCommandText } from "./commands";
import { getCommandAliasText, getCommonAliasMap, replaceArgForLinuxCmdAlias, replaceArgForWindowsCmdAlias, replaceForLoopVariableOnWindows } from './commonAlias';
import { getConfigValueByPriorityList, getConfigValueByProjectAndExtension, getConfigValueOfActiveProject, getConfigValueOfProject } from "./configUtils";
import { HomeFolder, InitLinuxTerminalFileName, IsDebugMode, IsWSL, IsWindows, RunCmdTerminalName, TempStorageFolder, TrimProjectNameRegex, getAliasFileName, getBashFileHeader, getTipInfoTemplate } from "./constants";
import { AdditionalFileExtensionMapNames, DefaultRootFolder, MappedExtToCodeFilePatternMap, MyConfig } from "./dynamicConfig";
import { FindCommandType, TerminalType } from "./enums";
import { createDirectory, readTextFile, saveTextToFile } from './fileUtils';
import { GitListFileHead } from './gitUtils';
import { outputDebug, outputDebugByTime, outputErrorByTime, outputInfo, outputInfoByDebugModeByTime, outputInfoQuiet, outputInfoQuietByTime, outputWarn, outputWarnByTime } from "./outputUtils";
import { escapeRegExp } from "./regexUtils";
import { getRunCmdTerminal, runCommandInTerminal, sendCommandToTerminal } from './runCommandUtils';
import { DefaultTerminalType, IsWindowsTerminalOnWindows, getCmdAliasSaveFolder, getTerminalInitialPath, getTerminalNameOrShellExeName, getTerminalShellExePath, getTipFileDisplayPath, getTipFileStoragePath, isLinuxTerminalOnWindows, isPowerShellTerminal, isWindowsTerminalOnWindows, toStoragePath, toTerminalPath } from './terminalUtils';
import { getSetToolEnvCommand, getToolExportFolder } from "./toolSource";
import { getDefaultRootFolderName, getElapsedSecondsToNow, getLoadAliasFileCommand, getPowerShellName, getRootFolder, getRootFolderName, getUniqueStringSetNoCase, isNullOrEmpty, isPowerShellCommand, isWeeklyCheckTime, quotePaths, replaceTextByRegex } from "./utils";
import { FindJavaSpringReferenceByPowerShellAlias } from './wordReferenceUtils';
import fs = require('fs');
import os = require('os');
import path = require('path');
const CookCmdDocUrl = 'https://github.com/qualiu/vscode-msr/blob/master/README.md#command-shortcuts';


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

function duplicateSearchFileCmdAlias(rootFolder: string, terminalType: TerminalType, cmdAliasMap: Map<string, string>, isForProjectCmdAlias: boolean, writeToEachFile: boolean) {
  // Duplicate find-xxx to gfind-xxx (use "git ls-file" + find-xxx), except find-nd / find-ndp
  const rootFolderName = getRootFolderName(rootFolder);
  const isWindowsTerminal = isWindowsTerminalOnWindows(terminalType);
  const tmpFileName = isForProjectCmdAlias
    ? 'git-paths-' + (rootFolderName + '-' + path.basename(path.dirname(rootFolder))).replace(TrimProjectNameRegex, '-')
    : 'git-paths-' + getTrimmedGitRepoEnvName(isWindowsTerminal);
  const powerShellCmdHead = getPowerShellName(terminalType) + ' -Command';
  const sortedCmdKeys = Array.from(cmdAliasMap.keys()).sort();
  const saveAliasFolder = getCmdAliasSaveFolder(true, false, terminalType);
  const needReplaceArgForLoop = writeToEachFile && isWindowsTerminalOnWindows(terminalType);
  sortedCmdKeys.forEach(key => {
    const value = cmdAliasMap.get(key) || '';
    if (key.match(/^(find|sort)-/) && !key.startsWith('find-nd') && /msr(\.exe)? -rp/.test(value)) {
      const isPowerShellScript = value.includes(powerShellCmdHead); // like find-spring-ref to gfind-spring-ref
      const tmpListFile = isPowerShellScript && isWindowsTerminal
        ? path.join(TempStorageFolder, tmpFileName)
        : quotePaths((isWindowsTerminal ? '%tmp%\\' : '/tmp/') + tmpFileName);

      const listFileCommand = `${GitListFileHead} > ${tmpListFile}`;
      let checkAndListCommand = listFileCommand + (isPowerShellScript ? '; ' : ' && ');
      const refreshDuration = MyConfig.RefreshTmpGitFileListDuration;
      if (IsFileTimeOffsetSupported) { // && isForProjectCmdAlias
        const checkTime = `msr -l --w1 ${refreshDuration} -p ${tmpListFile}`;
        if (isPowerShellScript) {
          checkAndListCommand = '$foundFile = ' + checkTime + ' -PAC 2>$null; if ([string]::IsNullOrEmpty($foundFile)) { ' + listFileCommand + ' }';
          if (!isWindowsTerminal) {
            checkAndListCommand = checkAndListCommand.replace(/\$(\w+)/g, '\\$$$1');
          }
        } else {
          if (isWindowsTerminal) {
            checkAndListCommand = '( ' + checkTime + ' 2>nul | msr -t "^Matched 1" >nul && ' + listFileCommand + ' ) & ';
          } else {
            checkAndListCommand = checkTime + ' 2>/dev/null -PAC 1>&2; [ $? -ne 1 ] && ' + listFileCommand + '; '
          }
        }
      }

      let newCommand = value.replace(/(msr(\.exe)?) -rp\s+(".+?"|\S+)/, checkAndListCommand.trimRight() + ' $1 -w ' + tmpListFile)
        .replace(/\s+(--nd|--np)\s+".+?"\s*/, ' ');
      newCommand = setNotCheckInputPathInCommandLine(newCommand);
      if (isForProjectCmdAlias && TerminalType.CygwinBash === terminalType && isPowerShellCommand(newCommand, terminalType)) {
        newCommand = newCommand.replace(/\bmsr (-+\w+)/g, 'msr.exe $1'); // workaround for cygwin PowerShell
      }
      const gitFindName = 'g' + key;;
      if (isWindowsTerminal) {
        newCommand = newCommand.replace(new RegExp('^' + key), gitFindName);
      } else {
        newCommand = newCommand.replace(new RegExp('^alias\\s+' + key), 'alias ' + gitFindName)
          .replace(new RegExp("\\b_" + key.replace(/-/g, '_') + "\\b", 'g'), '_' + gitFindName.replace(/-/g, '_')); // [optional]: replace inner function name
      }

      cmdAliasMap.set(gitFindName, newCommand);
      if (!isLinuxTerminalOnWindows(terminalType)) { // depends on alias scripts
        const recursiveGitFindName = 'rg' + key;
        let recursiveGitFindBody = isWindowsTerminal
          ? `for /f "tokens=*" %a in ('dir /A:D /B .') do @pushd "%CD%\\%a" && ${gitFindName} $* -O & popd`
          : `for folder in $(ls -d $PWD/*/); do pushd "$folder" >/dev/null && ${saveAliasFolder}/${gitFindName} $* -O; popd > /dev/null; done`;
        if (needReplaceArgForLoop) {
          recursiveGitFindBody = replaceForLoopVariableOnWindows(recursiveGitFindBody);
        }
        recursiveGitFindBody = getCommandAliasText(recursiveGitFindName, recursiveGitFindBody, true, terminalType, false, false, false);
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


function getPostInitCommands(terminalType: TerminalType, rootFolderName: string) {
  const terminalTypeName = TerminalType[terminalType].toString();
  const typeName = (terminalTypeName[0].toLowerCase() + terminalTypeName.substring(1))
    .replace(/CMD/i, 'cmd')
    .replace(/MinGW/i, 'mingw')
    .replace(/^(Linux|WSL)Bash/i, 'bash');
  const configTailKey = typeName + '.postInitTerminalCommandLine';
  return getConfigValueOfProject(rootFolderName, configTailKey, true);
}

function runPostInitCommands(terminal: vscode.Terminal | null | undefined, terminalType: TerminalType, rootFolderName: string) {
  if (!terminal) {
    return;
  }
  const postInitCommand = getPostInitCommands(terminalType, rootFolderName);
  if (isNullOrEmpty(postInitCommand)) {
    return;
  }
  sendCommandToTerminal(postInitCommand, terminal, true, false, isLinuxTerminalOnWindows(terminalType));
}

function showTipByCommand(terminal: vscode.Terminal | undefined, terminalType: TerminalType, aliasCount: number, initLinuxTerminalCommands = "") {
  const generalScriptFilesFolder = getCmdAliasSaveFolder(true, false, terminalType);
  const setToolAliasEnvCmd = getSetToolEnvCommand(terminalType, [generalScriptFilesFolder]);
  const isWindowsTerminal = isWindowsTerminalOnWindows(terminalType);
  const defaultCmdAliasFileStoragePath = getGeneralCmdAliasFilePath(terminalType);
  const defaultCmdAliasFileForTerminal = toTerminalPath(defaultCmdAliasFileStoragePath, terminalType);
  // If use echo command, should use '\\~' instead of '~'
  const defaultAliasPathForBash = getDisplayPathForBash(defaultCmdAliasFileForTerminal, '~'); // '\\~');
  const createCmdAliasTip = `You can create shortcuts in ${defaultAliasPathForBash}${isWindowsTerminal ? '' : ' or other files'} . `;
  const replaceTipValueArg = `-x S#C -o ${aliasCount}`;
  const shortcutsExample = 'Now you can use S#C shortcuts like find-all gfind-all gfind-small find-def gfind-ref find-doc find-spring-ref'
    + ' , find-top-folder gfind-top-type sort-code-by-time etc. See detail like: alias find-def or malias find-top or malias out-fp or malias sort-.+?= etc.';
  const finalGuide = createCmdAliasTip + shortcutsExample + ' You can change msr.skipInitCmdAliasForNewTerminalTitleRegex in user settings.'
    + ' Toggle-Enable/Disable finding definition + Speed-Up-if-Slowdown-by-Windows-Security + Adjust-Color + Fuzzy-Code-Mining + Preview-And-Replace-Files + Hide/Show-Menus'
    + ' + Use git-ignore + Use in external terminals/IDEs: use-this-alias / list-alias / out-fp / out-rp'
    + (IsWindowsTerminalOnWindows ? ' / mingw-mock' : '')
    + ' + More functions/details see doc like: ' + CookCmdDocUrl;

  const colorPattern = 'PowerShell|re-cook|\\d+|m*alias|doskey|find-\\S+|sort-\\S+|out-\\S+|use-\\S+|msr.skip\\S+|\\S+-alias\\S*|other|mock|mingw'
    + '|Toggle|Enable|Disable|Speed-Up|Adjust-Color|Code-Mining|Preview-|-Replace-|git-ignore|Menus|functions|details';

  // const colorPatternForCmdEscape = colorPattern.replace(/\|/g, '^|');
  const newLine = isWindowsTerminal ? "\r\n" : "\n";
  const lineSep = newLine + (isWindowsTerminal ? "::" : "#") + " ";
  const colorCmd = ` | msr -aPA -ix ignored -e "\\d+|Skip\\w+|g?find-\\w+|MSR-\\S+"`;
  const gitInfoTemplate = getTipInfoTemplate(isWindowsTerminal, false);

  const tipFileStoragePath = getTipFileStoragePath(terminalType);
  const tipFileDisplayPath = toTerminalPath(tipFileStoragePath, terminalType);

  let expectedContent = setToolAliasEnvCmd;
  const bashHeader = getBashFileHeader(isWindowsTerminal);
  if (!isWindowsTerminal && !isNullOrEmpty(initLinuxTerminalCommands)) {
    const initLinuxStoragePath = path.join(path.dirname(tipFileStoragePath), InitLinuxTerminalFileName);
    const initLinuxDisplayPath = toTerminalPath(initLinuxStoragePath, terminalType);
    saveTextToFile(initLinuxStoragePath, bashHeader + initLinuxTerminalCommands);
    expectedContent += newLine + `source ${initLinuxDisplayPath}`;
  }

  expectedContent += newLine + getJunkEnvCommandForTipFile(isWindowsTerminal)
    + newLine + (isWindowsTerminal ? '@' : '') + `msr -aPA -e .+ -z "${finalGuide}" -it "${colorPattern}" ` + (isWindowsTerminal ? '%*' : '$*')
    + lineSep + gitInfoTemplate + " Free to use gfind-xxx / find-xxx." + colorCmd + ` -t "[1-9]\\d* e\\w+"`
    + lineSep + gitInfoTemplate + " Please use gfind-xxx instead of find-xxx for git-exemptions." + colorCmd + ` -t "[1-9]\\d* e\\w+|MSR-\\S+|\\bfind-\\S+"`
    + lineSep + gitInfoTemplate + " Will not use git-ignore as too long Skip_Junk_Paths." + colorCmd + ` -t "[1-9]\\d* e\\w+|MSR-\\S+|Skip[\\w\\. -]+ = ([89][1-9]\\d{2}|\\d{5,})|(not use \\S+|too long [\\w-]+)"`
    + lineSep + getTipInfoTemplate(isWindowsTerminal, true)
    + newLine;

  if (saveTextToFile(tipFileStoragePath, bashHeader + expectedContent)) {
    const command = `${isWindowsTerminal ? "" : "bash"} ${quotePaths(tipFileDisplayPath)} ${replaceTipValueArg}`;
    sendCommandToTerminal(command, terminal || getRunCmdTerminal());
  }
}

export function cookCmdShortcutsOrFile(
  isFromMenu: boolean,
  currentFilePath: string,
  isForProjectCmdAlias: boolean,
  writeToEachFile: boolean,
  terminal: vscode.Terminal | undefined = undefined,
  isNewlyCreated: boolean = false,
  dumpOtherCmdAlias: boolean = false,
  isSelfLoopCalling: boolean = false,
  onlyCookFile: boolean = false,
  isGitIgnoreCompleted: boolean = false) {
  // 3 cookings of MSR-RUN-CMD: Init-terminal + Load-git-ignore + Tool downloaded.
  if (!RunCommandChecker.IsToolExists) {
    return;
  }

  const defaultRootFolderName = getDefaultRootFolderName();
  const trackBeginTime = new Date();

  // TODO: Refactor to compose-alias + write-files + different-os-terminals
  const isRunCmdTerminal = terminal !== undefined && terminal != null && terminal.name === RunCmdTerminalName;
  const isNewlyCreatedRunCmdTerminal = isNewlyCreated && isRunCmdTerminal;
  outputDebugByTime('Begin cooking command shortcuts for terminal ' + (terminal ? terminal.name : ''));
  const [shellExe, terminalType] = isRunCmdTerminal && !isNewlyCreated && IsWindows
    ? ['cmd.exe', TerminalType.CMD]
    : getShellExeAndTerminalType(terminal, isNewlyCreated);
  const shellExeName = path.basename(shellExe).replace(/\.exe$/i, ''); // Remove .exe for Linux bash on Windows.
  const bashConfigFile = "~/." + (isNullOrEmpty(shellExeName) ? 'bash' : shellExeName).replace('wsl', 'bash') + "rc";
  const shellExeFolder = path.dirname(shellExe);
  const isWindowsTerminal = isWindowsTerminalOnWindows(terminalType);
  const isLinuxTerminalOnWindows = IsWindows && !isWindowsTerminal;
  const generalScriptFilesFolder = getCmdAliasSaveFolder(true, false, terminalType);
  createDirectory(generalScriptFilesFolder);
  const generalAliasFolderForBash = toTerminalPath(generalScriptFilesFolder, terminalType);
  const rootFolder = isRunCmdTerminal && !onlyCookFile ? DefaultRootFolder : getRootFolder(currentFilePath, isForProjectCmdAlias);
  const rootFolderName = getRootFolderName(rootFolder);
  if (isPowerShellTerminal(terminalType) && MyConfig.canUseGoodGitIgnore(rootFolder)) {
    const testScriptName = isWindowsTerminal && IsWindows ? 'gfind-all.cmd' : 'gfind-all';
    const checkScriptPath = path.join(generalScriptFilesFolder, testScriptName);
    if (!isSelfLoopCalling && !fs.existsSync(checkScriptPath)) {
      cookCmdShortcutsOrFile(isFromMenu, currentFilePath, false, true, terminal, false, false, true);
    }
  }

  const saveAliasFolder = getCmdAliasSaveFolder(false, isForProjectCmdAlias, terminalType);
  if (isNullOrEmpty(rootFolderName)) { // && !terminal) {
    isForProjectCmdAlias = false;
  }

  const singleScriptsSaveFolder = toStoragePath(generalScriptFilesFolder);
  const singleScriptsFolderForTerminal = toTerminalPath(singleScriptsSaveFolder, terminalType);
  const cmdAliasFileNameForDefault = getAliasFileName(isWindowsTerminal, isForProjectCmdAlias);
  const cmdAliasFileNameForProject = defaultRootFolderName.replace(TrimProjectNameRegex, '-') + '.' + cmdAliasFileNameForDefault.replace(/\.doskeys$/, '.cmd'); // keep same with use-this-alias
  const tmpAliasStorageFolder = getCmdAliasSaveFolder(false, true, terminalType);
  const projectAliasFilePath = toStoragePath(path.join(tmpAliasStorageFolder, cmdAliasFileNameForProject));
  const quotedProjectAliasFileForTerminal = quotePaths(toTerminalPath(projectAliasFilePath, terminalType));
  const aliasFileName = isForProjectCmdAlias ? cmdAliasFileNameForProject : cmdAliasFileNameForDefault;
  const cmdAliasFileStoragePath = toStoragePath(path.join(saveAliasFolder, aliasFileName));
  const defaultCmdAliasFileStoragePath = getGeneralCmdAliasFilePath(terminalType);
  const defaultCmdAliasFileForTerminal = toTerminalPath(defaultCmdAliasFileStoragePath, terminalType);
  const quotedDefaultAliasFileForTerminal = quotePaths(defaultCmdAliasFileForTerminal);
  const quotedCmdAliasFileForTerminal = quotePaths(toTerminalPath(cmdAliasFileStoragePath, terminalType));
  const initBashAliasCmd = `source ${bashConfigFile}; chmod +x ${generalAliasFolderForBash}/*`;
  const slashQuotedDefaultCmdAliasFile = defaultCmdAliasFileForTerminal.includes(' ')
    ? '\\"' + defaultCmdAliasFileForTerminal + '\\"'
    : defaultCmdAliasFileForTerminal;


  // TODO: simplify checking tool path: Add tool folder + cmdAlias folder without checking.
  const rawWindowsPathSet = new Set<string>((process.env['PATH'] || '').split(/\\?\s*;\s*/));

  // If use echo command, should use '\\~' instead of '~'
  const defaultAliasPathForBash = getDisplayPathForBash(defaultCmdAliasFileForTerminal, '~'); // '\\~');

  const initLinuxTerminalCommands = isWindowsTerminal ? '' : getLinuxInitCommandLines();
  const aliasHeadText = getSkipJunkPathEnvCommand(terminalType, rootFolder, isForProjectCmdAlias, generalScriptFilesFolder);
  const newLine = isWindowsTerminal ? "\r\n" : "\n";
  let allCmdAliasText = aliasHeadText; // + newLine + initLinuxTerminalCommands
  if (isForProjectCmdAlias && !writeToEachFile) {
    allCmdAliasText += getLoadAliasFileCommand(defaultCmdAliasFileForTerminal, isWindowsTerminal) + newLine;
    saveTextToFile(projectAliasFilePath, allCmdAliasText, 'temp project alias file');
    if (isRunCmdTerminal) {
      return;
    }
  } else if (!writeToEachFile && !isNullOrEmpty(allCmdAliasText)) {
    allCmdAliasText += newLine;
  }

  const [cmdAliasMap, aliasCountFromFile, _commands] = getCommandAliasMap(terminalType, rootFolder, isForProjectCmdAlias, writeToEachFile, dumpOtherCmdAlias);
  const openFileTool = getOpenFileToolName(isWindowsTerminal, writeToEachFile, cmdAliasMap);
  addOpenUpdateCmdAlias(cmdAliasMap, openFileTool, isWindowsTerminal, writeToEachFile, quotedDefaultAliasFileForTerminal, 'update-alias', 'open-alias');

  const tmpAliasFolderForTerminal = toTerminalPath(getCmdAliasSaveFolder(false, true, terminalType), terminalType);
  const linuxTmpFolder = isLinuxTerminalOnWindows ? tmpAliasFolderForTerminal : '/tmp';
  const projectAliasFileName = getAliasFileName(isWindowsTerminal, true);
  const useThisAliasBody = isWindowsTerminal
    ? String.raw`@for /f "tokens=*" %a in ('git rev-parse --show-toplevel 2^>nul ^|^| echo "%CD%"') do`
    + String.raw` @for /f "tokens=*" %b in ('msr -z "%a" -t ".*?([^\\/]+?)\s*$" -o "\1" -aPAC ^|`
    + String.raw` msr -t "${TrimProjectNameRegex.source}" -o "-" -aPAC') do`
    + String.raw` @call "%tmp%\%b.${projectAliasFileName}"`
    : String.raw`thisFile=${linuxTmpFolder}/$(echo $(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD") |`
    + String.raw` msr -t ".*?([^/]+?)\s*$" -o "\1" -aPAC | msr -t "${TrimProjectNameRegex.source}" -o "-" -aPAC).${projectAliasFileName};`
    + String.raw` source $thisFile;`;
  cmdAliasMap.set('use-this-alias', getCommandAliasText('use-this-alias', useThisAliasBody, true, terminalType, false, true));

  if (createDirectory(singleScriptsSaveFolder)) {
    const shouldCheckUpdateAlias = isWeeklyCheckTime() || IsDebugMode;
    ['use-this-alias', 'add-user-path', 'reload-env', 'reset-env'].forEach(name => {
      const fullBody = cmdAliasMap.get(name) as string;
      if (!isNullOrEmpty(fullBody)) {
        const body = fullBody.replace(new RegExp(`^${name}=`), '');
        const useFunction = name === 'use-this-alias' || name === 'add-user-path';
        const text = getCommandAliasText(name, body, useFunction, terminalType, true, false);
        writeOneAliasToFile(name, text, shouldCheckUpdateAlias);
      }
    });
  }

  const openThisAliasBody = useThisAliasBody.replace(/doskey\W+MACROFILE=|(@?call|source) /g, 'code ');
  cmdAliasMap.set('use-this-alias', getCommandAliasText('use-this-alias', useThisAliasBody, isWindowsTerminal, terminalType, writeToEachFile, isWindowsTerminal));
  cmdAliasMap.set('open-this-alias', getCommandAliasText('open-this-alias', openThisAliasBody, true, terminalType, writeToEachFile, true));
  if (isForProjectCmdAlias && !isNullOrEmpty(rootFolderName)) {
    const tmpName = rootFolderName.replace(TrimProjectNameRegex, '-').toLowerCase();
    addOpenUpdateCmdAlias(cmdAliasMap, openFileTool, isWindowsTerminal, writeToEachFile, quotedCmdAliasFileForTerminal, 'update-' + tmpName + '-alias', 'open-' + tmpName + '-alias');
  }

  // list-alias + use-alias
  const tmpBody = 'msr -l --wt --sz -p ' + quotePaths(tmpAliasFolderForTerminal) + ' -f "' + cmdAliasFileNameForDefault + '$" $*';
  cmdAliasMap.set('list-alias', getCommandAliasText('list-alias', tmpBody, true, terminalType, false, false));
  const useBody = isWindowsTerminal ? 'call $1' : 'source $1';
  cmdAliasMap.set('use-alias', getCommandAliasText('use-alias', useBody, true, terminalType, false, false));

  [FindCommandType.FindTopFolder, FindCommandType.FindTopType, FindCommandType.FindTopSourceFolder, FindCommandType.FindTopSourceType, FindCommandType.FindTopCodeFolder, FindCommandType.FindTopCodeType].forEach(findTopCmd => {
    const findTopBody = getFindTopDistributionCommand(true, isForProjectCmdAlias, true, findTopCmd, rootFolder);
    let aliasName = replaceTextByRegex(FindCommandType[findTopCmd], /([a-z])([A-Z])/g, '$1-$2');
    aliasName = replaceTextByRegex(aliasName, /^-|-$/g, '').toLowerCase();
    cmdAliasMap.set(aliasName, getCommandAliasText(aliasName, findTopBody, false, terminalType, writeToEachFile, false, false));
  });

  [FindCommandType.SortBySize, FindCommandType.SortByTime, FindCommandType.SortSourceBySize, FindCommandType.SortSourceByTime, FindCommandType.SortCodeBySize, FindCommandType.SortCodeByTime].forEach(sortCmd => {
    const sortBody = getSortCommandText(true, isForProjectCmdAlias, true, sortCmd, rootFolder, true);
    let aliasName = replaceTextByRegex(FindCommandType[sortCmd], /([a-z])([A-Z])/g, '$1-$2');
    aliasName = replaceTextByRegex(aliasName, /^-|-$/g, '').toLowerCase();
    cmdAliasMap.set(aliasName, getCommandAliasText(aliasName, sortBody, false, terminalType, writeToEachFile, false, false));
  });

  const outFullPathsBody = getPathCmdAliasBody(true);
  cmdAliasMap.set('out-fp', getCommandAliasText('out-fp', outFullPathsBody, false, terminalType, writeToEachFile, false, false));
  const outRelativePathsBody = getPathCmdAliasBody(false);
  cmdAliasMap.set('out-rp', getCommandAliasText('out-rp', outRelativePathsBody, false, terminalType, writeToEachFile, false, false));

  duplicateSearchFileCmdAlias(rootFolder, terminalType, cmdAliasMap, isForProjectCmdAlias, writeToEachFile);

  const skipWritingScriptNames = new Set<string>(['use-fp', 'use-rp', 'out-rp', 'out-fp', 'alias']);
  const canWriteScripts = writeToEachFile && createDirectory(singleScriptsSaveFolder);

  let writeScriptFailureCount = 0;
  const isOnlyCookingGeneralCmdAlias = !isForProjectCmdAlias && isSelfLoopCalling && onlyCookFile;
  const isDumpingGeneralAliasFromMenu = isFromMenu && !isForProjectCmdAlias && dumpOtherCmdAlias;
  const sortedKeys = Array.from(cmdAliasMap.keys()).sort();
  sortedKeys.forEach(key => {
    let scriptContent = cmdAliasMap.get(key) || '';
    if (writeToEachFile) {
      if (canWriteScripts && !skipWritingScriptNames.has(key) && (dumpOtherCmdAlias || key.match(/^(r?g?find|sort)-|malias/))) {
        if (!writeOneAliasToFile(key, scriptContent, true)) {
          writeScriptFailureCount++;
        }
      }
    } else if (!isForProjectCmdAlias) {
      allCmdAliasText += scriptContent + newLine + newLine;
    }
  });

  if (writeToEachFile) {
    if (canWriteScripts && writeScriptFailureCount < cmdAliasMap.size) {
      if (!isWindowsTerminal) {
        runCmdInTerminal('chmod +x ' + singleScriptsFolderForTerminal + (dumpOtherCmdAlias ? '/*' : '/find*'));
      }
      outputCmdAliasGuide(terminal ? defaultCmdAliasFileStoragePath : cmdAliasFileStoragePath, saveAliasFolder);
    }

    if (writeScriptFailureCount > 0) {
      outputInfoQuietByTime('Total = ' + cmdAliasMap.size + ', failures = ' + writeScriptFailureCount + ', made ' + (cmdAliasMap.size - writeScriptFailureCount) + ' command alias/doskey script files saved in: ' + singleScriptsSaveFolder);
    } else {
      outputInfoQuietByTime('Successfully made ' + cmdAliasMap.size + ' command alias/doskey script files and saved in: ' + singleScriptsSaveFolder);
    }
  } else {
    if (!isForProjectCmdAlias || isOnlyCookingGeneralCmdAlias || isDumpingGeneralAliasFromMenu) {
      saveTextToFile(defaultCmdAliasFileStoragePath, allCmdAliasText, 'common alias file');
    }

    const expectedCount = cmdAliasMap.size - (isForProjectCmdAlias ? 2 : 0);
    let shouldUpdateCommonAliasFile = aliasCountFromFile < expectedCount;
    if (!shouldUpdateCommonAliasFile && !isSelfLoopCalling && isWeeklyCheckTime()) {
      const fileStatus = fs.statSync(defaultCmdAliasFileStoragePath);
      shouldUpdateCommonAliasFile = fileStatus.mtime && getElapsedSecondsToNow(fileStatus.mtime) > 3600;
    }

    if (shouldUpdateCommonAliasFile) {
      // Update common alias file for system terminal or Linux terminals on Windows
      cookCmdShortcutsOrFile(false, '', false, false, terminal, false, false, true, true);
    }

    if (!onlyCookFile) {
      if (isForProjectCmdAlias && !writeToEachFile) {
        const allTmpCmdAliasText = readTextFile(projectAliasFilePath);
        if (allTmpCmdAliasText !== allCmdAliasText) {
          saveTextToFile(projectAliasFilePath, allCmdAliasText, 'tmp project alias file');
          if (isRunCmdTerminal && isGitIgnoreCompleted) {
            const command = getLoadAliasFileCommand(quotedCmdAliasFileForTerminal, isWindowsTerminal);
            runCmdInTerminal(command);
          }
        }
      }

      if (terminal && isWindowsTerminal) {
        if (TerminalType.CMD !== terminalType && TerminalType.PowerShell !== terminalType) {
          outputErrorByTime('Not supported terminal: ' + terminal.name + ', shellExe = ' + shellExe);
          runCmdInTerminal('echo Not supported terminal: ' + terminal.name + ', shellExe = ' + shellExe);
          // fs.unlinkSync(cmdAliasFile);
          return;
        }
      }
    }
  }

  if (isWindowsTerminal && !isForProjectCmdAlias && (isRunCmdTerminal || (!terminal && isFromMenu) || isOnlyCookingGeneralCmdAlias)) {
    const regCmd = 'REG ADD "HKEY_CURRENT_USER\\Software\\Microsoft\\Command Processor" /v Autorun /d "DOSKEY /MACROFILE=' + slashQuotedDefaultCmdAliasFile + '" /f';
    runCmdInTerminal(regCmd, true);
  }

  if (onlyCookFile) {
    return;
  }

  const useGitIgnore = MyConfig.canUseGoodGitIgnore(rootFolder);
  if (isWindowsTerminal) {
    runCmdInTerminal(getLoadAliasFileCommand(quotedProjectAliasFileForTerminal, isWindowsTerminal));
    if (isRunCmdTerminal) {
      const toolFolder = getToolExportFolder(TerminalType.CMD);
      const foldersToAdd = isNullOrEmpty(toolFolder) ? [generalScriptFilesFolder] : [generalScriptFilesFolder, toolFolder];
      let foundCount = 0;
      for (let k = 0; k < foldersToAdd.length && foundCount < foldersToAdd.length; k++) {
        foundCount += rawWindowsPathSet.has(foldersToAdd[k]) ? 1 : 0;
      }

      if (foundCount < foldersToAdd.length) {
        const addPathText = foldersToAdd.join(';').trimRight();
        runCmdInTerminal(`add-user-path "${addPathText}"`, true);  // where /q add-user-path.cmd ||
      }
    }
  } else {
    runCmdInTerminal(`source ${quotedCmdAliasFileForTerminal}`);
  }

  if (!RunCommandChecker.IsToolExists) {
    return;
  }

  if (isPowerShellTerminal(terminalType)) {
    runPowerShellShowFindCmdLocation(MyConfig.canUseGoodGitIgnore(rootFolder) ? "^g?find-\\w+-def" : "^(update|open|use)-\\S*alias");
  }

  const showLongTip = MyConfig.ShowLongTip;
  if (TerminalType.PowerShell === terminalType && !useGitIgnore) {
    const tipFileDisplayPath = getTipFileDisplayPath(terminalType);
    runPostInitCommands(terminal, terminalType, rootFolderName); // Must be run before 'cmd /k' for PowerShell
    const quotedFileForPS = (quotedCmdAliasFileForTerminal === cmdAliasFileStoragePath ? cmdAliasFileStoragePath : '`"' + cmdAliasFileStoragePath + '`"').replace(TempStorageFolder, '%TMP%');
    const loadAliasCmd = getLoadAliasFileCommand(quotedFileForPS, isWindowsTerminal, false);
    const replaceTipValueArg = `-x S#C -o ${cmdAliasMap.size}`;
    const cmd = `cmd /k "${loadAliasCmd}`
      + ` & ${tipFileDisplayPath.replace(TempStorageFolder, '%TMP%')} ${replaceTipValueArg}`
      + ` & echo Type exit to back to PowerShell.| msr -aPA -e .+ -x exit"`;
    runCmdInTerminal(cmd, true);
  } else if (TerminalType.Pwsh === terminalType && !useGitIgnore) {
    runPowerShellShowFindCmdLocation();
    if (showLongTip) {
      showTipByCommand(terminal, terminalType, cmdAliasMap.size);
    }
    runCmdInTerminal('bash --init-file ' + quotedCmdAliasFileForTerminal);
  } else {
    if (showLongTip) {
      showTipByCommand(terminal, terminalType, cmdAliasMap.size, initLinuxTerminalCommands);
    }
  }

  outputDebugByTime('Finished to cook command shortcuts. Cost ' + getElapsedSecondsToNow(trackBeginTime) + ' seconds.');
  if (!isForProjectCmdAlias && (isRunCmdTerminal || isFromMenu) && !isNullOrEmpty(rootFolderName) && !isWindowsTerminal) {
    runCmdInTerminal(getLoadAliasFileCommand(projectAliasFilePath, isWindowsTerminal));
  }

  if (TerminalType.PowerShell !== terminalType) {
    runPostInitCommands(terminal, terminalType, rootFolderName);
  }

  function runPowerShellShowFindCmdLocation(searchFileNamePattern = "^g?find-\\w+-def") {
    if (fs.existsSync(generalScriptFilesFolder)) {
      runCmdInTerminal('msr -l --wt --sz -p ' + quotePaths(generalScriptFilesFolder) + ` -f "${searchFileNamePattern}" -H 2 -T2 -M`);
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
      scriptContent = (head.length > 0 ? head + os.EOL : head) + scriptContent;
    } else {
      scriptContent = '#!/bin/bash' + '\n' + scriptContent;
    }

    scriptContent = scriptContent.trim() + (isWindowsTerminal ? '\r\n' : '\n');
    return saveTextToFile(singleScriptPath, scriptContent, 'single command alias script file', true);
  }

  function getLinuxInitCommandLines(): string {
    let initLinuxCommands = "";
    if (isNewlyCreated) {
      if (isLinuxTerminalOnWindows) {
        if (isNewlyCreatedRunCmdTerminal) { // Calling bash to enter MinGW / Cygwin
          let envPathSet = new Set<string>().add(shellExeFolder);
          rawWindowsPathSet.forEach(a => envPathSet.add(a));
          envPathSet = getUniqueStringSetNoCase(envPathSet, true);
          process.env['PATH'] = Array.from(envPathSet).join(';');
          runCmdInTerminal(quotePaths(shellExe));
        }
      }

      initLinuxCommands += getLinuxInitCommands(terminalType);

    } else if (TerminalType.Pwsh !== terminalType) {
      initLinuxCommands += "\n" + initBashAliasCmd;
    }

    if (shellExeName !== 'pwsh') {
      // If file not found: Windows = -1; MinGW = 127; Linux = 255
      initLinuxCommands += "\n" + `msr -p ${bashConfigFile} 2>/dev/null -x 'source ${defaultAliasPathForBash}' -M;`
        + "\n" + `(($? == 0 || $? == -1 || $? == 255 || $? == 127)) && echo 'source ${defaultAliasPathForBash}' >> ${bashConfigFile}`
        + "\n";
    }
    return initLinuxCommands;
  }

  function getLinuxInitCommands(terminalType: TerminalType): string {
    const toolExportFolder = toTerminalPath(getToolExportFolder(terminalType), terminalType);
    const defaultAdding = `${toolExportFolder}:${generalAliasFolderForBash}`.replace(/^\s*:/, '');
    let initCommandList = "";
    let initEnvCmd = `export PATH="/usr/bin/:$PATH:~:${defaultAdding}"`;
    const checkAliasCmd = `which use-this-alias > /dev/null 2>&1`;
    initCommandList += `${checkAliasCmd} || ( `
      + `[ -z "$(cat ${bashConfigFile} | grep -E 'which use-this-alias')" ] && echo >> ${bashConfigFile} `
      + `&& echo '${checkAliasCmd} || ${initEnvCmd.replace(':~:', ':')}' >> ${bashConfigFile} )`
      + "\n" + `source ${bashConfigFile}`;
    if ((TerminalType.MinGWBash === terminalType || TerminalType.CygwinBash === terminalType)) {
      const binFolder = toTerminalPath(shellExeFolder, terminalType);
      const envPath = process.env['PATH'] || '';
      const shouldAddBinPath = !isNullOrEmpty(envPath) && !isNullOrEmpty(binFolder) && binFolder !== '.' && !envPath.includes(shellExeFolder);
      if (shouldAddBinPath) {
        // Avoid MinGW prior to Cygwin when use Cygwin bash.
        initEnvCmd = `export PATH="${binFolder}:/usr/bin/:~:$PATH:${defaultAdding}"`;
      }
      initCommandList += "\n" + initEnvCmd;
      const bashFolder = path.dirname(path.dirname(shellExe)).replace(/([^\\])(\\{1})([^\\]|$)/g, '$1$2$2$3');
      const getBashFolderCmd = TerminalType.MinGWBash === terminalType
        ? String.raw`$(where bash.exe | head -n 1 | sed 's#[\\/]usr[\\/]bin[\\/].*##' | sed 's#\\$##')`
        : String.raw`$(where bash.exe | head -n 1 | sed 's#[\\/]bin[\\/].*##' | sed 's#\\$##')`;
      const bashFolderValue = isNullOrEmpty(bashFolder) || bashFolder === '.' ? getBashFolderCmd : bashFolder;
      if (TerminalType.CygwinBash === terminalType) {
        initEnvCmd = `export CYGWIN_ROOT="${bashFolderValue}"`;
      } else if (TerminalType.MinGWBash === terminalType) {
        initEnvCmd = `export MINGW_ROOT="${bashFolderValue}"`;
      }
    }
    else if (isLinuxTerminalOnWindows) {
      // Avoid msr.exe prior to msr.cygwin or msr.gcc48
      initEnvCmd = `export PATH=/usr/bin/:~:$PATH:${defaultAdding}`;
    }
    else if (TerminalType.Pwsh === terminalType) {
      initEnvCmd = `$env:PATH = $env:HOME + ":" + $env:PATH + ":"  + "${defaultAdding}"`;
    }

    initCommandList += "\n" + initEnvCmd;

    // Check existing home folder and download tool
    if (isLinuxTerminalOnWindows) {
      const shouldUseDownload = /^(Git Bash|Cygwin)/i.test(shellExe);
      if (terminal || shouldUseDownload) {
        const downloadCommands = [
          new ToolChecker(terminalType).getCheckDownloadCommandsForLinuxBashOnWindows('msr', shouldUseDownload),
          new ToolChecker(terminalType).getCheckDownloadCommandsForLinuxBashOnWindows('nin', shouldUseDownload)
        ].filter(a => !isNullOrEmpty(a));

        downloadCommands.forEach(c => runCmdInTerminal(c));
      }
    }

    if (TerminalType.Pwsh !== terminalType) {
      initCommandList += "\n" + initBashAliasCmd;
    }

    return initCommandList;
  }

  function getPathCmdAliasBody(outputFullPath: boolean = false): string {
    let command = (isWindowsTerminal ? 'set' : 'export') + ' MSR_OUT_FULL_PATH=' + (outputFullPath ? 1 : 0);

    if (!IsUniformSlashSupported) {
      command += ' && echo Please update msr to latest manually, or set msr.autoUpdateSearchTool = true + delete msr + reload.';
    } else {
      command += " && echo Will output " + (outputFullPath ? "full" : "relative") + " file paths.";
    }

    return command;
  }

  function runCmdInTerminal(cmd: string, showTerminal: boolean = false) {
    const clearAtFirst = MyConfig.ClearTerminalBeforeExecutingCommands;
    if (terminal) {
      sendCommandToTerminal(cmd, terminal, showTerminal, clearAtFirst, isLinuxTerminalOnWindows);
    } else {
      runCommandInTerminal(cmd, showTerminal, clearAtFirst, isLinuxTerminalOnWindows);
    }
  }
}

export function getCommandAliasMap(
  terminalType: TerminalType,
  rootFolder: string,
  isForProjectCmdAlias: boolean,
  writeToEachFile: boolean,
  dumpOtherCmdAlias: boolean = false)
  : [Map<string, string>, number, string[]] {

  const rootFolderName = path.basename(rootFolder);
  const isWindowsTerminal = isWindowsTerminalOnWindows(terminalType);
  const projectKey = isForProjectCmdAlias ? (rootFolderName || '') : 'notUseProject';

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

  const skipFolderPatternForCmdAlias = getIgnoreFolderCommand(isWindowsTerminal);

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

    const body = 'msr -rp . ' + skipFolderPatternForCmdAlias + ' -f "' + filePattern + '" ' + extraOption;
    commands.push(getCommandAlias(cmdName, body, false));

    findTypes.forEach(fd => {
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
    let body = 'msr -rp . ' + skipFolderPatternForCmdAlias;
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

    const body = 'msr -rp . ' + skipFolderPatternForCmdAlias + (isFindAll ? "" : ' -f "' + filePattern + '" ' + extraOption.trim());
    commands.push(getCommandAlias(cmdName, body.trimRight(), true));
    if (cmdName === 'find-all') {
      extraOption = extraOption.replace(/(^|\s+)--s1\s+\S+\s*/g, ' '); // many repo files are empty
      extraOption = extraOption.replace(/(^|\s+)--s2\s+\S+\s*/, ' '); // some repo files are too huge
      extraOption = extraOption.replace(/(^|\s+)-I(\s+|$)/, ' '); // many errors may show up for gfind-all
      const findFileBody = 'msr -rp . ' + skipFolderPatternForCmdAlias + ' ' + extraOption.trim();
      commands.push(getCommandAlias('find-file', findFileBody.trim(), true));
    }
  });

  // find-nd find-code find-ndp find-small find-all
  const allCodeFilePattern = isForProjectCmdAlias ? MyConfig.CodeFilesPlusUIRegex.source : MyConfig.CodeFilesPlusUIDefaultRegex.source;
  const extraOption = addFullPathHideWarningOption(getConfigValueOfProject(projectKey, 'extraOptions'), writeToEachFile);
  const skipFoldersForCmd = skipFolderPatternForCmdAlias;
  commands.push(getCommandAlias('find-nd', 'msr -rp .' + skipFoldersForCmd + ' ' + extraOption, false));
  commands.push(getCommandAlias('find-ndp', 'msr -rp %1' + skipFoldersForCmd + ' ' + extraOption, true));
  commands.push(getCommandAlias('find-code', 'msr -rp .' + skipFoldersForCmd + ' -f "' + allCodeFilePattern + '" ' + extraOption, false));

  const allSmallFilesOptions = addFullPathHideWarningOption(getConfigValueOfProject(projectKey, 'allSmallFiles.extraOptions'), writeToEachFile);
  commands.push(getCommandAlias('find-small', 'msr -rp .' + skipFoldersForCmd + ' ' + allSmallFilesOptions, false));

  // find-class
  const findClassFiles = ' -f "' + MyConfig.CodeFilesRegex.source + '"';
  const findClassPattern = ' -t "\\b(class|struct|enum|interface|trait|^\\s*(object|type))\\s+%1"';
  const skipClassPattern = ' --nt "^\\s*(/|throw|return)|%1\\s*;\\s*$"';
  commands.push(getCommandAlias('find-class', 'msr -rp .' + findClassFiles + findClassPattern + skipClassPattern + skipFoldersForCmd + ' ' + extraOption, true));

  // find-spring-ref
  let oneLineCode = FindJavaSpringReferenceByPowerShellAlias.split(/[\r\n]+\s*/).join(' ');
  if (!isWindowsTerminal) {
    oneLineCode = oneLineCode.replace(/(\$[a-z]\w+)/g, '\\$1');
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
      + '; msr -rp .' + skipFoldersForCmd + " -f '" + fileExtPattern + "'"
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
      const extensions = MyConfig.RootConfig.get(`fileExtensionMap.${configPrefix}`) as string;
      if (isNullOrEmpty(extensions)) {
        return;
      }
      const fileExtensionPattern = `\\.(${extensions.split(/\s+/).join('|')})$`;
      const fileFilter = ` -f "${fileExtensionPattern}"`;
      const findUiDef = cmdAliasMap.get('find-ui-def') || '';
      const findUiRef = cmdAliasMap.get('find-ui-ref') || '';
      const defConfig = MyConfig.RootConfig.get(configPrefix);
      const refConfig = MyConfig.RootConfig.get(configPrefix);
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

  outputInfoQuiet('find-ndp dir1,dir2,file1,fileN -t MySearchRegex -x AndPlainText');
  outputInfoQuiet('find-nd -t MySearchRegex -x AndPlainText');
  outputInfoQuiet('find-code -it MySearchRegex -x AndPlainText');
  outputInfoQuiet('find-small -it MySearchRegex -U 5 -D 5 : Show up/down lines.');
  outputInfoQuiet('find-doc -it MySearchRegex -x AndPlainText -l -PAC : Show pure path list.');
  outputInfoQuiet('find-py-def ClassOrMethod -x AndPlainText : Search definition in python files.');
  outputInfoQuiet('find-py-ref MySearchRegex -x AndPlainText : Search references in python files.');
  outputInfoQuiet('find-ref "class\\s+MyClass" -x AndPlainText --np "unit|test" --xp src\\ext,src\\common -c show command line.');
  outputInfoQuiet('find-def MyClass -x AndPlainText --np "unit|test" --xp src\\ext,src\\common -c show command line.');
  outputInfoQuiet('find-ref MyClass --pp "unit|test" -U 3 -D 3 -H 20 -T 10 :  Preview Up/Down lines + Set Head/Tail lines in test.');
  outputInfoQuiet('find-ref OldClassOrMethod -o NewName -j : Just preview changes only.');
  outputInfoQuiet('find-ref OldClassOrMethod -o NewName -R : Replace files.');
  outputInfoQuiet('alias find-pure-ref');
  outputInfoQuiet('malias find -x all -H 9');
  outputInfoQuiet('malias "find[\\w-]*ref"');
  outputInfoQuiet('malias ".*?(find-\\S+)=.*" -o "\\2"  :  To see all find-xxx alias/doskeys.');
  outputInfoQuiet('out-rp  - Output relative path.');
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

export function getExistingCmdAlias(terminalType: TerminalType, forMultipleFiles: boolean): Map<string, string> {
  var cmdAliasMap = getCommonAliasMap(terminalType, forMultipleFiles);
  outputInfoByDebugModeByTime(`Built ${cmdAliasMap.size} common alias.`);
  const isWindowsTerminal = isWindowsTerminalOnWindows(terminalType);
  const defaultCmdAliasFile = getGeneralCmdAliasFilePath(terminalType);
  const defaultCmdAliasFileForTerminal = toTerminalPath(defaultCmdAliasFile, terminalType);
  const cmdAliasText = readTextFile(defaultCmdAliasFile);
  if (isNullOrEmpty(cmdAliasText)) {
    outputWarnByTime(`Not found or read empty file: ${defaultCmdAliasFileForTerminal}`);
    return cmdAliasMap;
  }
  const [inconsistentCount, newCount] = getCmdAliasMapFromText(cmdAliasText, cmdAliasMap, forMultipleFiles, isWindowsTerminal);
  if (inconsistentCount > 0) {
    outputInfoQuietByTime(`Found ${inconsistentCount} inconsistent common alias, you can enable 'msr.overwriteInconsistentCommonAliasByExtension'`
      + `, or delete them in file: ${defaultCmdAliasFileForTerminal}`);
  }

  // Skip checking and overwrite alias file if for multiple files - the alias body is different with default alias content.
  if (forMultipleFiles) {
    if (!isWindowsTerminal) {
      checkAddLinuxBashAliasFile(cmdAliasMap, path.dirname(defaultCmdAliasFile));
    }
    return cmdAliasMap;
  }

  if (newCount > 0) {
    outputInfo(`Found ${newCount} new common alias, will save all ${cmdAliasMap.size} alias to file: ${defaultCmdAliasFileForTerminal}`);
  }

  if (newCount > 0 || (inconsistentCount > 0 && MyConfig.OverwriteInconsistentCommonAliasByExtension)) {
    const sortedKeys = Array.from(cmdAliasMap.keys()).sort();
    const newCmdAliasText = sortedKeys.map(key => cmdAliasMap.get(key)).join(isWindowsTerminal ? '\r\n\r\n' : '\n\n');
    if (!saveTextToFile(defaultCmdAliasFile, newCmdAliasText)) {
      outputErrorByTime(`Failed to save ${newCount} new alias to file: ${defaultCmdAliasFileForTerminal}`);
    } else {
      outputInfoQuietByTime(`Updated ${inconsistentCount} alias, added ${newCount} alias, see ${cmdAliasMap.size} alias in file: ${defaultCmdAliasFileForTerminal}`);
    }
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

function getCmdAliasMapFromText(cmdAliasText: string, map: Map<string, string>, forMultipleFiles: boolean, isWindowsTerminal: boolean, isBashConfigFile: boolean = false): [number, number] {
  const lines = isWindowsTerminal ? cmdAliasText.split(/[\r\n]+/) : cmdAliasText.split(/(^|[\r\n]+)alias\s+/);
  const getNameBodyRegex = isWindowsTerminal || !forMultipleFiles
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
    if (forMultipleFiles && isBashConfigFile) {
      // Extract body if it's a function alias:
      rawBodyText = rawBodyText.replace(/^([\w-]+)=(.)function\s+\w+[^\r\n]*\{\s*(.+?)\s*[\r\n]+\s*\}\s*;\s*\w+[^\r\n]*\s*$/s, "$1=$2$3$2");
    }
    const match = getNameBodyRegex.exec(rawBodyText);
    if (!match) {
      return;
    }

    const name = match[1];
    let body = forMultipleFiles
      ? (isWindowsTerminal
        ? replaceArgForWindowsCmdAlias(match[2].trim(), forMultipleFiles)
        : replaceArgForLinuxCmdAlias(match[2].trim(), forMultipleFiles)
      )
      : (isWindowsTerminal ? '' : 'alias ') + match[0].trim();

    // Trim multi-line head whitespace for script files:
    if (!isWindowsTerminal && forMultipleFiles) {
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
