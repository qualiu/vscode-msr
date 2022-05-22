import * as vscode from 'vscode';
import { getSetToolEnvCommand, ToolChecker } from "./checkTool";
import { getFindTopDistributionCommand, getSortCommandText } from "./commands";
import { getConfigValueByRoot, getOverrideConfigByPriority } from "./configUtils";
import { HomeFolder, IsLinux, IsWindows, IsWSL, RunCmdTerminalName } from "./constants";
import { DefaultRootFolder, getConfig, getGitIgnore, getSearchPathOptions, MappedExtToCodeFilePatternMap, MyConfig } from "./dynamicConfig";
import { FindCommandType, TerminalType } from "./enums";
import { getTerminalInitialPath, getTerminalNameOrShellExeName, getTerminalShellExePath, saveTextToFile } from './otherUtils';
import { clearOutputChannel, enableColorAndHideCommandLine, HasCreatedRunCmdTerminal, outputDebug, outputError, outputInfoQuiet, runCommandInTerminal, sendCommandToTerminal } from "./outputUtils";
import { escapeRegExp } from "./regexUtils";
import { DefaultTerminalType, getRootFolder, getRootFolderName, getTimeCostToNow, getUniqueStringSetNoCase, IsLinuxTerminalOnWindows, isLinuxTerminalOnWindows, isNullOrEmpty, isPowerShellTerminal, isWindowsTerminalType, nowText, quotePaths, replaceSearchTextHolder, replaceTextByRegex, toOsPath, toOsPathsForText, toWSLPath } from "./utils";
import fs = require('fs');
import os = require('os');
import path = require('path');

const CookCmdDocUrl = 'https://github.com/qualiu/vscode-msr/blob/master/README.md#command-shortcuts';
export let CookCmdTimesForRunCmdTerminal: number = 0;

function getLinuxHomeFolderOnWindows(terminalType: TerminalType): string {
  const shellExePath = getTerminalShellExePath();
  const shellExeFolder = path.dirname(shellExePath);
  if (IsWSL || IsLinux) {
    return "~/";
  }

  let folder = path.join(path.dirname(shellExeFolder), 'home', os.userInfo().username);
  if (TerminalType.MinGWBash === terminalType || TerminalType.WslBash === terminalType) {
    const home = process.env['USERPROFILE'] || '';
    if (!isNullOrEmpty(home)) {
      return home;
    }
  }
  return folder.replace(/^home/, '/home');
}

function getCmdAliasSaveFolder(isGeneralCmdAlias: boolean, terminalType: TerminalType, forceUseDefault = false): string {
  const rootConfig = getConfig().RootConfig;
  let saveFolder = !isGeneralCmdAlias ? os.tmpdir() : toWSLPath(forceUseDefault ? HomeFolder : (rootConfig.get('cmdAlias.saveFolder') as string || HomeFolder));

  // avoid random folder in Darwin like: '/var/folders/7m/f0z72nfn3nn6_mnb_0000gn/T'
  if (!isGeneralCmdAlias && saveFolder.startsWith('/')) {
    saveFolder = '/tmp/';
  }

  if (isGeneralCmdAlias && !isLinuxTerminalOnWindows(terminalType)) {
    const linuxHomeFolderOnWindows = getLinuxHomeFolderOnWindows(terminalType);
    if (saveFolder.match(/^[A-Z]:/i) && (IsWSL || TerminalType.CygwinBash === terminalType || TerminalType.MinGWBash === terminalType)) {
      try {
        if (!fs.existsSync(linuxHomeFolderOnWindows)) {
          fs.mkdirSync(linuxHomeFolderOnWindows);
        }
        saveFolder = linuxHomeFolderOnWindows;
      } catch (error) {
        outputDebug('\n' + nowText() + 'Failed to create folder: ' + linuxHomeFolderOnWindows + ' for Linux terminal on Windows.');
      }
    }
  }

  return saveFolder;
}

export function getGeneralCmdAliasFilePath(terminalType: TerminalType) {
  const isWindowsTerminal = isWindowsTerminalType(terminalType);
  const saveFolder = getCmdAliasSaveFolder(true, terminalType);
  const fileName = 'msr-cmd-alias' + (isWindowsTerminal ? '.doskeys' : '.bashrc');

  // if is WSL and first time, which read Windows settings.
  if (IsWSL && saveFolder.match(/^[A-Z]:/i)) {
    return path.join(HomeFolder, fileName);
  }

  return path.join(saveFolder, fileName);
}

function getDisplayPathForBash(filePath: string, replaceTo: string = '~'): string {
  const homeValue = process.env['HOME'] || '';
  const pattern = isNullOrEmpty(homeValue)
    ? /^(~|\$HOME)/
    : new RegExp('^(~|\$HOME|' + homeValue + '\\b)');
  return filePath.replace(pattern, replaceTo);
}

