import * as vscode from 'vscode';
import { AliasNameBody } from './AliasNameBody';
import { IsWindows, isNullOrEmpty } from './constants';
import { MyConfig, getConfig } from './dynamicConfig';
import { TerminalType } from "./enums";
import { enableColorAndHideCommandLine, outputInfoByDebugModeByTime, outputInfoQuietByTime, outputWarnByTime } from "./outputUtils";
import { isToolExistsInPath, isWindowsTerminalOnWindows } from "./terminalUtils";
import { getPowerShellName, replaceSearchTextHolder, replaceTextByRegex } from "./utils";

/**
 * =====================================================================================================================
 * WINDOWS DOSKEY ALIAS LIMITATIONS AND SPECIAL CHARACTERS
 * =====================================================================================================================
 *
 * 1. DOSKEY MACRO LENGTH LIMIT:
 *    - Maximum macro length: ~8191 characters (Windows command line limit)
 *    - Practical limit: Keep doskey macros as short as possible for reliability
 *    - For complex/long commands: Use script files (.cmd) instead of doskey macros
 *
 * 2. DOSKEY SPECIAL CHARACTERS (MUST AVOID in variable names):
 *    - $a = & (ampersand)      - Variables like $alias, $arr will become &lias, &rr
 *    - $b = | (pipe)           - Variables like $bar, $batch will become |ar, |atch
 *    - $g = > (redirect out)   - Variables like $good, $get will become >ood, >et
 *    - $l = < (redirect in)    - Variables like $list, $log will become <ist, <og
 *    - $r = carriage return    - Variables like $rowNum will become <CR>owNum
 *    - $t = command separator  - Variables like $test, $temp will become <separator>est, <separator>emp
 *
 * 3. DOSKEY PARAMETER SYNTAX:
 *    - $1 to $9 = positional parameters (like %1 to %9 in batch files)
 *    - $* = all parameters
 *
 * 4. SAFE VARIABLE NAMING RULES:
 *    - AVOID: $a*, $b*, $g*, $l*, $r*, $t* (any variable starting with these)
 *    - SAFE: $prefix, $found, $settings, $item, $cmd, $pattern, $keyGroup, $matchXxx, $numXxx, etc.
 *    - When in doubt: Use longer descriptive names that don't start with a/b/g/l/r/t
 *
 * 5. EXAMPLES OF PROBLEMATIC VARIABLES:
 *    - $alias    -> &lias      (broken! $a is parsed as &)
 *    - $bar      -> |ar        (broken)
 *    - $good     -> >ood       (broken)
 *    - $list     -> <ist       (broken)
 *    - $rowNum   -> <CR>owNum  (broken! $r is parsed as carriage return)
 *    - $temp     -> <sep>emp   (broken)
 *
 * 6. POWERSHELL BUILT-IN VARIABLES TO AVOID:
 *    - $true     -> <sep>rue   (broken! $t is command separator)
 *    - $false    -> same reason, $f is safe but avoid for consistency
 *    - SOLUTION: Use 1/0 instead of $true/$false in doskey aliases
 *    - Example: $foundInSettings = 1  instead of  $foundInSettings = $true
 *
 * 7. TESTING DOSKEY ALIASES:
 *    - Script file (.cmd) uses %1, %2, %* syntax - test with: find-alias.cmd <args>
 *    - Doskey macro uses $1, $2, $* syntax - test in CMD terminal: find-alias <args>
 *    - IMPORTANT: PowerShell terminal calls script files, not doskey macros
 *    - To test doskey: Open CMD terminal first, then run the alias command
 *
 * =====================================================================================================================
 * LINUX BASH ALIAS LIMITATIONS AND SPECIAL CHARACTERS
 * =====================================================================================================================
 *
 * 1. BASH ALIAS SINGLE QUOTE ESCAPING:
 *    - Bash alias body is wrapped in single quotes: alias name='body'
 *    - Single quotes inside body must be escaped as: \"  (for pwsh -Command "...")
 *    - Use replacePowerShellQuoteForLinuxAlias() to convert single quotes in PowerShell commands
 *
 * 2. POWERSHELL VARIABLE ESCAPING FOR BASH ALIAS:
 *    - PowerShell variables ($name, $_) must be escaped with backslash: \$name, \$_
 *    - BUT $* and $1, $2, etc. should NOT be escaped (they are bash positional parameters)
 *    - Use replacePowerShellVarsForLinuxAlias() with regex: /(?<!\\)(\$[a-zA-Z_]\w*)/g
 *    - WARNING: $Matches variable will be overwritten by subsequent -match operations
 *    - SOLUTION: Save $Matches values to local variables BEFORE next -match call
 *
 * 3. MSR BLOCK MODE FOR MULTI-LINE ALIAS:
 *    - Use msr -b (begin pattern) -Q (quit pattern) -T -1 (tail filter) for multi-line matching
 *    - Use (?s) flag in regex to make .* match newlines: '(?s)^alias\s+(?<name>[\w-]+)=(?<body>.*)$'
 *    - Process msr output line by line, accumulating blocks until next alias definition
 *
 * 4. STRING LITERAL ESCAPING IN JAVASCRIPT TEMPLATE:
 *    - In getFindAliasBody(), special characters in -join separator must use [char] codes
 *    - Example: ($array -join ([char]44 + [char]32)) instead of ($array -join ", ")
 *    - Reason: ", " gets corrupted through multiple escaping layers (JS -> bash -> PowerShell)
 *
 * 5. BASHRC FILE SEARCH STRATEGY:
 *    - Search both ~/.bashrc and ~/msr-cmd-alias.bashrc for alias definitions
 *    - Use HashSet to track which files contain found aliases for accurate summary
 *    - Use HashMap to count alias occurrences for duplicate detection across files
 *
 * =====================================================================================================================
 */

