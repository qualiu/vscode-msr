import path = require('path');
import fs = require('fs');
import { getConfigValueOfActiveProject } from './configUtils';
import { getCommandToSetGitInfoVar, OutputChannelName, RunCmdTerminalName, TempStorageFolder, TrimProjectNameRegex } from './constants';
import { TerminalType } from './enums';
import { saveTextToFile } from './fileUtils';
import { outputError, outputErrorByTime, outputInfoByDebugMode, outputInfoByTime, outputInfoQuiet, outputInfoQuietByTime, outputWarnByTime } from './outputUtils';
import { runCommandInTerminal, runRawCommandInTerminal } from './runCommandUtils';
import { DefaultTerminalType, getTipFileDisplayPath, IsLinuxTerminalOnWindows, isWindowsTerminalOnWindows, toTerminalPath } from './terminalUtils';
import { IsForwardingSlashSupportedOnWindows, RunCommandChecker } from './ToolChecker';
import { changeToForwardSlash, getElapsedSecondsToNow, isNullOrEmpty, quotePaths, RunCmdTerminalRootFolder } from './utils';
// Another solution: (1) git ls-files --recurse-submodules > project-file-list.txt ; (2) msr -w project-file-list.txt  (3) file watcher + update list.
// Show junk files: (1) git ls-files --recurse-submodules --ignored --others --exclude-standard (2) git ls-files --recurse-submodules --others --ignored -X .gitignore

export const SkipPathVariableName: string = 'Skip_Git_Paths';
const RunCmdFolderWithForwardSlash: string = changeToForwardSlash(RunCmdTerminalRootFolder);

