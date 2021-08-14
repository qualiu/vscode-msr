import * as vscode from 'vscode';
import { getSetToolEnvCommand, ToolChecker } from "./checkTool";
import { getFindTopDistributionCommand, getSortCommandText } from "./commands";
import { getConfigValueByRoot, getOverrideConfigByPriority } from "./configUtils";
import { HomeFolder, IsLinux, IsWindows, IsWSL, RunCmdTerminalName } from "./constants";
import { DefaultRootFolder, getConfig, getGitIgnore, getSearchPathOptions, MappedExtToCodeFilePatternMap, MyConfig } from "./dynamicConfig";
import { FindCommandType, TerminalType } from "./enums";
import { getTerminalInitialPath, getTerminalNameOrShellExeName, getTerminalShellExePath, saveTextToFile } from './otherUtils';
import { clearOutputChannel, enableColorAndHideCommandLine, MessageLevel, outputDebug, outputError, outputInfoQuiet, runCommandGetInfo, runCommandInTerminal, sendCmdToTerminal } from "./outputUtils";
import { escapeRegExp } from "./regexUtils";
import { DefaultTerminalType, getRootFolder, getRootFolderName, getTimeCostToNow, getUniqueStringSetNoCase, IsLinuxTerminalOnWindows, isLinuxTerminalOnWindows, isNullOrEmpty, IsWindowsTerminalOnWindows, isWindowsTerminalType, nowText, quotePaths, replaceSearchTextHolder, replaceTextByRegex, toOsPath, toOsPathsForText, toWSLPath } from "./utils";
import fs = require('fs');
import os = require('os');
import path = require('path');

const CookCmdDocUrl = 'https://github.com/qualiu/vscode-msr/blob/master/README.md#command-shortcuts';
export let CookCmdTimesForRunCmdTerminal: number = 0;

