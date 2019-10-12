import path = require('path');
import fs = require('fs');
import https = require('https');
import crypto = require('crypto');
import ChildProcess = require('child_process');
import { outputError, clearOutputChannel, outputInfo, outputDebug } from './outputUtils';
import { replaceText, quotePaths } from './utils';
import { IsWindows, HomeFolder, IsSupportedSystem, IsDebugMode } from './constants';

let isToolExists = false;

export let MsrExe = 'msr';
let MsrExePath: string = '';

const SourceMd5FileUrl = 'https://raw.githubusercontent.com/qualiu/msr/master/tools/md5.txt';

const WhereCmd = IsWindows ? 'where' : 'whereis';
const PathEnvName = IsWindows ? '%PATH%' : '$PATH';

const Is64BitOS = process.arch.match(/x64|\s+64/);
const MsrExtension = IsWindows ? '.exe' : '.gcc48';
const MsrExeSourceName = (Is64BitOS ? 'msr' : (IsWindows ? 'msr-Win32' : 'msr-i386')) + MsrExtension;
const MsrSaveName = IsWindows ? 'msr.exe' : 'msr';

const TmpMsrExePath = path.join(HomeFolder, MsrSaveName);

const SourceExeUrl = 'https://github.com/qualiu/msr/raw/master/tools/' + MsrExeSourceName; //+ '?raw=true';
const MatchExeMd5Regex = new RegExp('^(\\S+)\\s+' + MsrExeSourceName + '\\s*$', 'm');

const [IsExistIcacls, _] = IsWindows ? isToolExistsInPath('icacls') : [false, ''];
const SetExecutableForWindows = IsExistIcacls ? ' && icacls "' + TmpMsrExePath + '" /grant %USERNAME%:RX' : '';

const RenameFileSetExecutableCmd = IsWindows
	? 'move /y "' + TmpMsrExePath + '.tmp" "' + TmpMsrExePath + '"' + SetExecutableForWindows
	: 'mv -f "' + TmpMsrExePath + '.tmp" "' + TmpMsrExePath + '" ' + ' && chmod +x "' + TmpMsrExePath + '"';

const WindowsDownloadCmd = 'Powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; '
	+ "Invoke-WebRequest -Uri '" + SourceExeUrl + "' -OutFile '" + TmpMsrExePath + '.tmp' + "'" + '" && ' + RenameFileSetExecutableCmd;

const LinuxDownloadCmd = 'wget "' + SourceExeUrl + '" -O "' + TmpMsrExePath + '.tmp" && ' + RenameFileSetExecutableCmd;

const DownloadCommand = IsWindows ? WindowsDownloadCmd : LinuxDownloadCmd;

export function toRunnableToolPath(commandLine: string) {
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
		outputError('Please take less than 1 minute (you can just copy + paste the command line to download it) follow: https://github.com/qualiu/vscode-msr/blob/master/README.md#more-freely-to-use-and-help-you-more');

		isToolExists = autoDownloadTool();
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

function autoDownloadTool(): boolean {
	if (!fs.existsSync(TmpMsrExePath)) {
		outputInfo('Will try to download the only one tiny tool by command:');
		outputInfo(DownloadCommand);
		try {
			let output = ChildProcess.execSync(DownloadCommand).toString();
			outputInfo(output);
		} catch (err) {
			outputError('\n' + 'Failed to download tool: ' + err);
			outputError('\n' + 'Please manually download the tool and add its folder to ' + PathEnvName + ': ' + SourceExeUrl);
			return false;
		}

		if (!fs.existsSync(TmpMsrExePath)) {
			outputError('Downloading completed but not found tmp tool: ' + TmpMsrExePath);
			return false;
		} else {
			outputInfo('Successfully downloaded tmp tool: ' + TmpMsrExePath);
		}
	} else {
		outputInfo('Found existing tmp tool: ' + TmpMsrExePath + ' , skip downloading.');
	}

	addTmpExeToPath();
	return true;
}

function addTmpExeToPath() {
	MsrExe = TmpMsrExePath;
	MsrExePath = TmpMsrExePath;

	const exeFolder = path.parse(TmpMsrExePath).dir;
	const oldPathValue = process.env['PATH'] || (IsWindows ? '%PATH%' : '$PATH');
	const paths = oldPathValue.split(IsWindows ? ';' : ':');
	const trimTailRegex = IsWindows ? new RegExp('[\\s\\\\]+$') : new RegExp('/$');
	const foundFolders = IsWindows
		? paths.filter(a => a.trim().replace(trimTailRegex, '').toLowerCase() === exeFolder.toLowerCase())
		: paths.filter(a => a.replace(trimTailRegex, '') === exeFolder);

	if (foundFolders.length < 1) {
		process.env['PATH'] = oldPathValue + (IsWindows ? ';' : ':') + exeFolder;
		outputInfo('Temporarily added tool ' + MsrSaveName + ' folder: ' + exeFolder + ' to ' + PathEnvName);
		outputInfo('Suggest permanently add exe folder to ' + PathEnvName + ' to freely use it by name `msr` everywhere.');
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

	const currentMd5 = getFileMd5(MsrExePath);

	const request = https.get(SourceMd5FileUrl, function (response) {
		response.on('data', function (data) {
			if (data) {
				const sourceText = data.toString();
				const latestMd5Match = MatchExeMd5Regex.exec(sourceText);
				if (latestMd5Match) {
					const md5 = latestMd5Match[1];
					if (currentMd5.toLowerCase() !== md5.toLowerCase()) {
						outputInfo('Found new version of `msr` which md5 = ' + md5 + ' , currentMd5 = ' + currentMd5 + ' , source-info = ' + SourceMd5FileUrl);
						outputInfo('You can download + update the exe by 1 command below:');
						outputInfo(replaceText(DownloadCommand, TmpMsrExePath, MsrExePath));
					} else {
						outputDebug('Great! Your `msr` exe is latest! md5 = ' + md5 + ' , exe = ' + MsrExePath + ' , sourceMD5 = ' + SourceMd5FileUrl);
					}
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
