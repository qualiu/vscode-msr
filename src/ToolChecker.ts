import { getConfigValueOfActiveProject } from "./configUtils";
import { GetCommandOutput, HomeFolder, Is64BitOS, IsDarwinArm64, IsDebugMode, IsLinuxArm64, IsWindows, OutputChannelName } from "./constants";
import { cookCmdShortcutsOrFile } from "./cookCommandAlias";
import { FileExtensionToMappedExtensionMap, getConfig } from "./dynamicConfig";
import { TerminalType } from "./enums";
import { checkIfSupported, clearOutputChannel, DefaultMessageLevel, MessageLevel, outputDebugByTime, outputErrorByTime, outputInfoByDebugMode, outputInfoByDebugModeByTime, outputInfoByTime, outputKeyInfo, outputKeyInfoByTime, outputWarnByTime, updateOutputChannel } from "./outputUtils";
import { getRunCmdTerminal, runRawCommandInTerminal } from "./runCommandUtils";
import { checkAddFolderToPath, DefaultTerminalType, getHomeFolderForLinuxTerminalOnWindows, getTerminalShellExePath, isBashTerminalType, isLinuxTerminalOnWindows, IsLinuxTerminalOnWindows, isToolExistsInPath, isWindowsTerminalOnWindows, toCygwinPath, toTerminalPath } from "./terminalUtils";
import { getDownloadUrl, getFileMd5, getHomeUrl, SourceHomeUrlArray, updateToolNameToPathMap } from "./toolSource";
import { getActiveFilePath, getDefaultRootFolder, getElapsedSecondsToNow, isDirectory, isFileExists, isNullOrEmpty, PathEnvName, quotePaths, runCommandGetOutput } from "./utils";
import path = require('path');
import fs = require('fs');
import https = require('https');
import ChildProcess = require('child_process');

const TipUrl = "https://marketplace.visualstudio.com/items?itemName=qualiu.vscode-msr";

const DefaultNonWindowsSuffix = IsWindows ? '' : ('-' + GetCommandOutput('uname -m') + '.' + GetCommandOutput('uname -s')).toLowerCase();
const DefaultNameSuffix = IsWindows ? (Is64BitOS ? '.exe' : '-Win32.exe')
  : (IsLinuxArm64 || IsDarwinArm64
    ? DefaultNonWindowsSuffix
    : (Is64BitOS ? '.gcc48' : '-i386.gcc48') // legacy naming
  );
const TerminalTypeToSourceExtensionMap = new Map<TerminalType, string>()
  .set(TerminalType.CMD, '.exe')
  .set(TerminalType.PowerShell, DefaultNameSuffix)
  .set(TerminalType.MinGWBash, '.exe')
  .set(TerminalType.CygwinBash, '.cygwin')
  .set(TerminalType.LinuxBash, DefaultNameSuffix)
  .set(TerminalType.WslBash, '.gcc48')
  ;

function getToolNameTail(terminalType: TerminalType): string {
  if (IsLinuxArm64 || IsDarwinArm64) {
    //return '-' + process.arch.toLowerCase() + '.' + process.platform.toLowerCase();
    return DefaultNameSuffix;
  }

  return TerminalTypeToSourceExtensionMap.get(terminalType) || '.exe';
}

// input msr / nin 
function getToolName(pureExeName: string, terminalType: TerminalType): string {
  return pureExeName + getToolNameTail(terminalType);
}

let GoodSourceUrlIndex = 0; // use it if succeeded
let MsrHelpText = '';
let NinHelpText = '';
const GetSearchDepthRegex: RegExp = /\s+(-k|--max-depth)\s+\d+/;
const GetTimeoutRegex: RegExp = /\s+--timeout\s+(-?\d+)/;
const CheckForwardingSlashSupportOnWindowsText = "Support '/' on Windows";

export let IsTimeoutSupported: boolean = false;
export let IsForwardingSlashSupportedOnWindows = false;
export let IsOutputColumnSupported = false;
export let IsFileTimeOffsetSupported = false;

