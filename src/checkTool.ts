import path = require('path');
import fs = require('fs');
import https = require('https');
import crypto = require('crypto');
import ChildProcess = require('child_process');
import { HomeFolder, IsDebugMode, IsSupportedSystem, IsWindows } from './constants';
import { MyConfig } from './dynamicConfig';
import { TerminalType } from './enums';
import { getHomeFolderForLinuxTerminalOnWindows, getTerminalShellExePath, isToolExistsInPath } from './otherUtils';
import { clearOutputChannel, outputDebug, outputError, outputInfo, outputKeyInfo } from './outputUtils';
import { checkAddFolderToPath, DefaultTerminalType, getTimeCostToNow, isLinuxTerminalOnWindows, isNullOrEmpty, isWindowsTerminalOnWindows, nowText, PathEnvName, quotePaths, runCommandGetOutput, toCygwinPath, toOsPath, toOsPaths } from './utils';

export const MsrExe = 'msr';
const Is64BitOS = process.arch.match(/x64|\s+64/);
const SourceExeHomeUrl = 'https://raw.githubusercontent.com/qualiu/msr/master/tools/';
const SourceMd5FileUrl = SourceExeHomeUrl + 'md5.txt';
const SourceExeNameTail = Is64BitOS ? '' : (IsWindows ? '-Win32' : '-i386');
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

let SourceMd5Text = '';
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

