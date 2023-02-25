import path = require('path');
import fs = require('fs');
import crypto = require('crypto');
import { IsWindows } from './constants';
import { TerminalType } from './enums';
import { toTerminalPaths } from './terminalUtils';
import { isNullOrEmpty } from './utils';

let TerminalTypeToToolNamePathMap = new Map<TerminalType, Map<string, string>>();
export const MsrExe = 'msr';
export const SourceHomeUrlArray = [
	'https://raw.githubusercontent.com/qualiu/msr/master/tools/',
	'https://gitlab.com/lqm678/msr/-/raw/master/tools/',
	'https://master.dl.sourceforge.net/project/avasattva/'
];

export function getDownloadUrl(sourceExeName: string, useUrlIndex: number = 0): string {
	const parentUrl = SourceHomeUrlArray[useUrlIndex % SourceHomeUrlArray.length];
	if (parentUrl.includes('sourceforge')) {
		return parentUrl + sourceExeName + '?viasf=1';
	} else if (parentUrl.includes('gitlab')) {
		return parentUrl + sourceExeName + '?inline=false';
	}
	return parentUrl + sourceExeName;
}

export function getHomeUrl(sourceHomeUrl: string): string {
	if (sourceHomeUrl.includes('gitlab')) {
		return 'https://gitlab.com/lqm678/msr/';
	} else if (sourceHomeUrl.includes('sourceforge')) {
		return 'https://sourceforge.net/projects/avasattva/files/'
	} else {
		return 'https://github.com/qualiu/msr';
	}
}

export function getFileMd5(filePath: string) {
	const hash = crypto.createHash('md5');
	const content = fs.readFileSync(filePath, { encoding: '' });
	const md5 = hash.update(content).digest('hex');
	return md5;
}

export function updateToolNameToPathMap(terminalType: TerminalType, toolName: string, toolPath: string, canReCheck = true) {
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

	const toolFolders = Array.from(toTerminalPaths(toolFolderSet, terminalType));
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