export function setTimeoutInCommandLine(command: string, timeoutSeconds: number) {
  if (timeoutSeconds > 0 && IsTimeoutSupported) {
    return setArgValueInCommandLine(command, GetTimeoutRegex, '--timeout', timeoutSeconds.toString());
  }
  return command;
}

export function setOutputColumnIndexInCommandLine(command: string) {
  if (IsOutputColumnSupported && !command.includes(' --out-index')) {
    command = command.trimRight() + " --out-index"
  }
  return command;
}

export function setSearchDepthInCommandLine(command: string, maxDepth: number) {
  return setArgValueInCommandLine(command, GetSearchDepthRegex, '-k', maxDepth.toString());
}

export function setArgValueInCommandLine(commandLine: string, getArgRegex: RegExp, argName: string, argValue: string): string {
  const match = getArgRegex.exec(commandLine);
  if (match) {
    commandLine = commandLine.replace(getArgRegex, ' ' + argName + ' ' + argValue);
  } else {
    commandLine = commandLine.trimRight() + ' ' + argName + ' ' + argValue;
  }
  return commandLine;
}

export function isArgSupported(argName: string, toolName = 'msr'): boolean {
  const isLongArgName = argName.startsWith('--') || (!argName.startsWith('-') && argName.length > 1);
  const regex = new RegExp((isLongArgName ? '^\\s*--' : '^\\s*-') + argName.replace(/^-+/, '') + "\\s", 'm');
  return regex.test(toolName === 'msr' ? MsrHelpText : NinHelpText);
}

export class ToolChecker {
  public IsToolExists = false;
  public MsrExePath: string = '';
  private terminalType: TerminalType;
  private autoDownload: boolean;
  private MatchExeMd5Regex: RegExp = /to-load/;
  private isTerminalOfWindows: boolean;
  private hasDownloaded: boolean = false;

  constructor(terminalType: TerminalType = DefaultTerminalType, autoDownload = true) {
    this.terminalType = terminalType;
    this.autoDownload = autoDownload;
    this.isTerminalOfWindows = isWindowsTerminalOnWindows(this.terminalType);
    this.MatchExeMd5Regex = new RegExp('^(\\S+)\\s+(\\w+)'
      + getToolNameTail(this.terminalType) + '\\s*$', 'm');
  }

  public checkAndDownloadTool(pureExeName: string): [boolean, string] {
    const [isExisted, exePath] = isToolExistsInPath(pureExeName, this.terminalType);
    const exeName = this.getSourceExeName(pureExeName);
    outputDebugByTime((isExisted ? 'Found ' + exeName + ' = ' + exePath : 'Not found ' + exeName + ', will download it.'));
    if (isExisted) {
      this.setEnvironmentForTool();
      this.updateHelpText(pureExeName, exePath);
      return [isExisted, exePath];
    }

    return this.autoDownloadTool(pureExeName);
  }

  private updateHelpText(pureExeName: string, exePath: string) {
    if (pureExeName === 'msr') {
      MsrHelpText = runCommandGetOutput(exePath + ' -h -C');
      IsForwardingSlashSupportedOnWindows = MsrHelpText.includes(CheckForwardingSlashSupportOnWindowsText);
      IsTimeoutSupported = isArgSupported('--timeout', 'msr');
      IsOutputColumnSupported = MsrHelpText.includes('--out-index');
      IsFileTimeOffsetSupported = MsrHelpText.includes('time or ago');
    } else {
      NinHelpText = runCommandGetOutput(exePath + ' -h -C');
    }
  }

  public getCheckDownloadCommandsForLinuxBashOnWindows(pureExeName: string = 'msr', forceCheckDownload: boolean = false): string {
    // others have already checked and downloaded.
    if (TerminalType.CygwinBash !== this.terminalType && TerminalType.WslBash !== this.terminalType) {
      if (!forceCheckDownload) {
        return '';
      }
    }

    const [downloadCmd, targetExePath] = this.getDownloadCommandAndSavePath(pureExeName, '~/', GoodSourceUrlIndex);
    const exportCommand = 'export PATH=~:$PATH';
    const checkExistCommand = 'ls -al ' + targetExePath + ' 2>/dev/null | egrep -e "^-[rw-]*?x.*?/' + pureExeName + '\\s*$"';
    const firstCheck = 'which ' + pureExeName + ' 2>/dev/null | egrep -e "/' + pureExeName + '"';
    const lastCheck = '( ' + checkExistCommand + ' || ( ' + downloadCmd + ' && ' + exportCommand + ' ) )';
    return firstCheck + ' || ' + lastCheck;
  }

