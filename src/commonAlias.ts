import * as vscode from 'vscode';
import { AliasNameBody } from './AliasNameBody';
import { getAliasFileName, HomeFolder, IsWindows, isNullOrEmpty } from './constants';
import { MyConfig, getConfig } from './dynamicConfig';
import { TerminalType } from "./enums";
import { enableColorAndHideCommandLine, outputInfoByDebugModeByTime, outputInfoQuietByTime, outputWarnByTime } from "./outputUtils";
import { isToolExistsInPath, isWindowsTerminalOnWindows } from "./terminalUtils";
import { IsUniformSlashSupported } from './ToolChecker';
import { getPowerShellName, replaceSearchTextHolder, replaceTextByRegex } from "./utils";
import path = require('path');

/**
 * DOSKEY SPECIAL CHARACTERS (case-insensitive) - AVOID these variable prefixes: $a, $b, $g, $l, $r, $t
 * Examples: $alias/$Alias->& $bar/$Bar->| $good/$Good->> $list/$List->< $rowNum->CR $temp->separator
 * Use 1/0 instead of $true/$false. Use $? instead of $LASTEXITCODE. Test doskey in CMD, not PowerShell.
 *
 * BASH ALIAS ESCAPING:
 * - Single quotes: use \" for pwsh -Command "..."
 * - PowerShell vars: escape with \$ except $* and $1-$9
 * - Save $Matches before next -match call
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

/** OS-specific alias configuration for Windows and Linux/macOS */
interface OsAliasConfig {
  settingsPathCode: string;
  defaultCmdFolder: string;
  cmdFileName: string;
  cmdFileType: string;
  scriptExt: string;
  osSpecificGroup: string;
  scriptSubFolder: string;
  /** Whether the alias file is stored in a subdirectory (for MinGW/Cygwin/WSL on Windows) */
  useAliasSubFolder: boolean;
  /** Terminal type subfolder name (mingw/cygwin/wsl/cmd) */
  terminalSubFolder: string;
}

function isLinuxStyleTerminalOnWindows(terminalType: TerminalType): boolean {
  return terminalType === TerminalType.MinGWBash ||
    terminalType === TerminalType.CygwinBash ||
    terminalType === TerminalType.WslBash;
}

// Get terminal type subdirectory name (mingw/cygwin/wsl/cmd) - matches getCmdAliasSaveFolder
function getTerminalTypeSubFolder(terminalType: TerminalType): string {
  return TerminalType[terminalType].toLowerCase()
    .replace(/bash$/i, '')
    .replace(/powershell$/i, 'cmd');
}

// Convert Windows path to WSL /c/ format (unlike toWSLPath which auto-detects)
function toWslPathForAlias(windowsPath: string): string {
  if (!windowsPath) return '';
  const match = windowsPath.match(/^([A-Za-z]):[\\\/](.*)$/);
  if (match) {
    const driveLetter = match[1].toLowerCase();
    const restPath = match[2].replace(/\\/g, '/');
    return `/${driveLetter}/${restPath}`;
  }
  return windowsPath.replace(/\\/g, '/');
}

// Get alias file sub-path (e.g., 'cmdAlias/mingw/msr-cmd-alias.bashrc')
function getAliasFileSubPath(config: OsAliasConfig): string {
  return config.useAliasSubFolder
    ? `cmdAlias/${config.terminalSubFolder}/${config.cmdFileName}`
    : config.cmdFileName;
}

// Generate PowerShell code to convert backslash to forward slash using [regex]::Escape([char]92)
function getToUnixPathCode(varName: string, useUnixSlash: boolean): string {
  return useUnixSlash ? `$${varName} = $${varName} -replace [regex]::Escape([char]92), [char]47;` : '';
}

// Get VSCode settings.json path for the current platform
function getVscodeSettingsPath(terminalType: TerminalType): string {
  const isWindowsTerminal = isWindowsTerminalOnWindows(terminalType);
  const isWslTerminal = terminalType === TerminalType.WslBash;

  if (isWindowsTerminal || isLinuxStyleTerminalOnWindows(terminalType)) {
    // All terminals on Windows use Windows APPDATA location
    const appdata = process.env['APPDATA'] || '';
    const windowsPath = path.join(appdata, 'Code/User/settings.json');
    if (isWslTerminal) {
      return toWslPathForAlias(windowsPath);
    }
    return windowsPath;
  }
  // Native Linux/macOS: ~/.config/Code/User/settings.json or ~/Library/Application Support/Code/User/settings.json
  return '';
}

// Generate PowerShell code to determine cmdFolder and cmdFilePath
function getCmdFilePathCode(
  config: OsAliasConfig,
  cmdFileSubPath: string,
  useUnixSlash: boolean,
  extraPathVars: string[] = []
): string {
  const toUnixPath = (varName: string) => getToUnixPathCode(varName, useUnixSlash);
  const extraConversions = extraPathVars.map(v => toUnixPath(v)).filter(s => s).join('\n    ');

  return `
    $cmdFolder = ${config.defaultCmdFolder};
    if (Test-Path $settingsPath) {
      try {
        $saveFolder = (Get-Content $settingsPath -Raw | ConvertFrom-Json).PSObject.Properties['msr.cmdAlias.saveFolder'].Value;
        if ($saveFolder) { $cmdFolder = $saveFolder.Trim(); }
      } catch { }
    }
    $cmdFilePath = Join-Path $cmdFolder '${cmdFileSubPath}';
    ${toUnixPath('settingsPath')}
    ${toUnixPath('cmdFilePath')}
    ${extraConversions}`;
}

/** Get OS-specific alias configuration
 * Uses getAliasFileName from constants.ts for consistent file naming
 */
function getOsAliasConfig(terminalType: TerminalType): OsAliasConfig {
  const isWindowsTerminal = isWindowsTerminalOnWindows(terminalType);
  const isLinuxOnWindows = isLinuxStyleTerminalOnWindows(terminalType);
  const isWslTerminal = terminalType === TerminalType.WslBash;
  const terminalSubFolder = getTerminalTypeSubFolder(terminalType);
  const cmdFileName = getAliasFileName(isWindowsTerminal);

  // WSL cannot access Windows env vars, so embed actual paths at generation time
  let settingsPathCode: string;
  let defaultCmdFolder: string;

  if (isWindowsTerminal) {
    // Windows CMD/PowerShell: use Windows env vars directly
    settingsPathCode = `$settingsPath = Join-Path $env:APPDATA 'Code/User/settings.json';`;
    defaultCmdFolder = '$env:USERPROFILE';
  } else if (isWslTerminal) {
    // WSL: Embed actual paths in WSL format at alias generation time
    // Because $env:APPDATA and $env:USERPROFILE are null in WSL's PowerShell
    const wslSettingsPath = getVscodeSettingsPath(terminalType);
    const wslUserProfile = toWslPathForAlias(HomeFolder);
    settingsPathCode = `$settingsPath = '${wslSettingsPath}';`;
    defaultCmdFolder = `'${wslUserProfile}'`;
  } else if (isLinuxOnWindows) {
    // MinGW/Cygwin: can access Windows env vars
    settingsPathCode = `$settingsPath = Join-Path $env:APPDATA 'Code/User/settings.json';`;
    defaultCmdFolder = '$env:USERPROFILE';
  } else {
    // Native Linux/macOS
    settingsPathCode = `$settingsPath = Join-Path $env:HOME '.config/Code/User/settings.json';
    if (-not (Test-Path $settingsPath)) { $settingsPath = Join-Path $env:HOME 'Library/Application Support/Code/User/settings.json'; }`;
    defaultCmdFolder = '$env:HOME';
  }

  // MinGW/Cygwin/WSL on Windows use subdirectory for alias files
  const useAliasSubFolder = isLinuxOnWindows;
  const scriptSubFolder = 'cmdAlias/' + terminalSubFolder;

  return {
    settingsPathCode,
    defaultCmdFolder,
    cmdFileName,
    cmdFileType: isWindowsTerminal ? 'doskeys' : 'bashrc',
    scriptExt: isWindowsTerminal ? '.cmd' : '',
    osSpecificGroup: isWindowsTerminal ? 'msr.cmd.commonAliasNameBodyList' : 'msr.bash.commonAliasNameBodyList',
    scriptSubFolder,
    useAliasSubFolder,
    terminalSubFolder,
  };
}

// Default description for aliases found in doskeys/bashrc files (no user-defined description)
const DefaultAliasDescription = `(N/A) Not your custom alias? See built-in alias doc: https://github.com/qualiu/vscode-msr/blob/master/Common-Alias.md`;

// Generate PowerShell code to search Windows doskeys file
function getWindowsSearchCmdFileCode(): string {
  return String.raw`$hitInFile -split '\r?\n' | ForEach-Object {
          if ($_ -match '^(?<fp>.+?):(?<num>\d+):(?:\d+:)?\s*(?<content>.+)$') {
            $fp = $Matches['fp']; $numInFile = $Matches['num']; $content = $Matches['content'];
            $itemName = if ($content -match '^([\w-]+)=') { $Matches[1] } else { '' };
            if (($ShowDup -or -not $hitNameSet.Contains($itemName)) -and (-not $isRegex -or $itemName -match $Prefix)) {
              if (($sb -or $sd -or $ss) -and ($cntSets -gt 0 -or $cntFiles -gt 0)) { Write-Host ''; }
              $cntFiles++;
              if ($content -match '^([\w-]+)=(.*)$') {
                $itemBody = $Matches[2]; $sumBodyLen += $itemBody.Length;
                if ($sn) { Write-Host 'aliasName = ' -No; Write-Host $Matches[1] -Fore Green; }
                if ($sb) { Write-Host 'aliasBody = ' -No; Write-Host $itemBody -Fore Cyan; }
                if ($sd) { Write-Host 'description = ' -No; Write-Host '${DefaultAliasDescription}' -Fore DarkGray; }
                if ($ss) { Write-Host 'location = ' -No; Write-Host ('doskeys file at ' + $fp + ':' + $numInFile + ':') -Fore DarkGray; }
              } else { Write-Host $content; }
            }
          }
        };`;
}

// Generate PowerShell code to search Linux bashrc file (multi-line format)
function getLinuxSearchCmdFileCode(): string {
  // NOTE: The regex '^.+?:\d+:(.*)' must NOT use '\s*' after the colon, otherwise it strips leading whitespace (indentation) from content
  return String.raw`$allLines = $hitInFile -split '\r?\n' | Where-Object { $_ -match '^.+?:\d+:' };
          $curBlock = @(); $curRow = '';
          function ProcessAliasBlock { if ($curBlock.Count -eq 0) { return; } $fullContent = ($curBlock | ForEach-Object { if ($_ -match '^.+?:\d+:(.*)') { $Matches[1] } else { $_ } }) -join ([char]10); $fullContent = $fullContent.Trim(); if ($fullContent -match '(?s)^alias\s+(?<name>[\w-]+)=(?<body>.*)$') { $script:itemName = $Matches['name']; $displayBody = $Matches['body']; $script:sumBodyLen += $displayBody.Length; if (($ShowDup -or -not $hitNameSet.Contains($script:itemName)) -and (-not $isRegex -or $script:itemName -match $Prefix)) { if (($sb -or $sd -or $ss) -and ($script:cntSets -gt 0 -or $script:cntFiles -gt 0)) { Write-Host ''; } $script:cntFiles++; [void] $hitCmdFileSet.Add($oneCmdFilePath); if ($sn) { Write-Host 'aliasName = ' -No; Write-Host $script:itemName -Fore Green; } if ($sb) { Write-Host 'aliasBody = ' -No; Write-Host $displayBody -Fore Cyan; } if ($sd) { Write-Host 'description = ' -No; Write-Host '${DefaultAliasDescription}' -Fore DarkGray; } if ($ss) { Write-Host 'location = ' -No; Write-Host ($oneCmdFilePath + ':' + $curRow + ':') -Fore DarkGray; } } if ($bashrcNameCountMap.ContainsKey($script:itemName)) { $bashrcNameCountMap[$script:itemName]++; } else { $bashrcNameCountMap[$script:itemName] = 1; } } }
          foreach ($oneLine in $allLines) {
            if ($oneLine -match '^(?<fp>.+?):(?<num>\d+):\s*(?<content>.*)$') {
              $lineNum = $Matches['num']; $content = $Matches['content'];
              if ($content -match '^alias\s+[\w-]+=') {
                ProcessAliasBlock;
                $curBlock = @($oneLine);
                $curRow = $lineNum;
              } else {
                $curBlock += $oneLine;
              }
            }
          }
          ProcessAliasBlock;`;
}

