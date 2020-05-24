import path = require('path');
import fs = require('fs');
import https = require('https');
import crypto = require('crypto');
import ChildProcess = require('child_process');
import { HomeFolder, IsDebugMode, IsSupportedSystem, IsWindows } from './constants';
import { clearOutputChannel, outputDebug, outputError, outputInfo, outputKeyInfo } from './outputUtils';
import { isNullOrEmpty, quotePaths } from './utils';

let isToolExists = false;

export let MsrExe = 'msr';
export let MsrExePath: string = '';

const SourceMd5FileUrl = 'https://raw.githubusercontent.com/qualiu/msr/master/tools/md5.txt';
const WhereCmd = IsWindows ? 'where' : 'whereis';
const PathEnvName = IsWindows ? '%PATH%' : '$PATH';

const Is64BitOS = process.arch.match(/x64|\s+64/);
const ExeExtension = IsWindows ? '.exe' : '.gcc48';
const SourceExeHomeUrl = 'https://github.com/qualiu/msr/raw/master/tools/';
const ExeNameTail = Is64BitOS ? '' : (IsWindows ? '-Win32' : '-i386');

function getSourceExeName(exeName64bit: string): string {
	return exeName64bit + ExeNameTail + ExeExtension;
}

function getRegexToMatchSourceExeMd5(exeName64bit: string): RegExp {
	return new RegExp('^(\\S+)\\s+' + getSourceExeName(exeName64bit).replace(/^(\w+)/, '($1)') + '\\s*$', 'm');
}

const MatchMsrExeMd5Regex = getRegexToMatchSourceExeMd5('msr');
const MatchExeMd5Regex = new RegExp('^(\\S+)\\s+(msr|nin)' + ExeNameTail + ExeExtension + '\\s*$', 'm');