  private getSourceExeName(pureExeName: string): string {
    return getToolName(pureExeName, this.terminalType);
  }

  private getSaveExeName(pureExeName: string) {
    return pureExeName + (this.isTerminalOfWindows ? '.exe' : '');
  }

  private getTempSaveExePath(pureExeName: string): string {
    const saveExeName = this.getSaveExeName(pureExeName);
    const folder = isLinuxTerminalOnWindows(this.terminalType) ? getHomeFolderForLinuxTerminalOnWindows() : HomeFolder;
    const savePath = path.join(toTerminalPath(folder, this.terminalType), saveExeName);
    return this.isTerminalOfWindows ? savePath : savePath.replace(/\\/g, '/');
  }

  private getDownloadCommandAndSavePath(pureExeName: string, saveExePath: string = '', useUrlIndex: number = 0): [string, string] {
    const sourceExeName = this.getSourceExeName(pureExeName);
    const sourceUrl = getDownloadUrl(sourceExeName, useUrlIndex);
    const [IsExistIcacls] = this.isTerminalOfWindows ? isToolExistsInPath('icacls', this.terminalType) : [false, ''];
    if (isNullOrEmpty(saveExePath)) {
      saveExePath = this.getTempSaveExePath(pureExeName);
    } else if (saveExePath.endsWith('/') || saveExePath === '~') {
      saveExePath = this.isTerminalOfWindows
        ? path.join(saveExePath, pureExeName)
        : saveExePath.replace(/\/$/, '') + "/" + pureExeName;
    }

    const tmpSaveExePath = saveExePath + '.tmp';
    const quotedTmpSavePath = quotePaths(tmpSaveExePath);
    saveExePath = saveExePath.startsWith('"') ? saveExePath : quotePaths(saveExePath);

    const isBashTerminal = isBashTerminalType(this.terminalType);
    const [isWgetExists] = isToolExistsInPath(this.isTerminalOfWindows ? "wget.exe" : "wget", this.terminalType);
    const [isCurlExists] = isBashTerminal && IsWindows ? [true] : isToolExistsInPath(this.isTerminalOfWindows ? "curl.exe" : "curl", this.terminalType);
    const wgetHelpText = isWgetExists ? runCommandGetOutput('wget --help') : '';
    const wgetArgs = wgetHelpText.includes('--no-check-certificate') ? ' --no-check-certificate' : '';
    const commonDownloadCommand = isCurlExists || TerminalType.CygwinBash === this.terminalType
      ? 'curl --silent --show-error --fail "' + sourceUrl + '" -o ' + quotedTmpSavePath
      : 'wget --quiet "' + sourceUrl + '" -O ' + quotedTmpSavePath + wgetArgs // + ' --timeout 30'
      ;
    const PowerShellExeName = this.isTerminalOfWindows ? 'Powershell' : 'pwsh';
    const lastResortCommand = PowerShellExeName + ' -Command "' + (this.isTerminalOfWindows ? '' : "\\") + '$ProgressPreference = \'SilentlyContinue\'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; '
      + "Invoke-WebRequest -Uri '" + sourceUrl + "' -OutFile " + quotePaths(tmpSaveExePath, "'") + '"';

    const downloadCommand = isWgetExists || isCurlExists
      ? commonDownloadCommand
      : lastResortCommand;

    const renameFileCommand = this.isTerminalOfWindows
      ? 'move /y ' + quotedTmpSavePath + ' ' + saveExePath
      : 'mv -f ' + quotedTmpSavePath + ' ' + saveExePath;

    const setExecutableCommand = this.isTerminalOfWindows
      ? (IsExistIcacls ? 'icacls ' + saveExePath + ' /grant %USERNAME%:RX' : '')
      : 'chmod +x ' + saveExePath;
    const command = downloadCommand + ' && ' + renameFileCommand + ' && ' + setExecutableCommand;
    return [command, saveExePath];
  }

