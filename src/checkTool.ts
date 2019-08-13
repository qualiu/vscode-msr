'use strict';

import path = require('path');
import fs = require('fs');
import https = require('https');
import crypto = require('crypto');
import ChildProcess = require('child_process');
import { outputError, clearOutputChannel, outputInfo, outputDebug } from './outputUtils';
import { ShouldQuotePathRegex, IsDebugMode } from './dynamicConfig';
import { replaceText } from './utils';

let isToolExists = false;

export let MsrExe = 'msr';
let MsrExePath: string = '';

const SourceMd5FileUrl = 'https://raw.githubusercontent.com/qualiu/msr/master/tools/md5.txt';

export const IsWindows = /(win32|windows)/i.test(process.platform);
const WhereCmd = IsWindows ? 'where' : 'whereis';
const PathEnvName = IsWindows ? '%PATH%' : '$PATH';

const Is64BitOS = process.arch.match(/x64|\s+64/);
const MsrExtension = IsWindows ? '.exe' : '.gcc48';
const MsrExeSourceName = (Is64BitOS ? 'msr' : (IsWindows ? 'msr-Win32' : 'msr-i386')) + MsrExtension;
const MsrSaveName = IsWindows ? 'msr.exe' : 'msr';

const TmpMsrExePath = IsWindows
	? path.join(process.env['USERPROFILE'] || '', 'Desktop', MsrSaveName)
	: path.join(process.env['HOME'] || '', MsrSaveName);

const SourceExeUrl = 'https://github.com/qualiu/msr/blob/master/tools/' + MsrExeSourceName + '?raw=true';
const MatchExeMd5Regex = new RegExp('^(\\S+)\\s+' + MsrExeSourceName + '\\s*$', 'm');

const [IsExistIcacls, _] = IsWindows ? isToolExistsInPath('icacls') : [false, ''];
const SetExecutableForWindows = IsExistIcacls ? ' && icacls "' + TmpMsrExePath + '" /grant %USERNAME%:RX' : '';
const WindowsDownloadCmd = 'Powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; '
	+ "Invoke-WebRequest -Uri '" + SourceExeUrl + "' -OutFile '" + TmpMsrExePath + '.tmp' + "'" + '"'
	+ ' && move /y "' + TmpMsrExePath + '.tmp" "' + TmpMsrExePath + '"'
	+ SetExecutableForWindows;

const LinuxDownloadCmd = 'wget "' + SourceExeUrl + '" -O "' + TmpMsrExePath + '.tmp"'
	+ ' && mv -f "' + TmpMsrExePath + '.tmp" "' + TmpMsrExePath + '" '
	+ ' && chmod +x "' + TmpMsrExePath + '"';

const DownloadCommand = IsWindows ? WindowsDownloadCmd : LinuxDownloadCmd;

// Always check tool exists if not exists in previous check, avoid need reloading.
export function checkSearchToolExists(forceCheck: boolean = false, clearOutputBeforeWarning: boolean = true): boolean {
	if (isToolExists && !forceCheck) {
		return true;
	}

	[isToolExists, MsrExePath] = isToolExistsInPath('msr');

	if (!isToolExists) {
		if (clearOutputBeforeWarning) {
			clearOutputChannel();
		}

		outputError('Not found `msr` in ' + PathEnvName + ' by checking command: ' + WhereCmd + ' msr');
		outputError('Please take less than 1 minute (you can just copy + paste the command line to download it) follow: https://github.com/qualiu/vscode-msr/blob/master/README.md#Requirements');

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
			const exeMatch = new RegExp('(\\S+/' + exeToolName + ') \\s+').exec(output);
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
			outputError('Failed to download tool: ' + err);
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

	MsrExe = TmpMsrExePath;
	MsrExePath = TmpMsrExePath;

	const exeFolder = path.parse(TmpMsrExePath).dir;
	const oldPathValue = process.env['PATH'] || '';
	if (oldPathValue.indexOf(exeFolder) < 0) {
		process.env['PATH'] = oldPathValue + (IsWindows ? ';' : ':') + exeFolder;
		outputInfo('Temporarily added tool ' + MsrSaveName + ' folder: ' + exeFolder + ' to ' + PathEnvName);
		outputInfo('Suggest permanently add exe folder to ' + PathEnvName + ' to freely use it by name `msr` everywhere.');
	}

	return true;
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
						outputInfo('Found new version of `msr` which md5 = ' + md5 + ' , currentMd5 = ' + currentMd5);
						outputInfo('You can download the new exe by command as below:');
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
