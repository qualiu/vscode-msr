import path = require('path');
import fs = require('fs');
import ChildProcess = require('child_process');
import { ExecSyncOptions } from 'child_process';
import { getCommandToSetGitInfoVar, getRunTipFileCommand, OutputChannelName } from './constants';
import { TerminalType } from './enums';
import { outputError, outputErrorByTime, outputInfoByDebugMode, outputInfoByTime, outputInfoQuiet, outputInfoQuietByTime, outputWarnByTime } from './outputUtils';
import { runRawCommandInTerminal } from './runCommandUtils';
import { DefaultTerminalType, getTipFileDisplayPath, IsLinuxTerminalOnWindows, isWindowsTerminalOnWindows } from './terminalUtils';
import { IsForwardingSlashSupportedOnWindows, RunCommandChecker } from './ToolChecker';
import { changeToForwardSlash, getDefaultRootFolder, getElapsedSecondsToNow, isNullOrEmpty, RunCmdTerminalRootFolder } from './utils';

function isGitRecurseSubModuleSupported(): boolean {
  const execOption: ExecSyncOptions = { cwd: getDefaultRootFolder() };
  try {
    ChildProcess.execSync('git ls-files --recurse-submodules .git', execOption);
    return true;
  } catch (err) {
    if (err) {
      const errorText = err.toString();  // error: unknown option `recurse-submodules'
      const shortError = errorText.replace(/[\r\n]+\s*usage\s*:.*/is, '');
      if (errorText.match(/unknown option \W*recurse-submodules/i)) {
        outputInfoQuietByTime(`Detected '--recurse-submodules' not supported in 'git ls-files': ${shortError}`);
        return false;
      }
    }
    return false;
  }
}

export const IsGitRecurseSubModuleSupported = isGitRecurseSubModuleSupported();
export const GitListFileRecursiveArg = IsGitRecurseSubModuleSupported ? '--recurse-submodules' : '';
export const GitListFileHead = `git ls-files ${GitListFileRecursiveArg}`.trimRight();

export const SkipPathVariableName: string = 'Skip_Junk_Paths';
const RunCmdFolderWithForwardSlash: string = changeToForwardSlash(RunCmdTerminalRootFolder);

let ProjectFolderToHasSkipGitPathsEnvMap = new Map<string, boolean>();
let ProjectFolderToShortSkipGitPathEnvValueMap = new Map<string, string>();

export function hasValidGitSkipPathsEnv(projectGitFolder: string): boolean {
  projectGitFolder = changeToForwardSlash(projectGitFolder);
  return ProjectFolderToHasSkipGitPathsEnvMap.get(projectGitFolder) || false;
}

export class GitIgnore {
  public Valid: boolean = false;
  public ExemptionCount: number = 0;
  private Terminal: TerminalType;
  private IgnoreFilePath: string = '';
  private UseGitIgnoreFile: boolean;
  private OmitGitIgnoreExemptions: boolean;
  private SkipDotFolders: boolean = true;
  private SkipPathPattern: string = '';
  private RootFolder: string = '';
  private CheckUseForwardingSlashForCmd = true;
  private IsCmdTerminal: boolean;
  private MaxCommandLength: number;