  public toRunnableToolPath(commandLine: string) {
    const TmpMsrExePath = this.getTempSaveExePath('msr');
    if (this.MsrExePath === TmpMsrExePath) {
      return quotePaths(TmpMsrExePath) + commandLine.replace(/^msr\s+/, ' ');
    } else {
      return commandLine;
    }
  }

  public checkToolAndInitRunCmdTerminal() {
    if (!this.checkSearchToolExists()) {
      return;
    }

    const config = getConfig();
    const shouldActivate = config.UseGitIgnoreFile || isNullOrEmpty(getDefaultRootFolder());// || !getGitIgnore(getDefaultRootFolder()).Valid;
    if (shouldActivate) {
      const activePath = getActiveFilePath() || '';
      const extension = isNullOrEmpty(activePath) ? '' : path.parse(activePath).ext;
      const mappedExt = isNullOrEmpty(extension) ? '' : (FileExtensionToMappedExtensionMap.get(extension.substring(1)) || '');
      const findType = ('finding ' + mappedExt + ' definition').replace('  ', ' ');
      const checkProcessPattern = getConfigValueOfActiveProject('autoDisableFindDefinitionPattern', true);
      let tip = 'echo Auto disable ' + findType + ' = ' + !isNullOrEmpty(checkProcessPattern)
        + '. Default terminal = ' + TerminalType[DefaultTerminalType]
        + '. Universal slash for --np/pp/xp/sp = ' + IsForwardingSlashSupportedOnWindows
        + '. Locate results to column = ' + IsOutputColumnSupported
        + '. Time offset support for --w1/w2 = ' + IsFileTimeOffsetSupported
        + '. Auto update search tool = ' + getConfig().AutoUpdateSearchTool
        + '.';
      if (PlatformToolChecker.IsToolExists) {
        tip += ' | msr -aPA -i -e true -t "false|Auto.*?(disable).*?definition"';
      }
      runRawCommandInTerminal(tip);
    }

    this.checkAndDownloadTool('nin');
  }

  // Always check tool exists if not exists in previous check, avoid need reloading.
  public checkSearchToolExists(forceCheck: boolean = false, clearOutputBeforeWarning: boolean = false): boolean {
    if (this.IsToolExists && !forceCheck) {
      return true;
    }

    [this.IsToolExists, this.MsrExePath] = isToolExistsInPath('msr', this.terminalType);

    if (!checkIfSupported()) {
      return false;
    }

    if (!this.IsToolExists) {
      if (clearOutputBeforeWarning) {
        clearOutputChannel();
      }

      const sourceExeName = this.getSourceExeName('msr');
      outputErrorByTime('Not found ' + sourceExeName + ' in ' + PathEnvName + ' for ' + TerminalType[this.terminalType] + ' terminal:');
      outputErrorByTime('Please download it (just copy + paste the command line) follow: https://github.com/qualiu/vscode-msr/blob/master/README.md#more-freely-to-use-and-help-you-more');

      if (this.autoDownload) {
        [this.IsToolExists, this.MsrExePath] = this.autoDownloadTool('msr');
      }
    }
    if (this.IsToolExists) {
      this.updateHelpText('msr', this.MsrExePath);
      outputDebugByTime('Found msr = ' + this.MsrExePath + ' , will check new version ...');
      if (this.hasDownloaded) {
        cookCmdShortcutsOrFile(false, getActiveFilePath(), true, false, getRunCmdTerminal(false), true);
      }
      this.checkToolNewVersion();
    }

    return this.IsToolExists;
  }

