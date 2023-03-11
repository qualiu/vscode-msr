import path = require('path');
import ChildProcess = require('child_process');

export function GetCommandOutput(command: string): string {
  try {
    const output = ChildProcess.execSync(command);
    return !output ? '' : output.toString().trim();
  } catch (error) {
    return '';
  }
}

export const IsDebugMode = process.execArgv && process.execArgv.length > 0 && process.execArgv.some((arg) => /^--debug=?/.test(arg) || /^--(debug|inspect)-brk=?/.test(arg));

export const RunCmdTerminalName = 'MSR-RUN-CMD';
export const OutputChannelName = 'MSR-Def-Ref';

export const SearchTextHolder = '%1';
export const SkipJumpOutForHeadResultsRegex = /\s+(-J\s+-H|-J?H)\s*\d+(\s+-J)?(\s+|$)/;
export const RemoveJumpRegex = /\s+-J(\s+|$)/;
export const TrimSearchTextRegex = /^[^\w\.-]+|[^\w\.-]+$/g;

export const Is64BitOS = process.arch.includes('64');
export const IsWindows = /Win32|Windows/i.test(process.platform);
const SystemInfo = IsWindows ? '' : GetCommandOutput('uname -smr');
export const IsWSL = !IsWindows && /Microsoft/i.test(SystemInfo) && /WSL/i.test(SystemInfo);

export const IsDarwinArm64 = !IsWindows && /^Darwin/i.test(process.platform) && process.arch === 'arm64';
export const IsMacOS = IsDarwinArm64 || (!IsWindows && /Darwin|Mac|\biOS\b|macOS|Apple/.test(SystemInfo));

export const IsLinuxArm64 = !IsWindows && !IsMacOS && !IsWSL && /aarch64/i.test(SystemInfo) && /Linux/i.test(SystemInfo);
export const IsLinux86x64 = !IsWindows && !IsMacOS && !IsWSL && !IsLinuxArm64 && /x86_64/.test(SystemInfo) && /Linux/i.test(SystemInfo);
export const IsLinux = IsLinuxArm64 || IsLinux86x64;

export const IsSupportedSystem = /win32|Windows|Linux/i.test(process.platform) || IsDarwinArm64;

export const ShouldQuotePathRegex = IsWindows ? /[^\w,\.\\/:~-]/ : /[^\w,\.\\/~-]/;
export const HomeFolder = IsWindows ? path.join(process.env['USERPROFILE'] || '.') : process.env['HOME'] || '.';
export const SystemBinFolder = IsWindows ? (process.env['SystemRoot'] || `C:\WINDOWS\system32`) : '/usr/bin/';