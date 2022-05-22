import path = require('path');
import fs = require('fs');
import https = require('https');
import crypto = require('crypto');
import ChildProcess = require('child_process');
import { HomeFolder, IsDebugMode, IsWindows } from './constants';
import { MyConfig } from './dynamicConfig';
import { TerminalType } from './enums';
import { getHomeFolderForLinuxTerminalOnWindows, getTerminalShellExePath, isToolExistsInPath } from './otherUtils';
import { checkIfSupported, clearOutputChannel, outputDebug, outputError, outputInfo, outputInfoByDebugMode, outputKeyInfo, outputWarn } from './outputUtils';
import { checkAddFolderToPath, DefaultTerminalType, getTimeCostToNow, isLinuxTerminalOnWindows, isNullOrEmpty, isWindowsTerminalOnWindows, nowText, PathEnvName, quotePaths, runCommandGetOutput, toCygwinPath, toOsPath, toOsPaths } from './utils';

export const MsrExe = 'msr';
const Is64BitOS = process.arch.includes('64');

const SourceHomeUrlArray = [
	'https://raw.githubusercontent.com/qualiu/msr/master/tools/',
	'https://gitlab.com/lqm678/msr/-/raw/master/tools/',
	'https://master.dl.sourceforge.net/project/avasattva/'
];

function getHomeUrl(sourceHomeUrl: string): string {
	if (sourceHomeUrl.includes('gitlab')) {
		return 'https://gitlab.com/lqm678/msr/';
	} else if (sourceHomeUrl.includes('sourceforge')) {
		return 'https://sourceforge.net/projects/avasattva/files/'
	} else {
		return 'https://github.com/qualiu/msr';
	}
}

let GoodSourceUrlIndex = 0; // use it if succeeded

function getDownloadUrl(sourceExeName: string, useUrlIndex: number = 0): string {
	const parentUrl = SourceHomeUrlArray[useUrlIndex % SourceHomeUrlArray.length];
	if (parentUrl.includes('sourceforge')) {
		return parentUrl + sourceExeName + '?viasf=1';
	} else if (parentUrl.includes('gitlab')) {
		return parentUrl + sourceExeName + '?inline=false';
	}
	return parentUrl + sourceExeName;
}

export const TerminalTypeToSourceExtensionMap = new Map<TerminalType, string>()
	.set(TerminalType.CMD, '.exe')
	.set(TerminalType.PowerShell, IsWindows ? '.exe' : '.gcc48')
	.set(TerminalType.MinGWBash, '.exe')
	.set(TerminalType.CygwinBash, '.cygwin')
	.set(TerminalType.LinuxBash, '.gcc48')
	.set(TerminalType.WslBash, '.gcc48')
	;

let MsrHelpText = '';
let NinHelpText = '';
const GetSearchDepthRegex: RegExp = /\s+(-k|--max-depth)\s+\d+/;
const GetTimeoutRegex: RegExp = /\s+--timeout\s+(-?\d+)/;
const CheckForwardingSlashSupportOnWindowsText = "Support '/' on Windows";

export let IsTimeoutSupported: boolean = false;
export let IsForwardingSlashSupportedOnWindows = false;

let TerminalTypeToToolNamePathMap = new Map<TerminalType, Map<string, string>>();

export function setTimeoutInCommandLine(command: string, timeoutSeconds = MyConfig.MaxWaitSecondsForSearchDefinition) {
	if (timeoutSeconds > 0 && IsTimeoutSupported) {
		return setArgValueInCommandLine(command, GetTimeoutRegex, '--timeout', timeoutSeconds.toString());
	} else {
		return command;
	}
}