export const [HasPwshExeOnWindows, PwshPathOnWindows] = IsWindows ? isToolExistsInPath('pwsh.exe', TerminalType.CMD) : [false, ''];
export const WindowsPowerShellCmdHeader = HasPwshExeOnWindows ? 'pwsh -Command' : 'PowerShell -Command';
// Avoid naming variables starting with '$b'/ '$g'/ '$t' / '$l' in PowerShell aliasBody to prevent conflicts with doskeys on Windows.
const ShouldUseFunctionRegex = /\$\d\b|[ "']+?\$[\*@]|\$\{@(:\d+)?\}|\n\s+/; // Check $1 or $* or $@ or "${@}" or "${@:2}"
const IsTailArgsRegex = /\$\*\W*$/;
const SafeConvertingArgsRegex = /^([^"]*?)(\$\*)([^"]*)$/mg; // One line has '$*' but no double quotes, change $* to "${@}"
const HasExistingArgsRegex = /\$\*|\$\d+|\$@\W*$|\$\{@(:\d+)?\}/;
const TrimMultilineRegex = /[\r\n]+\s*/mg;
const HasFunctionRegex = /^\s*function\s+\w+\(/m;
const ReplaceReturnToExit = /(?<=^|\s+)return(\s+(?:\d+|\$\S+)|\s*;)?\s*$/mg;
const ReplaceExitToReturn = /(?<=^|\s+)exit(\s+(?:\d+|\$\S+)|\s*;)?\s*$/mg;
const TrimPowerShellCmdWhiteRegex = /\b(pwsh|PowerShell)( 2>nul)? (-Command ")\s+/g;
const TrimForLoopWhite = /(%[a-zA-Z]\s+in\s+\(')\s+/g;
const GetPowerShellCommandHeadBodyRegex = /^(.*?)\b((?:pwsh|PowerShell)\s+(?:-Command\s+)?)"\s*(.+?)\s*"\s*$/s;

export function replacePowerShellVarsForLinuxAlias(body: string): string {
  // Match PowerShell variables: $name, $_, etc. (starting with letter or underscore)
  // But NOT $* or $1, $2, etc. (bash positional parameters)
  return body.replace(/(?<!\\)(\$[a-zA-Z_]\w*)/g, '\\$1');
}

export function replacePowerShellQuoteForLinuxAlias(windowsCmdBody: string): string {
  const match = GetPowerShellCommandHeadBodyRegex.exec(windowsCmdBody);
  if (!match) {
    return windowsCmdBody;
  }
  return match[1] + match[2] + '"' + match[3].replace(/'/g, String.raw`\"`) + '"';
}

function removeHeadSpacesInEachLine(body: string, addHead: string): string {
  const indexNewLine = body.indexOf('\n');
  if (indexNewLine > 0) {
    for (let k = indexNewLine + 1; k < body.length; k++) {
      if (body[k] !== ' ' && body[k] !== '\t') {
        const space = body.substring(indexNewLine + 1, k);
        return body.replace(new RegExp('^' + space, 'mg'), addHead);
      }
    }
  }
  return body;
}

function getCodeToReplaceHeadSpacesToTab(varName: string = 'rawBody', newLine: string = 'newLine'): string {
  const replaceTabTo = getConfig().ReplaceTabTo;
  if (replaceTabTo === '\t') {
    return '';
  }
  const spacePattern = String.raw`^(\t*) {${replaceTabTo.length}}`;
  return String.raw`$chTab=([char]9).ToString(); $${varName} = [string]::Join($${newLine}, ($${varName} | msr -t '${spacePattern}' -o '\1\t' -g -1 -aPAC));`;
}

function trimAliasBody(body: string): string {
  body = body.replace(/\t/g, MyConfig.ReplaceTabTo);
  return body.replace(TrimPowerShellCmdWhiteRegex, '$1$2 $3');
}

export function replaceArgForLinuxCmdAlias(body: string, writeToEachFile: boolean): string {
  // function or simple alias
  if (writeToEachFile) {
    body = body.replace(/\s+\$\*([^\w"]*)$/, ' "$*"$1');
  }

  const functionBody = body.replace(/^\s*\S+=['"]\s*function\s+[^\r\n]+[\r\n]+\s*(.+?)\}\s*;\s*\S+\s*['"]\s*$/s, '$1');
  if (functionBody !== body) {
    return functionBody.trim();
  }

  const aliasBody = body.replace(/^.*?=['"](.+)['"]\s*$/, '$1');
  return aliasBody.trim();
}

/**
 * OS-specific alias configuration for Windows and Linux/macOS
 * Used by getFindAliasBody() and getRemoveAliasBody() to avoid code duplication
 */
interface OsAliasConfig {
  /** PowerShell code to set $settingsPath variable for VSCode settings.json */
  settingsPathCode: string;
  /** Default cmd folder path ($env:USERPROFILE for Windows, $env:HOME for Linux) */
  defaultCmdFolder: string;
  /** Alias file name (msr-cmd-alias.doskeys for Windows, msr-cmd-alias.bashrc for Linux) */
  cmdFileName: string;
  /** Alias file type description (doskeys or bashrc) */
  cmdFileType: string;
  /** Script file extension (.cmd for Windows, empty for Linux) */
  scriptExt: string;
  /** OS-specific alias group name in settings.json */
  osSpecificGroup: string;
  /** Script subdirectory name (cmdAlias) */
  scriptSubFolder: string;
}

/**
 * Get the terminal type text for script subdirectory name.
 * This must match the logic in getCmdAliasSaveFolder() in terminalUtils.ts
 * @param terminalType - the terminal type enum
 * @returns subdirectory name (e.g., 'cmd', 'cygwin', 'mingw', 'wsl', 'linux', 'pwsh')
 */
function getTerminalTypeSubFolder(terminalType: TerminalType): string {
  // Logic from getCmdAliasSaveFolder in terminalUtils.ts:
  // const terminalTypeText = TerminalType[terminalType].toLowerCase()
  //   .replace(/bash$/i, '')
  //   .replace(/PowerShell$/i, 'cmd');
  return TerminalType[terminalType].toLowerCase()
    .replace(/bash$/i, '')
    .replace(/powershell$/i, 'cmd');
}

/**
 * Get OS-specific alias configuration
 * @param terminalType - the terminal type (for script subdirectory calculation)
 * @returns OsAliasConfig object with all OS-specific settings
 */
function getOsAliasConfig(terminalType: TerminalType): OsAliasConfig {
  const isWindows = isWindowsTerminalOnWindows(terminalType);
  const settingsPathCode = isWindows
    ? `$settingsPath = Join-Path $env:APPDATA 'Code/User/settings.json';`
    : `$settingsPath = Join-Path $env:HOME '.config/Code/User/settings.json';
    if (-not (Test-Path $settingsPath)) { $settingsPath = Join-Path $env:HOME 'Library/Application Support/Code/User/settings.json'; }`;

  // NOTE: Script files are saved in different subdirectories based on terminal type:
  // - Windows CMD/PowerShell: cmdAlias/cmd (see getCmdAliasSaveFolder in terminalUtils.ts)
  // - Cygwin: cmdAlias/cygwin
  // - MinGW: cmdAlias/mingw
  // - WSL: cmdAlias/wsl
  // - Linux: cmdAlias/linux or cmdAlias (depends on shouldSeparate)
  // This matches the behavior of getCmdAliasSaveFolder(isMultipleScripts=true, ...) which adds
  // terminalTypeText subdirectory when shouldSeparate is true
  const terminalTypeSubFolder = getTerminalTypeSubFolder(terminalType);
  const scriptSubFolder = 'cmdAlias/' + terminalTypeSubFolder;

  return {
    settingsPathCode,
    defaultCmdFolder: isWindows ? '$env:USERPROFILE' : '$env:HOME',
    cmdFileName: isWindows ? 'msr-cmd-alias.doskeys' : 'msr-cmd-alias.bashrc',
    cmdFileType: isWindows ? 'doskeys' : 'bashrc',
    scriptExt: isWindows ? '.cmd' : '',
    osSpecificGroup: isWindows ? 'msr.cmd.commonAliasNameBodyList' : 'msr.bash.commonAliasNameBodyList',
    scriptSubFolder,
  };
}

/**
 * Generate PowerShell code to search Windows doskeys file (single-line format: name=body)
 */
function getWindowsSearchCmdFileCode(): string {
  return String.raw`$foundInFile -split '\r?\n' | ForEach-Object {
          if ($_ -match '^(?<fp>.+?):(?<num>\d+):(?:\d+:)?\s*(?<content>.+)$') {
            $fp = $Matches['fp']; $numInFile = $Matches['num']; $content = $Matches['content'];
            $itemName = if ($content -match '^([\w-]+)=') { $Matches[1] } else { '' };
            if ($ShowDuplicates -or -not $foundNameSet.Contains($itemName)) {
              if ($countInSettings -gt 0 -or $countInAliasFiles -gt 0) { Write-Host ''; }
              $countInAliasFiles++;
              if ($content -match '^([\w-]+)=(.*)$') {
                Write-Host 'aliasName = ' -NoNewline; Write-Host $Matches[1] -ForegroundColor Green;
                Write-Host 'aliasBody = ' -NoNewline; Write-Host $Matches[2] -ForegroundColor Cyan;
              } else { Write-Host $content; }
              Write-Host ('Source = doskeys file at ' + $fp + ':' + $numInFile + ':') -ForegroundColor DarkGray;
            }
          }
        };`;
}

/**
 * Generate PowerShell code to search Linux bashrc file (multi-line format: alias name='body')
 * Uses block mode to capture complete multi-line alias definitions
 * Note: Uses $oneCmdFilePath from outer loop for file path display
 */
function getLinuxSearchCmdFileCode(): string {
  return String.raw`$allLines = $foundInFile -split '\r?\n' | Where-Object { $_ -match '^.+?:\d+:' };
          $currentBlock = @(); $currentLineNum = '';
          foreach ($oneLine in $allLines) {
            if ($oneLine -match '^(?<fp>.+?):(?<num>\d+):\s*(?<content>.*)$') {
              $lineNum = $Matches['num']; $content = $Matches['content'];
              if ($content -match '^alias\s+[\w-]+=') {
                if ($currentBlock.Count -gt 0) {
                  $fullContent = ($currentBlock | ForEach-Object { if ($_ -match '^.+?:\d+:\s*(.*)$') { $Matches[1] } else { $_ } }) -join ([char]10);
                  $fullContent = $fullContent.Trim();
                  if ($fullContent -match '(?s)^alias\s+(?<name>[\w-]+)=(?<body>.*)$') {
                    $itemName = $Matches['name']; $displayBody = $Matches['body'];
                    if ($ShowDuplicates -or -not $foundNameSet.Contains($itemName)) {
                      if ($countInSettings -gt 0 -or $countInAliasFiles -gt 0) { Write-Host ''; }
                      $countInAliasFiles++;
                [void] $foundCmdFileSet.Add($oneCmdFilePath);
                      Write-Host 'aliasName = ' -NoNewline; Write-Host $itemName -ForegroundColor Green;
                      Write-Host 'aliasBody = ' -NoNewline; Write-Host $displayBody -ForegroundColor Cyan;
                      Write-Host ('Source = ' + $oneCmdFilePath + ':' + $currentLineNum + ':') -ForegroundColor DarkGray;
                    }
                    if ($bashrcNameCountMap.ContainsKey($itemName)) { $bashrcNameCountMap[$itemName]++; } else { $bashrcNameCountMap[$itemName] = 1; }
                  }
                }
                $currentBlock = @($oneLine);
                $currentLineNum = $lineNum;
              } else {
                $currentBlock += $oneLine;
              }
            }
          }
          if ($currentBlock.Count -gt 0) {
            $fullContent = ($currentBlock | ForEach-Object { if ($_ -match '^.+?:\d+:\s*(.*)$') { $Matches[1] } else { $_ } }) -join ([char]10);
            $fullContent = $fullContent.Trim();
            if ($fullContent -match '(?s)^alias\s+(?<name>[\w-]+)=(?<body>.*)$') {
              $itemName = $Matches['name']; $displayBody = $Matches['body'];
                    if ($ShowDuplicates -or -not $foundNameSet.Contains($itemName)) {
                      if ($countInSettings -gt 0 -or $countInAliasFiles -gt 0) { Write-Host ''; }
                      $countInAliasFiles++;
                      [void] $foundCmdFileSet.Add($oneCmdFilePath);
                Write-Host 'aliasName = ' -NoNewline; Write-Host $itemName -ForegroundColor Green;
                Write-Host 'aliasBody = ' -NoNewline; Write-Host $displayBody -ForegroundColor Cyan;
                Write-Host ('Source = ' + $oneCmdFilePath + ':' + $currentLineNum + ':') -ForegroundColor DarkGray;
              }
              if ($bashrcNameCountMap.ContainsKey($itemName)) { $bashrcNameCountMap[$itemName]++; } else { $bashrcNameCountMap[$itemName] = 1; }
            }
          }`;
}

/**
 * Generate find-alias PowerShell command body for both Windows and Linux
 * NOTE: Variable names MUST NOT start with $a, $b, $g, $l, $r, $t to avoid DOSKEY special character conflicts.
 * See DOSKEY SPECIAL CHARACTERS documentation at the top of this file.
 * @param terminalType - the terminal type for OS and script path determination
 * @returns PowerShell command body (without escaping for Linux alias)
 */
function getFindAliasBody(terminalType: TerminalType): string {
  const isWindows = isWindowsTerminalOnWindows(terminalType);
  const config = getOsAliasConfig(terminalType);

  // Read alias folder from settings.json at runtime, fallback to default if not set
  // NOTE: Use $cmdFilePath instead of $aliasFilePath to avoid DOSKEY $a -> & conflict
  const cmdFilePathCode = `
    $cmdFolder = ${config.defaultCmdFolder};
    if (Test-Path $settingsPath) {
      try {
        $saveFolder = (Get-Content $settingsPath -Raw | ConvertFrom-Json).PSObject.Properties['msr.cmdAlias.saveFolder'].Value;
        if ($saveFolder) { $cmdFolder = $saveFolder.Trim(); }
      } catch { }
    }
    $cmdFilePath = Join-Path $cmdFolder '${config.cmdFileName}';`;

  // NOTE: All variables renamed to avoid DOSKEY special characters:
  // $aliasFolder -> $cmdFolder, $aliasFilePath -> $cmdFilePath, $aliasFileCount -> $cmdFileCount
  // $aliasList -> $itemList, $aliasIndex -> $itemIndex, $alias -> $item, $aliasName -> $itemName
  // $aliasNumInFile -> $itemNumInFile, $allKeyGroups -> $keyGroupList, $foundAliasNames -> $foundNames
  // User input parameters use PascalCase to follow PowerShell conventions and distinguish from internal variables
  // Support both positional and named parameters: find-alias grep-alias -OnlyThisOS 0
  return String.raw`
    $inputParams = @{}; $positionalParams = @();
    $currentParamName = $null;
    foreach ($inputValue in @('$*' -split '\s+' | Where-Object { $_ })) {
      if ($inputValue -match '^-(\w+)$') { $currentParamName = $Matches[1]; }
      elseif ($currentParamName) { $inputParams[$currentParamName] = $inputValue; $currentParamName = $null; }
      else { $positionalParams += $inputValue; }
    }
    $Prefix = if ($inputParams.ContainsKey('Prefix')) { $inputParams['Prefix'] } elseif ($positionalParams.Count -gt 0) { $positionalParams[0] } else { '' };
    $IsExactEqual = if ($inputParams.ContainsKey('IsExactEqual')) { $inputParams['IsExactEqual'] -imatch '^(1|true|y)$' } elseif ($positionalParams.Count -gt 1) { $positionalParams[1] -imatch '^(1|true|y)$' } else { 0 };
    $SearchCmdFile = if ($inputParams.ContainsKey('SearchCmdFile')) { -not ($inputParams['SearchCmdFile'] -imatch '^(0|false|n)$') } elseif ($positionalParams.Count -gt 2) { -not ($positionalParams[2] -imatch '^(0|false|n)$') } else { 1 };
    $ShowDuplicates = if ($inputParams.ContainsKey('ShowDuplicates')) { $inputParams['ShowDuplicates'] -imatch '^(1|true|y)$' } elseif ($positionalParams.Count -gt 3) { $positionalParams[3] -imatch '^(1|true|y)$' } else { 0 };
    $OnlyThisOS = if ($inputParams.ContainsKey('OnlyThisOS')) { -not ($inputParams['OnlyThisOS'] -imatch '^(0|false|n)$') } elseif ($positionalParams.Count -gt 4) { -not ($positionalParams[4] -imatch '^(0|false|n)$') } else { 1 };
    if (-not $Prefix) { Write-Host 'Usage: find-alias <Prefix> [-IsExactEqual 1] [-SearchCmdFile 0] [-ShowDuplicates 1] [-OnlyThisOS 0]' -ForegroundColor Red; Write-Host 'Or positional: find-alias <Prefix> [IsExactEqual] [SearchCmdFile] [ShowDuplicates] [OnlyThisOS]' -ForegroundColor Yellow; exit 1; }
    ${config.settingsPathCode}
    ${cmdFilePathCode}
    $countInSettings = 0; $foundGroupCount = 0; $sumItemCount = 0; $sumGroupCount = 0; $foundGroupNames = @(); $countInAliasFiles = 0; $foundNames = @();
    $dq = [char]34;
    if (Test-Path $settingsPath) {
      try {
        $settingsRaw = Get-Content $settingsPath -Raw;
        $settings = msr -p $settingsPath -b '^\W+msr.\w*\.?\w+List\W+$' -Q '^\s*\]\W*$' -PAC | msr -S -t '(.+?),\s*$' -o '{\1}' -aPAC | msr -S -t ',(?=\s*[\}\]])' -o ' ' -aPAC | ConvertFrom-Json;
        $keyGroupList = @('msr.commonAliasNameBodyList','msr.bash.commonAliasNameBodyList','msr.cmd.commonAliasNameBodyList');
        $keyGroupNames = if ($OnlyThisOS) { @('msr.commonAliasNameBodyList','${config.osSpecificGroup}') } else { $keyGroupList };
        foreach ($keyGroup in $keyGroupNames) {
          $itemList = $settings.PSObject.Properties[$keyGroup].Value;
          if (-not $itemList) { continue; }
          $sumGroupCount++; $sumItemCount += $itemList.Count; $hasFoundInGroup = 0;
          $matchesOfKey = Select-String -InputObject $settingsRaw -Pattern ('(?m)^\s*' + $dq + [regex]::Escape($keyGroup) + $dq) -AllMatches;
          $keyGroupStartNum = if ($matchesOfKey.Matches.Count -gt 0) { ($settingsRaw.Substring(0, $matchesOfKey.Matches[0].Index) -split '\r?\n').Count } else { 0 };
          $itemIndex = 0;
          foreach ($item in $itemList) {
            $itemIndex++;
            if (($IsExactEqual -and $item.aliasName -eq $Prefix) -or (-not $IsExactEqual -and $item.aliasName -like ($Prefix + '*'))) {
              if ($countInSettings -gt 0) { Write-Host ''; }
              $countInSettings++; $foundNames += $item.aliasName;
              if (-not $hasFoundInGroup) { $foundGroupCount++; $foundGroupNames += $keyGroup; $hasFoundInGroup = 1; }
              $itemNumInFile = $keyGroupStartNum + $itemIndex;
              $nameMatches = Select-String -InputObject $settingsRaw -Pattern ($dq + 'aliasName' + $dq + '\s*:\s*' + $dq + [regex]::Escape($item.aliasName) + $dq) -AllMatches;
              foreach ($oneMatch in $nameMatches.Matches) { $matchLineNum = ($settingsRaw.Substring(0, $oneMatch.Index) -split '\r?\n').Count; if ($matchLineNum -ge $keyGroupStartNum) { $itemNumInFile = $matchLineNum; break; } }
              Write-Host 'aliasName = ' -NoNewline; Write-Host $item.aliasName -ForegroundColor Green;
              Write-Host 'aliasBody = ' -NoNewline; Write-Host $item.aliasBody -ForegroundColor Cyan;
              Write-Host 'description = ' -NoNewline; Write-Host $item.description;
              Write-Host ('Source = ' + $keyGroup + ' at ' + $settingsPath + ':' + $itemNumInFile + ':') -ForegroundColor DarkGray;
            }
          }
        }
      } catch { }
    }
    if (($countInSettings -eq 0 -or -not $IsExactEqual -or $SearchCmdFile)${isWindows ? ' -and (Test-Path $cmdFilePath)' : ''}) {
      $searchPattern = if ($IsExactEqual) { '^\s*${isWindows ? '' : '(alias\\s+)?'}' + [regex]::Escape($Prefix) + '=' } else { '^\s*${isWindows ? '' : '(alias\\s+)?'}' + [regex]::Escape($Prefix) + '[\w-]*=' };
      $foundNameSet = New-Object 'System.Collections.Generic.HashSet[string]'([StringComparer]::OrdinalIgnoreCase);
      foreach ($name in $foundNames) { [void] $foundNameSet.Add($name); }
      ${isWindows
      ? `$foundInFile = msr -p $cmdFilePath -t $searchPattern --nt '^\\s*#' -AC 2>$null;
      if ($foundInFile) {
        ${getWindowsSearchCmdFileCode()}
      }`
      : `$bashrcNameCountMap = @{};
      $foundCmdFileSet = New-Object 'System.Collections.Generic.HashSet[string]'([StringComparer]::OrdinalIgnoreCase);
      $cmdFilePaths = @((Join-Path $env:HOME '.bashrc'), $cmdFilePath) | Where-Object { Test-Path $_ };
      foreach ($oneCmdFilePath in $cmdFilePaths) {
        $foundInFile = msr -p $oneCmdFilePath -b $searchPattern -Q '^alias \\w+' -y -T -1 -AC 2>$null;
        if ($foundInFile) {
          ${getLinuxSearchCmdFileCode()}
        }
      }
      $dupNames = @($bashrcNameCountMap.Keys | Where-Object { $bashrcNameCountMap[$_] -gt 1 });
      if ($dupNames.Count -gt 0) {
        Write-Host '';
        Write-Host ('Found ' + $dupNames.Count + ' duplicate alias in 2 bashrc files: ' + ($dupNames -join ' + ')) -ForegroundColor Yellow;
      }`}
    }
    $summaryParts = @();
    $sumFound = $countInSettings + $countInAliasFiles;
    if ($sumFound -gt 0) { $summaryParts += 'Found ' + [string]$sumFound + ' alias(es) in total.'; }
    if ($countInAliasFiles -gt 0) { $summaryParts += 'Found ' + [string]$countInAliasFiles + ' alias(es) in ${config.cmdFileType} file(s): ' + ${isWindows ? '$cmdFilePath' : '($foundCmdFileSet -join ([char]44 + [char]32))'} + '.'; }
    if ($countInSettings -gt 0) { $summaryParts += 'Found ' + [string]$countInSettings + ' alias(es) in ' + $foundGroupCount + ' groups from ' + $sumItemCount + ' aliases in ' + $sumGroupCount + ' groups: ' + ($foundGroupNames -join ', ') + ' in ' + $settingsPath + '.'; }
    if ($summaryParts.Count -gt 0) { Write-Host ''; Write-Host ($summaryParts -join ' ') -ForegroundColor Green; }
    elseif ($countInSettings -eq 0 -and $countInAliasFiles -eq 0) { $notFoundMsg = if ($IsExactEqual) { 'Not found alias name = ' } else { 'Not found alias starting with: ' }; Write-Host ($notFoundMsg + $Prefix) -ForegroundColor Red; }`;
}

export function replaceArgForWindowsCmdAlias(body: string, writeToEachFile: boolean): string {
  body = replaceTextByRegex(body, /([\"'])\$1/g, '$1%~1'); // replace "$1" to "%~1"
  body = replaceTextByRegex(body, /\$(\d+)/g, '%$1'); // replace $1 to %1
  body = replaceTextByRegex(body, /\$\*/g, '%*').trim(); // replace $* to %*
  body = writeToEachFile
    ? replaceForLoopVariableForWindowsScript(body)
    : replaceForLoopVariableForWindowsAlias(body);
  return body;
}

/**
 * Generate rm-alias PowerShell command body for both Windows and Linux
 * NOTE: Variable names MUST NOT start with $a, $b, $g, $l, $r, $t to avoid DOSKEY special character conflicts.
 * See DOSKEY SPECIAL CHARACTERS documentation at the top of this file.
 * @param terminalType - the terminal type for OS and script path determination
 * @returns PowerShell command body (without escaping for Linux alias)
 */
function getRemoveAliasBody(terminalType: TerminalType): string {
  const isWindows = isWindowsTerminalOnWindows(terminalType);
  const config = getOsAliasConfig(terminalType);

  // Read alias folder from settings.json at runtime, fallback to default if not set
  // NOTE: Use $cmdFilePath instead of $aliasFilePath to avoid DOSKEY $a -> & conflict
  // NOTE: Script files are saved in $cmdFolder/cmdAlias/<terminalType>/ subdirectory
  // (see getCmdAliasSaveFolder in terminalUtils.ts)
  // Terminal type subdirectories: cmd (for CMD/PowerShell), cygwin, mingw, wsl, linux, pwsh
  const cmdFilePathCode = `
    $cmdFolder = ${config.defaultCmdFolder};
    if (Test-Path $settingsPath) {
      try {
        $saveFolder = (Get-Content $settingsPath -Raw | ConvertFrom-Json).PSObject.Properties['msr.cmdAlias.saveFolder'].Value;
        if ($saveFolder) { $cmdFolder = $saveFolder.Trim(); }
      } catch { }
    }
    $cmdFilePath = Join-Path $cmdFolder '${config.cmdFileName}';
    $scriptFolder = Join-Path $cmdFolder '${config.scriptSubFolder}';`;

  // NOTE: All variables renamed to avoid DOSKEY special characters:
  // $aliasFolder -> $cmdFolder, $aliasFilePath -> $cmdFilePath
  // $aliasNames -> $inputNameList, $aliasName -> $itemName
  // $aliasFileContent -> $cmdFileContent, $aliasFileModified -> $cmdFileModified
  // $aliasList -> $itemList, $foundInAliasFile -> $foundInCmdFile
  return String.raw`
    $InputNames = '$1';
    if (-not $InputNames) { Write-Host 'Usage: rm-alias <AliasNames> (comma-separated)' -ForegroundColor Red; exit 1; }
    ${config.settingsPathCode}
    ${cmdFilePathCode}
    $inputNameList = @($InputNames -split '\s*,\s*' | Where-Object { $_ });
    $removedCount = 0;
    $notFoundNames = @();
    $foundInCmdFile = @();
    $foundInSettings = @();
    $deletedScripts = @();
    $cmdFileContent = $null;
    $cmdFileModified = 0;
    if (Test-Path $cmdFilePath) { $cmdFileContent = Get-Content $cmdFilePath -Raw; }
    $settings = $null;
    $settingsModified = 0;
    if (Test-Path $settingsPath) { try { $settings = Get-Content $settingsPath -Raw | ConvertFrom-Json; } catch { } }
    $keyGroupNames = @('msr.commonAliasNameBodyList','${config.osSpecificGroup}');
    foreach ($itemName in $inputNameList) {
      $foundForItem = 0;
      if ($cmdFileContent) {
        ${isWindows
      ? `$searchPattern = '(?m)^\\s*' + [regex]::Escape($itemName) + '=.*[\\r\\n]*';
        $newContent = $cmdFileContent -replace $searchPattern, '';`
      : `$searchPattern = '(?ms)^\\s*alias\\s+' + [regex]::Escape($itemName) + '=.*?(?=^\\s*alias\\s+\\w|\\z)';
        $newContent = $cmdFileContent -replace $searchPattern, '';
        $newContent = $newContent -replace '(?m)^\\s*[\\r\\n]+', ([char]10).ToString();`}
        if ($newContent -ne $cmdFileContent) {
          $cmdFileContent = $newContent;
          $cmdFileModified++;
          $foundInCmdFile += $itemName;
          $removedCount++; $foundForItem = 1;
        }
      }
      $scriptPath = Join-Path $scriptFolder ($itemName + '${config.scriptExt}');
      if (Test-Path $scriptPath) {
        Remove-Item -Path $scriptPath -Force;
        Write-Host ('Deleted script file: ' + $scriptPath) -ForegroundColor Yellow;
        $deletedScripts += $scriptPath;
        $removedCount++; $foundForItem = 1;
      }
      if ($settings) {
        foreach ($keyGroup in $keyGroupNames) {
          $prop = $settings.PSObject.Properties[$keyGroup];
          if ($prop -and $prop.Value) {
            $itemList = @($prop.Value);
            $newItemList = @($itemList | Where-Object { $_.aliasName -ne $itemName });
            if ($newItemList.Count -lt $itemList.Count) {
              $prop.Value = $newItemList;
              $settingsModified++;
              $foundInSettings += ($keyGroup + ':' + $itemName);
              $removedCount++; $foundForItem = 1;
            }
          }
        }
      }
      if ($foundForItem -eq 0) { $notFoundNames += $itemName; }
    }
    if ($cmdFileModified -gt 0) {
      Set-Content -Path $cmdFilePath -Value $cmdFileContent.TrimEnd() -NoNewline;
      Write-Host ('Removed ' + $foundInCmdFile.Count + ' alias(es) from ' + $cmdFilePath + ': ' + ($foundInCmdFile -join ', ')) -ForegroundColor Green;
    }
    if ($deletedScripts.Count -gt 0) {
      Write-Host ('Deleted ' + $deletedScripts.Count + ' script file(s): ' + ($deletedScripts -join ', ')) -ForegroundColor Green;
    }
    if ($settingsModified -gt 0) {
      $newJson = $settings | ConvertTo-Json -Depth 100;
      Set-Content -Path $settingsPath -Value $newJson -Encoding UTF8;
      Write-Host ('Removed ' + $foundInSettings.Count + ' alias(es) from settings.json: ' + ($foundInSettings -join ', ')) -ForegroundColor Green;
    }
    if ($notFoundNames.Count -gt 0) {
      Write-Host ('Alias not found: ' + ($notFoundNames -join ', ')) -ForegroundColor Red;
    }
    if ($removedCount -gt 0) {
      Write-Host ('Total removed: ' + $removedCount + ' item(s)') -ForegroundColor Cyan;
    }`;
}

// NOTE: find-alias and rm-alias are dynamically generated in getCommonAliasMap() based on terminalType
// to ensure the correct script subdirectory is used for each terminal type (cmd, cygwin, mingw, wsl, linux, pwsh)

let LinuxAliasMap: Map<string, string> = new Map<string, string>()
  .set('vim-to-row', String.raw`msr -z "$1" -t "^(.+?):(\d+)(:.*)?$" -o "vim +\2 +\"set number\" \"\1\"" -XM`)
  .set('git-add-safe-dir', String.raw`repoRootDir=$(git rev-parse --show-toplevel);
      git config --global --get-all safe.directory
        | msr -t "^$repoRootDir/?$" -M && msr -XMI -z "git config --global --add safe.directory $repoRootDir";
      [ -f $repoRootDir/.gitmodules ] && msr -p $repoRootDir/.gitmodules -t "^\s*path\s*=\s*(\S+)" -o "$repoRootDir/\1" -PAC
        | nin ~/.gitconfig "^(\S+)" "^\s*directory\s*=\s*(\S+)" -PAC
        | msr -t "(.+)" -o "git config --global --add safe.directory \1" -XMI;
      msr -XMI -z "git config --global --get-all safe.directory | msr -x $repoRootDir -P as final check"`)
  .set('clear-msr-env', String.raw`for name in $(printenv | msr -t "^(MSR_\w+)=.*" -o "\1" -PAC); do echo "Cleared $name=$(printenv $name)" | grep -iE "MSR_\w+" --color && eval "unset $name"; done`)
  .set('out-fp', String.raw`export MSR_OUT_FULL_PATH=1 && echo "Will output full file paths."`)
  .set('out-rp', String.raw`export MSR_OUT_FULL_PATH=0 && echo "Will output relative file paths."`)
  .set('out-wp', String.raw`export MSR_UNIX_SLASH=0 && echo "Now will output backslash '\\' (Windows style) for result paths."`)
  .set('out-up', String.raw`export MSR_UNIX_SLASH=1 && echo "Now will output forward slash '/' (Unix style) for result paths."`)
  ;

const CommonAliasMap: Map<string, string> = new Map<string, string>()
  .set('gpc', String.raw`git branch | msr -t "^\s*\*\s*(\S+).*" -o "git pull origin \1 $*" -XM & del-this-tmp-list`)
  .set('gpm', String.raw`pwsh -Command "$mainRef = git rev-parse --verify origin/main 2>$null; $primaryBranch = if ($mainRef) { 'main' } else { 'master' }; $cmd = 'git pull origin ' + $primaryBranch + ' $*'; [Console]::Error.WriteLine($cmd); Invoke-Expression $cmd" & del-this-tmp-list`)
  .set('gph', String.raw`git branch | msr -t "^\s*\*\s*(\S+).*" -o "git push origin \1 $*" -XM`)
  .set('gpc-sm', String.raw`git rev-parse --abbrev-ref HEAD | msr -t "(.+)" -o "git pull origin \1 --no-recurse-submodules" -XM
          & del-this-tmp-list & msr -z "git submodule sync && git submodule update --init" -t "&&" -o "\n" -PAC | msr -XM -V ne0`)
  .set('gpc-sm-reset', String.raw`git rev-parse --abbrev-ref HEAD | msr -t "(.+)" -o "git pull origin \1 --no-recurse-submodules" -XM
          && msr -z "git submodule sync && git submodule update --init && git submodule update -f" -t "&&" -o "\n" -PAC | msr -XM -V ne0
          & del-this-tmp-list
          & git status`)
  .set('gca', String.raw`git commit --amend --no-edit $*`)
  .set('gfc', String.raw`git rev-parse --abbrev-ref HEAD | msr -t "(.+)" -o "git fetch origin \1" -XM`)
  .set('gdc', String.raw`git rev-parse --abbrev-ref HEAD | msr -t "(.+)" -o "git difftool origin/\1 $*" -XM`)
  .set('gdc-l', String.raw`git rev-parse --abbrev-ref HEAD | msr -t "(.+)" -o "git diff --name-only origin/\1 $*" -XM`)
  .set('gdf', String.raw`git diff --name-only $1 | msr -t "(.+)" -o "git difftool $* \1" -XM`)
  .set('gsh', String.raw`git rev-parse --abbrev-ref HEAD | msr -t "(.+)" -o "git reset --hard origin/\1" -XM`)
  .set('gsh-sm', String.raw`git rev-parse --abbrev-ref HEAD | msr -t "(.+)" -o "git reset --hard origin/\1" -XM
          && msr -z "git submodule sync --init && git submodule update -f" -t "&&" -o "\n" -PAC | msr -XM -V ne0 & git status`)
  .set('gst', String.raw`git status $*`)
  .set('git-gc', String.raw`git reflog expire --all --expire=now && git gc --prune=now --aggressive`)
  .set('git-rb-list', String.raw`git for-each-ref --format="%(refname:short)" refs/remotes/origin`) // git ls-remote --heads origin | msr -t "^\w+\s+refs/.+?/" -o "" -PAC
  .set('git-shallow-clone', String.raw`echo git clone --single-branch --depth 1 $* && git clone --single-branch --depth 1 $*`)
  .set('git-clean', String.raw`msr -z "git clean -xffd && git submodule foreach --recursive git clean -xffd" -t "&&" -o "\n" -PAC | msr -XM`)
  .set('git-sm-prune', String.raw`msr -XM -z "git prune" && msr -XMz "git submodule foreach git prune"`)
  .set('git-sm-init', String.raw`msr -XMz "git submodule sync" && echo git submodule update --init $* | msr -XM & del-this-tmp-list & git status`)
  .set('git-sm-reset', String.raw`msr -XMz "git submodule sync" && msr -XMz "git submodule init" && echo git submodule update -f $*
          | msr -XM & del-this-tmp-list & git status`)
  .set('git-sm-restore', String.raw`echo git restore . --recurse-submodules $* | msr -XM & del-this-tmp-list & git status`)
  .set('git-sm-reinit', String.raw`msr -XM -z "git submodule deinit -f ." && msr -XM -z "git submodule update --init" & git status`)
  .set('git-sm-update-remote', String.raw`msr -XMz "git submodule sync" && echo git submodule update --remote $* | msr -XM & git status`)
  .set('git-cherry-pick-branch-new-old-commits', String.raw`git log $1 | msr -b "^commit $2" -q "^commit $3" -t "^commit (\w+)" -o "\1" -M -C
          | msr -s "^:(\d+):" -n --dsc -t "^:\d+:(?:\d+:)?\s+(\w+)" -o "git cherry-pick \1" -X -V ne0 $4 $5 $6 $7 $8 $9`)
  .set('git-sm-check', String.raw`git diff --name-only HEAD
          | msr -x / -o \ -aPAC | msr -t "(.+)" -o "if exist \1\* pushd \1 && git status --untracked-files=all --short && git diff --name-only" -XM $*`)
  .set('git-sm-delete', String.raw`git diff --name-only HEAD
          | msr -x / -o \ -aPAC | msr -t "(.+)" -o "if exist \1\* pushd \1
              && git status --untracked-files=all --short
              && git diff --name-only
              && git status --untracked-files=all --short
            | msr -t \"^\\W+\\s+(.+)\\s*$\" -o \"git clean -dfx \\1\" -XM" -XM`)
  .set('sfs', String.raw`msr -l --sz --wt -p $*`)
  .set('sft', String.raw`msr -l --wt --sz -p $*`)
  .set('git-find-commit', String.raw`git log --since="36 months ago" --date=format-local:"%Y-%m-%d %H:%M:%S %z" --pretty=format:"%H %ad %an %s" --grep=$*`)
  .set('git-find-content', String.raw`git log --since="36 months ago" --date=format-local:"%Y-%m-%d %H:%M:%S %z" --pretty=format:"%H %ad %an %s" -S $*`)
  .set('git-find-log', String.raw`git log --since="36 months ago" --date=format-local:"%Y-%m-%d %H:%M:%S %z" | msr -b "^commit \w+" -Q "" -y -aPAC -it $* | msr -i -t "^(commit\W+|Author:|Date:)|$1" -P -e "^commit\W+.*|(^Author:.*)|^Date:.*"`)
  .set('git-find-creation', String.raw`git log --since="36 months ago" --date=format-local:"%Y-%m-%d %H:%M:%S %z" --pretty=format:"%H %ad %an %s" --follow --diff-filter=A --name-status -- $*`)
  .set('git-find-deletion', String.raw`git log --since="36 months ago" --date=format-local:"%Y-%m-%d %H:%M:%S %z" --pretty=format:"%H %ad %an %s" --follow --diff-filter=D --name-status -- $*`)
  .set('git-find-update', String.raw`git log --since="36 months ago" --date=format-local:"%Y-%m-%d %H:%M:%S %z" --pretty=format:"%H %ad %an %s" --follow --diff-filter=M --name-status -- $*`)
  .set('glc', String.raw`git branch --show-current | msr -t "(.+)" -o "git log --date=format-local:\"%Y-%m-%d %H:%M:%S %z\" --pretty=format:\"%H %ad %an %s\" --name-only origin/\1 $*" -XIM --to-stderr --keep-color`)
  .set('glcc', String.raw`git branch --show-current | msr -t "(.+)" -o "git log --date=format-local:\"%Y-%m-%d %H:%M:%S %z\" --pretty=format:\"%H %ad %an %s\" --name-only \1 $*" -XIM --to-stderr --keep-color`)
  .set('gdm', String.raw`pwsh -Command "$mainRef = git rev-parse --verify origin/main 2>$null; $primaryRef = if ($mainRef) { 'origin/main' } else { 'origin/master' }; $cmd = 'git difftool ' + $primaryRef + '... $*'; [Console]::Error.WriteLine($cmd); Invoke-Expression $cmd"`)
  .set('gdm-l', String.raw`pwsh -Command "$mainRef = git rev-parse --verify origin/main 2>$null; $primaryRef = if ($mainRef) { 'origin/main' } else { 'origin/master' }; $cmd = 'git diff --name-only ' + $primaryRef + '... $*'; [Console]::Error.WriteLine($cmd); Invoke-Expression $cmd"`)
  .set('gdm-al', String.raw`pwsh -Command "$mainRef = git rev-parse --verify origin/main 2>$null; $primaryRef = if ($mainRef) { 'origin/main' } else { 'origin/master' }; $cmd = 'git diff --name-only --diff-filter=A ' + $primaryRef + '... $*'; [Console]::Error.WriteLine($cmd); Invoke-Expression $cmd"`)
  .set('gdm-m', String.raw`pwsh -Command "$mainRef = git rev-parse --verify origin/main 2>$null; $primaryRef = if ($mainRef) { 'origin/main' } else { 'origin/master' }; $cmd = 'git difftool --diff-filter=M ' + $primaryRef + '... $*'; [Console]::Error.WriteLine($cmd); Invoke-Expression $cmd"`)
  .set('gdm-ml', String.raw`pwsh -Command "$mainRef = git rev-parse --verify origin/main 2>$null; $primaryRef = if ($mainRef) { 'origin/main' } else { 'origin/master' }; $cmd = 'git diff --name-only --diff-filter=M ' + $primaryRef + '... $*'; [Console]::Error.WriteLine($cmd); Invoke-Expression $cmd"`)
  .set('gdm-dl', String.raw`pwsh -Command "$mainRef = git rev-parse --verify origin/main 2>$null; $primaryRef = if ($mainRef) { 'origin/main' } else { 'origin/master' }; $cmd = 'git diff --name-only --diff-filter=D ' + $primaryRef + '... $*'; [Console]::Error.WriteLine($cmd); Invoke-Expression $cmd"`)
  .set('gdm-nt', String.raw`pwsh -Command "$mainRef = git rev-parse --verify origin/main 2>$null; $primaryRef = if ($mainRef) { 'origin/main' } else { 'origin/master' }; $cmd = 'git diff ' + $primaryRef + '... $* | msr -b \"^\s*diff\s+\" -Q \"\" -y --nt \"^diff\s+.*?test\" -i -PIC'; [Console]::Error.WriteLine($cmd); Invoke-Expression $cmd"`)
  .set('to-alias-body', String.raw`pwsh -Command "
          $WithQuotes = '$1' -imatch '^(true|1|y)$';
          $cmdBody = Get-Clipboard;
          if ([string]::IsNullOrWhiteSpace($cmdBody)) {
            Write-Host 'Clipboard is empty! Please copy the alias body (raw command) to clipboard first.' -ForegroundColor Red;
            return;
          }
          if ([regex]::IsMatch($cmdBody, '\bfunction\s+\w+\(\s*\)\s*\{')) {
            Write-Host 'Please copy only the command body, not the function wrapper.' -ForegroundColor Red;
            return;
          }
          $newLine = ([char]10).ToString();
          $newBody = [string]::Join($newLine, $cmdBody).Trim();
          ${getCodeToReplaceHeadSpacesToTab('newBody', 'newLine')}
          $jsonBody = $newBody | ConvertTo-Json;
          if ($PSVersionTable.PSVersion.Major -lt 7) {
            $jsonBody = $jsonBody.Replace('\u0026', '&').Replace('\u003e', '>').Replace('\u0027', ([char]39).ToString()).Replace('\u003c', '<');
          }
          if (-not $WithQuotes) {
            $jsonBody = $jsonBody.Substring(1, $jsonBody.Length - 2);
          }
          Set-Clipboard $jsonBody;
          $jsonBody;
          $message = 'Copied one-line body(length = ' + $jsonBody.Length + ') above to clipboard, you can paste it to aliasBody in msr.xxx.commonAliasNameBodyList in vscode settings.json';
          Write-Host $message -ForegroundColor Green"`)
  ;

['to-alias-body', 'gpm', 'gdm', 'gdm-m', 'gdm-l', 'gdm-al', 'gdm-ml', 'gdm-dl', 'gdm-nt'].forEach(name => {
  let body = (CommonAliasMap.get(name) || '').replace(TrimMultilineRegex, ' ');
  body = replacePowerShellQuoteForLinuxAlias(body);
  body = replacePowerShellVarsForLinuxAlias(body);
  LinuxAliasMap.set(name, body);
});

['git-sm-check', 'git-sm-delete'].forEach(name => {
  const body = (LinuxAliasMap.get(name) || CommonAliasMap.get(name));
  if (body) {
    const newBody = body.replace(String.raw`if exist \1\* pushd `, String.raw`[ -d \1 ] && cd `)
      .replace(String.raw` msr -x / -o \ -aPAC |`, "");
    LinuxAliasMap.set(name, newBody);
  }
});

// Remove new lines at head with " |" or " &&" in alias body for Linux terminal.
const JoinLineHeadRegex: RegExp = /([\r\n]+)\s*([\|&]+)/mg;
CommonAliasMap.forEach((body, name, _) => {
  body = LinuxAliasMap.get(name) || body;
  let newBody = body.replace(JoinLineHeadRegex, ' $2');
  newBody = removeHeadSpacesInEachLine(newBody, getConfig().ReplaceTabTo);
  LinuxAliasMap.set(name, newBody);
});

LinuxAliasMap.forEach((body, name, _) => {
  let newBody = removeHeadSpacesInEachLine(body, getConfig().ReplaceTabTo);
  if (!CommonAliasMap.has(name)) {
    newBody = newBody.replace(JoinLineHeadRegex, ' $2');
  }
  LinuxAliasMap.set(name, newBody);
});

function getPathEnv(targets: string[] = ['User']): string {
  let pathSet = new Set<string>();
  targets.forEach(target => {
    pathSet.add(String.raw`[System.Environment]::GetEnvironmentVariable('PATH', [System.EnvironmentVariableTarget]::${target})`);
  });
  return Array.from(pathSet).join(" + ';' + ");
}

function getReloadWindowsEnvCmd(skipPaths: string = '', addTmpPaths: string = ''): string {
  const setDeletionPaths = isNullOrEmpty(skipPaths)
    ? ''
    : String.raw`
    $deleteValues = ('${skipPaths}'.Trim().TrimEnd('\; ')) -split '\\*\s*;\s*';
    $deleteValueSet = New-Object System.Collections.Generic.HashSet[String]([StringComparer]::OrdinalIgnoreCase);
    foreach ($pv in $deleteValues) {
      [void] $deleteValueSet.Add($pv);
    }`;

  const skipAddingNewPath = isNullOrEmpty(skipPaths)
    ? ''
    : String.raw`if ($deleteValueSet.Contains($pv)) { continue; }`;

  const addingTmpPath = isNullOrEmpty(addTmpPaths)
    ? ''
    : String.raw`$pathValues += ';' + ('${addTmpPaths}'.Trim().TrimEnd('\; '));`;
  return String.raw`for /f "tokens=*" %a in ('${WindowsPowerShellCmdHeader} "
  ${setDeletionPaths}
  $pathValues = ${getPathEnv(['Machine', 'User', 'Process'])};
  ${addingTmpPath}
  $values = $pathValues -split '\\*\s*;\s*';
  $valueSet = New-Object System.Collections.Generic.HashSet[String]([StringComparer]::OrdinalIgnoreCase);
  foreach ($pv in $values) {
    ${skipAddingNewPath}
    [void] $valueSet.Add($pv);
  }
  [void] $valueSet.Remove('');
  [String]::Join(';', $valueSet)"') do @SET "PATH=%a"`;
}

function getReloadEnvCmd(writeToEachFile: boolean, name: string = 'reload-env'): string {
  const escapeCmdEqual = '^=';
  const cmdAlias = String.raw`for /f "tokens=*" %a in ('${WindowsPowerShellCmdHeader} "
    $processEnvs = [System.Environment]::GetEnvironmentVariables([System.EnvironmentVariableTarget]::Process);
    $sysEnvs = [System.Environment]::GetEnvironmentVariables([System.EnvironmentVariableTarget]::Machine);
    $userEnvs = [System.Environment]::GetEnvironmentVariables([System.EnvironmentVariableTarget]::User);
    $pathValueSet = New-Object System.Collections.Generic.HashSet[String]([StringComparer]::OrdinalIgnoreCase);
    $allPathValues = $($processEnvs['Path'] + ';' + $sysEnvs['Path'] + ';' + $userEnvs['Path']) -Split '\\*\s*;\s*';
    foreach ($path in $allPathValues) {
      [void] $pathValueSet.Add($path);
    }
    [void] $pathValueSet.Remove('');
    $nameValueMap = New-Object 'System.Collections.Generic.Dictionary[string,string]'([StringComparer]::OrdinalIgnoreCase);
    foreach ($name in $processEnvs.Keys) { $nameValueMap[$name] = $processEnvs[$name]; }
    foreach ($name in $sysEnvs.Keys) { $nameValueMap[$name] = $sysEnvs[$name]; }
    foreach ($name in $userEnvs.Keys) { $nameValueMap[$name] = $userEnvs[$name]; }
    if ($nameValueMap.ContainsKey('USERNAME') -and $nameValueMap['USERNAME'] -eq 'SYSTEM') {
      $nameValueMap['USERNAME'] = [regex]::Replace($processEnvs['USERPROFILE'], '^.*\\', '');
    }
    $nameValueMap['PATH'] = $pathValueSet -Join ';';
    foreach ($name in $nameValueMap.Keys) {
      'SET \"' + $name + '${escapeCmdEqual}' + $nameValueMap[$name] + '\"'
    }"') do @%a`;
  const body = trimAliasBody(cmdAlias).replace(TrimMultilineRegex, ' ');
  return writeToEachFile ? replaceArgForWindowsCmdAlias(body, writeToEachFile) : name + '=' + body;
}

function getResetEnvCmd(writeToEachFile: boolean, name: string = 'reset-env'): string {
  const escapeCmdEqual = '^=';
  const knownEnvNames = "'" + ['ALLUSERSPROFILE', 'APPDATA', 'ChocolateyInstall', 'CommonProgramFiles', 'CommonProgramFiles(x86)', 'CommonProgramW6432',
    'COMPUTERNAME', 'ComSpec', 'DriverData', 'HOMEDRIVE', 'HOMEPATH', 'LOCALAPPDATA', 'LOGONSERVER', 'NugetMachineInstallRoot', 'NUMBER_OF_PROCESSORS',
    'OneDrive', 'OS', 'PACKAGE_CACHE_DIRECTORY', 'Path', 'PATHEXT', 'PROCESSOR_ARCHITECTURE', 'PROCESSOR_IDENTIFIER', 'PROCESSOR_LEVEL',
    'PROCESSOR_REVISION', 'ProgramData', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432', 'PROMPT', 'PSModulePath', 'PUBLIC', 'SystemDrive',
    'SystemRoot', 'TEMP', 'TMP', 'UATDATA', 'USERDNSDOMAIN', 'USERDOMAIN', 'USERDOMAIN_ROAMINGPROFILE', 'USERNAME', 'USERPROFILE', 'windir',
    'CLASSPATH', 'JAVA_HOME', 'GRADLE_HOME', 'MAVEN_HOME', 'CARGO_HOME', 'RUSTUP_HOME', 'GOPATH', 'GOROOT', 'ANDROID_SDK_ROOT', 'ANDROID_NDK_ROOT'
  ].join("', '") + "'";

  const cmdAlias = String.raw`for /f "tokens=*" %a in ('${WindowsPowerShellCmdHeader} "
    $processEnvs = [System.Environment]::GetEnvironmentVariables([System.EnvironmentVariableTarget]::Process);
    $sysEnvs = [System.Environment]::GetEnvironmentVariables([System.EnvironmentVariableTarget]::Machine);
    $userEnvs = [System.Environment]::GetEnvironmentVariables([System.EnvironmentVariableTarget]::User);
    $pathValueSet = New-Object System.Collections.Generic.HashSet[String]([StringComparer]::OrdinalIgnoreCase);
    $allPathValues = $($sysEnvs['Path'] + ';' + $userEnvs['Path']) -Split '\\*\s*;\s*';
    foreach ($path in $allPathValues) {
      [void] $pathValueSet.Add($path);
    }
    [void] $pathValueSet.Remove('');
    $nameValueMap = New-Object 'System.Collections.Generic.Dictionary[string,string]'([StringComparer]::OrdinalIgnoreCase);
    foreach ($name in $sysEnvs.Keys) {
      $nameValueMap[$name] = $sysEnvs[$name];
    }
    foreach ($name in $userEnvs.Keys) {
      $nameValueMap[$name] = $userEnvs[$name];
    }
    if ($nameValueMap.ContainsKey('USERNAME') -and $nameValueMap['USERNAME'] -eq 'SYSTEM') {
      $nameValueMap['USERNAME'] = [regex]::Replace($processEnvs['USERPROFILE'], '^.*\\', '');
    }
    $nameValueMap['PATH'] = $pathValueSet -Join ';';
    $KnownEnvNames = @(${knownEnvNames});
    foreach ($name in $processEnvs.Keys) {
      if (-not $nameValueMap.ContainsKey($name) -and -not $KnownEnvNames.Contains($name)) {
          'SET \"' + $name + '${escapeCmdEqual}\"'
      }
    }
    foreach ($name in $nameValueMap.Keys) {
      'SET \"' + $name + '${escapeCmdEqual}' + $nameValueMap[$name] + '\"'
    }
    "') do @%a`;
  const body = trimAliasBody(cmdAlias).replace(TrimMultilineRegex, ' ');
  return writeToEachFile ? replaceArgForWindowsCmdAlias(body, writeToEachFile) : name + '=' + body;
}

function getAddPathValueCmd(envTarget: string): string {
  const addPaths = envTarget === 'Process' ? '$*' : '';
  const cmdAlias = String.raw`${WindowsPowerShellCmdHeader} "
    $rawValue = ${getPathEnv([envTarget])};
    $newValue = $rawValue.Trim().TrimEnd('\; ') + ';' + '$*'.Trim().TrimEnd('\; ');
    $values = $newValue -split '\\*\s*;\s*';
    $valueSet = New-Object System.Collections.Generic.HashSet[String]([StringComparer]::OrdinalIgnoreCase);
    foreach ($pv in $values) {
      [void] $valueSet.Add($pv);
    }
    [void] $valueSet.Remove('');
    $newValue = [string]::Join(';', $valueSet);
    [System.Environment]::SetEnvironmentVariable('PATH', $newValue, [System.EnvironmentVariableTarget]::${envTarget});
    " && ${getReloadWindowsEnvCmd('', addPaths)}`;
  return trimAliasBody(cmdAlias).replace(TrimMultilineRegex, ' ');
}

function getRemovePathValueCmd(envTarget: string): string {
  const cmdAlias = String.raw`${WindowsPowerShellCmdHeader} "
    $deleteValues = ('$*'.Trim().TrimEnd('\; ')) -split '\\*\s*;\s*';
    $deleteValueSet = New-Object System.Collections.Generic.HashSet[String]([StringComparer]::OrdinalIgnoreCase);
    foreach ($pv in $deleteValues) {
      [void] $deleteValueSet.Add($pv);
    }
    $oldValue = ${getPathEnv([envTarget])};
    $newValues = ($oldValue.Trim().TrimEnd('\; ')) -split '\\*\s*;\s*';
    $valueSet = New-Object System.Collections.Generic.HashSet[String]([StringComparer]::OrdinalIgnoreCase);
    foreach ($pv in $newValues) {
      if (-not $deleteValueSet.Contains($pv)) {
        [void] $valueSet.Add($pv);
      }
    }
    [void] $valueSet.Remove('');
    $newValue = [string]::Join(';', $valueSet);
    [System.Environment]::SetEnvironmentVariable('PATH', $newValue, [System.EnvironmentVariableTarget]::${envTarget});
    " && ${getReloadWindowsEnvCmd('$*')}`;
  return trimAliasBody(cmdAlias).replace(TrimMultilineRegex, ' ');
}

function reduceIndentionForScript(body: string, checkRows = 10): string {
  let getIndentionRegex: RegExp = /^\s+/gm;
  let match: RegExpExecArray | null = null;
  let minIndentionText = '';
  let minIndentionLength = Number.MAX_SAFE_INTEGER;
  for (let k = 0; k < checkRows && (match = getIndentionRegex.exec(body)) !== null; k++) {
    const indention = match[0];
    if (indention.length > 0 && indention.length < minIndentionLength) {
      minIndentionText = indention;
      minIndentionLength = indention.length;
    }
  }
  if (minIndentionText.length > 0) {
    const searchRegex = new RegExp('^' + minIndentionText, 'mg');
    return body.replace(searchRegex, '');
  }
  return body;
}

function getAliasBody(terminalType: TerminalType, name: string, body: string, writeToEachFile: boolean, isFromJsonSettings = false): string {
  body = trimAliasBody(body);
  const isWindowsTerminal = isWindowsTerminalOnWindows(terminalType);
  if (isWindowsTerminal) {
    if (!writeToEachFile) {
      body = body.replace(/([\w"]+)\s*[\r\n]+\s*(\w+)/sg, '$1 && $2'); // replace new lines to ' && ' for words
    }
  } else {
    // case like 'gca -m "New message"' will get error on Linux terminal (including WSL/MinGW/Cygwin), need quote "${@}":
    if (IsTailArgsRegex.test(body)) {
      body = body.replace(/\$\*/g, '${@}')
        .replace(/([^"])(\$\{@\})/g, '$1"$2"') // quote "${@}" if not quoted.
        .replace(/"([^"]*?)"(\$\{@\})"([^"]*?)"/g, '"$1$*$3"') // replace "${@}" to ${@} if in a double quote, case like gph.
        ;
    }
    body = body.replace(SafeConvertingArgsRegex, '$1"${@}"$3');

    if (!isFromJsonSettings) {
      body = body.replace(/ & /g, '; ')
    }
    if (body.startsWith('pwsh') || body.startsWith('PowerShell')) {
      body = replacePowerShellVarsForLinuxAlias(body);
      if (!isFromJsonSettings) {
        body = body.replace(TrimMultilineRegex, ' ');
      }
    }

    if (writeToEachFile) {
      if (!HasFunctionRegex.test(body)) {
        body = body.replace(ReplaceReturnToExit, 'exit$1');
        body = reduceIndentionForScript(body);
      }
    } else {
      body = body.replace(ReplaceExitToReturn, 'return$1');
    }
  }

  const useFunction = !isWindowsTerminal && ShouldUseFunctionRegex.test(body);
  const addTailArgs = !isWindowsTerminal && !HasExistingArgsRegex.test(body);
  return getCommandAliasText(name, body, useFunction, terminalType, writeToEachFile, addTailArgs, false, false);
}

const WindowsAliasMap: Map<string, string> = new Map<string, string>()
  .set('git-add-safe-dir', String.raw`for /f "tokens=*" %a in ('git rev-parse --show-toplevel') do @(
          git config --global --get-all safe.directory | msr -x %a -M && msr -XMI -z "git config --global --add safe.directory %a")
        & if exist %a/.gitmodules (msr -p %a/.gitmodules -t "^\s*path\s*=\s*(\S+)" -o "%a/\1" -PAC
          | nin %USERPROFILE%/.gitconfig "^(\S+)" "^\s*directory\s*=\s*(\S+)" -i -PAC
          | msr -t "(.+)" -o "git config --global --add safe.directory \1" -XMI)
        & msr -XMI -z "git config --global --get-all safe.directory | msr -ix %a -P as final check"`)
  .set('add-user-path', getAddPathValueCmd('User'))
  .set('add-sys-path', getAddPathValueCmd('Machine'))
  .set('add-tmp-path', getAddPathValueCmd('Process'))
  .set('del-user-path', getRemovePathValueCmd('User'))
  .set('del-sys-path', getRemovePathValueCmd('Machine'))
  .set('del-tmp-path', getRemovePathValueCmd('Process'))
  .set('reload-path', String.raw`for /f "tokens=*" %a in ('${WindowsPowerShellCmdHeader} "
          $pathValue = ${getPathEnv(['Machine', 'User', 'Process'])};
          $newValues = $pathValue -split '\\*\s*;\s*';
          $valueSet = New-Object System.Collections.Generic.HashSet[String]([StringComparer]::OrdinalIgnoreCase);
          foreach ($pv in $newValues) {
            [void] $valueSet.Add($pv);
          }
          [void] $valueSet.Remove('');
          [string]::Join(';', $valueSet);
        "') do @SET "PATH=%a"`)
  .set('check-user-env', String.raw`${WindowsPowerShellCmdHeader} "[System.Environment]::GetEnvironmentVariables([System.EnvironmentVariableTarget]::User)"`)
  .set('check-user-path', String.raw`${WindowsPowerShellCmdHeader} "[System.Environment]::GetEnvironmentVariable('PATH', [System.EnvironmentVariableTarget]::User)"`)
  .set('check-sys-env', String.raw`${WindowsPowerShellCmdHeader} "[System.Environment]::GetEnvironmentVariables([System.EnvironmentVariableTarget]::Machine)"`)
  .set('check-sys-path', String.raw`${WindowsPowerShellCmdHeader} "[System.Environment]::GetEnvironmentVariable('PATH', [System.EnvironmentVariableTarget]::Machine)"`)
  .set('decode64', String.raw`PowerShell "[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('$*'))"`)
  .set('docker-login', String.raw`for /f "tokens=*" %a in ('
          docker container ls -a ^| msr -it "^(\w+)\s+\S*($1).*" -o "\1" -PAC'
        ) do echo login %a && docker start %a && docker exec -it %a /bin/bash`)
  .set('docker-login-cid', String.raw`echo login $1 && msr -XM -z "docker start $1" && docker exec -it $1 /bin/bash`)
  .set('docker-ls', String.raw`docker container ls -a $* | msr -aPA -it "Exit\w*" -e "^(\w+).*\s+Up\s+\d+\s+\w+"`)
  .set('docker-ls-image', String.raw`docker images --digests`)
  .set('docker-rm-cid', String.raw`msr -z "$1" -t "\w+" -PAC -H 0 || msr -XM -z "docker stop $1 $2 && docker rm $2 $1" Remove container by id with force -f or not`)
  .set('docker-rm-image', String.raw`msr -z "$1" -t "\w+" -PAC -H 0 || msr -XM -z "docker rmi $2 $1" Remove image by id with force -f or not`)
  .set('docker-send', String.raw`for /f "tokens=*" %a in ('docker container ls ^| msr -it "^(\w+)\s+\S*($1).*" -o "\1" -PAC') do
          echo docker cp $2 %a:$3 | msr -M $4 $5 $6 $7 $8 $9`)
  .set('docker-start', String.raw`for /f "tokens=*" %a in ('docker container ls -a ^| msr -it "^(\w+)\s+\S*($1).*" -o "\1" -PAC') do msr -XM -z "docker start %a"`)
  .set('docker-stop', String.raw`for /f "tokens=*" %a in ('docker container ls -a ^| msr -it "^(\w+)\s+\S*($1).*" -o "\1" -PAC') do msr -XM -z "docker stop %a"`)
  .set('docker-stop-all', String.raw`docker ps | msr --nt CONTAINER -t "^(\w+).*" -o "docker stop \1" -X`)
  .set('grant-perm', String.raw`echo icacls $1 /grant %USERNAME%:F /T /Q | msr -XM`)
  .set('open-vsc', String.raw`code "%APPDATA%\Code\User\settings.json"`)
  .set('to-vscode-arg-lines', String.raw`${WindowsPowerShellCmdHeader} "Set-Clipboard $(Get-Clipboard | msr -t '\s+' -o '\n' -aPAC
          | msr -t '(.+)' -o '\t\t\#\1\#,' -aPIC | msr -x '#' -o '\\\"' -PAC).Replace('\"\"', '\"');"`)
  .set('to-vscode-arg-lines-2-slashes', String.raw`${WindowsPowerShellCmdHeader} "Set-Clipboard $(Get-Clipboard | msr -t '\s+' -o '\n' -aPAC
          | msr -t '(.+)' -o '\t\t\#\1\#,' -aPIC | msr -x \ -o \\ -aPAC | msr -x '#' -o '\\\"' -aPAC).Replace('\"\"', '\"');"`)
  .set('to-one-json-line', String.raw`${WindowsPowerShellCmdHeader} "
          $requestBody = $(Get-Clipboard).Replace('\"', '\\\"') | msr -S -t '[\r\n]\s*' -o ' ' -PAC;
          Set-Clipboard('\"' + $requestBody.Trim() + '\"'); Get-Clipboard"`)
  .set('to-one-json-line-from-file', String.raw`${WindowsPowerShellCmdHeader} "$requestBody = $(Get-Content '$1').Replace('\"', '\\\"')
          | msr -S -t '[\r\n]\s*(\S+)' -o ' \1' -PAC; Set-Clipboard('\"' + $requestBody.Trim() + '\"'); Get-Clipboard"`)
  .set('ts-to-minutes', String.raw`${WindowsPowerShellCmdHeader} "[Math]::Round([TimeSpan]::Parse('$1').TotalMinutes)"`)
  .set('to-local-time', String.raw`${WindowsPowerShellCmdHeader} "
          msr -z $([DateTime]::Parse([regex]::Replace('$*'.TrimEnd('Z') + 'Z', '(?<=[+-]\d{2}:?\d{2})Z$', '')).ToString('o'))
          -t '\.0+([\+\-]\d+[:\d]*|Z)$' -o '\1' -aPA"`) // PowerShell "[DateTime]::Parse('$1').ToLocalTime()"
  .set('to-utc-time', String.raw`${WindowsPowerShellCmdHeader} "
          msr -z $([DateTime]::Parse('$*').ToUniversalTime().ToString('o')) -t '\.0+([\+\-]\d+[:\d]*|Z)$' -o '\1' -aPA"`)
  .set('to-full-path', String.raw`msr -PAC -W -l -p $*`)
  .set('to-unix-path', String.raw`msr -z %1 -x \ -o / -PAC`)
  .set('to-2s-path', String.raw`msr -z %1 -x \ -o \\ -PAC`)
  .set('wcopy', String.raw`${WindowsPowerShellCmdHeader} "
          [System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null;
          $filePaths = New-Object System.Collections.Specialized.StringCollection; '$1' -split '\s*,\s*'
          | ForEach-Object { [void] $filePaths.Add($(Resolve-Path $_).Path); };
          Write-Host Copied-$($filePaths.Count)-files-to-Clipboard: $filePaths;
          [System.Windows.Forms.Clipboard]::SetFileDropList($filePaths);"`)
  .set('wpaste', String.raw`${WindowsPowerShellCmdHeader} "
          if([string]::IsNullOrWhiteSpace('$1')) { Write-Host Please-input-save-folder -ForegroundColor Red; exit -1; }
          [System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null;
          $srcFiles = [System.Windows.Forms.Clipboard]::GetFileDropList(); $srcFiles;
          Write-Host Paste-$($srcFiles.Count)-files-in-Clipboard;
          for($k=0; $k -lt $srcFiles.Count; $k+=1) {
              $oneSrcPath = $srcFiles[$k];
              $oneName = [IO.Path]::GetFileName($oneSrcPath);
              $oneSavePath = Join-Path $1 $oneName; $number = $k + 1;
              [IO.File]::Copy($oneSrcPath, $oneSavePath, 1);
              msr -l --wt --sz -p $oneSavePath -M;
          }"`)
  .set('pwsh', String.raw`PowerShell $*`)
  .set('is-admin', String.raw`${WindowsPowerShellCmdHeader} "
          $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent());
          $principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)"`)
  .set('az-token-clip', String.raw`${WindowsPowerShellCmdHeader} "Set-Clipboard($(az account get-access-token | ConvertFrom-Json).accessToken.ToString().TrimEnd())"`)
  .set('az-token-env', String.raw`for /f "tokens=*" %a in ('${WindowsPowerShellCmdHeader} "
          az account get-access-token | ConvertFrom-Json | ForEach-Object {
             Write-Output $_.accessToken
          }"') do set "AZURE_ACCESS_TOKEN=%a"`)
  // NOTE: find-alias and rm-alias are dynamically generated in getCommonAliasMap() based on terminalType
  .set('out-fp', String.raw`set "MSR_OUT_FULL_PATH=1" && echo Will output full file paths.`)
  .set('out-rp', String.raw`set "MSR_OUT_FULL_PATH=0" && echo Will output relative file paths.`)
  .set('out-wp', String.raw`set "MSR_UNIX_SLASH=0" && echo Now will output backslash '\' (Windows style) for result paths.`)
  .set('out-up', String.raw`set "MSR_UNIX_SLASH=1" && echo Now will output forward slash '/' (Unix style) for result paths.`)
  .set('sfw', String.raw`msr -l --wt -W --unix-slash 0 -M -P -p $*`)
  .set('sfu', String.raw`msr -l --wt --unix-slash 1 -M -P -p $*`)
  .set('clear-msr-env', String.raw`for /f "tokens=*" %a in ('set ^| msr -t "^(MSR_\w+)=.*" -o "\1" -PAC') do
         @msr -z "%a" -t "(.+)" -o "echo Cleared \1=%\1% | msr -aPA -t MSR_\\w+ -e =.*" -XA || @set "%a="`)
  .set('trust-exe', String.raw`${WindowsPowerShellCmdHeader} "Write-Host 'Please run as Admin to add process exclusion,
          will auto fetch exe path by name, example: trust-exe msr,nin,git,scp' -ForegroundColor Cyan;
            foreach ($exe in ('$*'.Trim() -split '\s*[,;]\s*')) {
              if (-not [IO.File]::Exists($exe)) {
                $exe = $(Get-Command $exe).Source;
              }
              $exeName = [IO.Path]::GetFileName($exe);
              Write-Host ('Will add exe + process to exclusion: ' + $exe) -ForegroundColor Green;
              Add-MpPreference -ExclusionPath $exe;
              Add-MpPreference -ExclusionProcess $exeName;
          }"`)
  .set('restart-net', String.raw`echo ${WindowsPowerShellCmdHeader} "Get-NetAdapter | Restart-NetAdapter -Confirm:$false" | msr -XM`)
  ;

if (IsWindows) {
  if (HasPwshExeOnWindows) {
    WindowsAliasMap.delete('pwsh');
    outputInfoQuietByTime(`Remove alias 'pwsh' on Windows since found pwsh.exe at ${PwshPathOnWindows}`);
  }

  CommonAliasMap.forEach((body, name, _) => {
    body = trimAliasBody(body).replace(TrimMultilineRegex, ' ');
    WindowsAliasMap.set(name, body);
  });

  WindowsAliasMap.forEach((body, name, _) => {
    if (!CommonAliasMap.has(name)) {
      body = trimAliasBody(body).replace(TrimMultilineRegex, ' ');
      WindowsAliasMap.set(name, body);
    }
  });

  // Replace 'pwsh' with 'PowerShell' when pwsh.exe is not available on Windows
  if (!HasPwshExeOnWindows) {
    ['to-alias-body', 'gpm', 'gdm', 'gdm-m', 'gdm-l', 'gdm-al', 'gdm-ml', 'gdm-dl', 'gdm-nt'].forEach(name => {
      let body = WindowsAliasMap.get(name) || '';
      body = body.replace(/^pwsh/, 'PowerShell');
      WindowsAliasMap.set(name, body);
    });
  }
}

export function getCommonAliasMap(terminalType: TerminalType, writeToEachFile: boolean): Map<string, string> {
  let cmdAliasMap = new Map<string, string>();
  const isWindowsTerminal = isWindowsTerminalOnWindows(terminalType);
  if (isWindowsTerminal) {
    CommonAliasMap.forEach((value, key) => cmdAliasMap.set(key, getAliasBody(terminalType, key, value, writeToEachFile)));
    WindowsAliasMap.forEach((value, key) => cmdAliasMap.set(key, getAliasBody(terminalType, key, value, writeToEachFile)));
    cmdAliasMap.set('reload-env', getReloadEnvCmd(writeToEachFile))
      .set('reset-env', getResetEnvCmd(writeToEachFile));
  } else {
    CommonAliasMap.forEach((value, key) => cmdAliasMap.set(key, getAliasBody(terminalType, key, value, writeToEachFile)));
    LinuxAliasMap.forEach((value, key) => cmdAliasMap.set(key, getAliasBody(terminalType, key, value, writeToEachFile)));
  }

  // Dynamically generate find-alias and rm-alias based on terminalType
  // This ensures the correct script subdirectory is used for each terminal type
  const findAliasBody = generateFindAliasCommand(terminalType);
  const rmAliasBody = generateRemoveAliasCommand(terminalType);
  cmdAliasMap.set('find-alias', getAliasBody(terminalType, 'find-alias', findAliasBody, writeToEachFile));
  cmdAliasMap.set('rm-alias', getAliasBody(terminalType, 'rm-alias', rmAliasBody, writeToEachFile));

  // get common alias map from config/settings:
  readConfigCommonAlias(cmdAliasMap, terminalType, writeToEachFile);
  readConfigCommonAlias(cmdAliasMap, terminalType, writeToEachFile, isWindowsTerminal ? 'cmd' : 'bash');
  return cmdAliasMap;
}

/**
 * Generate find-alias command for the specified terminal type
 */
function generateFindAliasCommand(terminalType: TerminalType): string {
  const isWindowsTerminal = isWindowsTerminalOnWindows(terminalType);
  let findAliasBodyRaw = getFindAliasBody(terminalType);
  if (isWindowsTerminal) {
    // Convert multi-line PowerShell code to single line for CMD batch file
    // In CMD, each line is executed separately, so multi-line PowerShell commands break
    findAliasBodyRaw = findAliasBodyRaw.replace(TrimMultilineRegex, ' ');
    return `${WindowsPowerShellCmdHeader} "${findAliasBodyRaw}"`;
  } else {
    let body = 'pwsh -Command "' + findAliasBodyRaw + '"';
    body = replacePowerShellQuoteForLinuxAlias(body);
    return replacePowerShellVarsForLinuxAlias(body);
  }
}

/**
 * Generate rm-alias command for the specified terminal type
 */
function generateRemoveAliasCommand(terminalType: TerminalType): string {
  const isWindowsTerminal = isWindowsTerminalOnWindows(terminalType);
  let rmAliasBodyRaw = getRemoveAliasBody(terminalType);
  if (isWindowsTerminal) {
    // Convert multi-line PowerShell code to single line for CMD batch file
    // In CMD, each line is executed separately, so multi-line PowerShell commands break
    rmAliasBodyRaw = rmAliasBodyRaw.replace(TrimMultilineRegex, ' ');
    return `${WindowsPowerShellCmdHeader} "${rmAliasBodyRaw}"`;
  } else {
    let body = 'pwsh -Command "' + rmAliasBodyRaw + '"';
    body = replacePowerShellQuoteForLinuxAlias(body);
    return replacePowerShellVarsForLinuxAlias(body);
  }
}

function readConfigCommonAlias(cmdAliasMap: Map<string, string>, terminalType: TerminalType, writeToEachFile: boolean, subKey: string = '') {
  const keyName = isNullOrEmpty(subKey) ? 'commonAliasNameBodyList' : `${subKey}.commonAliasNameBodyList`;
  const commonAliasNameBodyList = vscode.workspace.getConfiguration('msr').get(keyName);
  if (!commonAliasNameBodyList) {
    return;
  }
  const isWindowsTerminal = isWindowsTerminalOnWindows(terminalType);
  const aliasNameBodyList = commonAliasNameBodyList as AliasNameBody[];
  aliasNameBodyList.forEach((item: AliasNameBody) => {
    const name = item.aliasName;
    const body = item.aliasBody.trim();
    // Replace '\\1' to '\\\\1' for Linux:
    const refinedBody = isWindowsTerminal ? body : body.replace(/(\\{2})(\d)\b/, '$1$1$2');
    const oldCount = cmdAliasMap.size;
    cmdAliasMap.set(name, getAliasBody(terminalType, name, refinedBody, writeToEachFile, true));
    if (cmdAliasMap.size > oldCount) {
      outputInfoByDebugModeByTime(`Added custom alias: ${name}=${refinedBody}`)
    } else {
      outputWarnByTime(`Overwrote existing alias: ${name}=${refinedBody}`, false);
    }
  });
}

export function getCommandAliasText(
  cmdName: string,
  cmdBody: string,
  useFunction: boolean,
  terminalType: TerminalType,
  writeToEachFile: boolean,
  addTailArgs: boolean = true,
  hideCmdAddColor: boolean = true,
  isPowerShellScript: boolean = false): string {
  if (hideCmdAddColor) {
    cmdBody = enableColorAndHideCommandLine(cmdBody);
  }

  const isWindowsTerminal = isWindowsTerminalOnWindows(terminalType);
  const hasSearchTextHolder = isWindowsTerminal ? /%~?1/.test(cmdBody) : /\$1|%~?1/.test(cmdBody);
  if (hasSearchTextHolder) {
    cmdBody = replaceSearchTextHolder(cmdBody.trimRight(), '$1');
  }

  let tailArgs = "";
  if (addTailArgs) {
    // Generally should not add tail args if found arg-holders by HasExistingArgsRegex, but special case for find-xxx-def
    addTailArgs = !CommonAliasMap.has(cmdName)
      && (isWindowsTerminal ? !WindowsAliasMap.has(cmdName) : !LinuxAliasMap.has(cmdName));
  }

  if (addTailArgs) {
    if (hasSearchTextHolder) {
      if (isPowerShellScript) { // only for find-spring-ref
        tailArgs = isWindowsTerminal
          ? ' $2 $3 $4 $5 $6 $7 $8 $9'
          //: ' $2 $3 $4 $5 $6 $7 $8 $9'.replace(/\$(\d+)/g, "'\\$$$1'"); // good
          : " '\\${@:2}'";
      }
      // For Windows must be: ' $2 $3 $4 $5 $6 $7 $8 $9', but msr can ignore duplicate $1, so this tricky way works fine, and avoid truncating long args.
      else {
        tailArgs = isWindowsTerminal ? ' $*' : ' "${@:2}"';
      }
    } else {
      tailArgs = isWindowsTerminal ? ' $*' : ' "${@}"';
    }
  }

  return getCommandTextByNameAndBody(cmdName, cmdBody, tailArgs, useFunction, terminalType, writeToEachFile, isPowerShellScript);
}


function replaceForLoopVariableTokens(cmd: string): string {
  // Example: for /f "tokens=*" %a in ('xxx') do xxx %a
  // Should replace %a to %%a when writing each alias/doskey to a file.
  const GetForLoopRegex = /\bfor\s+\/[lf]\s+("[^"]*?tokens=\s*(?<Token>\*|\d+[, \d]*)[^"]*?"\s+)?%(?<StartVariable>[a-z])\s+in\s+\(.*?\)\s*do\s+/i;
  const match = GetForLoopRegex.exec(cmd);
  if (!match || !match.groups) {
    return cmd;
  }

  let tokens = match.groups['Token'] ? match.groups['Token'].split(/,\s*/) : ['1'];
  if (tokens.length === 1 && tokens[0] === '*') {
    tokens = ['1'];
  }

  const startingVariableName = match.groups['StartVariable'];
  const isLowerCaseVariable = startingVariableName.toLowerCase() === startingVariableName;
  let beginCharCode = isLowerCaseVariable
    ? startingVariableName.toLowerCase().charCodeAt(0)
    : startingVariableName.toUpperCase().charCodeAt(0);

  let variableChars: string[] = [];
  tokens.forEach((numberText) => {
    const number = Number.parseInt(numberText.toString());
    const variableName = String.fromCharCode(beginCharCode + number - 1);
    variableChars.push(variableName);
  });

  for (let k = 0; k < variableChars.length; k++) {
    cmd = cmd.replace(new RegExp('%' + variableChars[k], 'g'), '%%' + variableChars[k]);
  }

  // next for loop
  const subText = cmd.substring(match.index + match[0].length);
  return cmd.substring(0, match.index + match[0].length) + replaceForLoopVariableTokens(subText);
}

export function replaceForLoopVariableForWindowsScript(cmd: string): string {
  cmd = replaceForLoopVariableTokens(cmd);
  // Replace %~dpa %~nxa to %%~dpa %%~nxa
  return cmd.replace(/(%~(dp|nx)[a-z])/g, '%$1');
  // return cmd.replace(/((?<!%)%~(dp|nx)[a-z])/g, '%$1');
}

function replaceForLoopVariableForWindowsAlias(cmd: string): string {
  // doskey on Windows must be one line
  return cmd.replace(/%%([a-zA-Z])/g, '%$1') // replace %%a to %a
    .replace(/^\s*@?echo\s+(on|off)\s*[\r\n]*/si, '') // remove 'echo on/off' or '@echo on/off'
    .replace(/^\s*[&\|]+\s*/, '') // check remove possible '&' after removing 'echo on/off'
    .replace(/\s*\^\s*$/mg, ' ') // remove tail '^' for line continuation
    .replace(TrimMultilineRegex, ' ')
    .trim();
}

function getCommandTextByNameAndBody(cmdName: string, cmdBody: string, tailArgs: string, useFunction: boolean, terminalType: TerminalType, writeToEachFile: boolean, isPowerShellScript: boolean = false) {
  const powerShellCmdText = getPowerShellName(terminalType, HasPwshExeOnWindows) + ' -Command "' + cmdBody + tailArgs + '"';
  if (isWindowsTerminalOnWindows(terminalType)) {
    cmdBody = cmdBody.replace(TrimForLoopWhite, '$1');
    if (writeToEachFile) {
      return isPowerShellScript
        ? powerShellCmdText.replace(/\$(\d+)\b/g, '%$1')
        : replaceArgForWindowsCmdAlias(cmdBody + tailArgs, writeToEachFile);
    }
    cmdBody = replaceForLoopVariableForWindowsAlias(cmdBody);
    return isPowerShellScript
      ? cmdName + '=' + powerShellCmdText
      : cmdName + '=' + cmdBody + tailArgs;
  }

  const funBody = isPowerShellScript ? powerShellCmdText : cmdBody + tailArgs;
  if (useFunction) {
    const functionName = '_' + cmdName.replace(/-/g, '_');
    if (writeToEachFile) {
      return funBody;
    }

    return 'alias ' + cmdName + "='function " + functionName + '() {'
      + `\n${MyConfig.ReplaceTabTo}${funBody}`
      + `\n}; ${functionName}'`;
  }

  if (writeToEachFile) {
    return funBody;
  }
  return 'alias ' + cmdName + "='" + funBody + "'";
}