  constructor(ignoreFilePath: string, useGitIgnoreFile: boolean = false, omitGitIgnoreExemptions: boolean = false,
    ignorableDotFolderNamePattern: string = '', terminalType = DefaultTerminalType, checkUseForwardingSlashForCmd = true) {
    this.IgnoreFilePath = ignoreFilePath;
    this.UseGitIgnoreFile = useGitIgnoreFile;
    this.OmitGitIgnoreExemptions = omitGitIgnoreExemptions;
    this.Terminal = terminalType;
    this.CheckUseForwardingSlashForCmd = checkUseForwardingSlashForCmd;
    this.IsCmdTerminal = isWindowsTerminalOnWindows(this.Terminal);
    this.MaxCommandLength = this.IsCmdTerminal ? 8163 : 131072;

    if (isNullOrEmpty(ignoreFilePath)) {
      return;
    }

    this.RootFolder = changeToForwardSlash(path.dirname(ignoreFilePath));
    const options: ChildProcess.ExecSyncOptionsWithStringEncoding = {
      encoding: 'utf8',
      cwd: path.dirname(ignoreFilePath),
    };

    if (isNullOrEmpty(ignorableDotFolderNamePattern)) {
      return;
    }

    try {
      const ignorableDotFolderNameRegex = new RegExp(ignorableDotFolderNamePattern, 'i');
      const folderNames = ChildProcess.execSync(String.raw`git ls-tree -d --name-only HEAD`, options).toString().split(/[\r?\n]+/);
      for (let i = 0; i < folderNames.length; i++) {
        if (folderNames[i].startsWith(".") && !folderNames[i].match(ignorableDotFolderNameRegex)) {
          this.SkipDotFolders = false;
          outputInfoQuietByTime(`Not skip all dot folders: Found repo-child-folder = ${folderNames[i]} , ignorableDotFolderNamePattern = "${ignorableDotFolderNamePattern}"`);
          break;
        }
      }
    } catch (error) {
      outputInfoQuietByTime("Cannot use git ls-tree to check git folder: " + error);
    }
  }

  public getSkipPathRegexPattern(toRunInTerminal: boolean, canUseVariable = true): string {
    const pattern = this.SkipPathPattern;
    if (isNullOrEmpty(pattern)) {
      return '';
    }

    this.exportSkipPathVariable();
    return toRunInTerminal && canUseVariable
      ? this.getSkipPathsVariable()
      : pattern;
  }

  private getSkipPathsVariable() {
    return this.IsCmdTerminal ? '"%' + SkipPathVariableName + '%"' : '"$' + SkipPathVariableName + '"';
  }

  public exportSkipPathVariable(forceExport: boolean = false): boolean {
    if (!forceExport && RunCmdFolderWithForwardSlash !== this.RootFolder) {
      return false;
    }

    if (isNullOrEmpty(this.SkipPathPattern)) {
      return false;
    }

    return true;
  }


  public replaceToSkipPathVariable(command: string): string {
    if (this.exportSkipPathVariable()) {
      command = command.replace('"' + this.SkipPathPattern + '"', this.getSkipPathsVariable());
    }
    return command;
  }

