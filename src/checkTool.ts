'use strict';

import ChildProcess = require('child_process');
import { outputError, clearOutputChannel } from './outputUtils';

export const IsWindows = /(win32|windows)/i.test(process.platform);

let isToolExists = false;
// Always check tool exists if not exists in previous check, avoid need reloading.
export function checkSearchToolExists(forceCheck: boolean = false): boolean {
	const whereCmd = IsWindows ? 'where msr' : 'whereis msr';
	if (isToolExists && !forceCheck) {
		return true;
	}

	try {
		let output = ChildProcess.execSync(whereCmd).toString();
		isToolExists = IsWindows
			? output.split(/[\r\n]+/).filter(a => !/cygwin/i.test(a) && /msr\.\w+$/i.test(a)).length > 0
			: output.indexOf('/msr') > 0;
	} catch (err) {
		console.warn(err);
		isToolExists = false;
	}

	if (!isToolExists) {
		clearOutputChannel();
		outputError('Not found `msr` in PATH by checking command: ' + whereCmd);
		outputError('Please take less than 1 minute follow: https://github.com/qualiu/vscode-msr/blob/master/README.md#Requirements');
	}

	return isToolExists;
}