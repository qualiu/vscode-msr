import path = require('path');
import fs = require('fs');
import https = require('https');
import crypto = require('crypto');
import ChildProcess = require('child_process');
import { HomeFolder, IsDebugMode, IsSupportedSystem, IsWindows } from './constants';
import { TerminalType } from './enums';
import { clearOutputChannel, outputDebug, outputError, outputInfo, outputKeyInfo } from './outputUtils';
import { getTimeCostToNow, isNullOrEmpty, nowText, quotePaths, toOsPaths } from './utils';

let isMsrToolExists = false;

export const MsrExe = 'msr';
export let MsrExePath: string = '';
let ToolNameToPathMap = new Map<string, string>();

const SourceMd5FileUrl = 'https://raw.githubusercontent.com/qualiu/msr/master/tools/md5.txt';
const WhereCmd = IsWindows ? 'where' : 'whereis';
const PathEnvName = IsWindows ? '%PATH%' : '$PATH';

const Is64BitOS = process.arch.match(/x64|\s+64/);
const ExeExtension = IsWindows ? '.exe' : '.gcc48';
const SourceExeHomeUrl = 'https://raw.githubusercontent.com/qualiu/msr/master/tools/';
const ExeNameTail = Is64BitOS ? '' : (IsWindows ? '-Win32' : '-i386');

export const TerminalTypeToMsrExeMap = new Map<TerminalType, string>()
	.set(TerminalType.CMD, 'msr.exe')
	.set(TerminalType.PowerShell, 'msr.exe')
	.set(TerminalType.MinGWBash, 'msr.exe')
	.set(TerminalType.CygwinBash, 'msr.cygwin')
	.set(TerminalType.LinuxBash, 'msr.gcc48')
	.set(TerminalType.WslBash, 'msr.gcc48')
	;

export function getDownloadCommandForNewTerminal(terminalType: TerminalType, exeName64bit: string = 'msr'): string {
	// others have already checked and downloaded.
	if (TerminalType.CygwinBash !== terminalType && TerminalType.WslBash !== terminalType) {
		return '';
	}

	const extension = path.extname(TerminalTypeToMsrExeMap.get(terminalType) || '.gcc48');

	const pureDownloadCmd = 'wget ' + SourceExeHomeUrl + exeName64bit + extension + ' -O ~/' + exeName64bit + '.tmp --quiet --no-check-certificate'
		+ ' && mv -f ~/' + exeName64bit + '.tmp ~/' + exeName64bit
		+ ' && chmod +x ~/' + exeName64bit + ' && export PATH=~/:$PATH';

	const firstCheck = 'whereis ' + exeName64bit + ' | egrep -e "/' + exeName64bit + '\\s+"';

	const lastCheck = '(ls -al ~/' + exeName64bit + ' 2>/dev/null | egrep -e "^-[rw-]*?x.*?/' + exeName64bit + '\\s*$" || ( ' + pureDownloadCmd + ' ) )';
	const downloadCmd = firstCheck + ' || ' + lastCheck;
	return downloadCmd;
}

