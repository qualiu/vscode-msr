import path = require('path');
import * as vscode from 'vscode';
import { IsWindows } from './constants';
import { TerminalType } from './enums';
import { isWindowsTerminalOnWindows, toTerminalPaths } from './terminalUtils';
import { isNullOrEmpty } from './utils';
import fs = require('fs');
import crypto = require('crypto');

export const MsrExe = 'msr';
let TerminalTypeToToolNamePathMap = new Map<TerminalType, Map<string, string>>();

const DefaultCheckingUrlFromConfig: string = vscode.workspace.getConfiguration('msr').get('default.checkingToolUrl') as string || '';
function getSourceUrls(): string[] {
	let urlSet = new Set<string>()
		.add(DefaultCheckingUrlFromConfig.replace(/[/]$/, '').trim() + '/')
		.add('https://raw.githubusercontent.com/qualiu/msr/master/tools/')
		.add('https://gitlab.com/lqm678/msr/-/raw/master/tools/')
		.add('https://master.dl.sourceforge.net/project/avasattva/')
		;

	urlSet.delete('');
	urlSet.delete('/');
	return Array.from(urlSet);
}

export const SourceHomeUrlArray = getSourceUrls();

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
		if (isWindowsTerminalOnWindows(terminalType)) {
			TerminalTypeToToolNamePathMap.set(TerminalType.PowerShell, toolNameToPathMap);
			TerminalTypeToToolNamePathMap.set(TerminalType.CMD, toolNameToPathMap);
			TerminalTypeToToolNamePathMap.set(TerminalType.MinGWBash, toolNameToPathMap);
		}
	}

	toolNameToPathMap.set(toolName, toolPath);
	if (canReCheck && IsWindows && (terminalType === TerminalType.CMD || TerminalType.PowerShell === terminalType)) {
		const tp = terminalType === TerminalType.CMD ? TerminalType.PowerShell : TerminalType.CMD;
		updateToolNameToPathMap(tp, toolName, toolPath, false);
	}
}

export function getToolExportFolder(terminalType: TerminalType): string {
	const toolNameToPathMap = TerminalTypeToToolNamePathMap.get(terminalType);
	if (toolNameToPathMap) {
		const toolPath = toolNameToPathMap.get(MsrExe) || '';
		return isNullOrEmpty(toolPath) ? '' : path.dirname(toolPath);
	}
	return '';
}

export function getSetToolEnvCommand(terminalType: TerminalType, foldersToAddPath: string[] = []): string {
	let toolFolderSet = new Set<string>();
	const toolNameToPathMap = TerminalTypeToToolNamePathMap.get(terminalType);
	const isToolInPath = !toolNameToPathMap;
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
	const pathEnv = TerminalType.CMD === terminalType ? `"%PATH%;"` : `"$PATH"`;
	const checkPathsPattern = TerminalType.CMD === terminalType
		? `-it "^(${toolFolders.join('|').replace(/[\\]/g, '\\\\')})$"`
		: `-t "^(${toolFolders.join('|')})$"`;
	const splitPattern = TerminalType.CMD === terminalType || TerminalType.MinGWBash === terminalType
		? String.raw`\\*\s*;\s*`
		: String.raw`\s*:\s*`;
	const checkCountPattern = "^Matched [" + toolFolders.length + "-9]";
	const checkDuplicate = isToolInPath
		? `msr -z ${pathEnv} -t "${splitPattern}" -o "\\n" -aPAC | msr ${checkPathsPattern} -H 0 -C | msr -t "${checkCountPattern}" -M -H 0 && `
		: '';
	switch (terminalType) {
		case TerminalType.CMD:
			return checkDuplicate + 'SET "PATH=%PATH%;' + toolFolders.join(';') + ';"';
		case TerminalType.PowerShell:
		case TerminalType.Pwsh:
			return `$env:Path += ";${toolFolders.join(';')};"`;
		case TerminalType.LinuxBash:
		case TerminalType.MinGWBash:
		default:
			return checkDuplicate + 'export PATH="$PATH:' + toolFolders.join(':').replace(/ /g, '\\ ') + '"';
	}
}