export function setSearchDepthInCommandLine(command: string, maxDepth = MyConfig.MaxSearchDepth) {
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

function getFileMd5(filePath: string) {
	const hash = crypto.createHash('md5');
	const content = fs.readFileSync(filePath, { encoding: '' });
	const md5 = hash.update(content).digest('hex');
	return md5;
}

export function isArgSupported(argName: string, toolName = 'msr'): boolean {
	const isLongArgName = argName.startsWith('--') || (!argName.startsWith('-') && argName.length > 1);
	const regex = new RegExp((isLongArgName ? '^\\s*--' : '^\\s*-') + argName.replace(/^-+/, '') + "\\s", 'm');
	return regex.test(toolName === 'msr' ? MsrHelpText : NinHelpText);
}

function updateToolNameToPathMap(terminalType: TerminalType, toolName: string, toolPath: string, canReCheck = true) {
	let toolNameToPathMap = TerminalTypeToToolNamePathMap.get(terminalType);
	if (!toolNameToPathMap) {
		toolNameToPathMap = new Map<string, string>();
		TerminalTypeToToolNamePathMap.set(terminalType, toolNameToPathMap);
	}

	toolNameToPathMap.set(toolName, toolPath);
	if (canReCheck && IsWindows && (terminalType === TerminalType.CMD || TerminalType.PowerShell === terminalType)) {
		const tp = terminalType === TerminalType.CMD ? TerminalType.PowerShell : TerminalType.CMD;
		updateToolNameToPathMap(tp, toolName, toolPath, false);
	}
}

export function getSetToolEnvCommand(terminalType: TerminalType, addTailTextIfNotEmpty: string = '', foldersToAddPath: string[] = []): string {
	let toolFolderSet = new Set<string>();
	const toolNameToPathMap = TerminalTypeToToolNamePathMap.get(terminalType);
	if (toolNameToPathMap) {
		toolNameToPathMap.forEach((value, _key, _m) => {
			toolFolderSet.add(path.dirname(value));
		});
	}

	if (foldersToAddPath && foldersToAddPath.length > 0) {
		foldersToAddPath.filter(d => !isNullOrEmpty(d)).forEach((folder) => toolFolderSet.add(folder));
	}

	if (toolFolderSet.size === 0) {
		return '';
	}

	const toolFolders = Array.from(toOsPaths(toolFolderSet, terminalType));
	switch (terminalType) {
		case TerminalType.CMD:
			return 'SET "PATH=%PATH%;' + toolFolders.join(';') + ';"' + addTailTextIfNotEmpty;
		case TerminalType.PowerShell:
		case TerminalType.Pwsh:
			return "$env:Path += ';" + toolFolders.join(';') + "'" + addTailTextIfNotEmpty;
		case TerminalType.LinuxBash:
		case TerminalType.MinGWBash:
		default:
			return 'export PATH=$PATH:' + toolFolders.join(':').replace(' ', '\\ ') + addTailTextIfNotEmpty;
	}
}

export class ToolChecker {
	public MsrExePath: string = '';
	private terminalType: TerminalType;
	private autoDownload: boolean;
	private MatchExeMd5Regex: RegExp = /to-load/;
	private isMsrToolExists = false;
	private isTerminalOfWindows: boolean;

	constructor(terminalType: TerminalType = DefaultTerminalType, autoDownload = true) {
		this.terminalType = terminalType;
		this.autoDownload = autoDownload;
		this.isTerminalOfWindows = isWindowsTerminalOnWindows(this.terminalType);
		this.MatchExeMd5Regex = new RegExp('^(\\S+)\\s+(\\w+)' + this.getSourceExeNameTail() + '\\s*$', 'm');
	}

	private getSourceExeNameTail() {
		if (process.platform.match(/Darwin/i)) {
			return '-' + process.arch.toLowerCase() + '.' + process.platform.toLowerCase();
		}

		const suffix = TerminalTypeToSourceExtensionMap.get(this.terminalType);
		if (IsWindows) {
			return (Is64BitOS ? '' : '-Win32') + suffix;
		}

		// for Linux
		return (Is64BitOS ? '' : '-i386') + suffix;
	}

	public checkAndDownloadTool(exeName64bit: string): [boolean, string] {
		const [isExisted, exePath] = isToolExistsInPath(exeName64bit, this.terminalType);
		const exeName = this.getSourceExeName(exeName64bit);
		outputDebug(nowText() + (isExisted ? 'Found ' + exeName + ' = ' + exePath : 'Not found ' + exeName + ', will download it.'));
		if (isExisted) {
			this.setEnvironmentForTool();
			this.updateHelpText(exeName64bit, exePath);
			return [isExisted, exePath];
		}

		return this.autoDownloadTool(exeName64bit);
	}

	private updateHelpText(exeName64bit: string, exePath: string) {
		if (exeName64bit === 'msr') {
			MsrHelpText = runCommandGetOutput(exePath + ' -h -C');
			IsForwardingSlashSupportedOnWindows = MsrHelpText.includes(CheckForwardingSlashSupportOnWindowsText);
			IsTimeoutSupported = isArgSupported('--timeout', 'msr');
		} else {
			NinHelpText = runCommandGetOutput(exePath + ' -h -C');
		}
	}

	public getCheckDownloadCommandsForLinuxBashOnWindows(exeName64bit: string = 'msr', forceCheckDownload: boolean = false): string {
		// others have already checked and downloaded.
		if (TerminalType.CygwinBash !== this.terminalType && TerminalType.WslBash !== this.terminalType) {
			if (!forceCheckDownload) {
				return '';
			}
		}

		const [downloadCmd, targetExePath] = this.getDownloadCommandAndSavePath(exeName64bit, '~/', GoodSourceUrlIndex);
		const exportCommand = 'export PATH=~:$PATH';
		const checkExistCommand = 'ls -al ' + targetExePath + ' 2>/dev/null | egrep -e "^-[rw-]*?x.*?/' + exeName64bit + '\\s*$"';
		const firstCheck = 'which ' + exeName64bit + ' 2>/dev/null | egrep -e "/' + exeName64bit + '"';
		const lastCheck = '( ' + checkExistCommand + ' || ( ' + downloadCmd + ' && ' + exportCommand + ' ) )';
		return firstCheck + ' || ' + lastCheck;
	}

	private getSourceExeName(exeName64bit: string): string {
		return exeName64bit + this.getSourceExeNameTail();
	}

	private getSaveExeName(exeName64bit: string) {
		return exeName64bit + (this.isTerminalOfWindows ? '.exe' : '');
	}

	private getTempSaveExePath(exeName64bit: string): string {
		const saveExeName = this.getSaveExeName(exeName64bit);
		const folder = isLinuxTerminalOnWindows(this.terminalType) ? getHomeFolderForLinuxTerminalOnWindows() : HomeFolder;
		const savePath = path.join(toOsPath(folder, this.terminalType), saveExeName);
		return this.isTerminalOfWindows ? savePath : savePath.replace(/\\/g, '/');
	}

	private getDownloadCommandAndSavePath(exeName64bit: string, saveExePath: string = '', useUrlIndex: number = 0): [string, string] {
		const sourceExeName = this.getSourceExeName(exeName64bit);
		const sourceUrl = getDownloadUrl(sourceExeName, useUrlIndex);
		const [IsExistIcacls] = this.isTerminalOfWindows ? isToolExistsInPath('icacls', this.terminalType) : [false, ''];
		if (isNullOrEmpty(saveExePath)) {
			saveExePath = this.getTempSaveExePath(exeName64bit);
		} else if (saveExePath.endsWith('/') || saveExePath === '~') {
			saveExePath = this.isTerminalOfWindows
				? path.join(saveExePath, exeName64bit)
				: saveExePath.replace(/\/$/, '') + "/" + exeName64bit;
		}

		const tmpSaveExePath = saveExePath + '.tmp';
		const quotedTmpSavePath = quotePaths(tmpSaveExePath);
		saveExePath = saveExePath.startsWith('"') ? saveExePath : quotePaths(saveExePath);

		const [isWgetExists] = isToolExistsInPath(this.isTerminalOfWindows ? "wget.exe" : "wget", this.terminalType);
		const [isCurlExists] = isToolExistsInPath(this.isTerminalOfWindows ? "curl.exe" : "curl", this.terminalType);
		const wgetHelpText = isWgetExists ? runCommandGetOutput('wget --help') : '';
		const wgetArgs = wgetHelpText.includes('--no-check-certificate') ? ' --no-check-certificate' : '';
		const commonDownloadCommand = isWgetExists
			? 'wget --quiet "' + sourceUrl + '" -O ' + quotedTmpSavePath + wgetArgs // + ' --timeout 30'
			: 'curl --silent --show-error --fail "' + sourceUrl + '" -o ' + quotedTmpSavePath;
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

	// Always check tool exists if not exists in previous check, avoid need reloading.
	public checkSearchToolExists(forceCheck: boolean = false, clearOutputBeforeWarning: boolean = false): boolean {
		if (this.isMsrToolExists && !forceCheck) {
			return true;
		}

		[this.isMsrToolExists, this.MsrExePath] = isToolExistsInPath('msr', this.terminalType);

		if (!checkIfSupported()) {
			return false;
		}

		if (!this.isMsrToolExists) {
			if (clearOutputBeforeWarning) {
				clearOutputChannel();
			}

			const sourceExeName = this.getSourceExeName('msr');
			outputError(nowText() + 'Not found ' + sourceExeName + ' in ' + PathEnvName + ' for ' + TerminalType[this.terminalType] + ' terminal:');
			outputError(nowText() + 'Please download it (just copy + paste the command line) follow: https://github.com/qualiu/vscode-msr/blob/master/README.md#more-freely-to-use-and-help-you-more');

			if (this.autoDownload) {
				[this.isMsrToolExists, this.MsrExePath] = this.autoDownloadTool('msr');
			}
		}

		if (this.isMsrToolExists) {
			this.updateHelpText('msr', this.MsrExePath);
			outputDebug(nowText() + 'Found msr = ' + this.MsrExePath + ' , will check new version ...');
			this.checkToolNewVersion();
		}

		return this.isMsrToolExists;
	}

	private autoDownloadTool(exeName64bit: string): [boolean, string] {
		const tmpSaveExePath = this.getTempSaveExePath(exeName64bit);
		const sourceExeName = this.getSourceExeName(exeName64bit);
		const targetExePath = path.join(path.dirname(tmpSaveExePath), isWindowsTerminalOnWindows(this.terminalType) ? exeName64bit + '.exe' : exeName64bit);
		if (!fs.existsSync(tmpSaveExePath)) {
			for (let tryTimes = 0; tryTimes < SourceHomeUrlArray.length; tryTimes++) {
				outputKeyInfo('\n' + nowText() + 'Will try to download the tiny tool "' + sourceExeName + '" by command:');
				const tryUrlIndex = GoodSourceUrlIndex + tryTimes;
				const [downloadCommand, _] = this.getDownloadCommandAndSavePath(exeName64bit, tmpSaveExePath, tryUrlIndex);
				outputKeyInfo(downloadCommand);
				const saveFolder = path.dirname(tmpSaveExePath);
				try {
					if (saveFolder !== '~' && !fs.existsSync(saveFolder)) {
						fs.mkdirSync(saveFolder);
					}
				} catch (err) {
					outputError('\`n' + nowText() + 'Failed to create save folder: ' + saveFolder + ' for ' + sourceExeName);
					continue;
				}

				const beginDownloadTime = new Date();
				try {
					let output = ChildProcess.execSync(downloadCommand, { timeout: 30 * 1000 }).toString();
					outputKeyInfo(output);
				} catch (err) {
					const costSeconds = (((new Date()).valueOf() - beginDownloadTime.valueOf()) / 1000).toFixed(3);
					outputError('\n' + nowText() + 'Cost ' + costSeconds + 's: Failed to download ' + sourceExeName + ' : ' + err);
					outputError('\n' + nowText() + 'Please manually download ' + sourceExeName + ' and add its folder to ' + PathEnvName + ': ' + getDownloadUrl(sourceExeName));
					const otherSources = SourceHomeUrlArray.filter(a => !downloadCommand.includes(a)).map(a => getHomeUrl(a)).join(" 或者 ");
					outputError('\n' + nowText() + '如果无法从github下载 ' + sourceExeName + ' 可试别处下载：' + otherSources + ' 或者 https://gitee.com/qualiu/msr/tree/master/tools/');
					if (tryTimes > 0) {
						return [false, ''];
					}
					continue;
				}

				if (!fs.existsSync(targetExePath)) {
					outputError(nowText() + 'Downloading completed but not found tmp tool "' + sourceExeName + '": ' + targetExePath);
					if (tryTimes > 0) {
						return [false, ''];
					}
				} else {
					const costSeconds = (((new Date()).valueOf() - beginDownloadTime.valueOf()) / 1000).toFixed(3);
					outputKeyInfo(nowText() + 'Cost ' + costSeconds + ' s: Successfully downloaded tmp tool "' + sourceExeName + '": ' + targetExePath);
					GoodSourceUrlIndex = tryUrlIndex % SourceHomeUrlArray.length;
					break;
				}
			}
		} else {
			outputInfo(nowText() + 'Found existing tmp tool "' + sourceExeName + '": ' + targetExePath + ' , skip downloading.');
		}

		this.addTmpExeToPath(exeName64bit);
		return [true, targetExePath];
	}

	private addTmpExeToPath(exeName64bit: string) {
		const saveExeName = this.getSaveExeName(exeName64bit);
		const tmpSaveExePath = this.getTempSaveExePath(exeName64bit);
		if (exeName64bit === 'msr') {
			this.MsrExePath = tmpSaveExePath;
			updateToolNameToPathMap(this.terminalType, 'msr', tmpSaveExePath);
		} else if (exeName64bit === 'nin') {
			updateToolNameToPathMap(this.terminalType, 'nin', tmpSaveExePath);
		}

		this.updateHelpText(exeName64bit, tmpSaveExePath);

		const exeFolder = path.dirname(tmpSaveExePath);
		if (checkAddFolderToPath(exeFolder, this.terminalType)) {
			outputKeyInfo(nowText() + 'Temporarily added ' + saveExeName + ' folder: ' + exeFolder + ' to ' + PathEnvName);
			outputKeyInfo(nowText() + 'Suggest that add the folder to ' + PathEnvName + ' to freely use/call ' + exeName64bit + ' everywhere (you can also copy/move "' + tmpSaveExePath + '" to a folder already in ' + PathEnvName + ').');
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
				outputDebug(nowText() + 'Skip checking for now. Only check at every Tuesday 07:00 ~ 12:00.');
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
			outputDebug(nowText() + 'Failed to read source md5 from ' + sourceMd5FileUrl + '. Cost ' + getTimeCostToNow(trackCheckBeginTime) + ' seconds. Error: ' + err.message);
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
				outputWarn(nowText() + 'Not match source MD5 text with Regex: "' + this.MatchExeMd5Regex.source + '" , remained text = ' + allMd5Text);
				break;
			}

			foundCount++;
			allMd5Text = allMd5Text.substring(matchInfo.index + matchInfo[0].length);
			const latestMd5 = matchInfo[1];
			const exeName64bit = matchInfo[2];
			const sourceExeName = this.getSourceExeName(exeName64bit);
			const currentMd5 = currentExeNameToMd5Map.get(exeName64bit) || '';

			if (isNullOrEmpty(currentMd5)) { // Skip other EXEs in source URL.
				continue;
			}

			if (currentMd5.toLowerCase() !== latestMd5.toLowerCase()) {
				oldExeNames.add(sourceExeName);
				outputKeyInfo(nowText() + 'Found new version of ' + sourceExeName + ' which md5 = ' + latestMd5 + ' , source-info = ' + sourceMd5FileUrl);
				outputKeyInfo(nowText() + 'Current ' + sourceExeName + ' md5 = ' + currentMd5 + ' , path = ' + exeName64bitToPathMap.get(exeName64bit));
			} else {
				outputInfoByDebugMode(nowText() + 'Great! Your ' + sourceExeName + ' is latest! md5 = ' + latestMd5 + ' , exe = ' + exeName64bitToPathMap.get(exeName64bit) + ' , sourceMD5 = ' + sourceMd5FileUrl);
			}
		}

		if (oldExeNames.size > 0) {
			outputKeyInfo('\n' + nowText() + 'You can download + update (if not link files) "' + Array.from(oldExeNames).join(' + ') + '" like below for your ' + TerminalType[this.terminalType] + ' terminal:');
			oldExeNames.forEach(exeName => {
				const exeName64bit = exeName.replace(/^(\w+).*/, '$1');
				let currentExeSavePath = exeName64bitToPathMap.get(exeName64bit) || '';
				if (TerminalType.CygwinBash === this.terminalType) {
					currentExeSavePath = toCygwinPath(currentExeSavePath);
				}
				const [downloadCommand, _] = this.getDownloadCommandAndSavePath(exeName64bit, currentExeSavePath, GoodSourceUrlIndex);
				outputKeyInfo(downloadCommand + '\n');
			});
		}

		outputInfoByDebugMode(nowText() + 'Finished to check tool versions. Cost ' + getTimeCostToNow(trackCheckBeginTime) + ' seconds.');
	}
}