export function GetSetToolEnvCommand(terminalType: TerminalType, addTailTextIfNotEmpty: string = ''): string {
	if (ToolNameToPathMap.size < 1) {
		return '';
	}
	if (terminalType !== TerminalType.CMD && terminalType !== TerminalType.PowerShell && terminalType !== TerminalType.LinuxBash && TerminalType.MinGWBash !== terminalType) {
		return '';
	}

	let toolFolderSet = new Set<string>();
	ToolNameToPathMap.forEach((value, key, _m) => {
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
			return 'export PATH=$PATH:' + toolFolders.join(':').replace(' ', '\\ ') + addTailTextIfNotEmpty;
		// case TerminalType.CygwinBash:
		// return 'export PATH=$HOME/Desktop/:' + toolFolders.join(':') + ':$PATH' + addTailTextIfNotEmpty;
		// case TerminalType.WslBash:
		// 	return 'export PATH=' + toolFolders.join(':') + ':' + '$PATH' + addTailTextIfNotEmpty;
	}
}

function getSourceExeName(exeName64bit: string): string {
	return exeName64bit + ExeNameTail + ExeExtension;
}

function getRegexToMatchSourceExeMd5(exeName64bit: string): RegExp {
	return new RegExp('^(\\S+)\\s+' + getSourceExeName(exeName64bit).replace(/^(\w+)/, '($1)') + '\\s*$', 'm');
}

const MatchMsrExeMd5Regex = getRegexToMatchSourceExeMd5('msr');
const MatchExeMd5Regex = new RegExp('^(\\S+)\\s+(msr|nin)' + ExeNameTail + ExeExtension + '\\s*$', 'm');

function getDownloadUrl(sourceExeName: string): string {
	return SourceExeHomeUrl + sourceExeName;
}

function getSaveExeName(exeName64bit: string) {
	return IsWindows ? exeName64bit + '.exe' : exeName64bit;
}

function getTmpSaveExePath(exeName64bit: string): string {
	const saveExeName = getSaveExeName(exeName64bit);
	return path.join(HomeFolder, saveExeName);
}

function getDownloadCommand(exeName64bit: string, saveExePath: string = ''): string {
	const sourceExeName = getSourceExeName(exeName64bit);
	const sourceUrl = getDownloadUrl(sourceExeName);
	const [IsExistIcacls, _] = IsWindows ? isToolExistsInPath('icacls') : [false, ''];
	const tmpSaveExePath = getTmpSaveExePath(exeName64bit);

	if (isNullOrEmpty(saveExePath)) {
		saveExePath = tmpSaveExePath;
	}

	const [isWgetExistsOnWindows, wgetPath] = IsWindows ? isToolExistsInPath('wget.exe') : [false, ''];

	const downloadCommand = IsWindows && !isWgetExistsOnWindows
		? 'Powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; '
		+ "Invoke-WebRequest -Uri '" + sourceUrl + "' -OutFile '" + tmpSaveExePath + '.tmp' + "'" + '"'
		: 'wget "' + sourceUrl + '" -O "' + tmpSaveExePath + '.tmp" --quiet --no-check-certificate';

	const renameFileCommand = IsWindows
		? 'move /y "' + tmpSaveExePath + '.tmp" "' + saveExePath + '"'
		: 'mv -f "' + tmpSaveExePath + '.tmp" "' + saveExePath + '"';

	const setExecutableCommand = IsWindows
		? (IsExistIcacls ? ' && icacls "' + saveExePath + '" /grant %USERNAME%:RX' : '')
		: ' && chmod +x "' + saveExePath + '"';

	return downloadCommand + ' && ' + renameFileCommand + ' ' + setExecutableCommand;
}

export function toRunnableToolPath(commandLine: string) {
	const TmpMsrExePath = getTmpSaveExePath('msr');
	if (MsrExePath === TmpMsrExePath) {
		return quotePaths(TmpMsrExePath) + commandLine.replace(/^msr\s+/, ' ');
	} else {
		return commandLine;
	}
}

// Always check tool exists if not exists in previous check, avoid need reloading.
export function checkSearchToolExists(forceCheck: boolean = false, clearOutputBeforeWarning: boolean = false): boolean {
	if (isMsrToolExists && !forceCheck) {
		return true;
	}

	if (!IsSupportedSystem) {
		outputError(nowText() + 'Sorry, "' + process.platform + ' platform" is not supported yet: Support 64-bit + 32-bit : Windows + Linux (Ubuntu / CentOS / Fedora which gcc/g++ version >= 4.8).');
		outputError(nowText() + 'https://github.com/qualiu/vscode-msr/blob/master/README.md');
		return false;
	}

	[isMsrToolExists, MsrExePath] = isToolExistsInPath('msr');

	if (!isMsrToolExists) {
		if (clearOutputBeforeWarning) {
			clearOutputChannel();
		}

		outputError(nowText() + 'Not found `msr` in ' + PathEnvName + ' by checking command: ' + WhereCmd + ' msr');
		outputError(nowText() + 'Please download it (just copy + paste the command line) follow: https://github.com/qualiu/vscode-msr/blob/master/README.md#more-freely-to-use-and-help-you-more');

		[isMsrToolExists, MsrExePath] = autoDownloadTool('msr');
	}

	if (isMsrToolExists) {
		outputDebug(nowText() + 'Found msr = ' + MsrExePath + ' , will check new version ...');
		checkToolNewVersion();
	}

	return isMsrToolExists;
}

function isToolExistsInPath(exeToolName: string): [boolean, string] {
	const whereCmd = (IsWindows ? 'where' : 'whereis') + ' ' + exeToolName;
	try {
		let output = ChildProcess.execSync(whereCmd).toString();
		if (IsWindows) {
			const exePaths = /\.exe$/i.test(exeToolName)
				? output.split(/[\r\n]+/)
				: output.split(/[\r\n]+/).filter(a => !/cygwin/i.test(a) && new RegExp('\\b' + exeToolName + '\\.\\w+$', 'i').test(a));
			if (exePaths.length > 0) {
				return [true, exePaths[0]];
			}
		} else {
			const exeMatch = new RegExp('(\\S+/' + exeToolName + ')(\\s+|$)').exec(output);
			if (exeMatch) {
				return [true, exeMatch[1]];
			}
		}
	} catch (err) {
		outputDebug(nowText() + err.toString());
	}

	return [false, ''];
}

function autoDownloadTool(exeName64bit: string): [boolean, string] {
	const tmpSaveExePath = getTmpSaveExePath(exeName64bit);
	const sourceExeName = getSourceExeName(exeName64bit);
	if (!fs.existsSync(tmpSaveExePath)) {
		outputKeyInfo('\n' + nowText() + 'Will try to download the tiny tool `' + exeName64bit + '` by command:');
		const downloadCommand = getDownloadCommand(exeName64bit);
		outputKeyInfo(downloadCommand);
		try {
			const saveFolder = path.dirname(tmpSaveExePath);
			if (!fs.existsSync(saveFolder)) {
				fs.mkdirSync(saveFolder);
			}

			let output = ChildProcess.execSync(downloadCommand).toString();
			outputKeyInfo(output);
		} catch (err) {
			outputError('\n' + nowText() + 'Failed to download `' + exeName64bit + '`: ' + err);
			outputError('\n' + nowText() + 'Please manually download `' + exeName64bit + '` and add its folder to ' + PathEnvName + ': ' + getDownloadUrl(sourceExeName));
			return [false, ''];
		}

		if (!fs.existsSync(tmpSaveExePath)) {
			outputError(nowText() + 'Downloading completed but not found tmp tool `' + exeName64bit + '`: ' + tmpSaveExePath);
			return [false, ''];
		} else {
			outputKeyInfo(nowText() + 'Successfully downloaded tmp tool `' + exeName64bit + '`: ' + tmpSaveExePath);
		}
	} else {
		outputInfo(nowText() + 'Found existing tmp tool `' + exeName64bit + '`: ' + tmpSaveExePath + ' , skip downloading.');
	}

	addTmpExeToPath(exeName64bit);
	return [true, tmpSaveExePath];
}

function addTmpExeToPath(exeName64bit: string) {
	const saveExeName = getSaveExeName(exeName64bit);
	const tmpSaveExePath = getTmpSaveExePath(exeName64bit);
	if (exeName64bit === 'msr') {
		MsrExePath = tmpSaveExePath;
		ToolNameToPathMap.set('msr', tmpSaveExePath);
	} else if (exeName64bit === 'nin') {
		ToolNameToPathMap.set('nin', tmpSaveExePath);
	}

	const exeFolder = path.dirname(tmpSaveExePath);
	const oldPathValue = process.env['PATH'] || (IsWindows ? '%PATH%' : '$PATH');
	const paths = oldPathValue.split(IsWindows ? ';' : ':');
	const trimTailRegex = IsWindows ? new RegExp('[\\s\\\\]+$') : new RegExp('/$');
	const foundFolders = IsWindows
		? paths.filter(a => a.trim().replace(trimTailRegex, '').toLowerCase() === exeFolder.toLowerCase())
		: paths.filter(a => a.replace(trimTailRegex, '') === exeFolder);

	if (foundFolders.length < 1) {
		process.env['PATH'] = oldPathValue + (IsWindows ? ';' : ':') + exeFolder;
		outputKeyInfo(nowText() + 'Temporarily added ' + saveExeName + ' folder: ' + exeFolder + ' to ' + PathEnvName);
		outputKeyInfo(nowText() + 'Suggest that add the folder to ' + PathEnvName + ' to freely use/call `msr` everywhere (you can also copy/move "' + tmpSaveExePath + '" to a folder already in ' + PathEnvName + ').');
	}
}

function checkToolNewVersion() {
	if (MsrExePath.length < 1) {
		return;
	}

	if (!IsDebugMode) {
		const now = new Date();
		const hour = now.getHours();
		if (now.getDay() !== 2 || hour < 9 || hour > 11) {
			outputDebug(nowText() + 'Skip checking for now. Only check at every Tuesday 09:00 ~ 11:00.');
			return;
		}
	}

	const trackCheckBeginTime = new Date();

	const request = https.get(SourceMd5FileUrl, function (response) {
		response.on('data', function (data) {
			if (data) {
				let sourceText: string = data.toString();
				const [hasMin, ninExePath] = isToolExistsInPath('nin');

				const currentMsrMd5 = getFileMd5(MsrExePath);
				let currentExeNameToMd5Map = new Map<string, string>().set('msr', currentMsrMd5);
				let exeName64bitToPathMap = new Map<string, string>().set('msr', MsrExePath);
				if (hasMin) {
					currentExeNameToMd5Map.set('nin', getFileMd5(ninExePath));
					exeName64bitToPathMap.set('nin', ninExePath);
				}

				let oldExeNames = new Set<string>();
				const matchingRegex = hasMin ? MatchExeMd5Regex : MatchMsrExeMd5Regex;
				while (true) {
					const matchInfo = matchingRegex.exec(sourceText);
					if (!matchInfo) {
						break;
					}

					sourceText = sourceText.substring(matchInfo.index + matchInfo[0].length);

					const latestMd5 = matchInfo[1];
					const exeName64bit = matchInfo[2];
					const currentMd5 = currentExeNameToMd5Map.get(exeName64bit) || '';
					if (currentMd5.toLowerCase() !== latestMd5.toLowerCase()) {
						oldExeNames.add(exeName64bit);
						outputKeyInfo(nowText() + 'Found new version of `' + exeName64bit + '` which md5 = ' + latestMd5 + ' , source-info = ' + SourceMd5FileUrl);
						outputKeyInfo(nowText() + 'Current `' + exeName64bit + '` md5 = ' + currentMd5 + ' , path = ' + exeName64bitToPathMap.get(exeName64bit));
					} else {
						outputDebug(nowText() + 'Great! Your `' + exeName64bit + '` exe is latest! md5 = ' + latestMd5 + ' , exe = ' + exeName64bitToPathMap.get(exeName64bit) + ' , sourceMD5 = ' + SourceMd5FileUrl);
					}
				}

				if (oldExeNames.size > 0) {
					outputKeyInfo('\n' + nowText() + 'You can download + update `' + Array.from(oldExeNames).join(' + ') + '` by command line below:');
					oldExeNames.forEach(exeName => {
						const currentExeSavePath = exeName64bitToPathMap.get(exeName);
						const downloadCommand = getDownloadCommand(exeName, currentExeSavePath);
						outputKeyInfo(downloadCommand + '\n');
					});
				}

				outputDebug(nowText() + 'Finished to check tool versions. Cost ' + getTimeCostToNow(trackCheckBeginTime) + ' seconds.');
			}
		});
	});

	request.end();

	request.on('error', (err) => {
		outputDebug(nowText() + 'Failed to read source md5 from ' + SourceMd5FileUrl + '. Cost ' + getTimeCostToNow(trackCheckBeginTime) + ' seconds. Error: ' + err.message);
	});
}

function getFileMd5(filePath: string) {
	const hash = crypto.createHash('md5');
	const content = fs.readFileSync(filePath, { encoding: '' });
	const md5 = hash.update(content).digest('hex');
	return md5;
}

export function checkAndDownloadTool(exeName64bit: string): [boolean, string] {
	const [isExisted, exePath] = isToolExistsInPath(exeName64bit);
	outputDebug(nowText() + (isExisted ? 'Found ' + exeName64bit + ' = ' + exePath : 'Not found ' + exeName64bit + ', will download it.'));
	if (isExisted) {
		return [isExisted, exePath];
	}

	return autoDownloadTool(exeName64bit);
}