  private autoDownloadTool(pureExeName: string): [boolean, string] {
    const tmpSaveExePath = this.getTempSaveExePath(pureExeName);
    const sourceExeName = this.getSourceExeName(pureExeName);
    const saveExeName = isWindowsTerminalOnWindows(this.terminalType) ? pureExeName + '.exe' : pureExeName;
    const targetExePath = path.join(path.dirname(tmpSaveExePath), saveExeName);

    if (!isFileExists(tmpSaveExePath)) {
      updateOutputChannel(MessageLevel.WARN);
      if (!this.tryAllSourcesToDownload(pureExeName, sourceExeName, tmpSaveExePath, targetExePath)) {
        runRawCommandInTerminal(`echo "Tried ${SourceHomeUrlArray.length} sources, please download ${sourceExeName} follow: ${TipUrl}"`)
        return [false, ''];
      }
    }
    updateOutputChannel(DefaultMessageLevel, getConfig().IsQuiet);
    outputInfoByTime('Found existing tmp tool "' + sourceExeName + '": ' + targetExePath + ' , skip downloading.');
    this.addTmpExeToPath(pureExeName);
    return [true, targetExePath];
  }


  private tryAllSourcesToDownload(pureExeName: string, sourceExeName: string, tmpSaveExePath: string, targetExePath: string): boolean {
    for (let tryTimes = 0; tryTimes < SourceHomeUrlArray.length; tryTimes++) {
      outputKeyInfoByTime('Will try to download the tiny tool "' + sourceExeName + '" by command:');
      runRawCommandInTerminal(`echo Times-${tryTimes + 1}: Try to download ${sourceExeName} from source-${tryTimes + 1}, see: "${TipUrl}"`)
      const tryUrlIndex = GoodSourceUrlIndex + tryTimes;
      const [downloadCommand, _] = this.getDownloadCommandAndSavePath(pureExeName, tmpSaveExePath, tryUrlIndex);
      outputKeyInfo(downloadCommand);
      if (isDirectory(tmpSaveExePath)) {
        const errorText = `echo "Found name conflict with directory: ${tmpSaveExePath} , please move the directory, or download ${sourceExeName} with command in ${OutputChannelName} in OUTPUT tab."`;
        runRawCommandInTerminal(errorText);
        outputErrorByTime(errorText);
        return false;
      }

      const saveFolder = path.dirname(tmpSaveExePath);
      try {
        if (saveFolder !== '~' && !fs.existsSync(saveFolder)) {
          fs.mkdirSync(saveFolder);
        }
      } catch (err) {
        outputErrorByTime('Failed to create save folder: ' + saveFolder + ' for ' + sourceExeName);
        continue;
      }

      const beginDownloadTime = new Date();
      try {
        let output = ChildProcess.execSync(downloadCommand, { timeout: 30 * 1000 }).toString();
        outputKeyInfo(output);
      } catch (err) {
        const costSeconds = (((new Date()).valueOf() - beginDownloadTime.valueOf()) / 1000).toFixed(3);
        outputErrorByTime('Cost ' + costSeconds + 's: Failed to download ' + sourceExeName + ' : ' + err);
        outputErrorByTime('Please manually download ' + sourceExeName + ' and add its folder to ' + PathEnvName + ': ' + getDownloadUrl(sourceExeName));
        const otherSources = SourceHomeUrlArray.filter(a => !downloadCommand.includes(a)).map(a => getHomeUrl(a)).join(" 或者 ");
        outputErrorByTime('如果无法从github下载 ' + sourceExeName + ' 可试别处下载：' + otherSources + ' 或者 https://gitee.com/qualiu/msr/tree/master/tools/');
        continue;
      }

      if (!fs.existsSync(targetExePath)) {
        outputErrorByTime('Downloading completed but not found tmp tool "' + sourceExeName + '": ' + targetExePath);
        continue;
      }
      const costSeconds = (((new Date()).valueOf() - beginDownloadTime.valueOf()) / 1000).toFixed(3);
      outputKeyInfoByTime('Cost ' + costSeconds + ' s: Successfully downloaded tmp tool "' + sourceExeName + '": ' + targetExePath);
      GoodSourceUrlIndex = tryUrlIndex % SourceHomeUrlArray.length;
      this.hasDownloaded = true;
      return true;
    }
    return false;
  }