let ProjectFolderToHasSkipGitPathsEnvMap = new Map<string, boolean>();

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
  private SkipDotFolders: boolean;
  private SkipPathPattern: string = '';
  private RootFolder: string = '';
  private CheckUseForwardingSlashForCmd = true;
  private ExportLongSkipGitPathsLength: number = 200;
  private LastExportedSkipPaths: string = '';
  private SetSkipPathEnvFile: string = '';
  private IsCmdTerminal: boolean;
  private MaxCommandLength: number;
  private LastPrintSkipExportingTime: Date = new Date();

  constructor(ignoreFilePath: string, useGitIgnoreFile: boolean = false, omitGitIgnoreExemptions: boolean = false,
    skipDotFolders: boolean = true, terminalType = DefaultTerminalType, checkUseForwardingSlashForCmd = true) {
    this.IgnoreFilePath = ignoreFilePath;
    this.UseGitIgnoreFile = useGitIgnoreFile;
    this.OmitGitIgnoreExemptions = omitGitIgnoreExemptions;
    this.SkipDotFolders = skipDotFolders;
    this.Terminal = terminalType;
    this.CheckUseForwardingSlashForCmd = checkUseForwardingSlashForCmd;
    this.ExportLongSkipGitPathsLength = Number(getConfigValueOfActiveProject('exportLongSkipGitPathsLength'));
    this.IsCmdTerminal = isWindowsTerminalOnWindows(this.Terminal);
    this.MaxCommandLength = this.IsCmdTerminal ? 8163 : 131072;
    this.LastPrintSkipExportingTime.setFullYear(this.LastPrintSkipExportingTime.getFullYear() - 1);

    if (isNullOrEmpty(ignoreFilePath)) {
      return;
    }

    this.RootFolder = changeToForwardSlash(path.dirname(ignoreFilePath));
  }

  public getSkipPathRegexPattern(toRunInTerminal: boolean, canUseVariable = true): string {
    const pattern = this.SkipPathPattern;
    if (isNullOrEmpty(pattern)) {
      return '';
    }

    if (pattern.length <= this.ExportLongSkipGitPathsLength) {
      return ' --np "' + pattern + '"';
    }

    this.exportSkipPathVariable();
    return toRunInTerminal && canUseVariable
      ? ' --np ' + this.getSkipPathsVariable()
      : ' --np "' + pattern + '"';
  }

  private getSkipPathsVariable() {
    return this.IsCmdTerminal ? '"%' + SkipPathVariableName + '%"' : '"$' + SkipPathVariableName + '"';
  }


  public exportSkipPathVariable(forceExport: boolean = false): boolean {
    if (!forceExport && RunCmdFolderWithForwardSlash !== this.RootFolder) {
      const passedSeconds = (new Date().getTime() - this.LastPrintSkipExportingTime.getTime()) / 1000;
      if (passedSeconds > 5) {
        this.LastPrintSkipExportingTime = new Date();
        outputInfoByTime(`Skip exporting ${SkipPathVariableName} due to workspace = ${this.RootFolder} != ${RunCmdFolderWithForwardSlash} of ${RunCmdTerminalName} terminal.`);
      }

      return false;
    }

    const pattern = this.SkipPathPattern;
    if (isNullOrEmpty(pattern)) {
      return false;
    }

    if (pattern.length <= this.ExportLongSkipGitPathsLength) {
      return false;
    }

    if (forceExport || pattern !== this.LastExportedSkipPaths) {
      this.LastExportedSkipPaths = pattern;
      const command = (this.IsCmdTerminal ? 'call ' : 'source ') + quotePaths(toTerminalPath(this.SetSkipPathEnvFile, this.Terminal));
      runCommandInTerminal(command, true, false, IsLinuxTerminalOnWindows);
    }

    return true;
  }

  private getExportCommand(pattern: string): string {
    const command = this.IsCmdTerminal
      ? '@set "' + SkipPathVariableName + '=' + pattern + '"'
      : "export " + SkipPathVariableName + "='" + pattern + "'";
    return command;
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

    const setVariableCommand = this.SkipPathPattern.length <= this.ExportLongSkipGitPathsLength
      ? this.getExportCommand(this.SkipPathPattern)
      : '';

    const commands = this.IsCmdTerminal
      ? [
        setVariableCommand,
        String.raw`git ls-files --recurse-submodules > %tmp%\git-file-list.txt`,
        String.raw`msr -rp . --np "%Skip_Git_Paths%" -l -PIC | msr -x \ -o / -aPAC > %tmp%\ext-file-list.txt`,
        String.raw`nin %tmp%\git-file-list.txt %tmp%\ext-file-list.txt --nt "^\.|/\." -H 5 -T 5`,
        String.raw`nin %tmp%\git-file-list.txt %tmp%\ext-file-list.txt --nt "^\.|/\." -S -H 5 -T 5`,
        String.raw`nin %tmp%\git-file-list.txt %tmp%\ext-file-list.txt --nt "^\.|/\." -PAC | msr -t "^(\S+.+)" -o "./\1" -PIC > %tmp%\files-only-in-git.txt`,
        String.raw`nin %tmp%\git-file-list.txt %tmp%\ext-file-list.txt --nt "^\.|/\." -S -PAC | msr -t "^(\S+.+)" -o "./\1" -PIC > %tmp%\files-only-in-ext.txt`,
        String.raw`for /f "tokens=*" %a in ('msr -z "%Skip_Git_Paths%" -t "\|" -o "\n" -PIC ^| msr -PIC') do @msr -p %tmp%\files-only-in-git.txt -it "%a" -H 3 -T 3 -O -c "Skip_Paths_Regex = %a"`,
        String.raw`for /f "tokens=*" %a in ('msr -z "%Skip_Git_Paths%" -t "\|" -o "\n" -PIC ^| msr -PIC') do @msr -p %tmp%\files-only-in-ext.txt -it "%a" -H 3 -T 3 -O -c "Skip_Paths_Regex = %a"`,
      ]
      : [
        setVariableCommand,
        String.raw`git ls-files --recurse-submodules > /tmp/git-file-list.txt`,
        String.raw`msr -rp . --np "$Skip_Git_Paths" -l -PIC > /tmp/ext-file-list.txt`,
        String.raw`nin /tmp/git-file-list.txt /tmp/ext-file-list.txt --nt "^\.|/\." -H 5 -T 5`,
        String.raw`nin /tmp/git-file-list.txt /tmp/ext-file-list.txt --nt "^\.|/\." -S -H 5 -T 5`,
        String.raw`nin /tmp/git-file-list.txt /tmp/ext-file-list.txt --nt "^\.|/\." -PAC | msr -t "^(\S+.+)" -o "./\1" -PIC > /tmp/files-only-in-git.txt`,
        String.raw`nin /tmp/git-file-list.txt /tmp/ext-file-list.txt --nt "^\.|/\." -S -PAC | msr -t "^(\S+.+)" -o "./\1" -PIC > /tmp/files-only-in-ext.txt`,
        String.raw`msr -z "$Skip_Git_Paths" -t "\|" -o "\n" -PIC | msr -PIC | while IFS= read -r p; do msr -p /tmp/files-only-in-git.txt -it "$p" -H 3 -T 3 -O -c "Skip_Paths_Regex = $p"; done`,
        String.raw`msr -z "$Skip_Git_Paths" -t "\|" -o "\n" -PIC | msr -PIC | while IFS= read -r p; do msr -p /tmp/files-only-in-ext.txt -it "$p" -H 3 -T 3 -O -c "Skip_Paths_Regex = $p"; done`
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

      const tmpScriptName = path.basename(this.RootFolder).replace(TrimProjectNameRegex, '-') + '.set-git-skip-paths-env.tmp';
      this.SetSkipPathEnvFile = path.join(TempStorageFolder, tmpScriptName + (this.IsCmdTerminal ? '.cmd' : '.sh'));
      const setEnvCommands = this.getExportCommand(this.SkipPathPattern);
      saveTextToFile(this.SetSkipPathEnvFile, setEnvCommands);
      callbackWhenSucceeded();

      const shouldDisplayTip = this.RootFolder === RunCmdFolderWithForwardSlash;
      if (!shouldDisplayTip || !RunCommandChecker.IsToolExists) {
        return;
      }

      const tipFileDisplayPath = getTipFileDisplayPath(this.Terminal);
      const setVarCmd = getCommandToSetGitInfoVar(this.IsCmdTerminal, this.SkipPathPattern.length, readPatternCount, skipPatterns.size, errorList.length, this.ExemptionCount);
      const replaceCmd = (this.IsCmdTerminal ? `-x ::` : `-x '#'`) + ` -o echo ` + (
        !isInMaxLength
          ? `-L 4 -N4`
          : (this.ExemptionCount > 0 ? `-L 3 -N3` : `-L 2 -N2`)
      );

      const command = `msr -XA -z "${setVarCmd} msr -p ${tipFileDisplayPath} ${replaceCmd} -XA"` // change -XA to -XMI for debug
        + (this.IsCmdTerminal ? ' & use-this-alias -A' : '');
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
