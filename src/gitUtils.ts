import path = require('path');
import fs = require('fs');
import { IsForwardingSlashSupportedOnWindows } from './checkTool';
import { getConfigValue } from './configUtils';
import { IsDebugMode, IsWSL } from './constants';
import { getGeneralCmdAliasFilePath } from './cookCommandAlias';
import { TerminalType } from './enums';
import { outputDebugOrInfo, outputError, outputInfo, outputWarn, runCommandInTerminal } from './outputUtils';
import { DefaultTerminalType, IsLinuxTerminalOnWindows, isNullOrEmpty, isWindowsTerminalOnWindows, nowText, quotePaths, toOsPath, toWSLPath } from './utils';

// Another solution: (1) git ls-files > project-file-list.txt ; (2) msr -w project-file-list.txt  (3) file watcher + update list.
// Show junk files: (1) git ls-files--ignored --others --exclude-standard (2) git ls-files --others --ignored -X .gitignore

const SkipPathVariableName: string = 'Skip_Git_Paths';

export class GitIgnore {
  public Valid: boolean = false;
  private Terminal: TerminalType;
  private IgnoreFilePath: string = '';
  private UseGitIgnoreFile: boolean;
  private OmitGitIgnoreExemptions: boolean;
  private SkipDotFolders: boolean;
  private SkipPathPattern: string = '';
  private RootFolder: string = '';
  private CheckUseForwardingSlashForCmd = true;
  private ExemptionCount: number = 0;
  private ExportLongSkipPathLength: number = 200;
  private LastExportedSkipPaths: string = '';
  private SetSkipPathEnvFile: string = '';
  private IsCmdTerminal: boolean;

  constructor(ignoreFilePath: string, useGitIgnoreFile: boolean = false, omitGitIgnoreExemptions: boolean = false,
    skipDotFolders: boolean = true, terminalType = DefaultTerminalType, checkUseForwardingSlashForCmd = true) {
    this.IgnoreFilePath = ignoreFilePath;
    this.UseGitIgnoreFile = useGitIgnoreFile;
    this.OmitGitIgnoreExemptions = omitGitIgnoreExemptions;
    this.SkipDotFolders = skipDotFolders;
    this.Terminal = terminalType;
    this.CheckUseForwardingSlashForCmd = checkUseForwardingSlashForCmd;
    this.ExportLongSkipPathLength = Number(getConfigValue('exportLongSkipFoldersLength'));
    this.IsCmdTerminal = isWindowsTerminalOnWindows(this.Terminal);
    if (isNullOrEmpty(ignoreFilePath)) {
      return;
    }

    if (IsWSL || TerminalType.WslBash === this.Terminal) {
      this.RootFolder = toWSLPath(this.RootFolder, true);
    }

    this.RootFolder = path.dirname(ignoreFilePath).replace(/\\/g, '/').replace(/\\$/, '');
  }

