import * as vscode from 'vscode';
import { AliasNameBody } from './AliasNameBody';
import { IsWindows, isNullOrEmpty } from './constants';
import { MyConfig, getConfig } from './dynamicConfig';
import { TerminalType } from "./enums";
import { enableColorAndHideCommandLine, outputInfoByDebugModeByTime, outputInfoQuietByTime, outputWarnByTime } from "./outputUtils";
import { isToolExistsInPath, isWindowsTerminalOnWindows } from "./terminalUtils";
import { getPowerShellName, replaceSearchTextHolder, replaceTextByRegex } from "./utils";

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
  return body.replace(/(?<!\\)(\$[a-zA-Z]\w+)/g, '\\$1');
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

export function replaceArgForWindowsCmdAlias(body: string, writeToEachFile: boolean): string {
  body = replaceTextByRegex(body, /([\"'])\$1/g, '$1%~1'); // replace "$1" to "%~1"
  body = replaceTextByRegex(body, /\$(\d+)/g, '%$1'); // replace $1 to %1
  body = replaceTextByRegex(body, /\$\*/g, '%*').trim(); // replace $* to %*
  body = writeToEachFile
    ? replaceForLoopVariableForWindowsScript(body)
    : replaceForLoopVariableForWindowsAlias(body);
  return body;
}

let LinuxAliasMap: Map<string, string> = new Map<string, string>()
  .set('vim-to-row', String.raw`msr -z "$1" -t "^(.+?):(\d+)(:.*)?$" -o "vim +\2 +\"set number\" \"\1\"" -XM`)
  .set('git-add-safe-dir', String.raw`repoRootDir=$(git rev-parse --show-toplevel);
      git config --global --get-all safe.directory
        | msr -t "^$repoRootDir/?$" -M && msr -XMI -z "git config --global --add safe.directory $repoRootDir";
      msr -p $repoRootDir/.gitmodules -t "^\s*path\s*=\s*(\S+)" -o "$repoRootDir/\1" -PAC
        | nin ~/.gitconfig "^(\S+)" "^\s*directory\s*=\s*(\S+)" -PAC
        | msr -t "(.+)" -o "git config --global --add safe.directory \1" -XMI;
      msr -XMI -z "git config --global --get-all safe.directory | msr -x $repoRootDir -P as final check"`)
  .set('clear-msr-env', String.raw`for name in $(printenv | msr -t "^(MSR_\w+)=.*" -o "\1" -PAC); do echo "Cleared $name=$(printenv $name)" | grep -iE "MSR_\w+" --color && eval "unset $name"; done`)
  ;

const CommonAliasMap: Map<string, string> = new Map<string, string>()
  .set('gpc', String.raw`git branch | msr -t "^\s*\*\s*(\S+).*" -o "git pull origin \1 $*" -XM & del-this-tmp-list`)
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
  .set('to-alias-body', String.raw`pwsh -Command "
          $rawBody = Get-Clipboard;
          if ([string]::IsNullOrWhiteSpace($rawBody)) {
            Write-Host 'Clipboard is empty! Please copy alias body to clipboard first.' -ForegroundColor Red;
            return;
          }
          if ([regex]::IsMatch($rawBody, '\bfunction\s+\w+\(\s*\)\s*\{')) {
            Write-Host 'Please copy pure alias body in the function.' -ForegroundColor Red;
            return;
          }
          $newLine = ([char]10).ToString();
          $newBody = [string]::Join($newLine, $rawBody).Trim();
          ${getCodeToReplaceHeadSpacesToTab('newBody', 'newLine')}
          $jsonBody = $newBody | ConvertTo-Json;
          if ($PSVersionTable.PSVersion.Major -lt 7) {
            $jsonBody = $jsonBody.Replace('\u0026', '&').Replace('\u003e', '>').Replace('\u0027', ([char]39).ToString()).Replace('\u003c', '<');
          }
          Set-Clipboard $jsonBody;
          $jsonBody;
          $message = 'Copied one-line body(length = ' + $jsonBody.Length + ') above to clipboard, you can paste it to aliasBody in msr.xxx.commonAliasNameBodyList in vscode settings.json';
          Write-Host $message -ForegroundColor Green"`)
  ;

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
  return String.raw`for /f "tokens=*" %a in ('PowerShell -Command "
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
  const cmdAlias = String.raw`for /f "tokens=*" %a in ('PowerShell -Command "
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

  const cmdAlias = String.raw`for /f "tokens=*" %a in ('PowerShell -Command "
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
  const cmdAlias = String.raw`PowerShell -Command "
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
  const cmdAlias = String.raw`PowerShell -Command "
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
        & msr -p %a/.gitmodules -t "^\s*path\s*=\s*(\S+)" -o "%a/\1" -PAC
          | nin %USERPROFILE%/.gitconfig "^(\S+)" "^\s*directory\s*=\s*(\S+)" -i -PAC
          | msr -t "(.+)" -o "git config --global --add safe.directory \1" -XMI
        & msr -XMI -z "git config --global --get-all safe.directory | msr -ix %a -P as final check"`)
  .set('add-user-path', getAddPathValueCmd('User'))
  .set('add-sys-path', getAddPathValueCmd('Machine'))
  .set('add-tmp-path', getAddPathValueCmd('Process'))
  .set('del-user-path', getRemovePathValueCmd('User'))
  .set('del-sys-path', getRemovePathValueCmd('Machine'))
  .set('del-tmp-path', getRemovePathValueCmd('Process'))
  .set('reload-path', String.raw`for /f "tokens=*" %a in ('PowerShell -Command "
          $pathValue = ${getPathEnv(['Machine', 'User', 'Process'])};
          $newValues = $pathValue -split '\\*\s*;\s*';
          $valueSet = New-Object System.Collections.Generic.HashSet[String]([StringComparer]::OrdinalIgnoreCase);
          foreach ($pv in $newValues) {
            [void] $valueSet.Add($pv);
          }
          [void] $valueSet.Remove('');
          [string]::Join(';', $valueSet);
        "') do @SET "PATH=%a"`)
  .set('check-user-env', String.raw`PowerShell -Command "[System.Environment]::GetEnvironmentVariables([System.EnvironmentVariableTarget]::User)"`)
  .set('check-user-path', String.raw`PowerShell -Command "[System.Environment]::GetEnvironmentVariable('PATH', [System.EnvironmentVariableTarget]::User)"`)
  .set('check-sys-env', String.raw`PowerShell -Command "[System.Environment]::GetEnvironmentVariables([System.EnvironmentVariableTarget]::Machine)"`)
  .set('check-sys-path', String.raw`PowerShell -Command "[System.Environment]::GetEnvironmentVariable('PATH', [System.EnvironmentVariableTarget]::Machine)"`)
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
  .set('to-vscode-arg-lines', String.raw`PowerShell -Command "Set-Clipboard $(Get-Clipboard | msr -t '\s+' -o '\n' -aPAC
          | msr -t '(.+)' -o '\t\t\#\1\#,' -aPIC | msr -x '#' -o '\\\"' -PAC).Replace('\"\"', '\"');"`)
  .set('to-vscode-arg-lines-2-slashes', String.raw`PowerShell -Command "Set-Clipboard $(Get-Clipboard | msr -t '\s+' -o '\n' -aPAC
          | msr -t '(.+)' -o '\t\t\#\1\#,' -aPIC | msr -x \ -o \\ -aPAC | msr -x '#' -o '\\\"' -aPAC).Replace('\"\"', '\"');"`)
  .set('to-one-json-line', String.raw`PowerShell -Command "
          $requestBody = $(Get-Clipboard).Replace('\"', '\\\"') | msr -S -t '[\r\n]\s*' -o ' ' -PAC;
          Set-Clipboard('\"' + $requestBody.Trim() + '\"'); Get-Clipboard"`)
  .set('to-one-json-line-from-file', String.raw`PowerShell -Command "$requestBody = $(Get-Content '$1').Replace('\"', '\\\"')
          | msr -S -t '[\r\n]\s*(\S+)' -o ' \1' -PAC; Set-Clipboard('\"' + $requestBody.Trim() + '\"'); Get-Clipboard"`)
  .set('ts-to-minutes', String.raw`PowerShell -Command "[Math]::Round([TimeSpan]::Parse('$1').TotalMinutes)"`)
  .set('to-local-time', String.raw`PowerShell -Command "
          msr -z $([DateTime]::Parse([regex]::Replace('$*'.TrimEnd('Z') + 'Z', '(?<=[+-]\d{2}:?\d{2})Z$', '')).ToString('o'))
          -t '\.0+([\+\-]\d+[:\d]*|Z)$' -o '\1' -aPA"`) // PowerShell "[DateTime]::Parse('$1').ToLocalTime()"
  .set('to-utc-time', String.raw`PowerShell -Command "
          msr -z $([DateTime]::Parse('$*').ToUniversalTime().ToString('o')) -t '\.0+([\+\-]\d+[:\d]*|Z)$' -o '\1' -aPA"`)
  .set('to-full-path', String.raw`msr -PAC -W -l -p $*`)
  .set('to-unix-path', String.raw`msr -z %1 -x \ -o / -PAC`)
  .set('to-2s-path', String.raw`msr -z %1 -x \ -o \\ -PAC`)
  .set('wcopy', String.raw`PowerShell -Command "
          [System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null;
          $filePaths = New-Object System.Collections.Specialized.StringCollection; '$1' -split '\s*,\s*'
          | ForEach-Object { [void] $filePaths.Add($(Resolve-Path $_).Path); };
          Write-Host Copied-$($filePaths.Count)-files-to-Clipboard: $filePaths;
          [System.Windows.Forms.Clipboard]::SetFileDropList($filePaths);"`)
  .set('wpaste', String.raw`PowerShell -Command "
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
  .set('win11-group-taskbar', String.raw`PowerShell 2>nul -Command "
          Write-Host Must-run-as-Admin-for-this-Workaround-of-Grouping-Taskbar-on-Windows11 -ForegroundColor Cyan;
          Set-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Shell\Update\Packages' -Name 'UndockingDisabled' -Value '00000000';
          Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Search' -Name 'SearchBoxTaskbarMode' -Value '00000001';
          Set-ItemProperty -Path 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer' -Name 'NoTaskGrouping' -Value '00000000';
          taskkill /f /im explorer.exe;
          CMD /Q /C START /REALTIME explorer.exe;"`)
  .set('win11-ungroup-taskbar', String.raw`PowerShell 2>nul -Command "
          Write-Host Must-run-as-Admin-for-this-Workaround-of-UnGrouping-Taskbar-on-Windows11 -ForegroundColor Cyan;
          Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope LocalMachine -Force;
          New-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Shell\Update\Packages' -Name 'UndockingDisabled' -PropertyType DWord -Value '00000001';
          Set-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Shell\Update\Packages' -Name 'UndockingDisabled' -Value '00000001';
          New-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Search' -Name 'SearchBoxTaskbarMode' -PropertyType DWord -Value '00000000';
          Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Search' -Name 'SearchBoxTaskbarMode' -Value '00000000';
          New-ItemProperty -Path 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer' -Name 'NoTaskGrouping' -PropertyType DWord -Value '00000001';
          Set-ItemProperty -Path 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer' -Name 'NoTaskGrouping' -Value '00000001';
          taskkill /f /im explorer.exe;
          CMD /Q /C START /REALTIME explorer.exe;"`)
  .set('pwsh', String.raw`PowerShell $*`)
  .set('is-admin', String.raw`PowerShell -Command "
          $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent());
          $principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)"`)
  .set('az-token-clip', String.raw`PowerShell -Command "Set-Clipboard($(az account get-access-token | ConvertFrom-Json).accessToken.ToString().TrimEnd())"`)
  .set('az-token-env', String.raw`for /f "tokens=*" %a in ('PowerShell -Command "
          az account get-access-token | ConvertFrom-Json | ForEach-Object {
             Write-Output $_.accessToken
          }"') do set "AZURE_ACCESS_TOKEN=%a"`)
  .set('mingw-mock', String.raw`set "MSR_UNIX_SLASH=1" && echo Now will output forward slash '/' for result paths in this CMD terminal.`)
  .set('mingw-unMock', String.raw`set "MSR_UNIX_SLASH=" && echo Now will output backslash '\' for result paths in this CMD terminal.`)
  .set('clear-msr-env', String.raw`for /f "tokens=*" %a in ('set ^| msr -t "^(MSR_\w+)=.*" -o "\1" -PAC') do
         @msr -z "%a" -t "(.+)" -o "echo Cleared \1=%\1% | msr -aPA -t MSR_\\w+ -e =.*" -XA || @set "%a="`)
  .set('trust-exe', String.raw`PowerShell -Command "Write-Host 'Please run as Admin to add process exclusion,
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
  .set('restart-net', String.raw`echo PowerShell -Command "Get-NetAdapter | Restart-NetAdapter -Confirm:$false" | msr -XM`)
  ;

if (IsWindows) {
  const [hasPwsh, path] = isToolExistsInPath('pwsh.exe', TerminalType.CMD);
  if (hasPwsh) {
    WindowsAliasMap.delete('pwsh');
    outputInfoQuietByTime(`Remove alias 'pwsh' on Windows since found pwsh.exe at ${path}`);
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

  ['to-alias-body'].forEach(name => {
    let body = WindowsAliasMap.get(name) || '';
    body = body.replace(/^pwsh/, 'PowerShell');
    WindowsAliasMap.set(name, body);
  });
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

  // get common alias map from config/settings:
  readConfigCommonAlias(cmdAliasMap, terminalType, writeToEachFile);
  readConfigCommonAlias(cmdAliasMap, terminalType, writeToEachFile, isWindowsTerminal ? 'cmd' : 'bash');
  return cmdAliasMap;
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
  const powerShellCmdText = getPowerShellName(terminalType) + ' -Command "' + cmdBody + tailArgs + '"';
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