// Generate find-alias PowerShell command body (avoid $a,$b,$g,$l,$r,$t prefixed variables)
function getFindAliasBody(terminalType: TerminalType, useUnixSlash: boolean = false): string {
  const isWindows = isWindowsTerminalOnWindows(terminalType);
  const config = getOsAliasConfig(terminalType);
  const cmdFileSubPath = getAliasFileSubPath(config);
  const toUnixPath = (varName: string) => getToUnixPathCode(varName, useUnixSlash);
  // Add --unix-slash 1 to msr commands when supported and needed (for file path output)
  const unixSlashArg = useUnixSlash ? ' --unix-slash 1' : '';
  const cmdFilePathCode = getCmdFilePathCode(config, cmdFileSubPath, useUnixSlash);

  return String.raw`
    $inArgs = @{}; $posArgs = @();
    $curArgName = $null;
    foreach ($va in @('$*' -split '\s+' | Where-Object { $_ })) {
      if ($va -match '^-(\w+)$') { $curArgName = $Matches[1]; }
      elseif ($curArgName) { $inArgs[$curArgName] = $va; $curArgName = $null; }
      else { $posArgs += $va; }
    }
    function Get-ParamValue($argName) { $matched = @($inArgs.Keys | Where-Object { $argName -like ($_ + '*') }); if ($matched.Count -eq 1) { return $inArgs[$matched[0]]; } elseif ($inArgs.ContainsKey($argName)) { return $inArgs[$argName]; } return $null; }
    $Prefix = $pv = Get-ParamValue 'Prefix'; if ($null -eq $pv) { if ($posArgs.Count -gt 0) { $Prefix = $posArgs[0] } else { $Prefix = '' } };
    $pv = Get-ParamValue 'IsExactEqual'; $IsExactEqual = if ($null -ne $pv) { $pv -imatch '^(1|true|y)' } elseif ($posArgs.Count -gt 1) { $posArgs[1] -imatch '^(1|true|y)' } else { 0 };
    $pv = Get-ParamValue 'SettingsOnly'; $SettingsOnly = if ($null -ne $pv) { $pv -imatch '^(1|true|y)' } elseif ($posArgs.Count -gt 2) { $posArgs[2] -imatch '^(1|true|y)' } else { 0 };
    $pv = Get-ParamValue 'ShowDup'; $ShowDup = if ($null -ne $pv) { $pv -imatch '^(1|true|y)' } elseif ($posArgs.Count -gt 3) { $posArgs[3] -imatch '^(1|true|y)' } else { 0 };
    $pv = Get-ParamValue 'OnlyThisOS'; $OnlyThisOS = if ($null -ne $pv) { -not ($pv -imatch '^(0|false|n)') } elseif ($posArgs.Count -gt 4) { -not ($posArgs[4] -imatch '^(0|false|n)') } else { 1 };
    $pv = Get-ParamValue 'Description'; $Description = if ($null -ne $pv) { $pv.ToLower() } elseif ($posArgs.Count -gt 5) { $posArgs[5].ToLower() } else { 'any' };
    $pv = Get-ParamValue 'Output'; $Out = if ($pv) { $pv.ToLower() } else { 'all' };
    $sn = $Out -match 'name|^all$'; $sb = $Out -match 'body|^all$'; $sd = $Out -match 'desc|^all$'; $ss = $Out -match 'lo|^all$';
    if ($Description -imatch '^(1|true|y)') { $Description = 'yes'; } elseif ($Description -imatch '^(0|false|n)') { $Description = 'no'; } elseif ($Description -imatch '^(any|all|a)$') { $Description = 'any'; } else { $Description = 'any'; }
    $isRegex = $Prefix -match '[^\w\-]';
    $matchMode = if ($IsExactEqual) { ' by name' } elseif ($isRegex) { ' by regex' } else { ' by prefix' };
    if (-not $Prefix) { Write-Host 'Usage: find-alias <Prefix|Regex> [-IsExactEqual 0] [-SettingsOnly 0] [-ShowDup 0] [-OnlyThisOS 1] [-Description any] [-Output name+body+desc+location]' -Fore Red; exit 1; }
    ${config.settingsPathCode}
    ${cmdFilePathCode}
    $cntSets = 0; $hitGroups = 0; $sumItems = 0; $sumGroups = 0; $hitGrpNames = @(); $cntFiles = 0; $hitNames = @(); $sumBodyLen = 0;
    $dq = [char]34;
    if (Test-Path $settingsPath) {
      try {
        $settingsRaw = Get-Content $settingsPath -Raw;
        $jsonLines = msr -p $settingsPath -b '^\W+msr.\w*\.?\w+List\W+$' -Q '^\s*\]\W*$' -PAC;
        $settings = '{' + [string]::Join([Environment]::NewLine, $jsonLines).Trim().TrimEnd(',') + '}' | ConvertFrom-Json;
        $keyGroupList = @('msr.commonAliasNameBodyList','msr.bash.commonAliasNameBodyList','msr.cmd.commonAliasNameBodyList');
        $keyGroupNames = if ($OnlyThisOS) { @('msr.commonAliasNameBodyList','${config.osSpecificGroup}') } else { $keyGroupList };
        foreach ($kg in $keyGroupNames) {
          $objList = $settings.PSObject.Properties[$kg].Value;
          if (-not $objList) { continue; }
          $sumGroups++; $sumItems += $objList.Count; $hasHitInGroup = 0;
          $matchedKeys = Select-String -InputObject $settingsRaw -Pattern ('(?m)^\s*' + $dq + [regex]::Escape($kg) + $dq) -AllMatches;
          $kgBegRow = if ($matchedKeys.Matches.Count -gt 0) { ($settingsRaw.Substring(0, $matchedKeys.Matches[0].Index) -split '\r?\n').Count } else { 0 };
          $idx = 0;
          foreach ($obj in $objList) {
            $idx++;
            if (($IsExactEqual -and ($obj.aliasName -eq $Prefix)) -or ($isRegex -and ($obj.aliasName -match $Prefix)) -or ((-not $IsExactEqual) -and (-not $isRegex) -and ($obj.aliasName -like ($Prefix + '*')))) {
              $objDesc = $obj.description;
              $hasDesc = -not [string]::IsNullOrWhiteSpace($objDesc);
              if ($Description -eq 'yes' -and -not $hasDesc) { continue; }
              if ($Description -eq 'no' -and $hasDesc) { continue; }
              if (($sb -or $sd -or $ss) -and $cntSets -gt 0) { Write-Host ''; }
              $cntSets++; $hitNames += $obj.aliasName;
              if (-not $hasHitInGroup) { $hitGroups++; $hitGrpNames += $kg; $hasHitInGroup = 1; }
              $objRow = $kgBegRow + $idx;
              $nameMatches = Select-String -InputObject $settingsRaw -Pattern ($dq + 'aliasName' + $dq + '\s*:\s*' + $dq + [regex]::Escape($obj.aliasName) + $dq) -AllMatches;
              foreach ($oneMatch in $nameMatches.Matches) { $matchRow = ($settingsRaw.Substring(0, $oneMatch.Index) -split '\r?\n').Count; if ($matchRow -ge $kgBegRow) { $objRow = $matchRow; break; } }
              $objBody = $obj.aliasBody; $sumBodyLen += $objBody.Length;
              if ($sn) { Write-Host 'aliasName = ' -No; Write-Host $obj.aliasName -Fore Green; }
              if ($sb) { Write-Host 'aliasBody = ' -No; Write-Host $objBody -Fore Cyan; }
              if ($sd) { Write-Host 'description = ' -No; Write-Host $objDesc; }
              if ($ss) { Write-Host 'location = ' -No; Write-Host ($kg + ' at ' + $settingsPath + ':' + $objRow + ':') -Fore DarkGray; }
            }
          }
        }
      } catch {
        Write-Host ('Error reading settings: ' + $_.Exception.Message) -Fore Red;
      }
    }
    if (-not $SettingsOnly -and $Description -ne 'yes' -and ($cntSets -eq 0 -or -not $IsExactEqual)${isWindows ? ' -and (Test-Path $cmdFilePath)' : ''}) {
      $searchPattern = if ($IsExactEqual) { '^\s*${isWindows ? '' : '(alias\\s+)?'}' + [regex]::Escape($Prefix) + '=' } elseif ($isRegex) { '^\s*${isWindows ? '' : '(alias\\s+)?'}[\w-]+=' } else { '^\s*${isWindows ? '' : '(alias\\s+)?'}' + [regex]::Escape($Prefix) + '[\w-]*=' };
      $hitNameSet = New-Object 'System.Collections.Generic.HashSet[string]'([StringComparer]::OrdinalIgnoreCase);
      foreach ($name in $hitNames) { [void] $hitNameSet.Add($name); }
      ${isWindows
      ? `$hitInFile = msr -p $cmdFilePath${unixSlashArg} -t $searchPattern --nt '^\\s*#' -AC 2>$null;
      if ($hitInFile) {
        ${getWindowsSearchCmdFileCode()}
      }`
      : `$bashrcNameCountMap = @{};
      $hitCmdFileSet = New-Object 'System.Collections.Generic.HashSet[string]'([StringComparer]::OrdinalIgnoreCase);
      $homeBashrc = Join-Path $env:HOME '.bashrc'; ${toUnixPath('homeBashrc')}
      $cmdFilePaths = @($homeBashrc, $cmdFilePath) | Where-Object { Test-Path $_ };
      foreach ($oneCmdFilePath in $cmdFilePaths) {
        $hitInFile = msr -p $oneCmdFilePath${unixSlashArg} -b $searchPattern -Q '^alias \\w+' -y -T -1 -AC 2>$null;
        if ($hitInFile) {
          ${getLinuxSearchCmdFileCode()}
        }
      }
      $dupNames = @($bashrcNameCountMap.Keys | Where-Object { $bashrcNameCountMap[$_] -gt 1 });
      if ($dupNames.Count -gt 0) {
        Write-Host '';
        Write-Host ('Found ' + $dupNames.Count + ' duplicate alias in 2 bashrc files: ' + ($dupNames -join ' + ')) -Fore Yellow;
      }`}
    }
    $summaryParts = @();
    $sumFound = $cntSets + $cntFiles;
    if ($sumFound -gt 0) { $summaryParts += 'Found ' + [string]$sumFound + ' aliases' + $matchMode + ' in total, sumAliasBodyLen = ' + [string]$sumBodyLen + '.'; }
    if ($cntFiles -gt 0) { $summaryParts += 'Found ' + [string]$cntFiles + ' aliases in ${config.cmdFileType} file(s): ' + ${isWindows ? '$cmdFilePath' : '($hitCmdFileSet -join ([char]44 + [char]32))'} + '.'; }
    if ($cntSets -gt 0) { $summaryParts += 'Found ' + [string]$cntSets + ' aliases in ' + $hitGroups + ' groups from ' + $sumItems + ' aliases in ' + $sumGroups + ' groups: ' + ($hitGrpNames -join ', ') + ' in ' + $settingsPath + '.'; }
    if ($summaryParts.Count -gt 0) { Write-Host ''; Write-Host ($summaryParts -join ' ') -Fore Green; }
    elseif ($cntSets -eq 0 -and $cntFiles -eq 0) {
      Write-Host ('No alias found' + $matchMode + ': ' + $Prefix + ' or not matching other conditions.') -Fore Red;
    }`;
}

