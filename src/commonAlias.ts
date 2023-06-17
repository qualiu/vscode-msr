import { TerminalType } from "./enums";
import { enableColorAndHideCommandLine } from "./outputUtils";
import { isWindowsTerminalOnWindows } from "./terminalUtils";
import { getPowerShellName, isNullOrEmpty, replaceSearchTextHolder, replaceTextByRegex } from "./utils";

export function replaceArgForLinuxCmdAlias(body: string): string {
  // function or simple alias
  const functionBody = body.replace(/^\s*\S+=['"]\s*function\s+[^\r\n]+[\r\n]+\s*(.+?)\}\s*;\s*\S+\s*['"]\s*$/s, '$1');
  if (functionBody !== body) {
    return functionBody.trim();
  }

  const aliasBody = body.replace(/^.*?=['"](.+)['"]\s*$/, '$1');
  return aliasBody.trim();
}

export function replaceArgForWindowsCmdAlias(body: string, forScriptFile: boolean): string {
  body = replaceTextByRegex(body, /([\"'])\$1/g, '$1%~1');
  body = replaceTextByRegex(body, /\$(\d+)/g, '%$1');
  body = replaceTextByRegex(body, /\$\*/g, '%*').trim();
  if (forScriptFile) {
    body = replaceForLoopVariableOnWindows(body);
  }
  return body;
}

const LinuxAliasMap: Map<string, string> = new Map<string, string>()
  .set('vim-to-row', String.raw`msr -z "$1" -t "^(.+?):(\d+)(:.*)?$" -o "vim +\2 +\"set number\" \"\1\"" -XM`)
  .set('git-add-safe-dir', String.raw`repoRootDir=$(git rev-parse --show-toplevel); git config --global --get-all safe.directory
        | msr -t "^$repoRootDir/?$" -M && msr -XMI -z "git config --global --add safe.directory $repoRootDir";
      msr -p $repoRootDir/.gitmodules -t "^\s*path\s*=\s*(\S+)" -o "$repoRootDir/\1" -PAC
        | nin ~/.gitconfig "^(\S+)" "^\s*directory\s*=\s*(\S+)" -PAC
        | msr -t "(.+)" -o "git config --global --add safe.directory \1" -XMI;
      msr -XMI -z "git config --global --get-all safe.directory | msr -x $repoRootDir -P as final check"`)
  ;

const CheckUseFunctionRegex = /\$\d\b| \$\*/;
const CheckExistingArgsRegex = /\$\*|\$\d+/;
const TrimMultilineRegex = /[\r\n]+\s*/mg;
const TrimPowerShellCmdWhiteRegex = /(PowerShell)( 2>nul)? (-Command ")\s+/g;
const TrimForLoopWhite = /(%[a-zA-Z]\s+in\s+\(')\s+/g;
function trimAliasBody(value: string): string {
  return value.replace(TrimMultilineRegex, ' ')
    .replace(TrimPowerShellCmdWhiteRegex, '$1$2 $3')
    .replace(TrimForLoopWhite, '$1');
}

const CommonAliasMap: Map<string, string> = new Map<string, string>()
  .set('gpc', String.raw`git branch | msr -t "^\s*\*\s*(\S+).*" -o "git pull origin \1 $*" -XM`)
  .set('gph', String.raw`git branch | msr -t "^\s*\*\s*(\S+).*" -o "git push origin \1 $*" -XM`)
  .set('gpc-sm', String.raw`git rev-parse --abbrev-ref HEAD | msr -t "(.+)" -o "git pull origin \1 --no-recurse-submodules" -XM && msr -z "git submodule sync && git submodule update --init" -t "&&" -o "\n" -PAC | msr -XM -V ne0`)
  .set('gpc-sm-reset', String.raw`git rev-parse --abbrev-ref HEAD | msr -t "(.+)" -o "git pull origin \1 --no-recurse-submodules" -XM
          && msr -z "git submodule sync && git submodule update --init && git submodule update -f" -t "&&" -o "\n" -PAC | msr -XM -V ne0
          & git status`)
  .set('gca', String.raw`git commit --amend --no-edit $*`)
  .set('gfc', String.raw`git rev-parse --abbrev-ref HEAD | msr -t "(.+)" -o "git fetch origin \1" -XM`)
  .set('gdc', String.raw`git rev-parse --abbrev-ref HEAD | msr -t "(.+)" -o "git difftool $* origin/\1" -XM`)
  .set('gdf', String.raw`git diff --name-only $1 | msr -t "(.+)" -o "git difftool $* \1" -XM`)
  .set('gsh', String.raw`git rev-parse --abbrev-ref HEAD | msr -t "(.+)" -o "git reset --hard origin/\1" -XM`)
  .set('gsh-sm', String.raw`git rev-parse --abbrev-ref HEAD | msr -t "(.+)" -o "git reset --hard origin/\1" -XM && msr -z "git submodule sync --init && git submodule update -f" -t "&&" -o "\n" -PAC | msr -XM -V ne0 & git status`)
  .set('gst', String.raw`git status $*`)
  .set('git-gc', String.raw`git reflog expire --all --expire=now && git gc --prune=now --aggressive`)
  .set('git-clean', String.raw`msr -z "git clean -xffd && git submodule foreach --recursive git clean -xffd" -t "&&" -o "\n" -PAC | msr -XM`)
  .set('git-sm-prune', String.raw`msr -XM -z "git prune" && msr -XMz "git submodule foreach git prune"`)
  .set('git-sm-init', String.raw`msr -XMz "git submodule sync" && echo git submodule update --init $* | msr -XM & git status`)
  .set('git-sm-reset', String.raw`msr -XMz "git submodule sync" && msr -XMz "git submodule init" && echo git submodule update -f $* | msr -XM & git status`)
  .set('git-sm-restore', String.raw`echo git restore . --recurse-submodules $* | msr -XM & git status`)  // replace '&' to ';' for Linux
  .set('git-sm-reinit', String.raw`msr -XM -z "git submodule deinit -f ." && msr -XM -z "git submodule update --init" & git status`)
  .set('git-sm-update-remote', String.raw`msr -XMz "git submodule sync" && echo git submodule update --remote $* | msr -XM & git status`)
  .set('git-cherry-pick-branch-new-old-commits', String.raw`git log $1 | msr -b "^commit $2" -q "^commit $3" -t "^commit (\w+)" -o "\1" -M -C | msr -s "^:(\d+):" -n --dsc -t "^:\d+:\s+(\w+)" -o "git cherry-pick \1" $4 $5 $6 $7 $8 $9`)
  .set('git-sm-check', String.raw`git status | msr -it "^\s*modified:\s+(\S+)\s*\(.*?$" -o "\1" -PAC
          | msr -x / -o \ -aPAC | msr -t "(.+)" -o "if exist \1\* pushd \1 && git status --untracked-files=all --short && git diff --name-only" -XM $*`)
  .set('git-sm-delete', String.raw`git status | msr -it "^\s*modified:\s+(\S+)\s*\(untracked content\)\s*$" -o "\1" -PAC
          | msr -x / -o \ -aPAC | msr -t "(.+)" -o "if exist \1\* pushd \1
              && git status --untracked-files=all --short
              && git diff --name-only
              && git status --untracked-files=all --short
            | msr -t \"^\\W+\\s+(.+)\\s*$\" -o \"git clean -dfx \\1\" -XM" -XM`)
  .set('sfs', String.raw`msr -l --sz --wt -p $*`)
  .set('sft', String.raw`msr -l --wt --sz -p $*`)
  ;

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

function getReloadEnvCmd(forScriptFile: boolean, name: string = 'reload-env'): string {
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
    $envNameSet = New-Object System.Collections.Generic.HashSet[String]([StringComparer]::OrdinalIgnoreCase);
    $nameValueMap = New-Object 'System.Collections.Generic.Dictionary[string,string]'([StringComparer]::OrdinalIgnoreCase);
    foreach ($name in $sysEnvs.Keys) { $nameValueMap[$name] = $sysEnvs[$name]; }
    foreach ($name in $userEnvs.Keys) { $nameValueMap[$name] = $userEnvs[$name]; }
    foreach ($name in $processEnvs.Keys) { $nameValueMap[$name] = $processEnvs[$name]; }
    $nameValueMap['PATH'] = $pathValueSet -Join ';';
    foreach ($name in $nameValueMap.Keys) {
      'SET \"' + $name + '${escapeCmdEqual}' + $nameValueMap[$name] + '\"'
    }"') do @%a`;
  const body = trimAliasBody(cmdAlias);
  return forScriptFile ? replaceArgForWindowsCmdAlias(body, forScriptFile) : name + '=' + body;
}

function getResetEnvCmd(forScriptFile: boolean, name: string = 'reset-env'): string {
  const escapeCmdEqual = '^=';
  const knownEvnNames = "'" + ['ALLUSERSPROFILE', 'APPDATA', 'ChocolateyInstall', 'CommonProgramFiles', 'CommonProgramFiles(x86)', 'CommonProgramW6432'
    , 'COMPUTERNAME', 'ComSpec', 'DriverData', 'HOMEDRIVE', 'HOMEPATH', 'LOCALAPPDATA', 'LOGONSERVER', 'NugetMachineInstallRoot', 'NUMBER_OF_PROCESSORS'
    , 'OneDrive', 'OS', 'PACKAGE_CACHE_DIRECTORY', 'Path', 'PATHEXT', 'PROCESSOR_ARCHITECTURE', 'PROCESSOR_IDENTIFIER', 'PROCESSOR_LEVEL'
    , 'PROCESSOR_REVISION', 'ProgramData', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432', 'PROMPT', 'PSModulePath', 'PUBLIC', 'SystemDrive'
    , 'SystemRoot', 'TEMP', 'TMP', 'UATDATA', 'USERDNSDOMAIN', 'USERDOMAIN', 'USERDOMAIN_ROAMINGPROFILE', 'USERNAME', 'USERPROFILE', 'windir'
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
    $envNameSet = New-Object System.Collections.Generic.HashSet[String]([StringComparer]::OrdinalIgnoreCase);
    $nameValueMap = New-Object 'System.Collections.Generic.Dictionary[string,string]'([StringComparer]::OrdinalIgnoreCase);
    foreach ($name in $sysEnvs.Keys) {
      $nameValueMap[$name] = $sysEnvs[$name];
    }
    foreach ($name in $userEnvs.Keys) {
      $nameValueMap[$name] = $userEnvs[$name];
    }
    $nameValueMap['PATH'] = $pathValueSet -Join ';';
    $KnownEnvNames = @(${knownEvnNames});
    foreach ($name in $processEnvs.Keys) {
      if (-not $nameValueMap.ContainsKey($name) -and -not $KnownEnvNames.Contains($name)) {
          'SET \"' + $name + '${escapeCmdEqual}\"'
      }
    }
    foreach ($name in $nameValueMap.Keys) {
      'SET \"' + $name + '${escapeCmdEqual}' + $nameValueMap[$name] + '\"'
    }
    "') do @%a`;
  const body = trimAliasBody(cmdAlias);
  return forScriptFile ? replaceArgForWindowsCmdAlias(body, forScriptFile) : name + '=' + body;
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
  return trimAliasBody(cmdAlias);
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
  return trimAliasBody(cmdAlias);
}

function getAliasBody(terminalType: TerminalType, name: string, body: string, writeToEachFile: boolean): string {
  body = trimAliasBody(body);
  if (!isWindowsTerminalOnWindows(terminalType)) {
    body = body.replace(/ & /g, '; ');
  }

  const useFunction = CheckUseFunctionRegex.test(body);
  const addTailArgs = !CheckExistingArgsRegex.test(body);
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
  .set('docker-send', String.raw`for /f "tokens=*" %a in ('docker container ls ^| msr -it "^(\w+)\s+\S*($1).*" -o "\1" -PAC') do echo docker cp $2 %a:$3 | msr -M $4 $5 $6 $7 $8 $9`)
  .set('docker-start', String.raw`for /f "tokens=*" %a in ('docker container ls -a ^| msr -it "^(\w+)\s+\S*($1).*" -o "\1" -PAC') do msr -XM -z "docker start %a"`)
  .set('docker-stop', String.raw`for /f "tokens=*" %a in ('docker container ls -a ^| msr -it "^(\w+)\s+\S*($1).*" -o "\1" -PAC') do msr -XM -z "docker stop %a"`)
  .set('docker-stop-all', String.raw`docker ps | msr --nt CONTAINER -t "^(\w+).*" -o "docker stop \1" -X`)
  .set('grant-perm', String.raw`echo icacls $1 /grant %USERNAME%:F /T /Q | msr -XM`)
  .set('open-vsc', String.raw`code "%APPDATA%\Code\User\settings.json"`)
  .set('to-vscode-arg-lines', String.raw`PowerShell -Command "Set-Clipboard $(Get-Clipboard | msr -t '\s+' -o '\n' -aPAC | msr -t '(.+)' -o '\t\t\#\1\#,' -aPIC | msr -x '#' -o '\\\"' -PAC).Replace('\"\"', '\"');"`)
  .set('to-vscode-arg-lines-2-slashes', String.raw`PowerShell -Command "Set-Clipboard $(Get-Clipboard | msr -t '\s+' -o '\n' -aPAC | msr -t '(.+)' -o '\t\t\#\1\#,' -aPIC | msr -x \ -o \\ -aPAC | msr -x '#' -o '\\\"' -aPAC).Replace('\"\"', '\"');"`)
  .set('to-one-json-line', String.raw`PowerShell -Command "$requestBody = $(Get-Clipboard).Replace('\"', '\\\"') | msr -S -t '[\r\n]\s*' -o ' ' -PAC; Set-Clipboard('\"' + $requestBody.Trim() + '\"'); Get-Clipboard"`)
  .set('to-one-json-line-from-file', String.raw`PowerShell -Command "$requestBody = $(Get-Content '$1').Replace('\"', '\\\"') | msr -S -t '[\r\n]\s*(\S+)' -o ' \1' -PAC; Set-Clipboard('\"' + $requestBody.Trim() + '\"'); Get-Clipboard"`)
  .set('ts-to-minutes', String.raw`PowerShell "[Math]::Round([TimeSpan]::Parse('$1').TotalMinutes)"`)
  .set('to-local-time', String.raw`PowerShell "msr -z $([DateTime]::Parse([regex]::Replace('$*'.TrimEnd('Z') + 'Z', '(?<=[+-]\d{2}:?\d{2})Z$', '')).ToString('o')) -t '\.0+([\+\-]\d+[:\d]*|Z)$' -o '\1' -aPA"`) // PowerShell "[DateTime]::Parse('$1').ToLocalTime()"
  .set('to-utc-time', String.raw`PowerShell "msr -z $([DateTime]::Parse('$*').ToUniversalTime().ToString('o')) -t '\.0+([\+\-]\d+[:\d]*|Z)$' -o '\1' -aPA"`)
  .set('to-full-path', String.raw`msr -PAC -W -l -p $*`)
  .set('to-unix-path', String.raw`msr -z %1 -x \ -o / -PAC`)
  .set('to-2s-path', String.raw`msr -z %1 -x \ -o \\ -PAC`)
  .set('wcopy', String.raw`PowerShell -Command "
          [System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null;
          $filePaths = New-Object System.Collections.Specialized.StringCollection; '$1' -split '\s*,\s*' | ForEach-Object { [void] $filePaths.Add($(Resolve-Path $_).Path); };
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
          Write-Host Must-run-as-Admin -ForegroundColor Cyan;
          Set-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Shell\Update\Packages' -Name 'UndockingDisabled' -Value '00000000';
          Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Search' -Name 'SearchboxTaskbarMode' -Value '00000001';
          Set-ItemProperty -Path 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer' -Name 'NoTaskGrouping' -Value '00000000';
          taskkill /f /im explorer.exe;
          CMD /Q /C START /REALTIME explorer.exe;"`)
  .set('win11-ungroup-taskbar', String.raw`PowerShell 2>nul -Command "
          Write-Host Must-run-as-Admin -ForegroundColor Cyan;
          Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope LocalMachine -Force;
          New-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Shell\Update\Packages' -Name 'UndockingDisabled' -PropertyType DWord -Value '00000001';
          Set-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Shell\Update\Packages' -Name 'UndockingDisabled' -Value '00000001';
          New-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Search' -Name 'SearchboxTaskbarMode' -PropertyType DWord -Value '00000000';
          Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Search' -Name 'SearchboxTaskbarMode' -Value '00000000';
          New-ItemProperty -Path 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer' -Name 'NoTaskGrouping' -PropertyType DWord -Value '00000001';
          Set-ItemProperty -Path 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer' -Name 'NoTaskGrouping' -Value '00000001';
          taskkill /f /im explorer.exe;
          CMD /Q /C START /REALTIME explorer.exe;"`)
  .set('pwsh', String.raw`PowerShell $*`)
  .set('is-admin', String.raw`PowerShell -Command "$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent()); $principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)"`)
  .set('az-token-clip', String.raw`PowerShell -Command "Set-Clipboard($(az account get-access-token | ConvertFrom-Json).accessToken.ToString().TrimEnd())"`)
  .set('az-token-env', String.raw`for /f "tokens=*" %a in ('PowerShell "az account get-access-token | ConvertFrom-Json | ForEach-Object { Write-Output $_.accessToken }"') do set "AZURE_ACCESS_TOKEN=%a"`)
  ;

export function getCommonAliasMap(terminalType: TerminalType, writeToEachFile: boolean): Map<string, string> {
  let cmdAliasMap = new Map<string, string>();
  if (isWindowsTerminalOnWindows(terminalType)) {
    CommonAliasMap.forEach((value, key) => cmdAliasMap.set(key, getAliasBody(terminalType, key, value, writeToEachFile)));
    WindowsAliasMap.forEach((value, key) => cmdAliasMap.set(key, getAliasBody(terminalType, key, value, writeToEachFile)));
    cmdAliasMap.set('reload-env', getReloadEnvCmd(writeToEachFile))
      .set('reset-env', getResetEnvCmd(writeToEachFile));
  } else {
    CommonAliasMap.forEach((value, key) => cmdAliasMap.set(key, getAliasBody(terminalType, key, value, writeToEachFile)));
    LinuxAliasMap.forEach((value, key) => cmdAliasMap.set(key, getAliasBody(terminalType, key, value, writeToEachFile)));
  }
  return cmdAliasMap;
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
    // Generally should not add tail args if found arg-holders by CheckExistingArgsRegex, but special case for find-xxx-def
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
      tailArgs = isWindowsTerminal ? ' $*' : ' "$@"';
    }
  }

  return getCommandTextByNameAndBody(cmdName, cmdBody, tailArgs, useFunction, terminalType, writeToEachFile, isPowerShellScript);
}


function replaceForLoopVariableTokens(cmd: string): string {
  // Example: for /f "tokens=*" %a in ('xxx') do xxx %a
  // Should replace %a to %%a when writing each alias/doskey to a file.
  const GetForLoopRegex = /\bfor\s+\/f\s+("[^"]*?tokens=\s*(?<Token>\*|\d+[, \d]*)[^"]*?"\s+)?%(?<StartVariable>[a-z])\s+in\s+\(.*?\)\s*do\s+/i;
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

export function replaceForLoopVariableOnWindows(cmd: string): string {
  cmd = replaceForLoopVariableTokens(cmd);

  // Replace %~dpa %~nxa to %%~dpa %%~nxa
  return cmd.replace(/(%~(dp|nx)[a-z])/g, '%$1');
  // return cmd.replace(/((?<!%)%~(dp|nx)[a-z])/g, '%$1');
}

function getCommandTextByNameAndBody(cmdName: string, cmdBody: string, tailArgs: string, useFunction: boolean, terminalType: TerminalType, writeToEachFile: boolean, isPowerShellScript: boolean = false) {
  const powerShellCmdText = getPowerShellName(terminalType) + ' -Command "' + cmdBody + tailArgs + '"';
  if (isWindowsTerminalOnWindows(terminalType)) {
    if (writeToEachFile) {
      return isPowerShellScript
        ? powerShellCmdText.replace(/\$(\d+)\b/g, '%$1')
        : replaceArgForWindowsCmdAlias(cmdBody + tailArgs, writeToEachFile);
    }

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
      + '\n\t' + funBody
      + '\n' + '}; ' + functionName + "'";
  }

  if (writeToEachFile) {
    return funBody;
  }
  return 'alias ' + cmdName + "='" + funBody + "'";
}