export function getSetToolEnvCommand(terminalType: TerminalType, addTailTextIfNotEmpty: string = ''): string {
	if (terminalType === TerminalType.CygwinBash || TerminalType.WslBash === terminalType) {
		return '';
	}

	let toolFolderSet = new Set<string>();
	const toolNameToPathMap = TerminalTypeToToolNamePathMap.get(terminalType);
	if (!toolNameToPathMap || toolNameToPathMap.size < 1) {
		return '';
	}

	toolNameToPathMap.forEach((value, _key, _m) => {
		toolFolderSet.add(path.dirname(value));
	});

	const toolFolders = Array.from(toOsPaths(toolFolderSet, terminalType));
	switch (terminalType) {
		case TerminalType.CMD:
			return 'SET "PATH=' + toolFolders.join(';') + ';%PATH%;"' + addTailTextIfNotEmpty;
		case TerminalType.PowerShell:
			return "$env:Path = $env:Path + ';" + toolFolders.join(';') + "'" + addTailTextIfNotEmpty;
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
		const sourceExeExtension = TerminalTypeToSourceExtensionMap.get(this.terminalType) || '';
		this.MatchExeMd5Regex = new RegExp('^(\\S+)\\s+(\\w+)' + SourceExeNameTail + sourceExeExtension + '\\s*$', 'm');
	}

	public checkAndDownloadTool(exeName64bit: string): [boolean, string] {
		if (!IsSupportedSystem) {
			return [false, ''];
		}

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

	public getDownloadCommandForNewTerminal(exeName64bit: string = 'msr', forceCheckDownload: boolean = false): string {
		// others have already checked and downloaded.
		if (TerminalType.CygwinBash !== this.terminalType && TerminalType.WslBash !== this.terminalType) {
			if (!forceCheckDownload) {
				return '';
			}
		}

		const sourceExeName = this.getSourceExeName(exeName64bit);
		const tmpSaveExePath = '~/' + sourceExeName + '.tmp';
		const targetExePath = '~/' + exeName64bit;
		const pureDownloadCmd = 'wget ' + SourceExeHomeUrl + sourceExeName + ' -O ' + tmpSaveExePath + ' --no-check-certificate'
			+ ' && mv -f ' + tmpSaveExePath + ' ' + targetExePath
			+ ' && chmod +x ' + targetExePath + ' && export PATH=~:$PATH';

		const firstCheck = 'which ' + exeName64bit + ' | egrep -e "/' + exeName64bit + '"';

		const lastCheck = '(ls -al ' + targetExePath + ' 2>/dev/null | egrep -e "^-[rw-]*?x.*?/' + exeName64bit + '\\s*$" || ( ' + pureDownloadCmd + ' ) )';
		const downloadCmd = firstCheck + ' || ' + lastCheck;
		return downloadCmd;
	}

	private getDownloadUrl(sourceExeName: string): string {
		return SourceExeHomeUrl + sourceExeName;
	}

	private getSourceExeName(exeName64bit: string): string {
		return exeName64bit + SourceExeNameTail + TerminalTypeToSourceExtensionMap.get(this.terminalType);
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

	private getDownloadCommand(exeName64bit: string, saveExePath: string = ''): string {
		const sourceExeName = this.getSourceExeName(exeName64bit);
		const sourceUrl = this.getDownloadUrl(sourceExeName);
		const [IsExistIcacls] = this.isTerminalOfWindows ? isToolExistsInPath('icacls', this.terminalType) : [false, ''];
		if (isNullOrEmpty(saveExePath)) {
			saveExePath = this.getTempSaveExePath(exeName64bit);
		}

		const tmpSaveExePath = quotePaths(saveExePath + '.tmp');
		saveExePath = saveExePath.startsWith('"') ? saveExePath : quotePaths(saveExePath);

		const [isWgetExistsOnWindows] = this.isTerminalOfWindows ? isToolExistsInPath('wget.exe', this.terminalType) : [false, ''];
		const wgetHelpText = isWgetExistsOnWindows ? runCommandGetOutput('wget --help') : '';
		const noCheckCertArg = wgetHelpText.includes('--no-check-certificate') ? ' --no-check-certificate' : '';

		const downloadCommand = this.isTerminalOfWindows && !isWgetExistsOnWindows
			? 'Powershell -Command "$ProgressPreference = \'SilentlyContinue\'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; '
			+ "Invoke-WebRequest -Uri '" + sourceUrl + "' -OutFile " + quotePaths(tmpSaveExePath, "'") + '"'
			: 'wget "' + sourceUrl + '" -O ' + tmpSaveExePath + noCheckCertArg;

		const renameFileCommand = this.isTerminalOfWindows
			? 'move /y ' + tmpSaveExePath + ' ' + saveExePath
			: 'mv -f ' + tmpSaveExePath + ' ' + saveExePath;

		const setExecutableCommand = this.isTerminalOfWindows
			? (IsExistIcacls ? ' && icacls ' + saveExePath + ' /grant %USERNAME%:RX' : '')
			: ' && chmod +x ' + saveExePath;

		return downloadCommand + ' && ' + renameFileCommand + ' ' + setExecutableCommand;
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

		if (!IsSupportedSystem) {
			outputError(nowText() + 'Sorry, "' + process.platform + ' platform" is not supported yet: Support 64-bit + 32-bit : Windows + Linux (Ubuntu / CentOS / Fedora which gcc/g++ version >= 4.8).');
			outputError(nowText() + 'https://github.com/qualiu/vscode-msr/blob/master/README.md');
			return false;
		}

		[this.isMsrToolExists, this.MsrExePath] = isToolExistsInPath('msr', this.terminalType);

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
			outputKeyInfo('\n' + nowText() + 'Will try to download the tiny tool "' + sourceExeName + '" by command:');
			const downloadCommand = this.getDownloadCommand(exeName64bit);
			outputKeyInfo(downloadCommand);
			const saveFolder = path.dirname(tmpSaveExePath);
			try {
				if (saveFolder !== '~' && !fs.existsSync(saveFolder)) {
					fs.mkdirSync(saveFolder);
				}
			} catch (err) {
				outputError('\`n' + nowText() + 'Failed to create save folder: ' + saveFolder + ' for ' + sourceExeName);
				// return [false, ''];
			}

			try {
				let output = ChildProcess.execSync(downloadCommand).toString();
				outputKeyInfo(output);
			} catch (err) {
				outputError('\n' + nowText() + 'Failed to download ' + sourceExeName + ' : ' + err);
				outputError('\n' + nowText() + 'Please manually download ' + sourceExeName + ' and add its folder to ' + PathEnvName + ': ' + this.getDownloadUrl(sourceExeName));
				outputError('\n' + nowText() + '如果在中国无法从github下载 ' + sourceExeName + ' 可从另两处试下载：https://gitee.com/qualiu/msr/tree/master/tools 或者 https://sourceforge.net/projects/avasattva/files/');
				return [false, ''];
			}

			if (!fs.existsSync(targetExePath)) {
				outputError(nowText() + 'Downloading completed but not found tmp tool "' + sourceExeName + '": ' + targetExePath);
				return [false, ''];
			} else {
				outputKeyInfo(nowText() + 'Successfully downloaded tmp tool "' + sourceExeName + '": ' + targetExePath);
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

	private checkToolNewVersion() {
		if (this.MsrExePath.length < 1) {
			return;
		}

		if (!IsDebugMode) {
			const now = new Date();
			const hour = now.getHours();
			if (now.getDay() !== 2 || hour < 8 || hour > 12) {
				outputDebug(nowText() + 'Skip checking for now. Only check at every Tuesday 09:00 ~ 11:00.');
				return;
			}
		}

		if (!isNullOrEmpty(SourceMd5Text)) {
			this.compareToolVersions(SourceMd5Text, new Date());
			return;
		}

		const trackCheckBeginTime = new Date();
		const checker = this;
		const request = https.get(SourceMd5FileUrl, function (response) {
			response.on('data', function (data) {
				if (data) {
					const sourceMd5Lines = data.toString();
					if (!isNullOrEmpty(sourceMd5Lines)) {
						SourceMd5Text = sourceMd5Lines;
					}
					checker.compareToolVersions(sourceMd5Lines, trackCheckBeginTime);
				}
			});
		});

		request.end();

		request.on('error', (err) => {
			outputDebug(nowText() + 'Failed to read source md5 from ' + SourceMd5FileUrl + '. Cost ' + getTimeCostToNow(trackCheckBeginTime) + ' seconds. Error: ' + err.message);
		});
	}

	private compareToolVersions(allMd5Text: string, trackCheckBeginTime: Date) {
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
				outputError(nowText() + 'Cannot match source MD5 text with Regex: "' + this.MatchExeMd5Regex.source + '" , remained text = ' + allMd5Text);
				break;
			}

			foundCount++;
			allMd5Text = allMd5Text.substring(matchInfo.index + matchInfo[0].length);
			const latestMd5 = matchInfo[1];
			const exeName64bit = matchInfo[2];
			const sourceExeName = this.getSourceExeName(exeName64bit);
			const currentMd5 = currentExeNameToMd5Map.get(exeName64bit) || '';
			if (currentMd5.toLowerCase() !== latestMd5.toLowerCase()) {
				oldExeNames.add(sourceExeName);
				outputKeyInfo(nowText() + 'Found new version of ' + sourceExeName + ' which md5 = ' + latestMd5 + ' , source-info = ' + SourceMd5FileUrl);
				outputKeyInfo(nowText() + 'Current ' + sourceExeName + ' md5 = ' + currentMd5 + ' , path = ' + exeName64bitToPathMap.get(exeName64bit));
			} else {
				outputDebug(nowText() + 'Great! Your ' + sourceExeName + ' is latest! md5 = ' + latestMd5 + ' , exe = ' + exeName64bitToPathMap.get(exeName64bit) + ' , sourceMD5 = ' + SourceMd5FileUrl);
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
				const downloadCommand = this.getDownloadCommand(exeName64bit, currentExeSavePath);
				outputKeyInfo(downloadCommand + '\n');
			});
		}

		outputDebug(nowText() + 'Finished to check tool versions. Cost ' + getTimeCostToNow(trackCheckBeginTime) + ' seconds.');
	}
}