function getDownloadUrl(sourceExeName: string): string {
	return SourceExeHomeUrl + sourceExeName; //+ '?raw=true';
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

	const downloadCommand = IsWindows
		? 'Powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; '
		+ "Invoke-WebRequest -Uri '" + sourceUrl + "' -OutFile '" + tmpSaveExePath + '.tmp' + "'" + '"'
		: 'wget "' + sourceUrl + '" -O "' + tmpSaveExePath + '.tmp"';

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
export function checkSearchToolExists(forceCheck: boolean = false, clearOutputBeforeWarning: boolean = true): boolean {
	if (isToolExists && !forceCheck) {
		return true;
	}

	if (!IsSupportedSystem) {
		outputError('Sorry, "' + process.platform + ' platform" is not supported yet: Support 64-bit + 32-bit : Windows + Linux (Ubuntu / CentOS / Fedora which gcc/g++ version >= 4.8).');
		outputError('https://github.com/qualiu/vscode-msr/blob/master/README.md');
		return false;
	}

	[isToolExists, MsrExePath] = isToolExistsInPath('msr');

	if (!isToolExists) {
		if (clearOutputBeforeWarning) {
			clearOutputChannel();
		}

		outputError('Not found `msr` in ' + PathEnvName + ' by checking command: ' + WhereCmd + ' msr');
		outputError('Please download it (just copy + paste the command line) follow: https://github.com/qualiu/vscode-msr/blob/master/README.md#more-freely-to-use-and-help-you-more');

		[isToolExists, MsrExePath] = autoDownloadTool('msr');
	}

	if (isToolExists) {
		checkToolNewVersion();
	}

	return isToolExists;
}

function isToolExistsInPath(exeToolName: string): [boolean, string] {
	const whereCmd = (IsWindows ? 'where' : 'whereis') + ' ' + exeToolName;
	try {
		let output = ChildProcess.execSync(whereCmd).toString();
		if (IsWindows) {
			const exePaths = output.split(/[\r\n]+/).filter(a => !/cygwin/i.test(a) && new RegExp('\\b' + exeToolName + '\\.\\w+$', 'i').test(a));
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
		outputDebug(err.toString());
	}

	return [false, ''];
}

function autoDownloadTool(exeName64bit: string): [boolean, string] {
	const tmpSaveExePath = getTmpSaveExePath(exeName64bit);
	const sourceExeName = getSourceExeName(exeName64bit);
	if (!fs.existsSync(tmpSaveExePath)) {
		outputKeyInfo('\n' + 'Will try to download the only one tiny tool by command:');
		const downloadCommand = getDownloadCommand(exeName64bit);
		outputKeyInfo(downloadCommand);
		try {
			let output = ChildProcess.execSync(downloadCommand).toString();
			outputKeyInfo(output);
		} catch (err) {
			outputError('\n' + 'Failed to download tool: ' + err);
			outputError('\n' + 'Please manually download the tool and add its folder to ' + PathEnvName + ': ' + getDownloadUrl(sourceExeName));
			return [false, ''];
		}

		if (!fs.existsSync(tmpSaveExePath)) {
			outputError('Downloading completed but not found tmp tool: ' + tmpSaveExePath);
			return [false, ''];
		} else {
			outputKeyInfo('Successfully downloaded tmp tool: ' + tmpSaveExePath);
		}
	} else {
		outputInfo('Found existing tmp tool: ' + tmpSaveExePath + ' , skip downloading.');
	}

	addTmpExeToPath(exeName64bit);
	return [true, tmpSaveExePath];
}

function addTmpExeToPath(exeName64bit: string) {
	const saveExeName = getSaveExeName(exeName64bit);
	const tmpSaveExePath = getTmpSaveExePath(exeName64bit);
	if (exeName64bit === 'msr') {
		MsrExe = tmpSaveExePath;
		MsrExePath = tmpSaveExePath;
	}

	const exeFolder = path.parse(tmpSaveExePath).dir;
	const oldPathValue = process.env['PATH'] || (IsWindows ? '%PATH%' : '$PATH');
	const paths = oldPathValue.split(IsWindows ? ';' : ':');
	const trimTailRegex = IsWindows ? new RegExp('[\\s\\\\]+$') : new RegExp('/$');
	const foundFolders = IsWindows
		? paths.filter(a => a.trim().replace(trimTailRegex, '').toLowerCase() === exeFolder.toLowerCase())
		: paths.filter(a => a.replace(trimTailRegex, '') === exeFolder);

	if (foundFolders.length < 1) {
		process.env['PATH'] = oldPathValue + (IsWindows ? ';' : ':') + exeFolder;
		outputKeyInfo('Temporarily added ' + saveExeName + ' folder: ' + exeFolder + ' to ' + PathEnvName);
		outputKeyInfo('Suggest that add the folder to ' + PathEnvName + ' to freely use/call `msr` everywhere (you can also copy/move "' + MsrExePath + '" to a folder already in ' + PathEnvName + ').');
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
			return;
		}
	}

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
					if (currentMsrMd5.toLowerCase() !== latestMd5.toLowerCase()) {
						oldExeNames.add(exeName64bit);
						outputKeyInfo('Found new version of ' + exeName64bit + ' which md5 = ' + latestMd5 + ' , currentMd5 = ' + currentMsrMd5 + ' , source-info = ' + SourceMd5FileUrl);
					} else {
						outputDebug('Great! Your `msr` exe is latest! md5 = ' + latestMd5 + ' , exe = ' + exeName64bitToPathMap.get(exeName64bit) + ' , sourceMD5 = ' + SourceMd5FileUrl);
					}
				}

				if (oldExeNames.size > 0) {
					outputKeyInfo('\n' + 'You can download + update ' + Array.from(oldExeNames).join(' + ') + ' by command line below:');
					oldExeNames.forEach(exeName => {
						const currentExeSavePath = exeName64bitToPathMap.get(exeName);
						const downloadCommand = getDownloadCommand(exeName, currentExeSavePath);
						outputKeyInfo(downloadCommand + '\n');
					});
				}
			}
		});
	});

	request.end();

	request.on('error', (err) => {
		outputDebug('Failed to read source md5 from ' + SourceMd5FileUrl + ': ' + err.message);
	});
}

function getFileMd5(filePath: string) {
	const hash = crypto.createHash('md5');
	const content = fs.readFileSync(filePath, { encoding: '' });
	const md5 = hash.update(content).digest('hex');
	return md5;
}

export function checkAndDownloadTool(exeName64bit: string): [boolean, string] {
	const [isExisted, ninExePath] = isToolExistsInPath(exeName64bit);
	outputDebug((isExisted ? 'Found nin = ' + ninExePath : 'Not found nin, will download it.'));
	if (isExisted) {
		return [isExisted, ninExePath];
	}

	return autoDownloadTool(exeName64bit);
}