  public getSkipPathRegexPattern(toRunInTerminal: boolean, canUseVariable = true): string {
    const pattern = this.SkipPathPattern;
    if (isNullOrEmpty(pattern)) {
      return '';
    }

    if (pattern.length <= this.ExportLongSkipPathLength) {
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

  private exportSkipPathVariable() {
    const pattern = this.SkipPathPattern;
    if (isNullOrEmpty(pattern)) {
      return;
    }

    if (pattern.length <= this.ExportLongSkipPathLength) {
      return;
    }

    if (pattern !== this.LastExportedSkipPaths) {
      this.LastExportedSkipPaths = pattern;
      const command = (this.IsCmdTerminal ? 'call ' : 'source ') + quotePaths(toOsPath(this.SetSkipPathEnvFile, this.Terminal));
      runCommandInTerminal(command, true, false, IsLinuxTerminalOnWindows);
    }
  }

  private getExportCommand(pattern: string): string {
    const command = this.IsCmdTerminal
      ? '@set "' + SkipPathVariableName + '=' + pattern + '"'
      : "export " + SkipPathVariableName + "='" + pattern + "'";
    return command;
  }

  public replaceToSkipPathVariable(command: string): string {
    this.exportSkipPathVariable();
    command = command.replace('"' + this.SkipPathPattern + '"', this.getSkipPathsVariable());
    return command;
  }

  public parse(callback: (...args: any[]) => void) {
    this.Valid = false;
    this.ExemptionCount = 0;
    if (!this.UseGitIgnoreFile || isNullOrEmpty(this.IgnoreFilePath)) {
      return;
    }

    if (!fs.existsSync(this.IgnoreFilePath)) {
      outputWarn(nowText() + 'Not exist git ignore file: ' + this.IgnoreFilePath);
      return;
    }

    const beginTime = new Date();
    fs.readFile(this.IgnoreFilePath, 'utf8', (err, text) => {
      if (err) {
        outputError(nowText() + 'Failed to read file: ' + this.IgnoreFilePath + ' , error: ' + err.toString());
        console.error(err);
        return;
      }

      if (isNullOrEmpty(text)) {
        outputError(nowText() + 'Read empty content from file: ' + this.IgnoreFilePath);
        return;
      }

      const lines = text.split(/\r?\n/);
      const ignoreRegex = /^\s*#/;
      const exemptionRegex = /^\s*\!/;

      const useBackSlash = this.IsCmdTerminal && !IsForwardingSlashSupportedOnWindows;
      const dotFolderPattern = this.SkipDotFolders
        ? (useBackSlash ? '\\\\' + '[\\$\\.]' : '/' + '[\\$\\.]')
        : (useBackSlash ? '\\\\' + '\\$' : '/' + '\\$');

      let skipPatterns = new Set<string>().add(dotFolderPattern);

      if (!this.SkipDotFolders) {
        skipPatterns.add(this.getPattern('.git/'));
      }

      for (let row = 0; row < lines.length; row++) {
        const line = lines[row].trim();
        if (ignoreRegex.test(line)) {
          continue;
        }

        if (exemptionRegex.test(line)) {
          if (this.OmitGitIgnoreExemptions) {
            this.ExemptionCount++;
            outputWarn(nowText() + 'Ignore exemption: "' + line + '" at ' + this.IgnoreFilePath + ':' + (row + 1) + ' while msr.omitGitIgnoreExemptions = true.');
            continue;
          } else {
            outputError(nowText() + 'Skip using git-ignore due to found exemption: "' + line + '" at ' + this.IgnoreFilePath + ':' + (row + 1) + ' while msr.omitGitIgnoreExemptions = false.');
            return;
          }
        }
        skipPatterns.add(this.getPattern(line));
      }

      this.SkipPathPattern = this.mergeToTerminalSkipPattern(skipPatterns);
      this.Valid = this.SkipPathPattern.length > 0;
      const cost = (new Date()).valueOf() - beginTime.valueOf();
      const message = 'Cost ' + (cost / 1000).toFixed(3) + ' s to parse ' + skipPatterns.size
        + ' ignore-path patterns and ' + this.ExemptionCount + ' exemptions from: ' + this.IgnoreFilePath
        + ' , SkipPathPattern.length = ' + this.SkipPathPattern.length;
      outputInfo(nowText() + message);
      const saveFolder = path.dirname(getGeneralCmdAliasFilePath(DefaultTerminalType));
      this.SetSkipPathEnvFile = path.join(saveFolder, path.basename(this.RootFolder) + '.set-git-skip-paths-env.tmp' + (this.IsCmdTerminal ? '.cmd' : '.sh'));
      const setEnvCommands = this.getExportCommand(this.SkipPathPattern);
      fs.writeFileSync(this.SetSkipPathEnvFile, setEnvCommands, 'utf8');
      if (callback) {
        callback();
      }
    });
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

    outputDebugOrInfo(!IsDebugMode, 'Input_Git_Ignore = ' + line);

    if (line.match(/(?<![\\])\!/)) {
      outputDebugOrInfo(!IsDebugMode, 'Skip exemption path: ' + line + '\n');
      return '';
    }

    if (this.SkipDotFolders && line.match(/^\.\w+|^\$/)) {
      outputDebugOrInfo(!IsDebugMode, 'Skip redundant dot/dollar-ignore-path: ' + line + '\n');
      return '';
    }

    const hasSlash = line.includes('/');
    const isExtension = !hasSlash && /^\*\.\w+[^/]*$/.test(line);

    let pattern = line.replace(/\/\**\s*$/g, '/'); // remove tail '/*'

    // The character "?" matches any one character except "/".
    pattern = pattern.replace('?', '[^/]?');
    if (isExtension) {
      // pattern = pattern.replace(/^\*\.(\w+[^\./]*)$/, '\\.$1');
      // pattern = pattern.replace(/^\*\.(\w+[^/]*)$/, '[^/]*\\.$1');
      pattern = pattern.replace(/^\*\.(\w+[^/]*)$/, '\\.$1');
    } else {
      pattern = pattern.replace(/^\*\./, '[^/]*\.'); // replace head *.ext to [^/]*\.ext
    }

    pattern = pattern.replace(/(?![\\/])\.\*/, '\\.[^/]*');
    pattern = pattern.replace(/\/\*\./, '/[^/]*\.');

    // 4.3 "a/**/b" matches "a/b", "a/x/b", "a/x/y/b"
    pattern = pattern.replace(/\*{2,}/g, '.*');

    // replace '.' to '\.' except: .*  \.
    pattern = pattern.replace(/(?<![\\/])\./g, '\\.');
    pattern = pattern.replace(/(?<!\\)\.(?![\*\?])/, '\\.');

    if (isExtension) {
      pattern += '$';
    }

    if (isNullOrEmpty(pattern)) {
      return '';
    }

    // let pattern = isInTopFolder ? '^\\./' + pattern.replace(new RegExp('^/'), "") : pattern;
    pattern = this.replaceSlashForSkipPattern(pattern);
    outputDebugOrInfo(!IsDebugMode, 'Skip_Paths_Regex = ' + pattern);
    return pattern;
  }
}