function getShellExeAndTerminalType(newTerminal: vscode.Terminal | undefined): [string, TerminalType] {
  const initialPath = getTerminalInitialPath(newTerminal) || '';
  const shellExe = initialPath.match(/\.exe$|\w*sh$/i) ? initialPath : getTerminalShellExePath();
  const terminalOrShellName = getTerminalNameOrShellExeName(newTerminal);
  const exeNameByInitPath = isNullOrEmpty(initialPath) ? '' : path.basename(initialPath);
  const terminalName = !isNullOrEmpty(exeNameByInitPath) ? exeNameByInitPath : terminalOrShellName;

  if (!newTerminal || terminalName === RunCmdTerminalName) {
    // Avoid error in reloading CMD terminal.
    const terminalType = IsWindows && !HasCreatedRunCmdTerminal ? TerminalType.CMD : DefaultTerminalType;
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
      } else if (/Cygwin.*?bin\\bash.exe$|^Cygwin/i.test(shellExe)) {
        return [shellExe, TerminalType.CygwinBash];
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

export function cookCmdShortcutsOrFile(
  isFromMenu: boolean,
  currentFilePath: string,
  useProjectSpecific: boolean,
  writeToEachFile: boolean,
  newTerminal: vscode.Terminal | undefined = undefined,
  dumpOtherCmdAlias: boolean = false,
  isSelfLoopCalling: boolean = false) {
  const trackBeginTime = new Date();
  if (!newTerminal) {
    clearOutputChannel();
  }

  outputDebug(nowText() + 'Begin cooking command shortcuts for terminal ' + (newTerminal ? newTerminal.name : ''));
  const isCreatingRunCmdTerminal = newTerminal && newTerminal.name === RunCmdTerminalName;
  const isGeneralCmdAlias = !useProjectSpecific; // && !newTerminal;

  const [shellExe, terminalType] = getShellExeAndTerminalType(newTerminal);
  const shellExeName = path.basename(shellExe).replace(/\.exe$/i, ''); // Remove .exe for Linux bash on Windows.
  const shellSettingsFile = "~/." + shellExeName + "rc";
  const loadShellSettingsCommand = `source ${shellSettingsFile}`;
  const shellExeFolder = path.dirname(shellExe);
  const isRunCmdTerminal = newTerminal !== undefined && newTerminal != null && newTerminal.name === RunCmdTerminalName;
  if (isRunCmdTerminal) {
    CookCmdTimesForRunCmdTerminal += 1;
  }

  const isReCookingForRunCmdTerminal: boolean = CookCmdTimesForRunCmdTerminal > 1 && isRunCmdTerminal;
  const isWindowsTerminal = isWindowsTerminalType(terminalType);
  const isLinuxTerminalOnWindows = IsWindows && !isWindowsTerminal;
  const generalScriptFilesFolder = path.join(getCmdAliasSaveFolder(true, terminalType), 'cmdAlias');
  if (isPowerShellTerminal(terminalType) && !MyConfig.ChangePowerShellTerminalToCmdOrBash) {
    const testScriptName = TerminalType.PowerShell === terminalType ? 'gfind-all.cmd' : 'gfind-all';
    const testPath = path.join(generalScriptFilesFolder, testScriptName);
    if (!isSelfLoopCalling && !fs.existsSync(testPath)) {
      cookCmdShortcutsOrFile(false, currentFilePath, false, true, newTerminal, false, true);
    }
  }

  const saveFolder = getCmdAliasSaveFolder(isGeneralCmdAlias, terminalType);
  const rootFolder = isRunCmdTerminal ? DefaultRootFolder : getRootFolder(currentFilePath, useProjectSpecific);
  const rootFolderName = getRootFolderName(rootFolder);
  if (isNullOrEmpty(rootFolderName) && !newTerminal) {
    useProjectSpecific = false;
  }

  const [cmdAliasMap, oldCmdCount, _commands] = getCommandAliasMap(terminalType, rootFolder, useProjectSpecific, writeToEachFile, dumpOtherCmdAlias);
  const fileName = (useProjectSpecific ? rootFolderName + '.' : '') + 'msr-cmd-alias' + (isWindowsTerminal ? '.doskeys' : '.bashrc');
  const cmdAliasFile = toWSLPath(path.join(saveFolder, fileName));
  const quotedCmdAliasFile = quotePaths(toOsPath(cmdAliasFile, terminalType));
  const defaultCmdAliasFile = getGeneralCmdAliasFilePath(terminalType);
  let toolToOpen = 'code';
  if (isWindowsTerminal) {
    const aliasBody = 'doskey /macros 2>&1 | msr -PI -t "^(%1)"';
    const existingOpenDoskey = cmdAliasMap.get('open-doskeys') as string || '';
    const matchTool = /=(\w+\S+|"\w+.*?")/.exec(existingOpenDoskey);
    toolToOpen = isNullOrEmpty(existingOpenDoskey) || !matchTool ? 'code' : matchTool[1];
    cmdAliasMap.set('alias', getCommandAliasText('alias', aliasBody, false, true, writeToEachFile));

    cmdAliasMap.set('malias', getCommandAliasText('malias', aliasBody, false, true, writeToEachFile));
  } else if (!isWindowsTerminal) {
    cmdAliasMap.set('malias', getCommandAliasText('malias', 'alias | msr -PI -t "^\\s*alias\\s+($1)"', true, false, writeToEachFile));
  }

  const defaultCmdAliasFileForTerminal = toOsPath(defaultCmdAliasFile, terminalType);
  const slashQuotedDefaultCmdAliasFile = defaultCmdAliasFileForTerminal.includes(' ') ? '\\"' + defaultCmdAliasFileForTerminal + '\\"' : defaultCmdAliasFileForTerminal;
  const defaultCmdAliasFileDisplayPath = toOsPath(defaultCmdAliasFile, terminalType);
  const quotedDefaultAliasFileForDisplay = quotePaths(toOsPath(defaultCmdAliasFile, terminalType));
  const quotedCmdAliasFileForDisplay = quotePaths(toOsPath(cmdAliasFile, terminalType));

  function addOpenUpdateCmdAlias(aliasFilePath: string, updateName: string = 'update-alias', openName: string = 'open-alias') {
    const updateDoskeyText = isWindowsTerminal
      ? (writeToEachFile ? `doskey /MACROFILE=${aliasFilePath}` : `${updateName}=doskey /MACROFILE=${aliasFilePath}`)
      : (writeToEachFile ? `source ${aliasFilePath}` : `alias ${updateName}='source ${aliasFilePath}'`);

    const openDoskeyText = isWindowsTerminal
      ? (writeToEachFile ? `${toolToOpen} ${aliasFilePath}` : `${openName}=${toolToOpen} ${aliasFilePath}`)
      : (writeToEachFile ? `${toolToOpen} ${aliasFilePath}` : `alias ${openName}='${toolToOpen} ${aliasFilePath}'`);

    cmdAliasMap.set(updateName, updateDoskeyText);
    cmdAliasMap.set(openName, openDoskeyText);
  }

  addOpenUpdateCmdAlias(quotedDefaultAliasFileForDisplay, 'update-alias', 'open-alias');
  if (isWindowsTerminal) { // support old shortcut name
    addOpenUpdateCmdAlias(quotedDefaultAliasFileForDisplay, 'update-doskeys', 'open-doskeys');
  }

  let extraAliasCount = 0;
  if (useProjectSpecific && !isNullOrEmpty(rootFolderName)) {
    const tmpName = rootFolderName.replace(/[^\w\.-]/g, '-').toLowerCase();
    addOpenUpdateCmdAlias(quotedCmdAliasFileForDisplay, 'update-' + tmpName + '-alias', 'open-' + tmpName + '-alias');
    extraAliasCount += 2;
    if (isWindowsTerminal) { // support old shortcut name
      addOpenUpdateCmdAlias(quotedCmdAliasFileForDisplay, 'update-' + tmpName + '-doskeys', 'open-' + tmpName + '-doskeys');
      extraAliasCount += 2;
    }
  }

  [FindCommandType.FindTopFolder, FindCommandType.FindTopType, FindCommandType.FindTopSourceFolder, FindCommandType.FindTopSourceType, FindCommandType.FindTopCodeFolder, FindCommandType.FindTopCodeType].forEach(findTopCmd => {
    const findTopBody = getFindTopDistributionCommand(false, useProjectSpecific, true, findTopCmd, rootFolder);
    let aliasName = replaceTextByRegex(FindCommandType[findTopCmd], /([a-z])([A-Z])/g, '$1-$2');
    aliasName = replaceTextByRegex(aliasName, /^-|-$/g, '').toLowerCase();
    cmdAliasMap.set(aliasName, getCommandAliasText(aliasName, findTopBody, false, isWindowsTerminal, writeToEachFile, false, false));
  });

  [FindCommandType.SortBySize, FindCommandType.SortByTime, FindCommandType.SortSourceBySize, FindCommandType.SortSourceByTime, FindCommandType.SortCodeBySize, FindCommandType.SortCodeByTime].forEach(sortCmd => {
    const sortBody = getSortCommandText(false, useProjectSpecific, true, sortCmd, rootFolder, true);
    let aliasName = replaceTextByRegex(FindCommandType[sortCmd], /([a-z])([A-Z])/g, '$1-$2');
    aliasName = replaceTextByRegex(aliasName, /^-|-$/g, '').toLowerCase();
    cmdAliasMap.set(aliasName, getCommandAliasText(aliasName, sortBody, false, isWindowsTerminal, writeToEachFile, false, false));
  });

  const useFullPathsBody = getPathCmdAliasBody(true, cmdAliasFile, false);
  cmdAliasMap.set('use-fp', getCommandAliasText('use-fp', useFullPathsBody, false, isWindowsTerminal, writeToEachFile, false, false));
  const searchRelativePathsBody = getPathCmdAliasBody(false, cmdAliasFile, false);
  cmdAliasMap.set('use-rp', getCommandAliasText('use-rp', searchRelativePathsBody, false, isWindowsTerminal, writeToEachFile, false, false));

  const outFullPathsBody = getPathCmdAliasBody(true, cmdAliasFile, true, true);
  cmdAliasMap.set('out-fp', getCommandAliasText('out-fp', outFullPathsBody, false, isWindowsTerminal, writeToEachFile, false, false));
  const outRelativePathsBody = getPathCmdAliasBody(false, cmdAliasFile, true, false);
  cmdAliasMap.set('out-rp', getCommandAliasText('out-rp', outRelativePathsBody, false, isWindowsTerminal, writeToEachFile, false, false));

  // Duplicate find-xxx to git ls-file & find-xxx
  const sortedCmdKeys = Array.from(cmdAliasMap.keys()).sort();
  sortedCmdKeys.forEach(key => {
    const value = cmdAliasMap.get(key) || '';
    if (key.match(/^(find|sort)-/) && value.includes('msr -rp')) {
      const tmpListFile = quotePaths((isWindowsTerminal ? '%tmp%\\' : '/tmp/') + 'tmp-listed-git-repo-file-paths');
      const listFileCommand = 'git ls-files > ' + tmpListFile;
      let newCommand = value.replace(/msr -rp\s+(".+?"|\S+)/, listFileCommand + ' && msr -w ' + tmpListFile)
        .replace(/\s+(--nd|--np)\s+".+?"\s*/, ' ');
      if (isWindowsTerminal) {
        newCommand = newCommand.replace(new RegExp('^' + key), 'g' + key);
      } else {
        newCommand = newCommand.replace(new RegExp('^alias\\s+' + key), 'alias g' + key)
      }
      cmdAliasMap.set('g' + key, newCommand);
    }
  });

  const skipWritingScriptNames = new Set<string>(['use-fp', 'use-rp', 'out-rp', 'out-fp', 'alias']);
  const singleScriptsSaveFolder = toWSLPath(path.join(saveFolder, 'cmdAlias'));
  const singleScriptsFolderOsPath = toOsPath(singleScriptsSaveFolder, terminalType);
  let failedToCreateSingleScriptFolder = false;
  if (writeToEachFile && !fs.existsSync(singleScriptsSaveFolder)) {
    try {
      fs.mkdirSync(singleScriptsSaveFolder);
    } catch (err) {
      failedToCreateSingleScriptFolder = true;
      outputError('\n' + nowText() + 'Failed to make single script folder: ' + singleScriptsSaveFolder + ' Error: ' + err);
    }
  }

  let allCmdAliasText = ''; // writeToEachFile || isWindowsTerminal || isGeneralCmdAlias ? '' : 'source /etc/profile; source ~/.bashrc' + '\n\n';
  let writeScriptFailureCount = 0;
  const sortedKeys = Array.from(cmdAliasMap.keys()).sort();
  sortedKeys.forEach(key => {
    let scriptContent = cmdAliasMap.get(key) || '';
    if (writeToEachFile) {
      if (!failedToCreateSingleScriptFolder && !skipWritingScriptNames.has(key)
        // find-xxx sort-xxx use-xxx out-xxx
        && (dumpOtherCmdAlias || key.match(/^(g?find|sort)-|malias/))
      ) {
        const singleScriptPath = path.join(singleScriptsSaveFolder, isWindowsTerminal ? key + '.cmd' : key);
        if (isWindowsTerminal) {
          const head = (MyConfig.AddEchoOffWhenCookingWindowsCommandAlias + os.EOL + MyConfig.SetVariablesToLocalScopeWhenCookingWindowsCommandAlias).trim();
          scriptContent = (head.length > 0 ? head + os.EOL : head) + replaceForLoopVariableOnWindows(scriptContent)
        }

        if (!isWindowsTerminal) {
          scriptContent = '#!/bin/bash' + '\n' + scriptContent;
        }

        if (!saveTextToFile(singleScriptPath, scriptContent.trim() + (isWindowsTerminal ? '\r\n' : '\n'), 'single command alias script file')) {
          writeScriptFailureCount++;
        }
      }
    } else {
      allCmdAliasText += scriptContent + (isWindowsTerminal ? '\r\n\r\n' : '\n\n');
    }
  });

  const warnCookNewCmdAliasTip = cmdAliasMap.size <= oldCmdCount + extraAliasCount
    ? ''
    : `Please click re-cook to get ${cmdAliasMap.size - oldCmdCount} new command alias/doskey for terminals out-of-vscode. `;
  // If use echo command, should use '\\~' instead of '~'
  const defaultAliasPathForBash = getDisplayPathForBash(defaultCmdAliasFileDisplayPath, '~'); // '\\~');
  const createCmdAliasTip = `You can create shortcuts in ${defaultAliasPathForBash}${isWindowsTerminal ? '' : ' or other files'} . `;
  const shortcutsExample = 'Now you can use ' + cmdAliasMap.size + ' shortcuts like find-all gfind-all find-def gfind-ref find-doc gfind-small , use-rp use-fp out-fp out-rp'
    + ' , find-top-folder gfind-top-type sort-code-by-time etc. See detail like: alias find-def or malias find-top or malias use-fp or malias sort-.+?= etc.';
  const finalGuide = createCmdAliasTip + warnCookNewCmdAliasTip + shortcutsExample + ' You can change msr.skipInitCmdAliasForNewTerminalTitleRegex in user settings.'
    + ' Toggle-Enable/Disable + Speed-Up-if-Slowdown-by-Windows-Security + Adjust-Color + Fuzzy-Code-Mining + Preview-And-Replace-Files + Hide/Show-Menus'
    + ' Use git-ignore + More functions + details see doc like: ' + CookCmdDocUrl;

  const colorPattern = 'PowerShell|re-cook|\\d+|m*alias|doskey|find-\\S+|sort-\\S+|out-\\S+|use-\\S+|msr.skip\\S+|\\S*msr-cmd-alias\\S*|other'
    + '|Toggle|Enable|Disable|Speed-Up|Adjust-Color|Code-Mining|Preview-|-Replace-|git-ignore|Menus|functions|details';

  if (writeToEachFile) {
    if (!failedToCreateSingleScriptFolder && writeScriptFailureCount < cmdAliasMap.size) {
      outputCmdAliasGuide(newTerminal ? getGeneralCmdAliasFilePath(terminalType) : cmdAliasFile, saveFolder);
      let setPathCmd = 'msr -z "' + (isWindowsTerminal ? '%PATH%;' : '$PATH:') + '" -ix "' + singleScriptsFolderOsPath + '" >'
        + (isWindowsTerminal ? 'nul' : '/dev/null') + ' && ';
      if (isWindowsTerminal) {
        setPathCmd += 'SET "PATH=%PATH%;' + singleScriptsSaveFolder + ';"';
      } else {
        setPathCmd += 'export PATH=$PATH:' + singleScriptsFolderOsPath;
      }

      runCmdInTerminal(setPathCmd, true);
      if (isWindowsTerminal) {
        runCmdInTerminal('where find-def.cmd', false);
        runCmdInTerminal('where find-def', false);
      } else {
        runCmdInTerminal('chmod +x ' + singleScriptsFolderOsPath + (dumpOtherCmdAlias ? '/*' : '/find*'), false);
        // const cmdHead = TerminalType.MinGWBash === terminalType ? 'alias ' : 'which ';
        // runCmdInTerminal(cmdHead + 'find-def', false);
        // runCmdInTerminal(cmdHead + 'find-ref', false);
      }
    }

    if (writeScriptFailureCount > 0) {
      outputInfoQuiet(nowText() + 'Total = ' + cmdAliasMap.size + ', failures = ' + writeScriptFailureCount + ', made ' + (cmdAliasMap.size - writeScriptFailureCount) + ' command alias/doskey script files saved in: ' + singleScriptsSaveFolder);
    } else {
      outputInfoQuiet(nowText() + 'Successfully made ' + cmdAliasMap.size + ' command alias/doskey script files and saved in: ' + singleScriptsSaveFolder);
    }
  } else {
    let existedText = '';
    try {
      if (fs.existsSync(cmdAliasFile)) {
        existedText = fs.readFileSync(cmdAliasFile).toString();
      }
    } catch (err) {
      outputError('\n' + nowText() + 'Failed to read file: ' + cmdAliasFile + ' Error: ' + err);
    }

    const hasChanged = allCmdAliasText !== existedText;
    if (hasChanged) {
      if (!isNullOrEmpty(existedText) && newTerminal && !MyConfig.OverwriteProjectCmdAliasForNewTerminals) {
        outputDebug(nowText() + `Found msr.overwriteProjectCmdAliasForNewTerminals = false, Skip writing temp command shortcuts file: ${cmdAliasFile}`);
      } else {
        if (!saveTextToFile(cmdAliasFile, allCmdAliasText, 'command alias file')) {
          return;
        }
      }
    }

    if (!newTerminal || (isRunCmdTerminal && MyConfig.IsDebug)) {
      outputCmdAliasGuide(newTerminal ? getGeneralCmdAliasFilePath(terminalType) : cmdAliasFile, '');
      const existingInfo = isWindowsTerminal ? ' (merged existing = ' + oldCmdCount + ')' : '';
      outputInfoQuiet(nowText() + (hasChanged ? 'Successfully made ' : 'Already has same ') + cmdAliasMap.size + existingInfo + ' command alias/doskey file at: ' + cmdAliasFile);
      outputInfoQuiet(nowText() + 'To more freely use them (like in scripts or nested command line pipe): Press `F1` search `msr Cook` and choose cooking script files. (You can make menu `msr.cookCmdAliasFiles` visible).');
    }

    if (defaultCmdAliasFile !== cmdAliasFile && !fs.existsSync(defaultCmdAliasFile)) {
      fs.copyFileSync(cmdAliasFile, defaultCmdAliasFile);
    }

    if (newTerminal && isWindowsTerminal) {
      if (TerminalType.CMD !== terminalType && TerminalType.PowerShell !== terminalType) {
        outputError('\n' + nowText() + 'Not supported terminal: ' + newTerminal.name + ', shellExe = ' + shellExe);
        runCmdInTerminal('echo Not supported terminal: ' + newTerminal.name + ', shellExe = ' + shellExe);
        // fs.unlinkSync(cmdAliasFile);
        return;
      }

      // Powershell PSReadLine module is not compatible with doskey
      if (TerminalType.PowerShell === terminalType && !isReCookingForRunCmdTerminal) {
        const setEnvCmd = getSetToolEnvCommand(TerminalType.PowerShell, '; ', [generalScriptFilesFolder]);
        runCmdInTerminal(setEnvCmd, true);
        // workaround for unknown shell case on Windows when reloading/reusing MSR-RUN-CMD terminal.
        if (isRunCmdTerminal) {
          const setEnvCmd = getSetToolEnvCommand(TerminalType.CMD, ' ', [generalScriptFilesFolder]);
          runCmdInTerminal(setEnvCmd, true);
        }
      }
    }
  }

  if (isWindowsTerminal) {
    const setEnvCmd = getSetToolEnvCommand(terminalType, '');
    setEnvAndLoadCmdAlias('doskey /MACROFILE="' + cmdAliasFile + '"', false, setEnvCmd);
    if (isFromMenu) {
      const regCmd = 'REG ADD "HKEY_CURRENT_USER\\Software\\Microsoft\\Command Processor" /v Autorun /d "DOSKEY /MACROFILE=' + slashQuotedDefaultCmdAliasFile + '" /f';
      runCmdInTerminal(regCmd, true);
    }
  } else {
    if (isReCookingForRunCmdTerminal) {
      if (TerminalType.Pwsh !== terminalType) {
        setEnvAndLoadCmdAlias('source ' + quotePaths(toOsPath(cmdAliasFile, terminalType)), true, loadShellSettingsCommand);
      }
    } else {
      if (IsWindows && !isWindowsTerminal) {
        if (isCreatingRunCmdTerminal) {
          let envPathSet = new Set<string>().add(shellExeFolder);
          (process.env['PATH'] || '').split(/\\?\s*;\s*/).forEach(a => envPathSet.add(a));
          envPathSet = getUniqueStringSetNoCase(envPathSet, true);
          process.env['PATH'] = Array.from(envPathSet).join(';');
          runCmdInTerminal(quotePaths(shellExe));
        }
        runCmdInTerminal('export PATH=/usr/bin:$PATH:~');
      }

      prepareEnvForLinuxTerminal(terminalType);
    }

    if (shellExeName !== 'pwsh') {
      runCmdInTerminal(`msr -p ${shellSettingsFile} 2>/dev/null -x 'source ${defaultAliasPathForBash}' -M; (($? == 0 || $? == 255 )) && echo 'source ${defaultAliasPathForBash}' >> ${shellSettingsFile}`);
    }
  }

  if (isPowerShellTerminal(terminalType)) {
    if (MyConfig.ChangePowerShellTerminalToCmdOrBash) {
      runCmdInTerminal('msr -l --wt -f "^(update|open)-\\S*alias" -p ' + quotePaths(generalScriptFilesFolder) + ' -M -H 2 -T2');
    } else {
      runPowerShellShowFindCmdLocation();
    }
  }

  if (TerminalType.PowerShell === terminalType && MyConfig.ChangePowerShellTerminalToCmdOrBash) {
    const setEnvCmd = getSetToolEnvCommand(terminalType, '; ');
    const colorPatternForCmdEscape = colorPattern.replace(/\|/g, '^|');
    const quotedFileForPS = quotedCmdAliasFile === cmdAliasFile ? cmdAliasFile : '`"' + cmdAliasFile + '`"';
    const cmd = setEnvCmd + 'cmd /k ' + '"doskey /MACROFILE=' + quotedFileForPS // + ' && doskey /macros | msr -t find-def -x msr --nx use- --nt out- -e \\s+-+\\w+\\S* -PM'
      + ' & echo. & echo Type exit if you want to back to PowerShell. '
      + finalGuide + ' | msr -aPA -e .+ -x exit -it ' + colorPatternForCmdEscape + '"';
    runCmdInTerminal(cmd, true);
  } else if (TerminalType.Pwsh === terminalType && MyConfig.ChangePowerShellTerminalToCmdOrBash) {
    runPowerShellTip()
    runCmdInTerminal('bash --init-file ' + quotedCmdAliasFile);
  } else {
    if (!isPowerShellTerminal(terminalType)) {
      if (isWindowsTerminal) {
        runCmdInTerminal('malias "update-\\S*alias^|open-\\S*alias" -e "(.:.+)" -M', true);
      } else {
        runCmdInTerminal('malias "update-\\S*alias|open-\\S*alias" -e "(.:.+|[~/].+\\w+)" -M', true);
      }
    }
    const cmd = 'msr -aPA -z "' + finalGuide + '" -e .+ -x ' + cmdAliasMap.size + ' -it "' + colorPattern + '"';
    runCmdInTerminal(cmd, true);
  }

  outputDebug(nowText() + 'Finished to cook command shortcuts. Cost ' + getTimeCostToNow(trackBeginTime) + ' seconds.');

  function runPowerShellShowFindCmdLocation() {
    runCmdInTerminal('msr -l --wt --sz -p ' + quotePaths(generalScriptFilesFolder) + ' -f "^g?find-" -H 2 -T 2');
    // Use extra PowerShell + msr to run command to avoid CMD terminal case.
    const exampleCmd = TerminalType.PowerShell === terminalType
      ? 'PowerShell -Command "Get-Command gfind-def" | msr --nt "^\\s*$" -e "\\w*find-\\w+" -PM'
      : 'pwsh -Command "Get-Command gfind-def" | msr --nt "^\\s*$" -e "\\w*find-\\w+" -PM';
    runCmdInTerminal(exampleCmd);
  }

  function runPowerShellTip() {
    runPowerShellShowFindCmdLocation();
    const cmdToRun = 'msr -aPA -z "' + finalGuide + '" -e .+ -x ' + cmdAliasMap.size + ' -it "' + colorPattern + '"';
    runCmdInTerminal(cmdToRun);
  }

  function prepareEnvForLinuxTerminal(terminalType: TerminalType) {
    if (isLinuxTerminalOnWindows) {
      const shouldUseDownload = IsWindows && /^(Git Bash|Cygwin)/i.test(shellExe);
      if (newTerminal || shouldUseDownload) {
        const downloadCommands = [
          new ToolChecker(terminalType).getCheckDownloadCommandsForLinuxBashOnWindows('msr', shouldUseDownload),
          new ToolChecker(terminalType).getCheckDownloadCommandsForLinuxBashOnWindows('nin', shouldUseDownload)
        ].filter(a => !isNullOrEmpty(a));

        downloadCommands.forEach(c => runCmdInTerminal(c));
      }
    }

    let setEnvCmd: string = getSetToolEnvCommand(terminalType, '; ');
    const shellExeFolderOsPath = toOsPath(shellExeFolder, terminalType);
    const envPath = process.env['PATH'] || '';
    if ((TerminalType.MinGWBash === terminalType || TerminalType.CygwinBash === terminalType)
      && !isNullOrEmpty(envPath) && !isNullOrEmpty(shellExeFolderOsPath) && shellExeFolderOsPath !== '.' && !envPath.includes(shellExeFolderOsPath)) {
      // Avoid MinGW prior to Cygwin when use Cygwin bash.
      if (isNullOrEmpty(setEnvCmd)) {
        setEnvCmd = 'export PATH=' + shellExeFolderOsPath + ':$PATH; ';
      } else {
        setEnvCmd = setEnvCmd.replace('export PATH=', 'export PATH=' + shellExeFolderOsPath + ':');
      }
    }

    if (TerminalType.Pwsh === terminalType) {
      setEnvCmd += (isNullOrEmpty(setEnvCmd) ? '' : '; ')
        + '$env:PATH = $env:HOME + ":" + $env:PATH + ":" + "' + generalScriptFilesFolder + '"';
    } else {
      // Avoid msr.exe prior to msr.cygwin or msr.gcc48
      if (isNullOrEmpty(setEnvCmd)) {
        setEnvCmd = 'export PATH=~:$PATH';
      } else {
        setEnvCmd = setEnvCmd.replace('export PATH=', 'export PATH=~:');
      }
    }

    const envRootFolder = path.dirname(path.dirname(shellExe)).replace(/([^\\])(\\{1})([^\\]|$)/g, '$1$2$2$3');
    const bashFolderValue = envRootFolder === '.' ?
      String.raw`$(where bash.exe | head -n 1 | sed 's#\\[a-z]\+.exe##' | sed 's#usr.bin##' | sed 's/\\$//')`
      : quotePaths(envRootFolder);
    if (TerminalType.CygwinBash === terminalType) {
      setEnvCmd += '; export CYGWIN_ROOT=' + bashFolderValue;
    } else if (TerminalType.MinGWBash === terminalType) {
      setEnvCmd += '; export MINGW_ROOT=' + bashFolderValue;
    }

    const allCmd = TerminalType.Pwsh === terminalType
      ? ''
      : loadShellSettingsCommand + '; source ' + quotePaths(toOsPath(cmdAliasFile, terminalType));
    setEnvAndLoadCmdAlias(allCmd, false, setEnvCmd);
  }

  function getPathCmdAliasBody(useWorkspacePath: boolean, sourceAliasFile: string, onlyForOutput: boolean = false, outputFullPath: boolean = false, useTmpFile: boolean = false): string {
    let sourceFilePath = toOsPath(sourceAliasFile, terminalType);
    if (IsLinuxTerminalOnWindows || IsLinux) {
      const linuxHome = toOsPath(IsLinux ? HomeFolder : getCmdAliasSaveFolder(true, terminalType, true));
      sourceFilePath = sourceFilePath.replace(linuxHome, '~');
    }
    const tmpSaveFile = !useTmpFile ? quotePaths(sourceFilePath) : quotePaths(sourceFilePath + `-${useWorkspacePath ? "full" : "relative"}.tmp`);
    const replaceHead = `msr -p ` + tmpSaveFile;
    const andText = isWindowsTerminal ? " & " : " ; ";
    const copyCmd = (isWindowsTerminal ? `copy /y ` : `cp `) + quotePaths(sourceFilePath) + ` ` + tmpSaveFile;
    const loadCmdAliasCmd = (isWindowsTerminal ? "doskey /MACROFILE=" : "source ") + tmpSaveFile;

    const useExtraPathsToFindDefinition = getConfigValueByRoot(rootFolderName, '', '', 'findDefinition.useExtraPaths') === "true";
    const useExtraPathsToFindReferences = getConfigValueByRoot(rootFolderName, '', '', 'findReference.useExtraPaths') === "true";
    const findDefinitionPathOptions = getSearchPathOptions(false, useProjectSpecific, rootFolder, "all", true, useExtraPathsToFindReferences, useExtraPathsToFindDefinition, false, false);
    const findReferencesPathOptions = getSearchPathOptions(false, useProjectSpecific, rootFolder, "all", false, useExtraPathsToFindReferences, useExtraPathsToFindDefinition, false, false);
    const pathsForDefinition = toOsPathsForText(findDefinitionPathOptions.replace(/\s*-r?p\s+(".+?"|\S+).*/, "$1"), terminalType);
    const pathsForOthers = toOsPathsForText(findReferencesPathOptions.replace(/\s*-r?p\s+(".+?"|\S+).*/, "$1"), terminalType);
    if (pathsForDefinition.includes(" ") || pathsForOthers.includes(" ")) {
      return "echo Skip due to whitespace found in workspace root paths. | msr -aPA -t .+";
    }

    const commonSkip = ` --nt "use-[wr]p|out-[fr]p|find-ndp"`;
    if (isWindowsTerminal) {
      return getWindowsBody();
    }

    return getLinuxBody(true, true, false) + andText + getLinuxBody(false, false, true);

    function getWindowsBody(): string {
      const headCopyCmd = useTmpFile ? copyCmd + andText : "";
      const tailLoadCmd = andText + loadCmdAliasCmd;
      if (onlyForOutput) {
        if (outputFullPath) {
          return headCopyCmd
            + replaceHead
            + ` -x find-` + ` --nt "use-[wr]p|out-[fr]p|find-ndp|\\s+-W\\s+"`
            + ` -t "(=msr -rp.*?\\S+)"`
            + ` -o "\\1 -W"`
            + ` -R -c Output full path.`
            + tailLoadCmd;
        } else {
          return headCopyCmd
            + replaceHead + ` -x find-`
            + ` -t "(=msr -rp.*?)\\s+-W\\s+"`
            + ` -o "\\1 "` + commonSkip
            + ` -R -c Output relative path.`
            + tailLoadCmd;
        }
      }

      if (useWorkspacePath) {
        return headCopyCmd
          + replaceHead + ` -t "find-\\S*def"` + commonSkip
          + ` -x "msr -rp . "`
          + ` -o "msr -rp ${pathsForDefinition} "`
          + ` -R -c Use workspace paths for all find-def + find-xxx-def`
          + andText + replaceHead + ` -t "find-" --nt "use-[wr]p|out-[fr]p|find-ndp|find-\\S*def" `
          + ` -x "msr -rp . "`
          + ` -o "msr -rp ${pathsForOthers} "`
          + ` -R -c Use workspace paths for others like find-ref or find-doc etc.`
          + tailLoadCmd;
      } else {
        // Skip case of workspace root path contains whitespace
        // + andText + replaceHead + ` -x find- -t "msr\\s+-rp\\s+(\\.?\\w+\\S+|([\\"']).+?\\2)" -o "msr -rp ." -R -c Use relative paths for all find-xxx`
        return headCopyCmd
          + replaceHead + commonSkip
          + ` -x "find-"` + ` -t "msr\\s+-rp\\s+\\S+"`
          + ` -o "msr -rp ."`
          + ` -R -c Use relative paths for all find-xxx`
          + tailLoadCmd;
      }
    }

    function getLinuxBody(forFunction: boolean, copySourceFile: boolean, addLoadCmd: boolean) {
      const headCopyCmd = copySourceFile && useTmpFile ? copyCmd + andText : "";
      const tailLoadCmd = addLoadCmd ? andText + loadCmdAliasCmd : "";
      const functionCondition = ` -b "alias find-.*?=.*?function"` + ` -Q "^\\s*\\}"`;
      if (onlyForOutput) {
        if (outputFullPath) {
          const findText = forFunction
            ? functionCondition + ` --nt "use-[wr]p|out-[fr]p|find-ndp|\\s+-W\\s+"` + ` -t "^(\\s*msr -rp.*?\\S+)"`
            : ` --nt "use-[wr]p|out-[fr]p|find-ndp|\\s+-W\\s+"` + ` -t "(alias find-.*?=.*?msr -rp.*?\\S+)"`;
          return headCopyCmd
            + replaceHead + findText + ` -o "\\1 -W"` + ` -R -c Output full path` + (forFunction ? " for functions" : "")
            + tailLoadCmd;
        } else {
          const findText = forFunction
            ? functionCondition + ` --nt "use-[wr]p|out-[fr]p|find-ndp"` + ` -t "^(\\s*msr -rp.*?)\\s+-W\\s+(.*)"`
            : ` --nt "use-[wr]p|out-[fr]p|find-ndp"` + ` -t "(alias find-.*?=.*?msr -rp.*?)\\s+-W\\s+(.*)"`;
          return headCopyCmd
            + replaceHead + findText + ` -o "\\1 \\2"` + ` -R -c Output relative path` + (forFunction ? " for functions" : "")
            + tailLoadCmd;
        }
      }

      if (useWorkspacePath) {
        if (forFunction) {
          // for functions on Linux / Cygwin / MinGW
          return headCopyCmd + replaceHead + functionCondition + ` --nt "use-[wr]p|out-[fr]p|find-ndp"`
            + ` -t "msr -rp . "`
            + ` -o "msr -rp ${pathsForDefinition} "`
            + ` -R -c Use workspace paths for all find-def + find-xxx-def functions`
            + andText + replaceHead + functionCondition + ` --nt "use-[wr]p|out-[fr]p|find-ndp|find-\\S*def"`
            + ` -t "msr -rp . "`
            + ` -o "msr -rp ${pathsForOthers} "`
            + ` -R -c Use workspace paths for other functions like find-ref or find-doc etc.`
            + tailLoadCmd;
        }
        else {
          // for single line alias on Linux / Cygwin / MinGW
          return headCopyCmd + replaceHead + ` --nt "use-[wr]p|out-[fr]p|find-ndp"`
            + ` -t "(alias find-\\S*def=.*?)msr -rp . "`
            + ` -o "\\1msr -rp ${pathsForDefinition} "`
            + ` -R -c Use workspace paths for all find-def + find-xxx-def`
            + andText + replaceHead + ` --nt "use-[wr]p|out-[fr]p|find-ndp|find-\\S*def"`
            + ` -t "(alias find.*?=.*?)msr -rp . " `
            + ` -o "\\1msr -rp ${pathsForOthers} "`
            + ` -R -c Use workspace paths for others like find-ref or find-doc etc.`
            + tailLoadCmd;
        }
      } else {
        // Skip case of workspace root path contains whitespace
        if (forFunction) {
          // for functions on Linux / Cygwin / MinGW
          return headCopyCmd + replaceHead + functionCondition + ` --nt "use-[wr]p|out-[fr]p|find-ndp"`
            + ` -t "^(\\s*)msr\\s+-rp\\s+\\S+" `
            + ` -o "\\1msr -rp ." `
            + ` -R -c Use relative paths for all find-xxx functions`
            + tailLoadCmd;
        }
        else {
          // for single line alias on Linux / Cygwin / MinGW
          return headCopyCmd + replaceHead + ` --nt "use-[wr]p|out-[fr]p|find-ndp"`
            + ` -t "^(\\s*alias find-.*?=.*?)msr\\s+-rp\\s+\\S+"`
            + ` -o "\\1msr -rp ." `
            + ` -R -c Use relative paths for all find-xxx`
            + tailLoadCmd;
        }
      }
    }
  }

  function setEnvAndLoadCmdAlias(doskeyOrSourceCmd: string, mergeCmd: boolean, setEnvCmd: string = '') {
    setEnvCmd = setEnvCmd.replace(/;\s*;/g, ';');
    if (mergeCmd) {
      if (!isNullOrEmpty(setEnvCmd)) {
        setEnvCmd += TerminalType.CMD === terminalType ? ' & ' : ' ; ';
      }
      runCmdInTerminal(setEnvCmd + doskeyOrSourceCmd, true);
    } else {
      if (!isNullOrEmpty(setEnvCmd)) {
        runCmdInTerminal(setEnvCmd, true);
      }

      runCmdInTerminal(doskeyOrSourceCmd, true);
    }
  }

  function runCmdInTerminal(cmd: string, showTerminal: boolean = false) {
    const clearAtFirst = MyConfig.ClearTerminalBeforeExecutingCommands;
    if (newTerminal) {
      sendCommandToTerminal(cmd, newTerminal, showTerminal, clearAtFirst, isLinuxTerminalOnWindows);
    } else {
      runCommandInTerminal(cmd, showTerminal, clearAtFirst, isLinuxTerminalOnWindows);
    }
  }
}

function getCommandAliasMap(
  terminalType: TerminalType,
  rootFolder: string,
  useProjectSpecific: boolean,
  writeToEachFile: boolean,
  dumpOtherCmdAlias: boolean = false)
  : [Map<string, string>, number, string[]] {

  const rootFolderName = path.basename(rootFolder);
  const isWindowsTerminal = isWindowsTerminalType(terminalType);
  const projectKey = useProjectSpecific ? (rootFolderName || '') : 'notUseProject';
  let skipFoldersPattern = getOverrideConfigByPriority([projectKey, 'default'], 'skipFolders');
  if (useProjectSpecific) {
    skipFoldersPattern = mergeSkipFolderPattern(skipFoldersPattern);
  }

  let fileExtensionMapTypes = Array.from(MappedExtToCodeFilePatternMap.keys());
  if (!fileExtensionMapTypes.includes('py')) {
    fileExtensionMapTypes.push('py');
  }

  const findTypes = ['definition', 'reference'];

  let cmdAliasMap = (writeToEachFile && !dumpOtherCmdAlias)
    ? new Map<string, string>()
    : getExistingCmdAlias(terminalType, writeToEachFile);

  const oldCmdCount = cmdAliasMap.size;

  const gitIgnoreInfo = getGitIgnore(rootFolder);
  function getSkipFolderPatternForCmdAlias() {
    if (gitIgnoreInfo.Valid && useProjectSpecific) {
      return gitIgnoreInfo.getSkipPathRegexPattern(true, false);
    } else {
      return ' --nd "' + skipFoldersPattern + '"';
    }
  }

  let commands: string[] = [];
  fileExtensionMapTypes.forEach(ext => {
    if (ext === 'default') {
      return;
    }

    // find-cs find-py find-cpp find-java
    let cmdName = 'find-' + ext.replace(/Files?$/i, '');
    let filePattern = getOverrideConfigByPriority([projectKey + '.' + ext, ext, projectKey], 'codeFiles');
    if (isNullOrEmpty(filePattern)) {
      filePattern = MappedExtToCodeFilePatternMap.get(ext) || '';
    }

    if (isNullOrEmpty(filePattern)) {
      filePattern = '\\.' + escapeRegExp(ext) + '$';
    }

    // msr.definition.extraOptions msr.default.extraOptions
    const extraOption = addFullPathHideWarningOption(getConfigValueByRoot(projectKey, ext, ext, 'extraOptions'), writeToEachFile);

    let body = 'msr -rp .' + getSkipFolderPatternForCmdAlias();
    body += ' -f "' + filePattern + '" ' + extraOption;
    commands.push(getCommandAlias(cmdName, body, false));

    findTypes.forEach(fd => {
      // msr.cpp.member.definition msr.py.class.definition msr.default.class.definition msr.default.definition
      let searchPattern = getConfigValueByRoot(projectKey, ext, ext, fd);

      if (searchPattern.length > 0) {
        searchPattern = ' -t "' + searchPattern + '"';
      }

      // msr.cpp.member.skip.definition  msr.cpp.skip.definition msr.default.skip.definition
      let skipPattern = getConfigValueByRoot(projectKey, ext, ext, 'skip.' + fd);
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
    let searchPattern = getOverrideConfigByPriority([projectKey, 'default'], configKeyForSearch);

    if (searchPattern.length > 0) {
      searchPattern = ' -t "' + searchPattern + '"';
    }

    // msr.cpp.member.skip.definition  msr.cpp.skip.definition msr.default.skip.definition
    const configNamesForSkip = fd === 'all-def' ? ['ui', 'default'] : [projectKey, 'default'];
    let skipPattern = getOverrideConfigByPriority(configNamesForSkip, 'skip.' + configKeyForSkip);
    if (skipPattern.length > 0) {
      skipPattern = ' --nt "' + skipPattern + '"';
    }

    const allFilesPattern = useProjectSpecific ? MyConfig.AllFilesRegex.source : MyConfig.AllFilesDefaultRegex.source;

    // msr.definition.extraOptions msr.default.extraOptions
    const extraOption = addFullPathHideWarningOption(getOverrideConfigByPriority([projectKey, 'default'], 'extraOptions'), writeToEachFile);

    let body = 'msr -rp .' + getSkipFolderPatternForCmdAlias() + ' -f "' + allFilesPattern + '" ' + extraOption;
    body += skipPattern + searchPattern;
    commands.push(getCommandAlias(cmdName, body, true));
  });

  // msr.cpp.member.definition msr.py.class.definition msr.default.class.definition msr.default.definition
  const additionalFileTypes = ['allFiles', 'docFiles', 'configFiles', 'scriptFiles'];
  additionalFileTypes.forEach(fp => {
    const filePattern = 'allFiles' === fp
      ? (useProjectSpecific ? MyConfig.AllFilesRegex.source : MyConfig.AllFilesDefaultRegex.source)
      : getOverrideConfigByPriority([projectKey, 'default'], fp);

    // find-all
    const cmdName = 'find-' + fp.replace(/[A-Z]\w*$/, '');

    // msr.definition.extraOptions msr.default.extraOptions
    let extraOption = addFullPathHideWarningOption(getOverrideConfigByPriority([projectKey, 'default'], 'extraOptions'), writeToEachFile);
    if (/find-config|find-script/.test(cmdName)) {
      extraOption = extraOption.replace(/(^|\s+)--s2\s+\S+\s*/, ' ');
    }

    let body = 'msr -rp .' + getSkipFolderPatternForCmdAlias() + ' -f "' + filePattern + '" ' + extraOption;

    commands.push(getCommandAlias(cmdName, body, true));
  });

  // find-nd find-code find-ndp find-small find-all
  const allCodeFilePattern = useProjectSpecific ? MyConfig.CodeFilesPlusUIRegex.source : MyConfig.CodeFilesPlusUIDefaultRegex.source;
  const extraOption = addFullPathHideWarningOption(getOverrideConfigByPriority([projectKey, 'default'], 'extraOptions'), writeToEachFile);
  commands.push(getCommandAlias('find-nd', 'msr -rp .' + getSkipFolderPatternForCmdAlias() + ' ' + extraOption, false));
  commands.push(getCommandAlias('find-ndp', 'msr -rp %1' + getSkipFolderPatternForCmdAlias() + ' ' + extraOption, true));
  commands.push(getCommandAlias('find-code', 'msr -rp .' + getSkipFolderPatternForCmdAlias() + ' -f "' + allCodeFilePattern + '" ' + extraOption, false));

  const findSmallOptions = getOverrideConfigByPriority([projectKey, '', 'default'], 'allSmallFiles.extraOptions');
  const allSmallFilesOptions = addFullPathHideWarningOption(findSmallOptions, writeToEachFile);
  commands.push(getCommandAlias('find-small', 'msr -rp .' + getSkipFolderPatternForCmdAlias() + ' ' + allSmallFilesOptions, false));

  copyAliasForSpecialShortcuts();
  return [cmdAliasMap, oldCmdCount, commands];

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
    let text = getCommandAliasText(cmdName, body, useFunction, isWindowsTerminal, writeToEachFile);

    // Workaround for find-def + find-xxx-def
    const hotFixFindDefRegex = /^find(-[\w-]+)?-def$/;
    if (cmdName.match(hotFixFindDefRegex)) {
      text = text.replace('[a-z0-9]+(\\.|->|::)?[A-Z]', '[a-z0-9]+(\\.|->|::)[A-Z]');
    }

    cmdAliasMap.set(cmdName, text);
    return text;
  }
}

function getCommandAliasText(
  cmdName: string,
  cmdBody: string,
  useFunction: boolean,
  isWindowsTerminal: boolean,
  writeToEachFile: boolean,
  addTailArgs: boolean = true,
  hideCmdAddColor: boolean = true): string {
  if (hideCmdAddColor) {
    cmdBody = enableColorAndHideCommandLine(cmdBody);
  }

  const hasSearchTextHolder = isWindowsTerminal ? /%~?1/.test(cmdBody) : /\$1|%~?1/.test(cmdBody);
  if (hasSearchTextHolder) {
    cmdBody = replaceSearchTextHolder(cmdBody.trimRight(), '$1');
  }

  const tailArgs = !addTailArgs
    ? ""
    : (hasSearchTextHolder
      // For Windows must be: ' $2 $3 $4 $5 $6 $7 $8 $9', but msr can ignore duplicate $1, so this tricky way works fine, and avoid truncating long args.
      ? (isWindowsTerminal ? ' $*' : ' "${@:2}"')
      : (isWindowsTerminal ? ' $*' : ' "$@"')
    );

  let commandText = '';
  if (isWindowsTerminal) {
    if (writeToEachFile) {
      commandText = '@' + cmdBody + tailArgs;
      commandText = replaceArgForWindowsCmdAlias(commandText);
    } else {
      commandText = cmdName + '=' + cmdBody + tailArgs;
    }
  } else {
    if (useFunction) {
      const functionName = '_' + cmdName.replace(/-/g, '_');
      if (writeToEachFile) {
        commandText = cmdBody + tailArgs;
      } else {
        commandText = 'alias ' + cmdName + "='function " + functionName + '() {'
          + '\n\t' + cmdBody + tailArgs
          + '\n' + '}; ' + functionName + "'";
      }
    } else {
      if (writeToEachFile) {
        commandText = cmdBody + tailArgs;
      } else {
        commandText = 'alias ' + cmdName + "='" + cmdBody + tailArgs + "'";
      }
    }
  }

  return commandText;
}

function outputCmdAliasGuide(cmdAliasFile: string, singleScriptFolder: string = '') {
  if (singleScriptFolder.length > 0) {
    outputInfoQuiet(nowText() + 'Add folder ' + singleScriptFolder + ' to PATH then you can directly call the script name everywhere in/out vscode to search/replace like:');
  } else {
    outputInfoQuiet(nowText() + 'Now you can directly use the command shortcuts in/out-of vscode to search + replace like:');
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
  outputInfoQuiet("malias use-rp :  To see matched alias/doskeys like 'use-rp', 'out-rp', 'use-fp' and 'out-fp' etc.");
  outputInfoQuiet('use-rp  - Search relative path(.) as input path: Output relative paths if no -W.');
  outputInfoQuiet('use-fp  - Search workspace root paths: Output absolute/full paths (regardless of -W).');
  outputInfoQuiet('out-rp  - Output relative path. This will not effect if use-fp which input full paths of current workspace.');
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

  return extraOption.trim();
}

function getExistingCmdAlias(terminalType: TerminalType, forMultipleFiles: boolean): Map<string, string> {
  var map = new Map<string, string>();
  const isWindowsTerminal = isWindowsTerminalType(terminalType);
  const defaultCmdAliasFile = toOsPath(getGeneralCmdAliasFilePath(terminalType), terminalType);
  const cmdHead = isWindowsTerminal ? "doskey /MACROFILE=" : "source ";
  const cmdTail = isWindowsTerminal ? " >nul 2>&1" : " 2>/dev/null 2>&1";
  const separator = isWindowsTerminal ? ' & ' : ' ; ';
  const refreshAliasCmd = cmdHead + quotePaths(defaultCmdAliasFile) + cmdTail;
  const showAliasCmd = isWindowsTerminal ? 'cmd /c "doskey /MACROS"' : 'alias';
  const isNativeTerminal = isWindowsTerminal || IsLinux;
  let readLatestAliasCmd = refreshAliasCmd + separator + showAliasCmd;
  if (!isNativeTerminal) {
    const shellExePath = quotePaths(getTerminalShellExePath());
    readLatestAliasCmd = shellExePath + ' -c "' + readLatestAliasCmd.replace(/"/g, '\\"') + '"';
  }

  const messageHead = 'IsNativeTerminal = ' + isNativeTerminal + ', terminalType = ' + TerminalType[terminalType] + ': ';
  outputDebug(messageHead + 'Will fetch existed command shortcuts: ' + readLatestAliasCmd);

  // const [cmdAliasText, error] = runCommandGetInfo(readLatestAliasCmd, MessageLevel.DEBUG, MessageLevel.DEBUG, MessageLevel.DEBUG);
  try {
    const cmdAliasText = fs.readFileSync(defaultCmdAliasFile).toString();
    return getCmdAliasMapFromText(cmdAliasText, map, forMultipleFiles, isWindowsTerminal);
  } catch (err) {
    outputError(nowText() + 'Failed to cook command alias from file: ' + defaultCmdAliasFile + ', error: ' + err);
    return map;
  }
}

function getCmdAliasMapFromText(cmdAliasText: string, map: Map<string, string>, forMultipleFiles: boolean, isWindowsTerminal: boolean) {
  const lines = IsWindows ? cmdAliasText.split(/[\r\n]+/) : cmdAliasText.split(/(^|[\r\n])alias\s+/);
  const reg = /^(\w+[\w\.-]+)=(.+)/s;
  lines.forEach(a => {
    const match = reg.exec(a);
    if (match) {
      const body = forMultipleFiles
        ? (isWindowsTerminal
          ? replaceArgForWindowsCmdAlias(match[2])
          : replaceArgForLinuxCmdAlias(match[0])
        )
        : (isWindowsTerminal ? '' : 'alias ') + match[0].trim();
      map.set(match[1], body);
    }
  });

  return map;
}

function replaceArgForLinuxCmdAlias(body: string): string {
  // function or simple alias
  const functionBody = body.replace(/^\s*\S+=['"]\s*function\s+[^\r\n]+[\r\n]+\s*(.+?)\}\s*;\s*\S+\s*['"]\s*$/s, '$1');
  if (functionBody !== body) {
    return functionBody.trim();
  }

  const aliasBody = body.replace(/^.*?=['"](.+)['"]\s*$/, '$1')
    .replace(/^\S+=/, '');
  return aliasBody.trim();
}

function replaceArgForWindowsCmdAlias(body: string): string {
  body = replaceTextByRegex(body, /([\"'])\$1/g, '$1%~1');
  body = replaceTextByRegex(body, /\$(\d+)/g, '%$1');
  body = replaceTextByRegex(body, /\$\*/g, '%*');
  return body.trim();
}

export function replaceForLoopVariableOnWindows(cmd: string): string {
  // Example: for /f "tokens=*" %a in ('xxx') do xxx %a
  // Should replace %a to %%a when writing each alias/doskey to a file.
  const GetForLoopRegex = /\bfor\s+\/f\s+("[^"]*?tokens=\s*(?<Token>\*|\d+[, \d]*)[^"]*?"\s+)?%(?<StartVariable>[a-z])\s+in\s+\(.*?\)\s*do\s+/i;
  const match = GetForLoopRegex.exec(cmd);
  if (!match || !match.groups) {
    return cmd;
  }

  let tokens = match.groups['Token'] ? match.groups['Token'].split(/,\s*/) : ['1'];
  if (tokens.length === 1 && tokens[0] === '*') {
    tokens = ['1'];
  }

  const startingVariableName = match.groups['StartVariable'];
  const isLowerCaseVariable = startingVariableName.toLowerCase() === startingVariableName;
  let beginCharCode = isLowerCaseVariable
    ? startingVariableName.toLowerCase().charCodeAt(0)
    : startingVariableName.toUpperCase().charCodeAt(0);

  let variableChars: string[] = [];
  tokens.forEach((numberText) => {
    const number = Number.parseInt(numberText.toString());
    const variableName = String.fromCharCode(beginCharCode + number - 1);
    variableChars.push(variableName);
  });

  for (let k = 0; k < variableChars.length; k++) {
    cmd = cmd.replace(new RegExp('%' + variableChars[k], 'g'), '%%' + variableChars[k]);
  }

  // next for loop
  const subText = cmd.substr(match.index + match[0].length);
  return cmd.substring(0, match.index + match[0].length) + replaceForLoopVariableOnWindows(subText);
}

export function mergeSkipFolderPattern(skipFoldersPattern: string) {
  if (!isNullOrEmpty(skipFoldersPattern) && MyConfig.ExcludeFoldersFromSettings.size > 0) {
    try {
      const existedExcludeRegex = new RegExp(skipFoldersPattern);
      const extraExcludeFolders = Array.from(MyConfig.ExcludeFoldersFromSettings).filter(a => !existedExcludeRegex.test(a));
      if (extraExcludeFolders.length > 0) {
        if (skipFoldersPattern.indexOf('|node_modules|') > 0) {
          skipFoldersPattern = skipFoldersPattern.replace('|node_modules|', '|node_modules|' + extraExcludeFolders.join('|') + '|');
        }
        else if (skipFoldersPattern.indexOf('|Debug|') > 0) {
          skipFoldersPattern = skipFoldersPattern.replace('|Debug|', '|Debug|' + extraExcludeFolders.join('|') + '|');
        }
        else {
          skipFoldersPattern += '|^(' + extraExcludeFolders.join('|') + ')$';
        }
      }
    }
    catch (error) {
      outputDebug(nowText() + 'Failed to add exclude folder from settings:' + error);
    }
  }
  else if (isNullOrEmpty(skipFoldersPattern) && MyConfig.ExcludeFoldersFromSettings.size > 0) {
    skipFoldersPattern = '^(' + Array.from(MyConfig.ExcludeFoldersFromSettings).join('|') + ')$';
  }

  return skipFoldersPattern;
}