  public compareFileList() {
    if (!this.Valid) {
      return;
    }

    const commands = this.IsCmdTerminal
      ? [
        String.raw`${GitListFileHead} > %tmp%\git-file-list.txt`,
        String.raw`msr -rp . --np "%Skip_Junk_Paths%" -l -PIC | msr -x \ -o / -aPAC > %tmp%\ext-file-list.txt`,
        String.raw`nin %tmp%\git-file-list.txt %tmp%\ext-file-list.txt --nt "^\.|/\." -H 5 -T 5`,
        String.raw`nin %tmp%\git-file-list.txt %tmp%\ext-file-list.txt --nt "^\.|/\." -S -H 5 -T 5`,
        String.raw`nin %tmp%\git-file-list.txt %tmp%\ext-file-list.txt --nt "^\.|/\." -PAC | msr -t "^(\S+.+)" -o "./\1" -PIC > %tmp%\files-only-in-git.txt`,
        String.raw`nin %tmp%\git-file-list.txt %tmp%\ext-file-list.txt --nt "^\.|/\." -S -PAC | msr -t "^(\S+.+)" -o "./\1" -PIC > %tmp%\files-only-in-ext.txt`,
        String.raw`for /f "tokens=*" %a in ('msr -z "%Skip_Junk_Paths%" -t "\|" -o "\n" -PIC ^| msr -PIC') do @msr -p %tmp%\files-only-in-git.txt -it "%a" -H 3 -T 3 -O -c "Skip_Paths_Regex = %a"`,
        String.raw`for /f "tokens=*" %a in ('msr -z "%Skip_Junk_Paths%" -t "\|" -o "\n" -PIC ^| msr -PIC') do @msr -p %tmp%\files-only-in-ext.txt -it "%a" -H 3 -T 3 -O -c "Skip_Paths_Regex = %a"`,
      ]
      : [
        String.raw`${GitListFileHead} > /tmp/git-file-list.txt`,
        String.raw`msr -rp . --np "$Skip_Junk_Paths" -l -PIC > /tmp/ext-file-list.txt`,
        String.raw`nin /tmp/git-file-list.txt /tmp/ext-file-list.txt --nt "^\.|/\." -H 5 -T 5`,
        String.raw`nin /tmp/git-file-list.txt /tmp/ext-file-list.txt --nt "^\.|/\." -S -H 5 -T 5`,
        String.raw`nin /tmp/git-file-list.txt /tmp/ext-file-list.txt --nt "^\.|/\." -PAC | msr -t "^(\S+.+)" -o "./\1" -PIC > /tmp/files-only-in-git.txt`,
        String.raw`nin /tmp/git-file-list.txt /tmp/ext-file-list.txt --nt "^\.|/\." -S -PAC | msr -t "^(\S+.+)" -o "./\1" -PIC > /tmp/files-only-in-ext.txt`,
        String.raw`msr -z "$Skip_Junk_Paths" -t "\|" -o "\n" -PIC | msr -PIC | while IFS= read -r p; do msr -p /tmp/files-only-in-git.txt -it "$p" -H 3 -T 3 -O -c "Skip_Paths_Regex = $p"; done`,
        String.raw`msr -z "$Skip_Junk_Paths" -t "\|" -o "\n" -PIC | msr -PIC | while IFS= read -r p; do msr -p /tmp/files-only-in-ext.txt -it "$p" -H 3 -T 3 -O -c "Skip_Paths_Regex = $p"; done`
      ];

    commands.forEach((cmd, _idx, _commands) => {
      if (!isNullOrEmpty(cmd)) {
        runRawCommandInTerminal(cmd);
      }
    });
  }