  private addTmpExeToPath(pureExeName: string) {
    const saveExeName = this.getSaveExeName(pureExeName);
    const tmpSaveExePath = this.getTempSaveExePath(pureExeName);
    if (pureExeName === 'msr') {
      this.MsrExePath = tmpSaveExePath;
      updateToolNameToPathMap(this.terminalType, 'msr', tmpSaveExePath);
    } else if (pureExeName === 'nin') {
      updateToolNameToPathMap(this.terminalType, 'nin', tmpSaveExePath);
    }

    this.updateHelpText(pureExeName, tmpSaveExePath);

    const exeFolder = path.dirname(tmpSaveExePath);
    if (checkAddFolderToPath(exeFolder, this.terminalType)) {
      outputKeyInfoByTime('Temporarily added ' + saveExeName + ' folder: ' + exeFolder + ' to ' + PathEnvName);
      outputKeyInfoByTime('Suggest that add the folder to ' + PathEnvName + ' to freely use/call ' + pureExeName + ' everywhere (you can also copy/move "' + tmpSaveExePath + '" to a folder already in ' + PathEnvName + ').');
    }
  }

  private setEnvironmentForTool() {
    if (TerminalType.CygwinBash === this.terminalType) {
      const shellExe = getTerminalShellExePath();
      const shellExeFolder = path.dirname(shellExe);
      process.env['CYGWIN_ROOT'] = shellExeFolder.replace('\\', '\\\\');
      checkAddFolderToPath(shellExeFolder, TerminalType.CMD);
    }
  }

  private checkToolNewVersion(tryUrlIndex: number = 0) {
    if (tryUrlIndex >= SourceHomeUrlArray.length) {
      return;
    }
    if (this.MsrExePath.length < 1) {
      return;
    }

    if (!IsDebugMode) {
      const now = new Date();
      const hour = now.getHours();
      if (now.getDay() !== 2 || hour < 7 || hour > 12) {
        outputDebugByTime('Skip checking for now. Only check at every Tuesday 07:00 ~ 12:00.');
        return;
      }
    }

    const trackCheckBeginTime = new Date();
    const checker = this;
    const sourceMd5FileUrl = getDownloadUrl('md5.txt', tryUrlIndex + GoodSourceUrlIndex);
    outputInfoByDebugMode(`Checking version with: ${sourceMd5FileUrl}`);
    const request = https.get(sourceMd5FileUrl, function (response) {
      response.on('data', function (data) {
        if (data) {
          const sourceMd5Lines = data.toString();
          if (!isNullOrEmpty(sourceMd5Lines) && /^\w+\s+(msr|nin)/i.test(sourceMd5Lines)) {
            GoodSourceUrlIndex = tryUrlIndex % SourceHomeUrlArray.length;
            checker.compareToolVersions(sourceMd5Lines, sourceMd5FileUrl, trackCheckBeginTime);
          } else if (tryUrlIndex < SourceHomeUrlArray.length) {
            checker.checkToolNewVersion(tryUrlIndex + 1);
          }
        }
      });
    });
    request.end();
    request.on('error', (err) => {
      outputDebugByTime('Failed to read source md5 from ' + sourceMd5FileUrl + '. Cost ' + getElapsedSecondsToNow(trackCheckBeginTime) + ' seconds. Error: ' + err.message);
      if (tryUrlIndex < SourceHomeUrlArray.length) {
        this.checkToolNewVersion(tryUrlIndex + 1);
      }
    });
  }