function getLinuxHomeFolderOnWindows(terminalType: TerminalType): string {
  const shellExeFolder = path.dirname(getTerminalShellExePath());
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

export function cookCmdShortcutsOrFile(
  currentFilePath: string,
  useProjectSpecific: boolean,
  writeToEachFile: boolean,
  newTerminal: vscode.Terminal | undefined = undefined,
  dumpOtherCmdAlias: boolean = false) {
  const trackBeginTime = new Date();
  if (!newTerminal) {
    clearOutputChannel();
  }

  outputDebug(nowText() + 'Begin cooking command shortcuts for terminal ' + (newTerminal ? newTerminal.name : ''));
  const isCreatingRunCmdTerminal = newTerminal && newTerminal.name === RunCmdTerminalName;
  const isGeneralCmdAlias = !newTerminal && !useProjectSpecific;

  const initialPath = getTerminalInitialPath(newTerminal) || '';
  const shellExe = initialPath.match(/\.exe$/i) ? initialPath : getTerminalShellExePath();
  const shellExeFolder = path.dirname(shellExe);
  const terminalOrShellName = getTerminalNameOrShellExeName(newTerminal);

  const terminalName = initialPath.match(/(bash|exe|wsl|sh)$/i)
    ? path.basename(initialPath)
    : terminalOrShellName || path.basename(initialPath);

  const isRunCmdTerminal = terminalOrShellName === RunCmdTerminalName;
  if (isRunCmdTerminal) {
    CookCmdTimesForRunCmdTerminal += 1;
  }

  const isReCookingForRunCmdTerminal: boolean = CookCmdTimesForRunCmdTerminal > 1 && isRunCmdTerminal;

  let terminalType: TerminalType = DefaultTerminalType;
  if (newTerminal && terminalName !== RunCmdTerminalName) {
    if (IsWindows) {
      if (isNullOrEmpty(shellExe)) {
        if (/PowerShell/i.test(terminalName)) {
          terminalType = TerminalType.PowerShell;
        } else if (/bash/i.test(terminalName)) {
          terminalType = TerminalType.WslBash;
        } else if (/CMD|Command/i.test(terminalName)) {
          terminalType = TerminalType.CMD;
        } else {
          terminalType = TerminalType.PowerShell;
        }
      } else {
        if (/cmd.exe$|^Command Prompt/i.test(terminalName || shellExe)) {
          terminalType = TerminalType.CMD;
        } else if (/PowerShell.exe$|^PowerShell/i.test(terminalName || shellExe)) {
          terminalType = TerminalType.PowerShell;
        } else if (/Cygwin.*?bin\\bash.exe$|^Cygwin/i.test(shellExe)) {
          terminalType = TerminalType.CygwinBash;
        } else if (/System(32)?.bash.exe$|wsl.exe$|^WSL/i.test(shellExe)) {
          terminalType = TerminalType.WslBash;
        } else if (/Git\S+bash.exe$|^Git Bash/i.test(shellExe)) { // (shellExe.includes('Git\\bin\\bash.exe'))
          terminalType = TerminalType.MinGWBash;
        } else {
          terminalType = TerminalType.PowerShell;
        }
      }
    } else {
      terminalType = TerminalType.LinuxBash;
    }
  }

  const isWindowsTerminal = isWindowsTerminalType(terminalType);
  const isLinuxTerminalOnWindows = IsWindows && !isWindowsTerminal;
  const saveFolder = getCmdAliasSaveFolder(isGeneralCmdAlias, terminalType);
  const rootFolder = isRunCmdTerminal ? DefaultRootFolder : getRootFolder(currentFilePath, useProjectSpecific);
  const rootFolderName = getRootFolderName(rootFolder);
  if (isNullOrEmpty(rootFolderName) && !newTerminal) {
    useProjectSpecific = false;
  }

  const [cmdAliasMap, oldCmdCount, commands] = getCommandAliasMap(terminalType, rootFolder, useProjectSpecific, writeToEachFile, dumpOtherCmdAlias);
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

  if (useProjectSpecific && !isNullOrEmpty(rootFolderName)) {
    const tmpName = rootFolderName.replace(/[^\w\.-]/g, '-').toLowerCase();
    addOpenUpdateCmdAlias(quotedCmdAliasFileForDisplay, 'update-' + tmpName + '-alias', 'open-' + tmpName + '-alias');
    if (isWindowsTerminal) { // support old shortcut name
      addOpenUpdateCmdAlias(quotedCmdAliasFileForDisplay, 'update-' + tmpName + '-doskeys', 'open-' + tmpName + '-doskeys');
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

  let skipWritingScriptNames = new Set<string>(['use-fp', 'use-rp', 'out-rp', 'out-fp', 'alias']);
  if (!isWindowsTerminal) {
    skipWritingScriptNames.add('malias');
  }

  let allText = '';
  let failureCount = 0;
  const singleScriptFolder = toWSLPath(path.join(saveFolder, 'cmdAlias'));
  const singleScriptFolderOsPath = toOsPath(singleScriptFolder, terminalType);
  let failedToCreateSingleScriptFolder = false;
  if (writeToEachFile && !fs.existsSync(singleScriptFolder)) {
    try {
      fs.mkdirSync(singleScriptFolder);
    } catch (err) {
      failedToCreateSingleScriptFolder = true;
      outputError('\n' + nowText() + 'Failed to make single script folder: ' + singleScriptFolder + ' Error: ' + err.toString());
    }
  }

  const sortedKeys = Array.from(cmdAliasMap.keys()).sort();
  sortedKeys.forEach(key => {
    let scriptContent = cmdAliasMap.get(key) || '';
    if (writeToEachFile) {
      if (!failedToCreateSingleScriptFolder && !skipWritingScriptNames.has(key) && (dumpOtherCmdAlias || key.startsWith('find'))) {
        const singleScriptPath = path.join(singleScriptFolder, isWindowsTerminal ? key + '.cmd' : key);
        if (IsWindowsTerminalOnWindows) {
          const head = (MyConfig.AddEchoOffWhenCookingWindowsCommandAlias + os.EOL + MyConfig.SetVariablesToLocalScopeWhenCookingWindowsCommandAlias).trim();
          scriptContent = (head.length > 0 ? head + os.EOL : head) + replaceForLoopVariableOnWindows(scriptContent)
        }

        if (!saveTextToFile(singleScriptPath, scriptContent.trim() + (isWindowsTerminal ? '\r\n' : '\n'), 'single command alias script file')) {
          failureCount++;
        }
      }
    } else {
      allText += scriptContent + (isWindowsTerminal ? '\r\n\r\n' : '\n\n');
    }
  });

  if (writeToEachFile) {
    if (!failedToCreateSingleScriptFolder && failureCount < cmdAliasMap.size) {
      outputCmdAliasGuide(newTerminal ? getGeneralCmdAliasFilePath(terminalType) : cmdAliasFile, saveFolder);
      let setPathCmd = 'msr -z "' + (isWindowsTerminal ? '%PATH%' : '$PATH') + '" -ix "' + singleScriptFolderOsPath + '" >'
        + (isWindowsTerminal ? 'nul' : '/dev/null') + ' && ';
      if (isWindowsTerminal) {
        setPathCmd += 'SET "PATH=%PATH%;' + singleScriptFolder + '"';
      } else {
        setPathCmd += 'export PATH=$PATH:' + singleScriptFolderOsPath;
      }

      runCmdInTerminal(setPathCmd, true);
      if (isWindowsTerminal) {
        runCmdInTerminal('where find-def.cmd', false);
        runCmdInTerminal('where find-def', false);
      } else {
        runCmdInTerminal('chmod +x ' + singleScriptFolderOsPath + (dumpOtherCmdAlias ? '/*' : '/find*'), false);
        // const cmdHead = TerminalType.MinGWBash === terminalType ? 'alias ' : 'which ';
        // runCmdInTerminal(cmdHead + 'find-def', false);
        // runCmdInTerminal(cmdHead + 'find-ref', false);
      }
    }

    if (failureCount > 0) {
      outputInfoQuiet(nowText() + 'Total = ' + cmdAliasMap.size + ', failures = ' + failureCount + ', made ' + (cmdAliasMap.size - failureCount) + ' command alias/doskey script files saved in: ' + singleScriptFolder);
    } else {
      outputInfoQuiet(nowText() + 'Successfully made ' + cmdAliasMap.size + ' command alias/doskey script files and saved in: ' + singleScriptFolder);
    }
  } else {
    let existedText = '';
    try {
      if (fs.existsSync(cmdAliasFile)) {
        existedText = fs.readFileSync(cmdAliasFile).toString();
      }
    } catch (err) {
      outputError('\n' + nowText() + 'Failed to read file: ' + cmdAliasFile + ' Error: ' + err.toString());
    }

    const hasChanged = allText !== existedText;
    if (hasChanged) {
      if (!isNullOrEmpty(existedText) && newTerminal && !MyConfig.OverwriteProjectCmdAliasForNewTerminals) {
        outputDebug(nowText() + `Found msr.overwriteProjectCmdAliasForNewTerminals = false, Skip writing temp command shortcuts file: ${cmdAliasFile}`);
      } else {
        if (!saveTextToFile(cmdAliasFile, allText, 'command alias file')) {
          return;
        }
      }
    }

    if (!newTerminal || (isRunCmdTerminal && MyConfig.IsDebug)) {
      outputCmdAliasGuide(newTerminal ? getGeneralCmdAliasFilePath(terminalType) : cmdAliasFile, '');
      const existingInfo = isWindowsTerminal ? ' (merged existing = ' + oldCmdCount + ')' : '';
      outputInfoQuiet(nowText() + (hasChanged ? 'Successfully made ' : 'Already has same ') + commands.length + existingInfo + ' command alias/doskey file at: ' + cmdAliasFile);
      outputInfoQuiet(nowText() + 'To more freely use them (like in scripts or nested command line pipe): Press `F1` search `msr Cook` and choose cooking script files. (You can make menu `msr.cookCmdAliasFiles` visible).');
    }

    const shortcutsExample = ' shortcuts like find-all-def find-pure-ref find-doc find-small , use-rp use-fp out-fp out-rp , find-top-folder find-top-type sort-code-by-time etc. See detail like: alias find-def or malias find-top or malias use-fp or malias sort-.+?= etc.';
    if (defaultCmdAliasFile !== cmdAliasFile && !fs.existsSync(defaultCmdAliasFile)) {
      fs.copyFileSync(cmdAliasFile, defaultCmdAliasFile);
    }

    const createCmdAliasTip = ` You can also create shortcuts in ${isWindowsTerminal ? '' : 'other files like '}`;
    let finalGuide = ' You can change msr.skipInitCmdAliasForNewTerminalTitleRegex in user settings. '
      + 'Toggle-Enable + Speed-Up-if-Slowdown-by-Windows-Security + Adjust-Color + Fuzzy-Code-Mining + Preview-And-Replace-Files + Hide/Show-Menus + Use git-ignore + More functions + details see doc like: ' + CookCmdDocUrl;
    let canRunShowDef = true;
    if (newTerminal && isWindowsTerminal) {
      if (TerminalType.CMD !== terminalType && TerminalType.PowerShell !== terminalType) {
        outputError('\n' + nowText() + 'Not supported terminal: ' + newTerminal.name + ', shellExe = ' + shellExe);
        runCmdInTerminal('echo Not supported terminal: ' + newTerminal.name + ', shellExe = ' + shellExe);
        // fs.unlinkSync(cmdAliasFile);
        return;
      }

      // Powershell PSReadLine module is not compatible with doskey
      if (TerminalType.PowerShell === terminalType && !isReCookingForRunCmdTerminal) {
        canRunShowDef = false;
        finalGuide = createCmdAliasTip + defaultCmdAliasFile + ' .' + finalGuide;
        const quotedFileForPS = quotedCmdAliasFile === cmdAliasFile ? cmdAliasFile : '`"' + cmdAliasFile + '`"';
        const setEnvCmd = getSetToolEnvCommand(TerminalType.PowerShell, '; ');
        const cmd = setEnvCmd + 'cmd /k ' + '"doskey /MACROFILE=' + quotedFileForPS // + ' && doskey /macros | msr -t find-def -x msr --nx use- --nt out- -e \\s+-+\\w+\\S* -PM'
          + ' & echo. & echo Type exit if you want to back to PowerShell without ' + commands.length + shortcutsExample
          + finalGuide
          + ' | msr -aPA -e .+ -ix exit -t ' + commands.length
          + '^|PowerShell^|m*alias^|find-\\S+^|sort-\\S+^|out-\\S+^|use-\\S+^|msr.skip\\S+^|\\S*msr-cmd-alias\\S*^|Toggle-Enable^|Speed-Up^|Adjust-Color^|Code-Mining^|Preview-^|-Replace-^|git-ignore^|Menus^|functions^|details'
          + '"';
        // if (!onlyReCookAliasFile) {
        runCmdInTerminal(cmd, true);
        // }
      }
    }

    if (isWindowsTerminal) {
      if (TerminalType.PowerShell !== terminalType) {
        finalGuide = createCmdAliasTip + defaultCmdAliasFile + ' .' + finalGuide;
        const setEnvCmd = getSetToolEnvCommand(terminalType, '');
        checkSetPathBeforeRunDoskeyAlias('doskey /MACROFILE="' + cmdAliasFile + '"', true, setEnvCmd);
        if (isGeneralCmdAlias) {
          const regCmd = 'REG ADD "HKEY_CURRENT_USER\\Software\\Microsoft\\Command Processor" /v Autorun /d "DOSKEY /MACROFILE=' + slashQuotedDefaultCmdAliasFile + '" /f';
          runCmdInTerminal(regCmd, true);
        }
      }
    } else {
      if (isReCookingForRunCmdTerminal) {
        checkSetPathBeforeRunDoskeyAlias('source ' + quotePaths(toOsPath(cmdAliasFile, terminalType)), false);
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
        prepareEnvForBashOnWindows(terminalType);
      }

      if (isGeneralCmdAlias) {
        const displayPath = getDisplayPathForBash(defaultCmdAliasFileDisplayPath, '~');
        runCmdInTerminal('ls ~/.bashrc > /dev/null 2>&1 || echo \'source ' + displayPath + '\' >> ~/.bashrc');
        runCmdInTerminal('msr -p ~/.bashrc 2>/dev/null -x \'source ' + displayPath + '\' -M && echo \'source ' + displayPath + '\' >> ~/.bashrc');
      }
    }

    if (isWindowsTerminal) {
      if (TerminalType.PowerShell !== terminalType) {
        runCmdInTerminal('malias "update-\\S*alias^|open-\\S*alias" -e "(.:.+)" -M', true);
      }
    } else {
      runCmdInTerminal('malias "update-\\S*alias|open-\\S*alias" -e "(.:.+|[~/].+\\w+)" -M', true);
    }

    if (canRunShowDef || !newTerminal) {
      const cmd = 'echo Now you can use ' + commands.length + shortcutsExample + finalGuide + ' | msr -aPA -e .+ -x ' + commands.length
        + ' -it "find-\\S+|sort-\\S+|out-\\S+|use-\\S+|msr.skip\\S+|other|Toggle-Enable|Speed-Up|Adjust-Color|Preview-|-Replace-|Code-Mining|git-ignore|Menus|functions|details|\\S*msr-cmd-alias\\S*|(m*alias \\w+\\S*)"';
      runCmdInTerminal(cmd, true);
    }

    function prepareEnvForBashOnWindows(terminalType: TerminalType) {
      const displayPath = getDisplayPathForBash(defaultCmdAliasFileDisplayPath, '\\~');
      finalGuide = createCmdAliasTip + displayPath + ' .' + finalGuide;
      const shouldUseDownload = IsWindows && /^(Git Bash|Cygwin)/i.test(shellExe);
      if (newTerminal || shouldUseDownload) {
        const downloadCommands = [
          new ToolChecker(terminalType).getDownloadCommandForNewTerminal('msr', shouldUseDownload),
          new ToolChecker(terminalType).getDownloadCommandForNewTerminal('nin', shouldUseDownload)
        ].filter(a => !isNullOrEmpty(a));

        downloadCommands.forEach(c => runCmdInTerminal(c));
      }

      let setEnvCmd: string = getSetToolEnvCommand(terminalType, '; ');
      const shellExeFolderOsPath = toOsPath(shellExeFolder, terminalType);
      const envPath = process.env['PATH'] || '';
      if (!isNullOrEmpty(envPath) && !isNullOrEmpty(shellExeFolderOsPath) && shellExeFolderOsPath !== '.' && !envPath.includes(shellExeFolderOsPath)) {
        // Avoid MinGW prior to Cygwin when use Cygwin bash.
        if (isNullOrEmpty(setEnvCmd)) {
          setEnvCmd = 'export PATH=' + shellExeFolderOsPath + ':$PATH; ';
        } else {
          setEnvCmd = setEnvCmd.replace('export PATH=', 'export PATH=' + shellExeFolderOsPath + ':');
        }
      }

      // Avoid msr.exe prior to msr.cygwin or msr.gcc48
      if (isNullOrEmpty(setEnvCmd)) {
        setEnvCmd = 'export PATH=~:$PATH';
      } else {
        setEnvCmd = setEnvCmd.replace('export PATH=', 'export PATH=~:');
      }

      const envRootFolder = path.dirname(path.dirname(shellExe)).replace(/([^\\])(\\{1})([^\\]|$)/g, '$1$2$2$3');
      const bashFolderValue = envRootFolder === '.' ?
        String.raw`$(where bash.exe | head -n 1 | sed 's#\\[a-z]\+.exe##' | sed 's#usr.bin##' | sed 's/\\$//')`
        : quotePaths(envRootFolder);
      if (TerminalType.CygwinBash === terminalType) {
        setEnvCmd += ';export CYGWIN_ROOT=' + bashFolderValue;
      } else if (TerminalType.MinGWBash === terminalType) {
        setEnvCmd += ';export MINGW_ROOT=' + bashFolderValue;
      }

      checkSetPathBeforeRunDoskeyAlias('source ' + quotePaths(toOsPath(cmdAliasFile, terminalType)), false, setEnvCmd);
    }

    outputDebug(nowText() + 'Finished to cook command shortcuts. Cost ' + getTimeCostToNow(trackBeginTime) + ' seconds.');
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

  function checkSetPathBeforeRunDoskeyAlias(doskeyOrSourceCmd: string, mergeCmd: boolean, setEnvCmd: string = '') {
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
      sendCmdToTerminal(cmd, newTerminal, showTerminal, clearAtFirst, isLinuxTerminalOnWindows);
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

  let fileTypes = Array.from(MappedExtToCodeFilePatternMap.keys());
  if (!fileTypes.includes('py')) {
    fileTypes.push('py');
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
  fileTypes.forEach(ext => {
    if (ext === 'default') {
      return;
    }

    let cmdName = 'find-' + ext.replace(/Files?$/i, '');
    let filePattern = getOverrideConfigByPriority([projectKey + '.' + ext, ext, projectKey], 'codeFiles');
    if (isNullOrEmpty(filePattern)) {
      filePattern = MappedExtToCodeFilePatternMap.get(ext) || '';
    }

    if (isNullOrEmpty(filePattern)) {
      filePattern = '\\.' + escapeRegExp(ext) + '$';
    }

    // msr.definition.extraOptions msr.default.extraOptions
    const extraOption = addFullPathHideWarningOption(getConfigValueByRoot(projectKey, ext, ext, 'extraOptions'));

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
      commands.push(getCommandAlias(cmdName + '-' + fd.replace(/^(.{3}).*/, '$1'), newBody, true));
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

    const filePattern = getOverrideConfigByPriority([projectKey, 'default'], 'allFiles'); // codeFilesPlusUI

    // msr.definition.extraOptions msr.default.extraOptions
    const extraOption = addFullPathHideWarningOption(getOverrideConfigByPriority([projectKey, 'default'], 'extraOptions'));

    let body = 'msr -rp .' + getSkipFolderPatternForCmdAlias() + ' -f "' + filePattern + '" ' + extraOption;
    body += skipPattern + searchPattern;
    commands.push(getCommandAlias(cmdName, body, true));
  });

  // msr.cpp.member.definition msr.py.class.definition msr.default.class.definition msr.default.definition
  const additionalFileTypes = ['allFiles', 'docFiles', 'configFiles', 'scriptFiles'];
  additionalFileTypes.forEach(fp => {
    const filePattern = getOverrideConfigByPriority([projectKey, 'default'], fp);

    // find-all
    const cmdName = 'find-' + fp.replace(/[A-Z]\w*$/, '');

    // msr.definition.extraOptions msr.default.extraOptions
    let extraOption = addFullPathHideWarningOption(getOverrideConfigByPriority([projectKey, 'default'], 'extraOptions'));
    if (/find-config|find-script/.test(cmdName)) {
      extraOption = extraOption.replace(/(^|\s+)--s2\s+\S+\s*/, ' ');
    }

    let body = 'msr -rp .' + getSkipFolderPatternForCmdAlias() + ' -f "' + filePattern + '" ' + extraOption;

    commands.push(getCommandAlias(cmdName, body, true));
  });

  // find-nd find-code find-ndp find-small find-all
  const allCodeFilePattern = getOverrideConfigByPriority([projectKey, 'default', ''], 'codeFilesPlusUI');
  const extraOption = addFullPathHideWarningOption(getOverrideConfigByPriority([projectKey, 'default'], 'extraOptions'));
  commands.push(getCommandAlias('find-nd', 'msr -rp .' + getSkipFolderPatternForCmdAlias(), false));
  commands.push(getCommandAlias('find-ndp', 'msr -rp %1' + getSkipFolderPatternForCmdAlias(), true));
  commands.push(getCommandAlias('find-code', 'msr -rp .' + getSkipFolderPatternForCmdAlias() + ' -f "' + allCodeFilePattern + '" ' + extraOption, false));

  const allSmallFilesOptions = getOverrideConfigByPriority([projectKey, 'default', ''], 'allSmallFiles.extraOptions');
  commands.push(getCommandAlias('find-small', 'msr -rp .' + getSkipFolderPatternForCmdAlias() + ' ' + allSmallFilesOptions, false));

  return [cmdAliasMap, oldCmdCount, commands];

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

function addFullPathHideWarningOption(extraOption: string): string {
  const hasFoundOutputFullPath = /(^|\s+)-[PACIGMOZc]*?W/.test(extraOption);
  const shouldOutputFullPath = MyConfig.OutputFullPathWhenCookingCommandAlias && (!isLinuxTerminalOnWindows() || !MyConfig.OutputRelativePathForLinuxTerminalsOnWindows);
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
  if (isWindowsTerminal) {
    outputDebug(messageHead + 'Will fetch existed command shortcuts: ' + readLatestAliasCmd);
  } else {
    outputDebug(messageHead + 'Skip getting existed command shortcuts: ' + readLatestAliasCmd);
    return map;
  }

  const [output, error] = runCommandGetInfo(readLatestAliasCmd, MessageLevel.DEBUG, MessageLevel.DEBUG, MessageLevel.DEBUG);
  if (!output || error) {
    return map;
  }

  return getCmdAliasMapFromText(output, map, forMultipleFiles, isWindowsTerminal);
}

function getCmdAliasMapFromText(output: string, map: Map<string, string>, forMultipleFiles: boolean, isWindowsTerminal: boolean) {
  const lines = output.split(/[\r\n]+/);
  const reg = /^(\w+[\w\.-]+)=(.+)/;
  lines.forEach(a => {
    const match = reg.exec(a);
    if (match) {
      const body = forMultipleFiles ? (isWindowsTerminal ? replaceArgForWindowsCmdAlias(match[2]) : match[2]) : match[0];
      map.set(match[1], body);
    }
  });

  return map;
}

function replaceArgForWindowsCmdAlias(body: string): string {
  body = replaceTextByRegex(body, /([\"'])\$1/g, '$1%~1');
  body = replaceTextByRegex(body, /\$(\d+)/g, '%$1');
  body = replaceTextByRegex(body, /\$\*/g, '%*');
  return body;
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
      outputDebug(nowText() + 'Failed to add exclude folder from settings:' + error.toString());
    }
  }
  else if (isNullOrEmpty(skipFoldersPattern) && MyConfig.ExcludeFoldersFromSettings.size > 0) {
    skipFoldersPattern = '^(' + Array.from(MyConfig.ExcludeFoldersFromSettings).join('|') + ')$';
  }

  return skipFoldersPattern;
}