export function replaceArgForWindowsCmdAlias(body: string, writeToEachFile: boolean): string {
  body = replaceTextByRegex(body, /([\"'])\$1/g, '$1%~1'); // replace "$1" to "%~1"
  body = replaceTextByRegex(body, /\$(\d+)/g, '%$1'); // replace $1 to %1
  body = replaceTextByRegex(body, /\$\*/g, '%*').trim(); // replace $* to %*
  body = writeToEachFile
    ? replaceForLoopVariableForWindowsScript(body)
    : replaceForLoopVariableForWindowsAlias(body);
  if (writeToEachFile) {
    body = escapePercentForWindowsScript(body);
  }
  return body;
}

/**
 * Escape lone % characters for Windows batch script files (.cmd).
 *
 * In batch scripts, CMD expands %VAR% env vars and %0-%9 params before
 * any program runs. Git format specifiers like %Y, %H, %ad get consumed.
 * Fix: double % that are NOT part of:
 *   - Already doubled %% (for-loop vars after replaceForLoopVariableForWindowsScript)
 *   - %* (all batch params)
 *   - %0-%9 or %~... (batch param references like %1, %~dp0)
 *   - %ENVVAR% (matched env var pairs intended for expansion)
 */
export function escapePercentForWindowsScript(cmd: string): string {
  let result = '';
  let i = 0;
  while (i < cmd.length) {
    if (cmd[i] !== '%') {
      result += cmd[i];
      i++;
      continue;
    }

    // Already-doubled %% (e.g., for-loop vars %%a) — keep as-is
    if (i + 1 < cmd.length && cmd[i + 1] === '%') {
      result += '%%';
      i += 2;
      continue;
    }

    // %* (all batch params) — keep as-is
    if (i + 1 < cmd.length && cmd[i + 1] === '*') {
      result += '%*';
      i += 2;
      continue;
    }

    // %0-%9 or %~... (batch param references like %1, %~1, %~dp0) — keep as-is
    const remaining = cmd.substring(i);
    const paramMatch = remaining.match(/^%(~[a-z]*)?[0-9]/);
    if (paramMatch) {
      result += paramMatch[0];
      i += paramMatch[0].length;
      continue;
    }

    // %ENVVAR% (matched env var pair: %WORD_CHARS%) — keep as-is
    const envVarMatch = remaining.match(/^%(\w+)%/);
    if (envVarMatch) {
      result += envVarMatch[0];
      i += envVarMatch[0].length;
      continue;
    }

    // All other lone %: double it for literal % in batch scripts
    result += '%%';
    i++;
  }
  return result;
}

// Generate rm-alias PowerShell command body (avoid $a,$b,$g,$l,$r,$t prefixed variables)
function getRemoveAliasBody(terminalType: TerminalType, useUnixSlash: boolean = false): string {
  const isWindows = isWindowsTerminalOnWindows(terminalType);
  const isLinuxOnWindows = isLinuxStyleTerminalOnWindows(terminalType);
  const config = getOsAliasConfig(terminalType);
  const cmdFileSubPath = getAliasFileSubPath(config);
  // rm-alias also needs scriptFolder for deleting script files
  // Script folder path must match getCmdAliasSaveFolder logic:
  // - Native Linux/macOS: ~/cmdAlias (no subfolder)
  // - Windows CMD/PowerShell: ~/cmdAlias/cmd
  // - Linux terminals on Windows (WSL/MinGW/Cygwin): ~/cmdAlias/{terminalType}
  const scriptSubFolderPath = (isWindows || isLinuxOnWindows)
    ? config.scriptSubFolder  // cmdAlias/cmd or cmdAlias/mingw etc.
    : 'cmdAlias';             // Native Linux/macOS: just cmdAlias, no subfolder
  const cmdFilePathCode = getCmdFilePathCode(config, cmdFileSubPath, useUnixSlash, ['scriptFolder'])
    .replace(/(\$cmdFilePath = [^;]+;)/, `$1\n    $scriptFolder = Join-Path $cmdFolder '${scriptSubFolderPath}';`);
  // Helper function code for converting path to unix slash (for Cygwin/MinGW output)
  const toUnixSlashFunc = useUnixSlash
    ? `function ToUnixPath($p) { return $p -replace [regex]::Escape([char]92), [char]47; }`
    : `function ToUnixPath($p) { return $p; }`;
  return String.raw`
    $inArgs = @{}; $posArgs = @();
    $curArgName = $null;
    foreach ($va in @('$*' -split '\s+' | Where-Object { $_ })) {
      if ($va -match '^-(\w+)$') { $curArgName = $Matches[1]; }
      elseif ($curArgName) { $inArgs[$curArgName] = $va; $curArgName = $null; }
      else { $posArgs += $va; }
    }
    function Get-ParamValue($argName) { $matched = @($inArgs.Keys | Where-Object { $argName -like ($_ + '*') }); if ($matched.Count -eq 1) { return $inArgs[$matched[0]]; } elseif ($inArgs.ContainsKey($argName)) { return $inArgs[$argName]; } return $null; }
    $InputNames = if ($posArgs.Count -gt 0) { $posArgs -join ',' } else { '' };
    $pv = Get-ParamValue 'SettingsOnly'; $SettingsOnly = if ($null -ne $pv) { $pv -imatch '^(1|true|y)' } else { 0 };
    $pv = Get-ParamValue 'OnlyThisOS'; $OnlyThisOS = if ($null -ne $pv) { -not ($pv -imatch '^(0|false|n)') } else { 1 };
    $pv = Get-ParamValue 'KeepScripts'; $KeepScripts = if ($null -ne $pv) { $pv -imatch '^(1|true|y)' } else { 0 };
    $pv = Get-ParamValue 'Preview'; $Preview = if ($null -ne $pv) { $pv -imatch '^(1|true|y)' } else { 0 };
    if (-not $InputNames) { Write-Host 'Usage: rm-alias <AliasNames|Regex> [-SettingsOnly 0] [-OnlyThisOS 1] [-KeepScripts 0] [-Preview 0]' -Fore Red; Write-Host 'AliasNames: comma names or regex (auto-detected by special chars ^$.*+?|[])' -Fore Yellow; Write-Host 'Examples: rm-alias find-cs,find-py | rm-alias "find-.*" | rm-alias "^rgfind-.*" -Preview true' -Fore Cyan; Write-Host '-SettingsOnly 1: Only remove from settings.json, skip doskeys/bashrc and scripts' -Fore Yellow; Write-Host '-OnlyThisOS 0: Check all groups in settings, not just current OS' -Fore Yellow; Write-Host '-KeepScripts 1: Keep script files' -Fore Yellow; Write-Host '-Preview 1: Show matched aliases without deleting' -Fore Yellow; exit 1; }
    ${toUnixSlashFunc}
    ${config.settingsPathCode}
    ${cmdFilePathCode}
    $isRegexMode = $InputNames -notmatch '^[\w\-,]+$';
    $matchMode = if ($isRegexMode) { ' by regex' } else { ' by name' };
    $inputNameList = @();
    if (-not $isRegexMode) {
      $inputNameList = @($InputNames -split '\s*,\s*' | Where-Object { $_ });
    }
    $deleteCount = 0;
    $notFoundNames = @();
    $foundInCmdFile = @();
    $foundInSettings = @();
    $cmdFileContent = $null;
    $cmdFileModified = 0;
    if (-not $SettingsOnly -and (Test-Path $cmdFilePath)) { $cmdFileContent = Get-Content $cmdFilePath -Raw; }
    $settings = $null;
    $settingsRaw = $null;
    $settingsModified = 0;
    $dq = [char]34;
    if (Test-Path $settingsPath) { try { $settingsRaw = Get-Content $settingsPath -Raw; $settings = $settingsRaw | ConvertFrom-Json; } catch { } }
    $keyGroupNames = if ($OnlyThisOS) { @('msr.commonAliasNameBodyList','${config.osSpecificGroup}') } else { @('msr.commonAliasNameBodyList','msr.bash.commonAliasNameBodyList','msr.cmd.commonAliasNameBodyList') };
    if ($isRegexMode) {
      $regexPattern = $InputNames;
      $matchedNames = @();
      if (-not $SettingsOnly -and $cmdFileContent) {
        ${isWindows
      ? `$cmdFileContent -split '\\r?\\n' | ForEach-Object {
          if ($_ -match '^([\\w-]+)=' -and $Matches[1] -match $regexPattern) { $matchedNames += $Matches[1]; }
        };`
      : `$cmdFileContent -split '\\r?\\n' | ForEach-Object {
          if ($_ -match '^\\s*alias\\s+([\\w-]+)=' -and $Matches[1] -match $regexPattern) { $matchedNames += $Matches[1]; }
        };`}
      }
      if ($settings -and $settingsRaw) {
        foreach ($keyGroup in $keyGroupNames) {
          $prop = $settings.PSObject.Properties[$keyGroup];
          if ($prop -and $prop.Value) {
            foreach ($item in $prop.Value) {
              if ($item.aliasName -match $regexPattern -and $matchedNames -notcontains $item.aliasName) {
                $matchedNames += $item.aliasName;
              }
            }
          }
        }
      }
      if (-not $SettingsOnly -and -not $KeepScripts -and (Test-Path $scriptFolder)) {
        Get-ChildItem -Path $scriptFolder -File | ForEach-Object {
          $scriptName = $_.BaseName;
          if ($scriptName -match $regexPattern -and $matchedNames -notcontains $scriptName) {
            $matchedNames += $scriptName;
          }
        };
      }
      $matchedNames = @($matchedNames | Sort-Object -Unique);
      if ($matchedNames.Count -eq 0) {
        Write-Host ('No alias matched regex pattern: ' + $regexPattern) -Fore Red;
        exit 1;
      }
      $inputNameList = $matchedNames;
    }
    function Get-SrcRow($raw, $pt) { $ms = Select-String -InputObject $raw -Pattern $pt -AllMatches; if ($ms.Matches.Count -gt 0) { ($raw.Substring(0, $ms.Matches[0].Index) -split '\r?\n').Count } else { 0 } }
    function Test-AliasExists($pn) {
      if ($cmdFileContent) { ${isWindows
      ? `if ($cmdFileContent -match ('(?m)^\\s*' + [regex]::Escape($pn) + '=')) { return 1; }`
      : `if ($cmdFileContent -match ('(?m)^\\s*alias\\s+' + [regex]::Escape($pn) + '=')) { return 1; }`} }
      if ($settings) { foreach ($kg in $keyGroupNames) { $pp = $settings.PSObject.Properties[$kg]; if ($pp -and $pp.Value) { foreach ($it in $pp.Value) { if ($it.aliasName -eq $pn) { return 1; } } } } }
      if (-not $SettingsOnly -and -not $KeepScripts) { if (Test-Path (Join-Path $scriptFolder ($pn + '${config.scriptExt}'))) { return 1; } }
      return 0;
    }
    function Show-Names($nl, $c) { foreach ($n in $nl) { Write-Host ('  - ' + $n) -Fore $c; } }
    if ($Preview) {
      $existNames = @(); $missNames = @();
      foreach ($pn in $inputNameList) { if (Test-AliasExists $pn) { $existNames += $pn; } else { $missNames += $pn; } }
      Write-Host '[Preview] Would delete the following aliases:' -Fore Cyan;
      Show-Names $existNames Yellow;
      if ($missNames.Count -gt 0) {
        Write-Host ('[Preview] Not found in any source (' + $missNames.Count + '):') -Fore DarkGray;
        Show-Names $missNames DarkGray;
      }
      if ($isRegexMode) {
        Write-Host ('Found ' + $inputNameList.Count + ' matching regex: ' + $InputNames + ', ' + $existNames.Count + ' to delete, ' + $missNames.Count + ' not found.') -Fore Green;
      } else {
        Write-Host ('Input ' + $inputNameList.Count + ' aliases' + $matchMode + ', ' + $existNames.Count + ' found to delete, ' + $missNames.Count + ' not found.') -Fore Green;
      }
      exit 0;
    }
    foreach ($itemName in $inputNameList) {
      $foundForItem = 0;
      if (-not $SettingsOnly -and $cmdFileContent) {
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
          $deleteCount++; $foundForItem = 1;
        }
      }
      if (-not $SettingsOnly -and -not $KeepScripts) {
        $scriptPath = Join-Path $scriptFolder ($itemName + '${config.scriptExt}');
        if (Test-Path $scriptPath) {
          Remove-Item -Path $scriptPath -Force;
          Write-Host ('Deleted script file: ' + (ToUnixPath $scriptPath)) -Fore Yellow;
          $deleteCount++; $foundForItem = 1;
        }
      }
      if ($settings -and $settingsRaw) {
        foreach ($keyGroup in $keyGroupNames) {
          $prop = $settings.PSObject.Properties[$keyGroup];
          if ($prop -and $prop.Value) {
            $itemList = @($prop.Value);
            $newItemList = @($itemList | Where-Object { $_.aliasName -ne $itemName });
            if ($newItemList.Count -lt $itemList.Count) {
              $prop.Value = $newItemList;
              $settingsModified++;
              $kgRow = Get-SrcRow $settingsRaw ('(?m)^\s*' + $dq + [regex]::Escape($keyGroup) + $dq);
              $itemRow = Get-SrcRow $settingsRaw ($dq + 'aliasName' + $dq + '\s*:\s*' + $dq + [regex]::Escape($itemName) + $dq);
              if ($itemRow -lt $kgRow -or $itemRow -eq 0) { $itemRow = $kgRow; }
              $foundInSettings += ($keyGroup + ': ' + $itemName + ' at ' + (ToUnixPath $settingsPath) + ':' + $itemRow + ':');
              $deleteCount++; $foundForItem = 1;
            }
          }
        }
      }
      if ($foundForItem -eq 0) { $notFoundNames += $itemName; }
    }
    if ($cmdFileModified -gt 0) {
      Set-Content -Path $cmdFilePath -Value $cmdFileContent.TrimEnd() -NoNewline;
      Write-Host ('Removed ' + $foundInCmdFile.Count + ' aliases from ' + (ToUnixPath $cmdFilePath)) -Fore Green;
    }
    if ($settingsModified -gt 0) {
      $newJson = $settings | ConvertTo-Json -Depth 100;
      Set-Content -Path $settingsPath -Value $newJson -Encoding UTF8;
      Write-Host ('Removed ' + $foundInSettings.Count + ' aliases from ' + (ToUnixPath $settingsPath)) -Fore Green;
    }
    if ($notFoundNames.Count -gt 0) {
      Write-Host ('Alias not found' + $matchMode + ': ' + ($notFoundNames -join ', ')) -Fore Red;
    }
    if ($deleteCount -gt 0) {
      Write-Host ('Total removed' + $matchMode + ': ' + $deleteCount + ' items') -Fore Cyan;
    }`;
}

let LinuxAliasMap: Map<string, string> = new Map<string, string>()
  .set('vim-to-row', String.raw`msr -z "$1" -t "^(.+?):(\d+)(:.*)?$" -o "vim +\2 +\"set number\" \"\1\"" -XM`)
  // Pure bash versions for Linux - git hash check in update-repo-paths handles cache refresh automatically
  .set('gpc', String.raw`git rev-parse --abbrev-ref HEAD | msr -t "(.+)" -o "git pull origin \1 $*" --to-stderr --keep-color -XM`)
  .set('gpm', String.raw`mainRef=$(git rev-parse --verify origin/main 2>/dev/null); primaryBranch=$([ -n "$mainRef" ] && echo main || echo master); msr --to-stderr --keep-color -XM -z "git pull origin $primaryBranch $*"`)
  .set('gfm', String.raw`mainRef=$(git rev-parse --verify origin/main 2>/dev/null); primaryBranch=$([ -n "$mainRef" ] && echo main || echo master); msr --to-stderr --keep-color -XM -z "git fetch origin $primaryBranch $*"`)
  .set('gpc-sm', String.raw`git rev-parse --abbrev-ref HEAD | msr -t "(.+)" -o "git pull origin \1 --no-recurse-submodules" -XM; msr -z "git submodule sync && git submodule update --init" -t "&&" -o "\n" -PAC | msr -XM -V ne0`)
  .set('gpc-sm-reset', String.raw`git rev-parse --abbrev-ref HEAD | msr -t "(.+)" -o "git pull origin \1 --no-recurse-submodules" -XM && msr -z "git submodule sync && git submodule update --init && git submodule update -f" -t "&&" -o "\n" -PAC | msr -XM -V ne0; git status`)
  .set('git-sm-init', String.raw`msr -XMz "git submodule sync" && echo git submodule update --init $* | msr -XM; git status`)
  .set('git-sm-reset', String.raw`msr -XMz "git submodule sync" && msr -XMz "git submodule init" && echo git submodule update -f $* | msr -XM; git status`)
  .set('git-sm-restore', String.raw`echo git restore . --recurse-submodules $* | msr -XM; git status`)
  .set('git-rm-junk', String.raw`git ls-files --others --exclude-standard | msr -t "(.+)" -o "rm -f \"\1\"" -XMO; git status`)
  .set('gdm', String.raw`mainRef=$(git rev-parse --verify origin/main 2>/dev/null); primaryRef=$([ -n "$mainRef" ] && echo origin/main || echo origin/master); cnt3=$(git diff --name-only "$primaryRef..." 2>/dev/null | wc -l); cnt2=$(git diff --name-only $primaryRef 2>/dev/null | wc -l); dots=$([ $cnt3 -le $cnt2 ] && echo "..." || echo ""); msr --to-stderr --keep-color -XM -z "git difftool $primaryRef$dots $*"`)
  .set('gdmt', String.raw`mainRef=$(git rev-parse --verify origin/main 2>/dev/null); primaryRef=$([ -n "$mainRef" ] && echo origin/main || echo origin/master); cnt3=$(git diff --name-only "$primaryRef..." 2>/dev/null | wc -l); cnt2=$(git diff --name-only $primaryRef 2>/dev/null | wc -l); dots=$([ $cnt3 -le $cnt2 ] && echo "..." || echo ""); msr --to-stderr --keep-color -XM -z "git --no-pager diff $primaryRef$dots $*"`)
  .set('gdm-l', String.raw`mainRef=$(git rev-parse --verify origin/main 2>/dev/null); primaryRef=$([ -n "$mainRef" ] && echo origin/main || echo origin/master); cnt3=$(git diff --name-only "$primaryRef..." 2>/dev/null | wc -l); cnt2=$(git diff --name-only $primaryRef 2>/dev/null | wc -l); dots=$([ $cnt3 -le $cnt2 ] && echo "..." || echo ""); msr --to-stderr --keep-color -XM -z "git --no-pager diff --name-only $primaryRef$dots $*"`)
  .set('gdm-al', String.raw`mainRef=$(git rev-parse --verify origin/main 2>/dev/null); primaryRef=$([ -n "$mainRef" ] && echo origin/main || echo origin/master); cnt3=$(git diff --name-only --diff-filter=A "$primaryRef..." 2>/dev/null | wc -l); cnt2=$(git diff --name-only --diff-filter=A $primaryRef 2>/dev/null | wc -l); dots=$([ $cnt3 -le $cnt2 ] && echo "..." || echo ""); msr --to-stderr --keep-color -XM -z "git --no-pager diff --name-only --diff-filter=A $primaryRef$dots $*"`)
  .set('gdm-m', String.raw`mainRef=$(git rev-parse --verify origin/main 2>/dev/null); primaryRef=$([ -n "$mainRef" ] && echo origin/main || echo origin/master); cnt3=$(git diff --name-only --diff-filter=M "$primaryRef..." 2>/dev/null | wc -l); cnt2=$(git diff --name-only --diff-filter=M $primaryRef 2>/dev/null | wc -l); dots=$([ $cnt3 -le $cnt2 ] && echo "..." || echo ""); msr --to-stderr --keep-color -XM -z "git difftool --diff-filter=M $primaryRef$dots $*"`)
  .set('gdm-ml', String.raw`mainRef=$(git rev-parse --verify origin/main 2>/dev/null); primaryRef=$([ -n "$mainRef" ] && echo origin/main || echo origin/master); cnt3=$(git diff --name-only --diff-filter=M "$primaryRef..." 2>/dev/null | wc -l); cnt2=$(git diff --name-only --diff-filter=M $primaryRef 2>/dev/null | wc -l); dots=$([ $cnt3 -le $cnt2 ] && echo "..." || echo ""); msr --to-stderr --keep-color -XM -z "git --no-pager diff --name-only --diff-filter=M $primaryRef$dots $*"`)
  .set('gdm-dl', String.raw`mainRef=$(git rev-parse --verify origin/main 2>/dev/null); primaryRef=$([ -n "$mainRef" ] && echo origin/main || echo origin/master); cnt3=$(git diff --name-only --diff-filter=D "$primaryRef..." 2>/dev/null | wc -l); cnt2=$(git diff --name-only --diff-filter=D $primaryRef 2>/dev/null | wc -l); dots=$([ $cnt3 -le $cnt2 ] && echo "..." || echo ""); msr --to-stderr --keep-color -XM -z "git --no-pager diff --name-only --diff-filter=D $primaryRef$dots $*"`)
  .set('gdm-nt', String.raw`mainRef=$(git rev-parse --verify origin/main 2>/dev/null); primaryRef=$([ -n "$mainRef" ] && echo origin/main || echo origin/master); cnt3=$(git diff --name-only "$primaryRef..." 2>/dev/null | wc -l); cnt2=$(git diff --name-only $primaryRef 2>/dev/null | wc -l); dots=$([ $cnt3 -le $cnt2 ] && echo "..." || echo ""); echo "git diff $primaryRef$dots $* | msr -b \"^\s*diff\s+\" -Q \"\" -y --nt \"^diff\s+.*?test\" -i -PIC" | msr -V lt0 --to-stderr --keep-color -XM`)
  .set('gdc', String.raw`msr -z "git difftool origin/$(git rev-parse --abbrev-ref HEAD) $*" -XM`)
  .set('gdct', String.raw`msr -z "git --no-pager diff origin/$(git rev-parse --abbrev-ref HEAD) $*" -XM`)
  .set('gdc-l', String.raw`msr -z "git --no-pager diff --name-only origin/$(git rev-parse --abbrev-ref HEAD) $*" -XM`)
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
  .set('gsf', String.raw`git --no-pager diff --name-only $1^! $2 $3 $4 $5 $6 $7 $8 $9`)
  ;

const CommonAliasMap: Map<string, string> = new Map<string, string>()
  // Git hash check in update-repo-paths handles cache refresh automatically - no need for del-this-tmp-list
  .set('gpc', String.raw`git rev-parse --abbrev-ref HEAD | msr -t "(.+)" -o "git pull origin \1 $*" --to-stderr --keep-color -XM`)
  .set('gpm', String.raw`pwsh -Command "$mainRef = git rev-parse --verify origin/main 2>$null; $primaryBranch = if ($mainRef) { 'main' } else { 'master' }; msr --to-stderr --keep-color -XM -z \"git pull origin $primaryBranch $*\""`)
  .set('gfm', String.raw`pwsh -Command "$mainRef = git rev-parse --verify origin/main 2>$null; $primaryBranch = if ($mainRef) { 'main' } else { 'master' }; msr --to-stderr --keep-color -XM -z \"git fetch origin $primaryBranch $*\""`)
  .set('gph', String.raw`git rev-parse --abbrev-ref HEAD | msr -t "(.+)" -o "git push origin \1 $*" -XM`)
  .set('gpc-sm', String.raw`git rev-parse --abbrev-ref HEAD | msr -t "(.+)" -o "git pull origin \1 --no-recurse-submodules" -XM
          & msr -z "git submodule sync && git submodule update --init" -t "&&" -o "\n" -PAC | msr -XM -V ne0`)
  .set('gpc-sm-reset', String.raw`git rev-parse --abbrev-ref HEAD | msr -t "(.+)" -o "git pull origin \1 --no-recurse-submodules" -XM
          && msr -z "git submodule sync && git submodule update --init && git submodule update -f" -t "&&" -o "\n" -PAC | msr -XM -V ne0
          & git status`)
  .set('gca', String.raw`git commit --amend --no-edit $*`)
  .set('gfc', String.raw`git rev-parse --abbrev-ref HEAD | msr -t "(.+)" -o "git fetch origin \1" -XM`)
  .set('gfcs', String.raw`git rev-parse --abbrev-ref HEAD | msr -t "(.+)" -o "git fetch origin \1:refs/remotes/origin/\1 --depth=1 $*" -XM`)
  .set('gdc', String.raw`pwsh -Command "msr -z \"git difftool origin/$(git rev-parse --abbrev-ref HEAD) $*\" -XM"`)
  .set('gdct', String.raw`pwsh -Command "msr -z \"git --no-pager diff origin/$(git rev-parse --abbrev-ref HEAD) $*\" -XM"`)
  .set('gdc-l', String.raw`pwsh -Command "msr -z \"git --no-pager diff --name-only origin/$(git rev-parse --abbrev-ref HEAD) $*\" -XM"`)
  .set('gdf', String.raw`git diff --name-only $1 | msr -t "(.+)" -o "git difftool $* \1" -XM`)
  .set('gsf', String.raw`git --no-pager diff --name-only $1^^! $2 $3 $4 $5 $6 $7 $8 $9`)
  .set('gsh', String.raw`git rev-parse --abbrev-ref HEAD | msr -t "(.+)" -o "git reset --hard origin/\1" -XM`)
  .set('gsh-sm', String.raw`git rev-parse --abbrev-ref HEAD | msr -t "(.+)" -o "git reset --hard origin/\1" -XM
          && msr -z "git submodule sync --init && git submodule update -f" -t "&&" -o "\n" -PAC | msr -XM -V ne0 & git status`)
  .set('gst', String.raw`git status $*`)
  .set('git-gc', String.raw`git reflog expire --all --expire=now && git gc --prune=now --aggressive`)
  .set('git-rb-list', String.raw`git --no-pager for-each-ref --format="%(refname:short)" refs/remotes/origin`)
  .set('git-shallow-clone', String.raw`echo git clone --single-branch --depth 1 $* && git clone --single-branch --depth 1 $*`)
  .set('git-clean', String.raw`msr -z "git clean -xffd && git submodule foreach --recursive git clean -xffd" -t "&&" -o "\n" -PAC | msr -XM`)
  .set('git-sm-prune', String.raw`msr -XM -z "git prune" && msr -XMz "git submodule foreach git prune"`)
  .set('git-sm-init', String.raw`msr -XMz "git submodule sync" && echo git submodule update --init $* | msr -XM & git status`)
  .set('git-sm-reset', String.raw`msr -XMz "git submodule sync" && msr -XMz "git submodule init" && echo git submodule update -f $*
          | msr -XM & git status`)
  .set('git-sm-restore', String.raw`echo git restore . --recurse-submodules $* | msr -XM & git status`)
  .set('git-sm-reinit', String.raw`msr -XM -z "git submodule deinit -f ." && msr -XM -z "git submodule update --init" & git status`)
  .set('git-sm-update-remote', String.raw`msr -XMz "git submodule sync" && echo git submodule update --remote $* | msr -XM & git status`)
  .set('git-cherry-pick-branch-new-old-commits', String.raw`git --no-pager log $1 | msr -b "^commit $2" -q "^commit $3" -t "^commit (\w+)" -o "\1" -M -C
          | msr -s "^:(\d+):" -n --dsc -t "^:\d+:(?:\d+:)?\s+(\w+)" -o "git cherry-pick \1" -X -V ne0 $4 $5 $6 $7 $8 $9`)
  .set('git-sm-check', String.raw`git diff --name-only HEAD
          | msr -x / -o \ -aPAC | msr -t "(.+)" -o "if exist \1\* pushd \1 && git status --untracked-files=all --short && git --no-pager diff --name-only" -XM $*`)
  .set('git-sm-delete', String.raw`git diff --name-only HEAD
          | msr -x / -o \ -aPAC | msr -t "(.+)" -o "if exist \1\* pushd \1
              && git status --untracked-files=all --short
              && git --no-pager diff --name-only
              && git status --untracked-files=all --short
            | msr -t \"^\\W+\\s+(.+)\\s*$\" -o \"git clean -dfx \\1\" -XM" -XM`)
  .set('sfs', String.raw`msr -l --sz --wt -p $*`)
  .set('sft', String.raw`msr -l --wt --sz -p $*`)
  .set('git-find-commit', String.raw`git --no-pager log --since="36 months ago" --date=format-local:"%Y-%m-%d %H:%M:%S %z" --pretty=format:"%H %ad %an %s" --grep=$*`)
  .set('git-find-content', String.raw`git --no-pager log --since="36 months ago" --date=format-local:"%Y-%m-%d %H:%M:%S %z" --pretty=format:"%H %ad %an %s" -S $*`)
  .set('git-find-log', String.raw`git --no-pager log --since="36 months ago" --date=format-local:"%Y-%m-%d %H:%M:%S %z" | msr -b "^commit \w+" -Q "" -y -aPAC -it $* | msr -i -t "^(commit\W+|Author:|Date:)|$1" -P -e "^commit\W+.*|(^Author:.*)|^Date:.*"`)
  .set('git-find-creation', String.raw`git --no-pager log --since="36 months ago" --date=format-local:"%Y-%m-%d %H:%M:%S %z" --pretty=format:"%H %ad %an %s" --follow --diff-filter=A --name-status -- $*`)
  .set('git-find-deletion', String.raw`git --no-pager log --since="36 months ago" --date=format-local:"%Y-%m-%d %H:%M:%S %z" --pretty=format:"%H %ad %an %s" --follow --diff-filter=D --name-status -- $*`)
  .set('git-find-update', String.raw`git --no-pager log --since="36 months ago" --date=format-local:"%Y-%m-%d %H:%M:%S %z" --pretty=format:"%H %ad %an %s" --follow --diff-filter=M --name-status -- $*`)
  .set('glc', String.raw`git rev-parse --abbrev-ref HEAD | msr -t "(.+)" -o "git --no-pager log --date=format-local:\"%Y-%m-%d %H:%M:%S %z\" --pretty=format:\"%H %ad %an %s\" --name-only origin/\1 $*" -XIM --to-stderr --keep-color`)
  .set('glcc', String.raw`git rev-parse --abbrev-ref HEAD | msr -t "(.+)" -o "git --no-pager log --date=format-local:\"%Y-%m-%d %H:%M:%S %z\" --pretty=format:\"%H %ad %an %s\" --name-only \1 $*" -XIM --to-stderr --keep-color`)
  .set('gdm', String.raw`pwsh -Command "$mainRef = git rev-parse --verify origin/main 2>$null; $primaryRef = if ($mainRef) { 'origin/main' } else { 'origin/master' }; $cnt3 = @(git diff --name-only ($primaryRef + '...') 2>$null).Count; $cnt2 = @(git diff --name-only $primaryRef 2>$null).Count; $dots = if ($cnt3 -le $cnt2) { '...' } else { '' }; msr --to-stderr --keep-color -XM -z \"git difftool $primaryRef$dots $*\""`)
  .set('gdmt', String.raw`pwsh -Command "$mainRef = git rev-parse --verify origin/main 2>$null; $primaryRef = if ($mainRef) { 'origin/main' } else { 'origin/master' }; $cnt3 = @(git diff --name-only ($primaryRef + '...') 2>$null).Count; $cnt2 = @(git diff --name-only $primaryRef 2>$null).Count; $dots = if ($cnt3 -le $cnt2) { '...' } else { '' }; msr --to-stderr --keep-color -XM -z \"git --no-pager diff $primaryRef$dots $*\""`)
  .set('gdm-l', String.raw`pwsh -Command "$mainRef = git rev-parse --verify origin/main 2>$null; $primaryRef = if ($mainRef) { 'origin/main' } else { 'origin/master' }; $cnt3 = @(git diff --name-only ($primaryRef + '...') 2>$null).Count; $cnt2 = @(git diff --name-only $primaryRef 2>$null).Count; $dots = if ($cnt3 -le $cnt2) { '...' } else { '' }; msr --to-stderr --keep-color -XM -z \"git --no-pager diff --name-only $primaryRef$dots $*\""`)
  .set('gdm-al', String.raw`pwsh -Command "$mainRef = git rev-parse --verify origin/main 2>$null; $primaryRef = if ($mainRef) { 'origin/main' } else { 'origin/master' }; $cnt3 = @(git diff --name-only --diff-filter=A ($primaryRef + '...') 2>$null).Count; $cnt2 = @(git diff --name-only --diff-filter=A $primaryRef 2>$null).Count; $dots = if ($cnt3 -le $cnt2) { '...' } else { '' }; msr --to-stderr --keep-color -XM -z \"git --no-pager diff --name-only --diff-filter=A $primaryRef$dots $*\""`)
  .set('gdm-m', String.raw`pwsh -Command "$mainRef = git rev-parse --verify origin/main 2>$null; $primaryRef = if ($mainRef) { 'origin/main' } else { 'origin/master' }; $cnt3 = @(git diff --name-only --diff-filter=M ($primaryRef + '...') 2>$null).Count; $cnt2 = @(git diff --name-only --diff-filter=M $primaryRef 2>$null).Count; $dots = if ($cnt3 -le $cnt2) { '...' } else { '' }; msr --to-stderr --keep-color -XM -z \"git difftool --diff-filter=M $primaryRef$dots $*\""`)
  .set('gdm-ml', String.raw`pwsh -Command "$mainRef = git rev-parse --verify origin/main 2>$null; $primaryRef = if ($mainRef) { 'origin/main' } else { 'origin/master' }; $cnt3 = @(git diff --name-only --diff-filter=M ($primaryRef + '...') 2>$null).Count; $cnt2 = @(git diff --name-only --diff-filter=M $primaryRef 2>$null).Count; $dots = if ($cnt3 -le $cnt2) { '...' } else { '' }; msr --to-stderr --keep-color -XM -z \"git --no-pager diff --name-only --diff-filter=M $primaryRef$dots $*\""`)
  .set('gdm-dl', String.raw`pwsh -Command "$mainRef = git rev-parse --verify origin/main 2>$null; $primaryRef = if ($mainRef) { 'origin/main' } else { 'origin/master' }; $cnt3 = @(git diff --name-only --diff-filter=D ($primaryRef + '...') 2>$null).Count; $cnt2 = @(git diff --name-only --diff-filter=D $primaryRef 2>$null).Count; $dots = if ($cnt3 -le $cnt2) { '...' } else { '' }; msr --to-stderr --keep-color -XM -z \"git --no-pager diff --name-only --diff-filter=D $primaryRef$dots $*\""`)
  .set('gdm-nt', String.raw`pwsh -Command "$mainRef = git rev-parse --verify origin/main 2>$null; $primaryRef = if ($mainRef) { 'origin/main' } else { 'origin/master' }; $cnt3 = @(git diff --name-only ($primaryRef + '...') 2>$null).Count; $cnt2 = @(git diff --name-only $primaryRef 2>$null).Count; $dots = if ($cnt3 -le $cnt2) { '...' } else { '' }; $dq = [char]34; $inputArgs = '$*'.Trim(); $matchResult = [regex]::Match($inputArgs, '(^|\s+)([12]?>>?\s*\S+)\s*$'); $fileArgs = if ($matchResult.Success) { $inputArgs.Substring(0, $matchResult.Index).Trim() } else { $inputArgs }; $pipeTail = if ($matchResult.Success) { ' ' + $matchResult.Groups[2].Value.Trim() } else { '' }; $command = 'git diff ' + $primaryRef + $dots + ' ' + $fileArgs + ' | msr -b ' + $dq + '^\s*diff\s+' + $dq + ' -Q ' + $dq + $dq + ' -y --nt ' + $dq + '^diff\s+.*?test' + $dq + ' -i -PIC' + $pipeTail; msr -V lt0 --to-stderr --keep-color -XM -z $command"`)
  .set('to-alias-body', String.raw`pwsh -Command "
          $WithQuotes = '$1' -imatch '^(1|true|y)';
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

// Only to-alias-body needs PowerShell conversion (gpm/gdm-* have pure bash versions)
['to-alias-body'].forEach(name => {
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

// Generate check-xxx-env PowerShell body with statistics
function getCheckEnvBody(envTarget: string): string {
  const displayName = envTarget === 'User' ? 'User' : (envTarget === 'Process' ? 'Tmp' : 'System');
  const cmdName = envTarget === 'User' ? 'check-user-env' : (envTarget === 'Process' ? 'check-tmp-env' : 'check-sys-env');
  const envVarsCode = envTarget === 'Process'
    ? '[System.Environment]::GetEnvironmentVariables()'
    : `[System.Environment]::GetEnvironmentVariables([System.EnvironmentVariableTarget]::${envTarget})`;
  return String.raw`
    $inputArgs = [Console]::In.ReadToEnd().Trim();
    if ([string]::IsNullOrWhiteSpace($inputArgs) -or $inputArgs -imatch '^ECHO is o(n|ff)\W*$') { $inputArgs = ''; }
    if ($inputArgs -imatch '^(-h|--help)$') { Write-Host 'Usage: ${cmdName} [NameMatch] [-ValueMatch {regex}] [-IgnoreCase 1]' -ForegroundColor Cyan; Write-Host 'NameMatch: regex pattern to filter environment variable names (optional)' -ForegroundColor Yellow; Write-Host '-ValueMatch {regex}: regex pattern to filter environment variable values (optional)' -ForegroundColor Yellow; Write-Host '-IgnoreCase 1: case-insensitive matching (default), set 0 for case-sensitive' -ForegroundColor Yellow; exit 0; }
    $namedArgs = @{}; $posArgs = @();
    $curArgName = $null;
    foreach ($inputValue in @($inputArgs -split '\s+' | Where-Object { $_ })) {
      if ($inputValue -match '^-(\w+)$') { $curArgName = $Matches[1]; }
      elseif ($curArgName) { $namedArgs[$curArgName] = $inputValue.Trim([char]34); $curArgName = $null; }
      else { $posArgs += $inputValue.Trim([char]34); }
    }
    function Get-ParamValue($argName) { $matched = @($namedArgs.Keys | Where-Object { $argName -like ($_ + '*') }); if ($matched.Count -eq 1) { return $namedArgs[$matched[0]]; } elseif ($namedArgs.ContainsKey($argName)) { return $namedArgs[$argName]; } return $null; }
    $pv = Get-ParamValue 'NameMatch'; $NameMatch = if ($null -ne $pv) { $pv } elseif ($posArgs.Count -gt 0) { $posArgs[0] } else { '' };
    $pv = Get-ParamValue 'ValueMatch'; $ValueMatch = if ($null -ne $pv) { $pv } elseif ($posArgs.Count -gt 1) { $posArgs[1] } else { '' };
    $pv = Get-ParamValue 'IgnoreCase'; $IgnoreCase = if ($null -ne $pv) { -not ($pv -imatch '^(0|false|n)') } elseif ($posArgs.Count -gt 2) { -not ($posArgs[2] -imatch '^(0|false|n)') } else { 1 };
    $matchOptions = if ($IgnoreCase) { [System.Text.RegularExpressions.RegexOptions]::IgnoreCase } else { [System.Text.RegularExpressions.RegexOptions]::None };
    $envVars = ${envVarsCode};
    $keyCount = 0;
    $nonEmptyCount = 0;
    $sumLen = 0;
    $minLen = [int]::MaxValue;
    $maxLen = 0;
    $minKey = '';
    $maxKey = '';
    $filteredEnvs = @{};
    foreach ($key in $envVars.Keys) {
      $val = $envVars[$key];
      if ($NameMatch -and -not [regex]::IsMatch($key, $NameMatch, $matchOptions)) { continue; }
      if ($ValueMatch -and -not [regex]::IsMatch($val, $ValueMatch, $matchOptions)) { continue; }
      $filteredEnvs[$key] = $val;
      $keyCount++;
      if (-not [string]::IsNullOrEmpty($val)) {
        $nonEmptyCount++;
        $valLen = $val.Length;
        $sumLen += $valLen;
        if ($valLen -lt $minLen) { $minLen = $valLen; $minKey = $key; }
        if ($valLen -gt $maxLen) { $maxLen = $valLen; $maxKey = $key; }
      }
    }
    $filteredEnvs.GetEnumerator() | Sort-Object Name | ForEach-Object {
      $nameText = $_.Name;
      $valueText = $_.Value;
      Write-Host ($nameText + ' = ') -NoNewline -ForegroundColor Green;
      Write-Host $valueText;
    };
    Write-Host '';
    if ($minLen -eq [int]::MaxValue) { $minLen = 0; }
    Write-Host ('${displayName} environment matched ' + $keyCount + ' keys, ' + $nonEmptyCount + ' non-empty values, total value length = ' + $sumLen + '. ') -ForegroundColor Cyan -NoNewline;
    Write-Host ('Min = ' + $minLen) -ForegroundColor Yellow -NoNewline;
    if ($minKey) { Write-Host (' (' + $minKey + ')') -ForegroundColor DarkGray -NoNewline; }
    Write-Host (', Max = ' + $maxLen) -ForegroundColor Yellow -NoNewline;
    if ($maxKey) { Write-Host (' (' + $maxKey + ')') -ForegroundColor DarkGray; } else { Write-Host ''; }`;
}

// Generate check-xxx-path PowerShell body with duplicate detection and existence check
function getCheckPathBody(envTarget: string): string {
  const pathValueCode = envTarget === 'Process' ? '$env:PATH' : getPathEnv([envTarget]);
  const displayName = envTarget === 'Process' ? 'Tmp' : envTarget;
  const cmdName = envTarget === 'User' ? 'check-user-path' : (envTarget === 'Process' ? 'check-tmp-path' : 'check-sys-path');
  const addPathCmd = envTarget === 'Process' ? 'add-tmp-path' : `add-${envTarget.toLowerCase()}-path`;
  return String.raw`
    $inputArgs = '$*'.Trim();
    if ($inputArgs -imatch '^(-h|--help)$') { Write-Host 'Usage: ${cmdName} [PathOrMultiline] [-CheckPath {path}]' -ForegroundColor Cyan; Write-Host 'PathOrMultiline: set 1/yes/true for multiline output, or a path to check existence' -ForegroundColor Yellow; Write-Host '-CheckPath {path}: specific path to check if it exists in PATH (alternative to positional arg)' -ForegroundColor Yellow; Write-Host 'Output colors: Red=non-existing, Yellow=duplicate(first), DarkYellow=duplicate(later), Magenta=no-permission' -ForegroundColor Yellow; exit 0; }
    $namedArgs = @{}; $posArgs = @();
    $curArgName = $null;
    $inputTokens = @($inputArgs -split '\s+' | Where-Object { $_ });
    for ($idx = 0; $idx -lt $inputTokens.Count; $idx++) {
      $inputValue = $inputTokens[$idx];
      if ($inputValue -match '^-(\w+)$') { $curArgName = $Matches[1]; }
      elseif ($curArgName) { $namedArgs[$curArgName] = $inputValue.Trim([char]34); $curArgName = $null; }
      else { $posArgs += ($inputTokens[$idx..($inputTokens.Count-1)] -join ' ').Trim([char]34); break; }
    }
    function Get-ParamValue($argName) { $matched = @($namedArgs.Keys | Where-Object { $argName -like ($_ + '*') }); if ($matched.Count -eq 1) { return $namedArgs[$matched[0]]; } elseif ($namedArgs.ContainsKey($argName)) { return $namedArgs[$argName]; } return $null; }
    $pv = Get-ParamValue 'PathOrMultiline'; $PathOrMultiline = if ($null -ne $pv) { $pv } elseif ($posArgs.Count -gt 0) { $posArgs[0] } else { '' };
    $pv = Get-ParamValue 'CheckPath'; if ($null -ne $pv) { $PathOrMultiline = $pv; }
    $pathValue = ${pathValueCode};
    $pathItems = @($pathValue -split '\s*;\s*' | Where-Object { $_ } | ForEach-Object { $_.TrimEnd('\\/') });
    $seenPathSet = New-Object 'System.Collections.Generic.HashSet[string]'([StringComparer]::OrdinalIgnoreCase);
    $duplicateSet = New-Object 'System.Collections.Generic.HashSet[string]'([StringComparer]::OrdinalIgnoreCase);
    $nonExistSet = New-Object 'System.Collections.Generic.HashSet[string]'([StringComparer]::OrdinalIgnoreCase);
    $noPermSet = New-Object 'System.Collections.Generic.HashSet[string]'([StringComparer]::OrdinalIgnoreCase);
    foreach ($onePath in $pathItems) {
      if (-not $seenPathSet.Add($onePath)) { [void] $duplicateSet.Add($onePath); }
      try { if (-not (Test-Path $onePath -ErrorAction Stop)) { [void] $nonExistSet.Add($onePath); } }
      catch { [void] $noPermSet.Add($onePath); }
    }
    $isMultilineMode = $PathOrMultiline -imatch '^(1|true|y)';
    $isCheckMode = -not [string]::IsNullOrWhiteSpace($PathOrMultiline) -and -not ($PathOrMultiline -imatch '^(yes|y|1|true|0|false|no|n)$');
    if ($isCheckMode) {
      $checkPath = $PathOrMultiline.TrimEnd('\\/');
      $foundIndex = -1;
      for ($k = 0; $k -lt $pathItems.Count; $k++) {
        if ($pathItems[$k] -ieq $checkPath) { $foundIndex = $k; break; }
      }
      if ($foundIndex -ge 0) {
        Write-Host ('Found at index ' + $foundIndex + ' in ${displayName} PATH: ') -NoNewline;
        Write-Host $checkPath -ForegroundColor Green;
      } else {
        Write-Host ('NOT found in ${displayName} PATH: ') -NoNewline;
        Write-Host $checkPath -ForegroundColor Red;
      }
    }
    if ($isMultilineMode -or -not $isCheckMode) {
      $seenForDisplay = New-Object 'System.Collections.Generic.HashSet[string]'([StringComparer]::OrdinalIgnoreCase);
      $isFirstItem = 1;
      foreach ($onePath in $pathItems) {
        $isDup = $duplicateSet.Contains($onePath);
        $isFirstOccur = $seenForDisplay.Add($onePath);
        $notExist = $nonExistSet.Contains($onePath);
        $noPerm = $noPermSet.Contains($onePath);
        if ($isMultilineMode) {
          if ($notExist) { Write-Host $onePath -ForegroundColor Red; }
          elseif ($noPerm) { Write-Host $onePath -ForegroundColor Magenta; }
          elseif ($isDup) {
            if ($isFirstOccur) { Write-Host $onePath -ForegroundColor Yellow; }
            else { Write-Host $onePath -ForegroundColor DarkYellow; }
          } else { Write-Host $onePath; }
        } else {
          if (-not $isFirstItem) { Write-Host ';' -NoNewline; }
          $isFirstItem = 0;
          if ($notExist) { Write-Host $onePath -ForegroundColor Red -NoNewline; }
          elseif ($noPerm) { Write-Host $onePath -ForegroundColor Magenta -NoNewline; }
          elseif ($isDup) {
            if ($isFirstOccur) { Write-Host $onePath -ForegroundColor Yellow -NoNewline; }
            else { Write-Host $onePath -ForegroundColor DarkYellow -NoNewline; }
          } else { Write-Host $onePath -NoNewline; }
        }
      }
      if (-not $isMultilineMode) {
        Write-Host '';
      }
      Write-Host '';
      $dupCount = $duplicateSet.Count;
      $nonExistCount = $nonExistSet.Count;
      $noPermCount = $noPermSet.Count;
      $uniqueCount = $seenForDisplay.Count;
      $dupColor = if ($dupCount -eq 0) { 'Green' } else { 'Red' };
      $nonExistColor = if ($nonExistCount -eq 0) { 'Green' } else { 'Red' };
      $noPermColor = if ($noPermCount -eq 0) { 'Green' } else { 'Magenta' };
      Write-Host ('Found ' + $pathItems.Count + ' paths with ') -NoNewline;
      Write-Host ([string]$dupCount + ' duplicate(s)') -ForegroundColor $dupColor -NoNewline;
      Write-Host ', ' -NoNewline;
      Write-Host ([string]$nonExistCount + ' non-existing') -ForegroundColor $nonExistColor -NoNewline;
      Write-Host ', ' -NoNewline;
      Write-Host ([string]$noPermCount + ' no-permission') -ForegroundColor $noPermColor -NoNewline;
      Write-Host (', ' + [string]$uniqueCount + ' unique path(s). ') -NoNewline;
      $pathSize = $pathValue.Length;
      $joinedSize = ($seenForDisplay -join ';').Length;
      $diffSize = $pathSize - $joinedSize;
      $sizeColor = if ($diffSize -eq 0) { 'Green' } else { 'Yellow' };
      Write-Host ('Raw length = ' + $pathSize + ', trimmed length = ' + $joinedSize + ', diff = ' + $diffSize + '.') -ForegroundColor $sizeColor;
      if ($dupCount -gt 0) {
        $simplePath = ($pathItems | Where-Object { $_ -notmatch '[\s\(\)]' } | Sort-Object { $_.Length } | Select-Object -First 1);
        Write-Host '';
        Write-Host ('Tip: Run "${addPathCmd} {any-existing-path}" to remove duplicates, example: ${addPathCmd} ' + $simplePath) -ForegroundColor Cyan;
      }
    }`;
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
  $seenSet = New-Object System.Collections.Generic.HashSet[String]([StringComparer]::OrdinalIgnoreCase);
  $orderedList = New-Object System.Collections.Generic.List[String];
  foreach ($pv in $values) {
    if ([string]::IsNullOrWhiteSpace($pv)) { continue; }
    ${skipAddingNewPath}
    if ($seenSet.Add($pv)) { $orderedList.Add($pv); }
  }
  [String]::Join(';', $orderedList)"') do @SET "PATH=%a"`;
}

function getReloadEnvCmd(writeToEachFile: boolean, name: string = 'reload-env'): string {
  const escapeCmdEqual = '^=';
  const cmdAlias = String.raw`for /f "tokens=*" %a in ('${WindowsPowerShellCmdHeader} "
    $processEnvs = [System.Environment]::GetEnvironmentVariables([System.EnvironmentVariableTarget]::Process);
    $sysEnvs = [System.Environment]::GetEnvironmentVariables([System.EnvironmentVariableTarget]::Machine);
    $userEnvs = [System.Environment]::GetEnvironmentVariables([System.EnvironmentVariableTarget]::User);
    $pathValueSet = New-Object System.Collections.Generic.HashSet[String]([StringComparer]::OrdinalIgnoreCase);
    $combinedPathValues = $($processEnvs['Path'] + ';' + $sysEnvs['Path'] + ';' + $userEnvs['Path']) -Split '\\*\s*;\s*';
    foreach ($path in $combinedPathValues) {
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
    $combinedPathValues = $($sysEnvs['Path'] + ';' + $userEnvs['Path']) -Split '\\*\s*;\s*';
    foreach ($path in $combinedPathValues) {
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

// Generate add-xxx-env command for setting environment variables
function getAddEnvCmd(envTarget: string): string {
  const displayName = envTarget === 'User' ? 'User' : 'System';
  const cmdName = envTarget === 'User' ? 'add-user-env' : 'add-sys-env';
  const permissionHint = envTarget === 'Machine'
    ? `Write-Host 'ERROR: Modifying system environment requires Administrator privileges. Please run CMD/PowerShell as Administrator.' -ForegroundColor Red; exit 1;`
    : `Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red; exit 1;`;
  const cmdAlias = String.raw`set "TMP_ADD_ENV_INPUT=$*" && ${WindowsPowerShellCmdHeader} "
    $fullInput = $env:TMP_ADD_ENV_INPUT;
    if ([string]::IsNullOrWhiteSpace($fullInput)) {
      Write-Host 'Usage: ${cmdName} <EnvName> <EnvValue>' -ForegroundColor Red;
      Write-Host 'Example: ${cmdName} MY_VAR \"my value with spaces\"' -ForegroundColor Yellow;
      exit 1;
    }
    $fullInput = $fullInput.Trim();
    $envName = $null; $envValue = $null;
    if ($fullInput -match '^(\S+)\s+(.+)$') {
      $envName = $Matches[1].Trim([char]34);
      $envValue = $Matches[2].Trim([char]34);
    } elseif ($fullInput -match '^(\S+)$') {
      $envName = $Matches[1].Trim([char]34);
      $envValue = '';
    }
    if (-not $envName) {
      Write-Host 'Usage: ${cmdName} <EnvName> <EnvValue>' -ForegroundColor Red;
      exit 1;
    }
    try {
      [System.Environment]::SetEnvironmentVariable($envName, $envValue, [System.EnvironmentVariableTarget]::${envTarget});
      Write-Host ('Set ${displayName} env: ' + $envName + '=' + $envValue) -ForegroundColor Green;
    } catch {
      ${permissionHint}
    }
    " && set "TMP_ADD_ENV_INPUT=" && reload-env`;
  return trimAliasBody(cmdAlias).replace(TrimMultilineRegex, ' ');
}

// Generate del-xxx-env command for deleting environment variables
function getDelEnvCmd(envTarget: string): string {
  const displayName = envTarget === 'User' ? 'User' : 'System';
  const cmdName = envTarget === 'User' ? 'del-user-env' : 'del-sys-env';
  const permissionHint = envTarget === 'Machine'
    ? `Write-Host 'ERROR: Modifying system environment requires Administrator privileges. Please run CMD/PowerShell as Administrator.' -ForegroundColor Red; exit 1;`
    : `Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red; exit 1;`;
  const cmdAlias = String.raw`set "TMP_DEL_ENV_INPUT=$*" && ${WindowsPowerShellCmdHeader} "
    $fullInput = $env:TMP_DEL_ENV_INPUT;
    if ([string]::IsNullOrWhiteSpace($fullInput)) {
      Write-Host 'Usage: ${cmdName} <EnvName>' -ForegroundColor Red;
      Write-Host 'Example: ${cmdName} MY_VAR' -ForegroundColor Yellow;
      exit 1;
    }
    $envName = $fullInput.Trim().Trim([char]34);
    if (-not $envName) {
      Write-Host 'Usage: ${cmdName} <EnvName>' -ForegroundColor Red;
      exit 1;
    }
    try {
      $oldValue = [System.Environment]::GetEnvironmentVariable($envName, [System.EnvironmentVariableTarget]::${envTarget});
      if ($null -eq $oldValue) {
        Write-Host ('${displayName} env not found: ' + $envName) -ForegroundColor Yellow;
      } else {
        [System.Environment]::SetEnvironmentVariable($envName, $null, [System.EnvironmentVariableTarget]::${envTarget});
        Write-Host ('Deleted ${displayName} env: ' + $envName + ' (was: ' + $oldValue + ')') -ForegroundColor Green;
      }
    } catch {
      ${permissionHint}
    }
    " && set "TMP_DEL_ENV_INPUT=" && reload-env`;
  return trimAliasBody(cmdAlias).replace(TrimMultilineRegex, ' ');
}

// Generate add-xxx-path command (supports DeleteNonExistsPaths flag)
function getAddPathValueCmd(envTarget: string): string {
  const permissionHint = envTarget === 'Machine'
    ? `Write-Host 'ERROR: Modifying system PATH requires Administrator privileges. Please run CMD/PowerShell as Administrator.' -ForegroundColor Red; exit 1;`
    : `Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red; exit 1;`;
  // For Process target, use env var to pass input (handles paths with spaces/parentheses)
  if (envTarget === 'Process') {
    const cmdAlias = String.raw`set "TMP_ADD_PATH_INPUT=$*" && for /f "tokens=*" %a in ('${WindowsPowerShellCmdHeader} "
      $fullInput = $env:TMP_ADD_PATH_INPUT;
      if ([string]::IsNullOrWhiteSpace($fullInput)) { $fullInput = ''; }
      $fullInput = $fullInput.Trim().Trim([char]34);
      $namedArgs = @{}; $posArgs = @();
      $curArgName = $null;
      foreach ($inputValue in @($fullInput -split '\s*;\s*' | Where-Object { $_ })) {
        $inputValue = $inputValue.Trim([char]34);
        if ($inputValue -match '^-(\w+)\s+(.+)$') { $namedArgs[$Matches[1]] = $Matches[2].Trim([char]34); }
        elseif ($inputValue -match '^-(\w+)$') { $curArgName = $Matches[1]; }
        elseif ($curArgName) { $namedArgs[$curArgName] = $inputValue; $curArgName = $null; }
        else { $posArgs += $inputValue; }
      }
      function Get-ParamValue($argName) { $matched = @($namedArgs.Keys | Where-Object { $argName -like ($_ + '*') }); if ($matched.Count -eq 1) { return $namedArgs[$matched[0]]; } elseif ($namedArgs.ContainsKey($argName)) { return $namedArgs[$argName]; } return $null; }
      $pv = Get-ParamValue 'Paths'; $pathsToAdd = if ($null -ne $pv) { $pv } elseif ($posArgs.Count -gt 0) { $posArgs -join ';' } else { '' };
      $pv = Get-ParamValue 'DeleteNonExistsPaths'; $DeleteNonExistsPaths = if ($null -ne $pv) { $pv -imatch '^(1|true|y)' } else { 0 };
      $pathValues = $env:PATH;
      $newValue = $pathValues.Trim().TrimEnd('\; ') + ';' + $pathsToAdd.Trim().TrimEnd('\; ');
      $values = $newValue -split '\\*\s*;\s*';
      $seenSet = New-Object System.Collections.Generic.HashSet[String]([StringComparer]::OrdinalIgnoreCase);
      $orderedList = New-Object System.Collections.Generic.List[String];
      $deletedCount = 0;
      foreach ($pv in $values) {
        if ([string]::IsNullOrWhiteSpace($pv)) { continue; }
        if ($DeleteNonExistsPaths -and -not (Test-Path $pv)) {
          [Console]::Error.WriteLine('Deleting non-exist path: ' + $pv);
          $deletedCount++;
          continue;
        }
        if ($seenSet.Add($pv)) { $orderedList.Add($pv); }
      }
      if ($deletedCount -gt 0) { [Console]::Error.WriteLine('Removed ' + $deletedCount + ' non-existing path(s) in total.'); }
      [string]::Join(';', $orderedList);
    "') do @SET "PATH=%a" && set "TMP_ADD_PATH_INPUT="`;
    return trimAliasBody(cmdAlias).replace(TrimMultilineRegex, ' ');
  }
  const cmdAlias = String.raw`${WindowsPowerShellCmdHeader} "
    $fullInput = '$*'.Trim().Trim([char]34);
    $namedArgs = @{}; $posArgs = @();
    $curArgName = $null;
    foreach ($inputValue in @($fullInput -split '\s*;\s*' | Where-Object { $_ })) {
      $inputValue = $inputValue.Trim([char]34);
      if ($inputValue -match '^-(\w+)\s+(.+)$') { $namedArgs[$Matches[1]] = $Matches[2].Trim([char]34); }
      elseif ($inputValue -match '^-(\w+)$') { $curArgName = $Matches[1]; }
      elseif ($curArgName) { $namedArgs[$curArgName] = $inputValue; $curArgName = $null; }
      else { $posArgs += $inputValue; }
    }
    function Get-ParamValue($argName) { $matched = @($namedArgs.Keys | Where-Object { $argName -like ($_ + '*') }); if ($matched.Count -eq 1) { return $namedArgs[$matched[0]]; } elseif ($namedArgs.ContainsKey($argName)) { return $namedArgs[$argName]; } return $null; }
    $pv = Get-ParamValue 'Paths'; $pathsToAdd = if ($null -ne $pv) { $pv } elseif ($posArgs.Count -gt 0) { $posArgs -join ';' } else { '' };
    $pv = Get-ParamValue 'DeleteNonExistsPaths'; $DeleteNonExistsPaths = if ($null -ne $pv) { $pv -imatch '^(1|true|y)' } else { 0 };
    $oldPathValue = ${getPathEnv([envTarget])};
    $newValue = $oldPathValue.Trim().TrimEnd('\; ') + ';' + $pathsToAdd.Trim().TrimEnd('\; ');
    $values = $newValue -split '\\*\s*;\s*';
    $seenSet = New-Object System.Collections.Generic.HashSet[String]([StringComparer]::OrdinalIgnoreCase);
    $orderedList = New-Object System.Collections.Generic.List[String];
    $deletedCount = 0;
    foreach ($pv in $values) {
      if ([string]::IsNullOrWhiteSpace($pv)) { continue; }
      if ($DeleteNonExistsPaths -and -not (Test-Path $pv)) {
        Write-Host ('Deleting non-exist path: ' + $pv) -ForegroundColor Yellow;
        $deletedCount++;
        continue;
      }
      if ($seenSet.Add($pv)) { $orderedList.Add($pv); }
    }
    $newValue = [string]::Join(';', $orderedList);
    if ($deletedCount -gt 0) { Write-Host ('Removed ' + $deletedCount + ' non-existing path(s) in total.') -ForegroundColor Green; }
    try {
      [System.Environment]::SetEnvironmentVariable('PATH', $newValue, [System.EnvironmentVariableTarget]::${envTarget});
    } catch {
      ${permissionHint}
    }
    " && ${getReloadWindowsEnvCmd()}`;
  return trimAliasBody(cmdAlias).replace(TrimMultilineRegex, ' ');
}

function getRemovePathValueCmd(envTarget: string): string {
  const permissionHint = envTarget === 'Machine'
    ? `Write-Host 'ERROR: Modifying system PATH requires Administrator privileges. Please run CMD/PowerShell as Administrator.' -ForegroundColor Red; exit 1;`
    : `Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red; exit 1;`;
  // For Process target, use env var to pass input (handles paths with spaces/parentheses)
  if (envTarget === 'Process') {
    const cmdAlias = String.raw`set "TMP_DEL_PATH_INPUT=$*" && for /f "tokens=*" %a in ('${WindowsPowerShellCmdHeader} "
      $deleteInput = $env:TMP_DEL_PATH_INPUT;
      if ([string]::IsNullOrWhiteSpace($deleteInput)) { $deleteInput = ''; }
      $deleteInput = $deleteInput.Trim().Trim([char]34);
      $namedArgs = @{}; $posArgs = @();
      $curArgName = $null;
      foreach ($inputValue in @($deleteInput -split '\s*;\s*' | Where-Object { $_ })) {
        $inputValue = $inputValue.Trim([char]34);
        if ($inputValue -match '^-(\w+)\s+(.+)$') { $namedArgs[$Matches[1]] = $Matches[2].Trim([char]34); }
        elseif ($inputValue -match '^-(\w+)$') { $curArgName = $Matches[1]; }
        elseif ($curArgName) { $namedArgs[$curArgName] = $inputValue; $curArgName = $null; }
        else { $posArgs += $inputValue; }
      }
      function Get-ParamValue($argName) { $matched = @($namedArgs.Keys | Where-Object { $argName -like ($_ + '*') }); if ($matched.Count -eq 1) { return $namedArgs[$matched[0]]; } elseif ($namedArgs.ContainsKey($argName)) { return $namedArgs[$argName]; } return $null; }
      $pv = Get-ParamValue 'Paths'; $pathsInput = if ($null -ne $pv) { $pv } elseif ($posArgs.Count -gt 0) { $posArgs -join ';' } else { '' };
      $deleteValues = ($pathsInput.Trim().TrimEnd('\; ')) -split '\\*\s*;\s*';
      $deleteValueSet = New-Object System.Collections.Generic.HashSet[String]([StringComparer]::OrdinalIgnoreCase);
      foreach ($pv in $deleteValues) {
        [void] $deleteValueSet.Add($pv);
      }
      $oldValue = $env:PATH;
      $newValues = ($oldValue.Trim().TrimEnd('\; ')) -split '\\*\s*;\s*';
      $seenSet = New-Object System.Collections.Generic.HashSet[String]([StringComparer]::OrdinalIgnoreCase);
      $orderedList = New-Object System.Collections.Generic.List[String];
      foreach ($pv in $newValues) {
        if ([string]::IsNullOrWhiteSpace($pv)) { continue; }
        if (-not $deleteValueSet.Contains($pv)) {
          if ($seenSet.Add($pv)) { $orderedList.Add($pv); }
        }
      }
      [string]::Join(';', $orderedList);
    "') do @SET "PATH=%a" && set "TMP_DEL_PATH_INPUT="`;
    return trimAliasBody(cmdAlias).replace(TrimMultilineRegex, ' ');
  }
  const cmdAlias = String.raw`${WindowsPowerShellCmdHeader} "
    $fullInput = '$*'.Trim().Trim([char]34);
    $namedArgs = @{}; $posArgs = @();
    $curArgName = $null;
    foreach ($inputValue in @($fullInput -split '\s*;\s*' | Where-Object { $_ })) {
      $inputValue = $inputValue.Trim([char]34);
      if ($inputValue -match '^-(\w+)\s+(.+)$') { $namedArgs[$Matches[1]] = $Matches[2].Trim([char]34); }
      elseif ($inputValue -match '^-(\w+)$') { $curArgName = $Matches[1]; }
      elseif ($curArgName) { $namedArgs[$curArgName] = $inputValue; $curArgName = $null; }
      else { $posArgs += $inputValue; }
    }
    function Get-ParamValue($argName) { $matched = @($namedArgs.Keys | Where-Object { $argName -like ($_ + '*') }); if ($matched.Count -eq 1) { return $namedArgs[$matched[0]]; } elseif ($namedArgs.ContainsKey($argName)) { return $namedArgs[$argName]; } return $null; }
    $pv = Get-ParamValue 'Paths'; $pathsInput = if ($null -ne $pv) { $pv } elseif ($posArgs.Count -gt 0) { $posArgs -join ';' } else { '' };
    $deleteValues = ($pathsInput.Trim().TrimEnd('\; ')) -split '\\*\s*;\s*';
    $deleteValueSet = New-Object System.Collections.Generic.HashSet[String]([StringComparer]::OrdinalIgnoreCase);
    foreach ($pv in $deleteValues) {
      [void] $deleteValueSet.Add($pv);
    }
    $oldValue = ${getPathEnv([envTarget])};
    $newValues = ($oldValue.Trim().TrimEnd('\; ')) -split '\\*\s*;\s*';
    $seenSet = New-Object System.Collections.Generic.HashSet[String]([StringComparer]::OrdinalIgnoreCase);
    $orderedList = New-Object System.Collections.Generic.List[String];
    foreach ($pv in $newValues) {
      if ([string]::IsNullOrWhiteSpace($pv)) { continue; }
      if (-not $deleteValueSet.Contains($pv)) {
        if ($seenSet.Add($pv)) { $orderedList.Add($pv); }
      }
    }
    $newValue = [string]::Join(';', $orderedList);
    try {
      [System.Environment]::SetEnvironmentVariable('PATH', $newValue, [System.EnvironmentVariableTarget]::${envTarget});
    } catch {
      ${permissionHint}
    }
    " && ${getReloadWindowsEnvCmd()}`;
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
  .set('git-rm-junk', String.raw`git ls-files --others --exclude-standard | msr -x / -o \ -aPAC | msr -t "(.+)" -o "del /A /f \"\1\"" -XMO & git status`)
  .set('add-user-env', getAddEnvCmd('User'))
  .set('add-sys-env', getAddEnvCmd('Machine'))
  .set('del-user-env', getDelEnvCmd('User'))
  .set('del-sys-env', getDelEnvCmd('Machine'))
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
  .set('check-user-env', `echo $* | ${WindowsPowerShellCmdHeader} "${getCheckEnvBody('User').replace(TrimMultilineRegex, ' ')}"`)
  .set('check-user-path', `${WindowsPowerShellCmdHeader} "${getCheckPathBody('User').replace(TrimMultilineRegex, ' ')}"`)
  .set('check-sys-env', `echo $* | ${WindowsPowerShellCmdHeader} "${getCheckEnvBody('Machine').replace(TrimMultilineRegex, ' ')}"`)
  .set('check-sys-path', `${WindowsPowerShellCmdHeader} "${getCheckPathBody('Machine').replace(TrimMultilineRegex, ' ')}"`)
  .set('check-tmp-env', `echo $* | ${WindowsPowerShellCmdHeader} "${getCheckEnvBody('Process').replace(TrimMultilineRegex, ' ')}"`)
  .set('check-tmp-path', `${WindowsPowerShellCmdHeader} "${getCheckPathBody('Process').replace(TrimMultilineRegex, ' ')}"`)
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
  .set('grant-perm', String.raw`echo icacls $* /grant %USERNAME%:(OI)(CI)F /T /C /Q | msr -XM`)
  .set('open-vsc', String.raw`code "%APPDATA%\Code\User\settings.json"`)
  .set('to-vscode-arg-lines', String.raw`${WindowsPowerShellCmdHeader} "Set-Clipboard $(Get-Clipboard | msr -t '\s+' -o '\n' -aPAC
          | msr -t '(.+)' -o '\t\t\#\1\#,' -aPIC | msr -x '#' -o '\\\"' -PAC).Replace('\"\"', '\"');"`)
  .set('to-vscode-arg-lines-2-slashes', String.raw`${WindowsPowerShellCmdHeader} "Set-Clipboard $(Get-Clipboard | msr -t '\s+' -o '\n' -aPAC
          | msr -t '(.+)' -o '\t\t\#\1\#,' -aPIC | msr -x \ -o \\ -aPAC | msr -x '#' -o '\\\"' -aPAC).Replace('\"\"', '\"');"`)
  .set('to-one-json-line', String.raw`${WindowsPowerShellCmdHeader} "
          $clipContent = $(Get-Clipboard).Replace('\"', '\\\"') | msr -S -t '[\r\n]\s*' -o ' ' -PAC;
          Set-Clipboard('\"' + $clipContent.Trim() + '\"'); Get-Clipboard"`)
  .set('to-one-json-line-from-file', String.raw`${WindowsPowerShellCmdHeader} "$clipContent = $(Get-Content '$1').Replace('\"', '\\\"')
          | msr -S -t '[\r\n]\s*(\S+)' -o ' \1' -PAC; Set-Clipboard('\"' + $clipContent.Trim() + '\"'); Get-Clipboard"`)
  .set('ts-to-minutes', String.raw`${WindowsPowerShellCmdHeader} "[Math]::Round([TimeSpan]::Parse('$1').TotalMinutes)"`)
  .set('to-local-time', String.raw`${WindowsPowerShellCmdHeader} "
          msr -z $([DateTime]::Parse([regex]::Replace('$*'.TrimEnd('Z') + 'Z', '(?<=[+-]\d{2}:?\d{2})Z$', '')).ToString('o'))
          -t '\.0+([\+\-]\d+[:\d]*|Z)$' -o '\1' -aPA"`) // PowerShell "[DateTime]::Parse('$1').ToLocalTime()"
  .set('to-utc-time', String.raw`${WindowsPowerShellCmdHeader} "
          msr -z $([DateTime]::Parse('$*').ToUniversalTime().ToString('o')) -t '\.0+([\+\-]\d+[:\d]*|Z)$' -o '\1' -aPA"`)
  .set('to-full-path', String.raw`msr -l -p $* -H 0 -C | msr -t ".*?SourcePaths = (.+?)\s*\.\s*$" -o "\1" -PAC`)
  .set('to-unix-path', String.raw`msr -z $* -x \ -o / -PAC`)
  .set('to-2s-path', String.raw`msr -z $* -x \ -o \\ -PAC`)
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
    ['to-alias-body', 'gpm', 'gfm', 'gdm', 'gdm-m', 'gdm-l', 'gdm-al', 'gdm-ml', 'gdm-dl', 'gdm-nt'].forEach(name => {
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

  const findAliasBody = generateFindAliasCommand(terminalType);
  const rmAliasBody = generateRemoveAliasCommand(terminalType);
  cmdAliasMap.set('find-alias', getAliasBody(terminalType, 'find-alias', findAliasBody, writeToEachFile));
  cmdAliasMap.set('rm-alias', getAliasBody(terminalType, 'rm-alias', rmAliasBody, writeToEachFile));

  // get common alias map from config/settings:
  readConfigCommonAlias(cmdAliasMap, terminalType, writeToEachFile);
  readConfigCommonAlias(cmdAliasMap, terminalType, writeToEachFile, isWindowsTerminal ? 'cmd' : 'bash');
  return cmdAliasMap;
}

// Get Windows native msr.exe path (excluding Cygwin symlink)
function getWindowsNativeMsrPath(): string {
  const [isExists, msrPath] = isToolExistsInPath('msr.exe', TerminalType.CMD);
  if (isExists && msrPath) {
    return msrPath;
  }
  // Fallback: return empty, PowerShell script will handle it
  return '';
}

// Generate find-alias or rm-alias command for the specified terminal type
function generatePowerShellAliasCommand(terminalType: TerminalType, bodyGenerator: (t: TerminalType, useUnixSlash: boolean) => string): string {
  const isWindowsTerminal = isWindowsTerminalOnWindows(terminalType);
  const isLinuxOnWindows = isLinuxStyleTerminalOnWindows(terminalType);
  const useUnixSlash = isLinuxOnWindows && IsUniformSlashSupported;
  let bodyRaw = bodyGenerator(terminalType, useUnixSlash);
  if (isWindowsTerminal) {
    return `${WindowsPowerShellCmdHeader} "${bodyRaw.replace(TrimMultilineRegex, ' ')}"`;
  }
  bodyRaw = bodyRaw.replace(TrimMultilineRegex, ' ');
  // For Cygwin: embed Windows native msr.exe path to avoid symlink execution error
  if (terminalType === TerminalType.CygwinBash) {
    const windowsMsrPath = getWindowsNativeMsrPath();
    if (windowsMsrPath) {
      const escapedPath = windowsMsrPath.replace(/\\/g, '\\\\\\\\');
      const setMsrAlias = `Set-Alias -Name msr -Value \\\"${escapedPath}\\\" -Scope Script;`;
      bodyRaw = setMsrAlias + ' ' + bodyRaw;
    }
  }
  let body = 'pwsh -Command "' + bodyRaw + '"';
  body = replacePowerShellQuoteForLinuxAlias(body);
  return replacePowerShellVarsForLinuxAlias(body);
}

function generateFindAliasCommand(terminalType: TerminalType): string {
  return generatePowerShellAliasCommand(terminalType, getFindAliasBody);
}

function generateRemoveAliasCommand(terminalType: TerminalType): string {
  return generatePowerShellAliasCommand(terminalType, getRemoveAliasBody);
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