  public parse(callbackWhenSucceeded: (...args: any[]) => void, callbackWhenFailed: (...args: any[]) => void) {
    ProjectFolderToHasSkipGitPathsEnvMap.set(this.RootFolder, false);
    this.Valid = false;
    this.ExemptionCount = 0;
    if (!this.UseGitIgnoreFile || isNullOrEmpty(this.IgnoreFilePath)) {
      callbackWhenFailed();
      return;
    }

    if (!fs.existsSync(this.IgnoreFilePath)) {
      outputWarnByTime('Not exist git ignore file: ' + this.IgnoreFilePath);
      callbackWhenFailed();
      return;
    }

    const beginTime = new Date();
    fs.readFile(this.IgnoreFilePath, 'utf8', (err, text) => {
      if (err) {
        const message = 'Failed to read file: ' + this.IgnoreFilePath + ' , error: ' + err;
        outputErrorByTime(message);
        this.showErrorInRunCmdTerminal(message);
        callbackWhenFailed();
        return;
      }

      if (isNullOrEmpty(text)) {
        const message = 'Read empty content from file: ' + this.IgnoreFilePath;
        outputErrorByTime(message);
        this.showErrorInRunCmdTerminal(message);
        callbackWhenFailed();
        return;
      }

      const lines = text.split(/\r?\n/);
      const ignoreCommentSpecialRegex = new RegExp(String.raw`^\s*#` + '|' + String.raw`^/\**/?$`); // Skip cases: /*/
      const exemptionRegex = /^\s*\!/;
      const ignoreDotFolderRegex = new RegExp(String.raw`^\.\*$` + '|' + String.raw`^/?\.[\w\./\?-]+$`); // Skip cases: .*.swp 

      const useBackSlash = this.IsCmdTerminal && !IsForwardingSlashSupportedOnWindows;
      const headSlash = useBackSlash ? '\\\\' : '/';
      const dotFolderPattern = headSlash + (this.SkipDotFolders ? '[\\$\\.]' : '\\$');

      let skipPatterns = new Set<string>().add(dotFolderPattern);

      if (!this.SkipDotFolders) {
        skipPatterns.add(this.getPattern(headSlash + '.git/'));
      }

      let readPatternCount = 0;
      let errorList = new Array<string>();
      for (let row = 0; row < lines.length; row++) {
        const line = lines[row].trim();
        if (isNullOrEmpty(line) || ignoreCommentSpecialRegex.test(line)) {
          continue;
        }

        readPatternCount++;
        if (exemptionRegex.test(line)) {
          if (this.OmitGitIgnoreExemptions) {
            this.ExemptionCount++;
            outputWarnByTime('Ignore exemption: "' + line + '" at ' + this.IgnoreFilePath + ':' + (row + 1) + ' while msr.omitGitIgnoreExemptions = true.');
            continue;
          } else {
            const message = 'Skip using git-ignore due to found exemption: "' + line + '" at ' + this.IgnoreFilePath + ':' + (row + 1) + ' while msr.omitGitIgnoreExemptions = false.';
            outputErrorByTime(message);
            this.showErrorInRunCmdTerminal(message);
            callbackWhenFailed();
            return;
          }
        }

        if (line.startsWith('$') || (this.SkipDotFolders && ignoreDotFolderRegex.test(line))) {
          outputInfoQuiet('Ignore redundant dot ignore: "' + line + '" at ' + this.IgnoreFilePath + ':' + (row + 1) + ' while msr.skipDotFoldersIfUseGitIgnoreFile = true.');
          continue;
        }

        const pattern = this.getPattern(line);
        if (pattern.length < 2) {
          outputWarnByTime('Skip too short pattern: "' + line + '" at ' + this.IgnoreFilePath + ':' + (row + 1));
          continue;
        }

        try {
          // tslint:disable-next-line: no-unused-expression
          new RegExp(pattern);
          skipPatterns.add(pattern);
        } catch (err) {
          const message = 'Error[' + (errorList.length + 1) + ']:' + ' at ' + this.IgnoreFilePath + ':' + row + ' : Input_Git_Ignore = ' + line
            + ' , Skip_Paths_Regex = ' + pattern + ' , error = ' + err;
          errorList.push(message);
          outputErrorByTime(message + '\n');
        }
      }

      this.SkipPathPattern = this.mergeToTerminalSkipPattern(skipPatterns);
      const setVarCmdLength = this.SkipPathPattern.length + (this.IsCmdTerminal ? '@set "="'.length : 'export =""'.length) + SkipPathVariableName.length;
      const isInMaxLength = setVarCmdLength < this.MaxCommandLength;
      this.Valid = this.SkipPathPattern.length > 0 && isInMaxLength;
      ProjectFolderToHasSkipGitPathsEnvMap.set(this.RootFolder, this.Valid);
      if (this.Valid) {
        ProjectFolderToShortSkipGitPathEnvValueMap.set(this.RootFolder, this.SkipPathPattern);
      }
      if (errorList.length > 0) {
        outputError(errorList.join('\n'));
      }

      let parsedInfo = `Parsed ${skipPatterns.size} of ${readPatternCount} patterns, omitted ${errorList.length} errors, ignored ${this.ExemptionCount} exemptions in ${this.IgnoreFilePath}`;
      if (this.ExemptionCount > 0) {
        parsedInfo += ` - see ${OutputChannelName} in OUTPUT. Use gfind-xxx instead of find-xxx for git-exemptions`;
      }

      parsedInfo += ' ; ' + SkipPathVariableName + ' length = ' + this.SkipPathPattern.length + '.';
      const message = 'Cost ' + getElapsedSecondsToNow(beginTime).toFixed(3) + ' s: ' + parsedInfo;
      outputInfoByTime(message);

      callbackWhenSucceeded();

      const shouldDisplayTip = this.RootFolder === RunCmdFolderWithForwardSlash;
      if (!shouldDisplayTip || !RunCommandChecker.IsToolExists) {
        return;
      }

      const tipFileDisplayPath = getTipFileDisplayPath(this.Terminal);
      const setVarCmd = getCommandToSetGitInfoVar(this.IsCmdTerminal, this.SkipPathPattern.length, readPatternCount, skipPatterns.size, errorList.length, this.ExemptionCount);
      const tipRow = !isInMaxLength ? 8 : (this.ExemptionCount > 0 ? 7 : 6);
      const replaceCmd = (this.IsCmdTerminal ? `-x ::` : `-x '#'`) + ` -o echo `;
      const tipCommand = getRunTipFileCommand(tipFileDisplayPath, tipRow, replaceCmd);
      // change -XA to -XMI for debug
      const command = `msr -XA -z "${setVarCmd} ${tipCommand}"` + (this.IsCmdTerminal ? ' 2>nul & use-this-alias -A' : ' 2>/dev/null');
      runRawCommandInTerminal(command);
    });
  }