  private compareToolVersions(allMd5Text: string, sourceMd5FileUrl: string, trackCheckBeginTime: Date) {
    const [hasNin, ninExePath] = isToolExistsInPath('nin', this.terminalType);
    const currentMsrMd5 = getFileMd5(this.MsrExePath);
    let currentExeNameToMd5Map = new Map<string, string>().set('msr', currentMsrMd5);
    let exeName64bitToPathMap = new Map<string, string>().set('msr', this.MsrExePath);
    if (hasNin) {
      currentExeNameToMd5Map.set('nin', getFileMd5(ninExePath));
      exeName64bitToPathMap.set('nin', ninExePath);
    }

    let oldExeNames = new Set<string>();
    let foundCount = 0;
    while (foundCount < currentExeNameToMd5Map.size) {
      const matchInfo = this.MatchExeMd5Regex.exec(allMd5Text);
      if (!matchInfo) {
        outputWarnByTime('Not match source MD5 text with Regex: "' + this.MatchExeMd5Regex.source + '" , remained text = ' + allMd5Text);
        break;
      }

      foundCount++;
      allMd5Text = allMd5Text.substring(matchInfo.index + matchInfo[0].length);
      const latestMd5 = matchInfo[1];
      const pureExeName = matchInfo[2];
      const sourceExeName = this.getSourceExeName(pureExeName);
      const currentMd5 = currentExeNameToMd5Map.get(pureExeName) || '';

      if (isNullOrEmpty(currentMd5)) { // Skip other EXEs in source URL.
        continue;
      }

      if (currentMd5.toLowerCase() !== latestMd5.toLowerCase()) {
        oldExeNames.add(sourceExeName);
        outputKeyInfoByTime('Found new version of ' + sourceExeName + ' which md5 = ' + latestMd5 + ' , source-info = ' + sourceMd5FileUrl);
        outputKeyInfoByTime('Current ' + sourceExeName + ' md5 = ' + currentMd5 + ' , path = ' + exeName64bitToPathMap.get(pureExeName));
      } else {
        outputInfoByTime('Great! Your ' + sourceExeName + ' is latest! md5 = ' + latestMd5 + ' , exe = ' + exeName64bitToPathMap.get(pureExeName) + ' , sourceMD5 = ' + sourceMd5FileUrl);
      }
    }

    const canAutoUpdateTool = getConfig().AutoUpdateSearchTool;
    if (oldExeNames.size > 0) {
      if (!canAutoUpdateTool) {
        outputKeyInfoByTime(`Found 'msr.autoUpdateSearchTool' = 'false', please manually update ${Array.from(oldExeNames).join(' + ')} by command below for ${TerminalType[this.terminalType]} terminal:`);
      }
      oldExeNames.forEach(exeName => {
        const pureExeName = exeName.replace(/^(\w+).*/, '$1');
        let currentExeSavePath = exeName64bitToPathMap.get(pureExeName) || '';
        if (TerminalType.CygwinBash === this.terminalType) {
          currentExeSavePath = toCygwinPath(currentExeSavePath);
        }
        const [downloadCommand, _] = this.getDownloadCommandAndSavePath(pureExeName, currentExeSavePath, GoodSourceUrlIndex);
        if (!canAutoUpdateTool) {
          outputKeyInfo(downloadCommand + '\n');
          return;
        }
        outputKeyInfoByTime(`Found 'msr.autoUpdateSearchTool' = true, will auto update ${currentExeSavePath}`);
        outputKeyInfo(downloadCommand + '\n');
        try {
          const stat = fs.lstatSync(currentExeSavePath);
          if (stat.isSymbolicLink()) {
            outputKeyInfoByTime('Skip auto updating link file: ' + currentExeSavePath);
            return;
          }
        } catch (err) {
          outputKeyInfoByTime('Failed to check if it is a link file: ' + currentExeSavePath);
          console.log(err);
          return;
        }
        runRawCommandInTerminal(downloadCommand);
      });
    }

    outputInfoByDebugModeByTime('Finished to check tool versions. Cost ' + getElapsedSecondsToNow(trackCheckBeginTime) + ' seconds.');
  }
}

const LinuxToolChecker = new ToolChecker(DefaultTerminalType, false);
const PlatformToolChecker = new ToolChecker(IsWindows ? TerminalType.CMD : TerminalType.LinuxBash);
export const RunCommandChecker = TerminalType.CygwinBash === DefaultTerminalType ? LinuxToolChecker : PlatformToolChecker;

if (IsLinuxTerminalOnWindows && TerminalType.CygwinBash === DefaultTerminalType) {
  LinuxToolChecker.checkSearchToolExists();
}