  private showErrorInRunCmdTerminal(message: string) {
    if (IsLinuxTerminalOnWindows) {
      message = message.replace(/"/g, "'");
    }
    runRawCommandInTerminal(`echo ${message.replace(this.IgnoreFilePath, this.IgnoreFilePath.replace(/\\/g, '/'))} | msr -aPA -ix exemption -t "\\S+:\\d+" -e "\\w+ = \\w+"`);
  }

  private mergeToTerminalSkipPattern(patterns: Set<string>): string {
    patterns.delete('');
    if (patterns.size < 1) {
      return '';
    }

    let skipPattern = Array.from(patterns).join('|');
    const useBackSlash = this.IsCmdTerminal && !IsForwardingSlashSupportedOnWindows;
    if (useBackSlash && skipPattern.endsWith('\\')) {
      // Avoid truncating tail slash on Windows with double-quotes:
      skipPattern += '\\\\';
    }

    return skipPattern;
  }

  private replaceSlashForSkipPattern(pattern: string): string {
    if (this.CheckUseForwardingSlashForCmd && IsForwardingSlashSupportedOnWindows) {
      return pattern;
    }

    if (this.IsCmdTerminal) {
      pattern = pattern.replace(/\//g, '\\\\');
    } else if (TerminalType.MinGWBash === this.Terminal) {
      pattern = pattern.replace(/\//g, '\\\\\\\\');
    }

    return pattern;
  }

  public getPattern(line: string): string {
    // https://git-scm.com/docs/gitignore#_pattern_format,
    // 1. Root paths skip: folder name with or without begin slash '/' like: folder1/fileOrFolder or /folder1/fileOrFolder
    // 2. Skip folder not file if slash '/' at tail, like: folder1/folder2/
    // 3.1 An asterisk "*" matches anything except a slash.
    // 3.2 The character "?" matches any one character except "/". 
    // 3.3 Range notation: [a-zA-Z]
    // 4.1 A leading "**" followed by a slash means match in all directories. Like: **/folder/fileOrFolder
    // 4.2 A trailing "/**" matches everything inside. Like: folder/** skip all files/folders under it.

    if (isNullOrEmpty(line)) {
      return '';
    }

    outputInfoByDebugMode('Input_Git_Ignore = ' + line);

    if (line.match(/(?<![\\])\!/)) {
      outputInfoByDebugMode('Skip exemption path: ' + line + '\n');
      return '';
    }

    if (this.SkipDotFolders && line.match(/^\.\w+|^\$|^\.\*$/)) {
      outputInfoQuietByTime('Skip redundant dot/dollar pattern: "' + line + '"');
      return '';
    }

    line = reduceCasePattern(line);
    const hasSlash = line.includes('/');
    const isExtension = !hasSlash && /^\*\.\w+[^/]*$/.test(line);

    let pattern = line.replace(/\/\**\s*$/g, '/'); // remove tail '/*'

    if (pattern === '*~' || pattern === '*~$') {
      pattern = '~$';
      outputInfoByDebugMode('Skip_Paths_Regex = ' + pattern);
      return pattern;
    }

    pattern = pattern.replace(/~\$\*/g, '~\\$[^/]*'); // replace ~$* to ~\$[^/]*
    pattern = pattern.replace(/\*\.(\w+(\[[0-9A-Za-z\._-]+\])?)\*$/g, '[^/]*\\.$1[^/]*$');
    pattern = pattern.replace(/(?<![\]])\*\.(\w+(\[[0-9A-Za-z\._-]+\])?)$/g, '[^/]*\\.$1$');
    pattern = pattern.replace(/(\*\\?\.)(\w+(\[[0-9A-Za-z\._-]+\])?)$/, '$1$2$');

    if (pattern.startsWith('*')) {
      pattern = pattern.replace(/^\*+(\w+\\?\.\w+(\[[0-9A-Za-z\._-]+\])?)$/, '$1');
      pattern = pattern.replace(/^\*+/, '');
    }

    pattern = pattern.replace(/(?<![\]])\*\./g, '[^/]*\\.');
    if (pattern.startsWith('[^/]*\\.')) {
      pattern = pattern.substring('[^/]*'.length);
    }

    pattern = pattern.replace('[^/][^/]*', '[^/]*');

    // The character "?" matches any one character except "/".
    pattern = pattern.replace('?', '[^/]?');

    pattern = pattern.replace(/(?![\\/])\.\*/, '\\.[^/]*');
    pattern = pattern.replace(/\/\*\./, '/[^/]*\.');

    // 4.3 "a/**/b" matches "a/b", "a/x/b", "a/x/y/b"
    pattern = pattern.replace(/\*{2,}/g, '.*');

    // replace '.' to '\.' except: .*  \.
    pattern = pattern.replace(/(?<![\\/])\./g, '\\.');
    pattern = pattern.replace(/(?<!\\)\.(?![\*\?])/, '\\.');

    // escape * $
    pattern = pattern.replace(/(?<![\.\]\\])(\*)/, '[^/]*');

    pattern = pattern.replace(/\.((\[[a-zA-Z0-9-]+\]){1,})$/, '.$1$');

    if (isExtension && !pattern.endsWith('$')) {
      pattern += '$';
    }

    if (pattern.endsWith('[^/]*')) {
      pattern = pattern.substring(0, pattern.length - '[^/]*'.length);
    }

    if (isNullOrEmpty(pattern)) {
      return '';
    }

    if (/^\[?\w/.test(line)) {
      pattern = '/' + pattern;
    }

    if (/(^|\/)[\w-]+$/.test(line)) {
      pattern = pattern + '/';
    }

    if (line === '.*') {
      pattern = "/\\.";
    }

    if (!pattern.endsWith('$') && line.match(/\[[\._]{0,2}\]\*?\.?(\[?[a-z]?-?[a-z]\]?){3}$/i)) {
      pattern += '$';
    }

    pattern = this.replaceSlashForSkipPattern(pattern);
    outputInfoByDebugMode('Skip_Paths_Regex = ' + pattern);
    return pattern;
  }
}

function reduceCasePattern(pattern: string): string {
  // reduce pattern length and make it readable.
  let k = pattern.indexOf("[");
  while (k >= 0 && k + 3 < pattern.length && pattern[k + 3] === ']') {
    const a = pattern[k + 1].toLowerCase();
    const b = pattern[k + 2].toLowerCase();
    if (a >= 'a' && a <= 'z' && a === b) {
      pattern = pattern.substring(0, k) + pattern[k + 1] + pattern.substring(k + 4);
      k = pattern.indexOf("[", Math.max(0, k - 4));
    } else {
      k = pattern.indexOf("[", k + 4);
    }
  }
  return pattern;
}
