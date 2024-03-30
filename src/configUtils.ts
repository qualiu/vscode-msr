import { ExecSyncOptions } from 'child_process';
import * as vscode from 'vscode';
import { DefaultWorkspaceFolder, getDefaultRepoFolderByActiveFile, getProjectFolderKey } from './constants';
import { TerminalType } from './enums';
import { outputInfoQuietByTime } from './outputUtils';
import path = require('path');
import ChildProcess = require('child_process');

function isGitRecurseSubModuleSupported(): boolean {
  const execOption: ExecSyncOptions = { cwd: DefaultWorkspaceFolder };
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

const IsGitRecurseSubModuleSupported = isGitRecurseSubModuleSupported();

function shouldSearchGitSubModules(repoFolderName: string): boolean {
  return IsGitRecurseSubModuleSupported
    && getConfigValueOfProject(repoFolderName, 'searchGitSubModuleFolders') === 'true';
}

export function GitListFileRecursiveArg(repoFolderName: string): string {
  return shouldSearchGitSubModules(repoFolderName) ? '--recurse-submodules' : ' ';
}

export function GitListFileHead(repoFolderName: string): string {
  return `git ls-files ${GitListFileRecursiveArg(repoFolderName)}`.trimRight()
}

export function getConfigValueOfActiveProject(configTailKey: string, allowEmpty = false, addDefault: boolean = true): string {
  const repoFolder = getDefaultRepoFolderByActiveFile();
  const repoFolderName = path.basename(repoFolder);
  return getConfigValueOfProject(repoFolderName, configTailKey, allowEmpty, addDefault);
}

export function getConfigValueOfProject(repoFolderName: string, configTailKey: string, allowEmpty = false, addDefault: boolean = true): string {
  const prefixSet = GetConfigPriorityPrefixes(repoFolderName, 'default', '', addDefault);
  return getConfigValueByPriorityList(prefixSet, configTailKey, allowEmpty);
}

export function getConfigValueByProjectAndExtension(repoFolderName: string, extension: string, mappedExt: string, configTailKey: string, allowEmpty = false, addDefault: boolean = true): string {
  const prefixSet = GetConfigPriorityPrefixes(repoFolderName, extension, mappedExt, addDefault);
  return getConfigValueByPriorityList(prefixSet, configTailKey, allowEmpty);
}

export function GetConfigPriorityPrefixes(repoFolderName: string, extension: string, mappedExt: string, addDefault: boolean = true): string[] {
  repoFolderName = getProjectFolderKey(repoFolderName);
  let prefixSet = new Set<string>([
    (repoFolderName + '.' + extension).replace(/\.$/, ''),
    (repoFolderName + '.' + mappedExt).replace(/\.$/, ''),
    repoFolderName,
    extension,
    mappedExt,
    '',
    'default',
  ]);

  if (!repoFolderName || repoFolderName === '') {
    // prefixSet.delete('');
  }

  if (!addDefault) {
    prefixSet.delete('default');
    prefixSet.delete('');
  }

  return Array.from(prefixSet).filter(a => !a.startsWith('.'));
}

export function getConfigValueByAllParts(repoFolderName: string, extension: string, mappedExt: string, subKeyName: string, configTailKey: string, allowEmpty = false): string {
  repoFolderName = getProjectFolderKey(repoFolderName);
  let prefixSet = new Set<string>([
    repoFolderName + '.' + extension + '.' + subKeyName,
    repoFolderName + '.' + mappedExt + '.' + subKeyName,
    repoFolderName + '.' + extension,
    repoFolderName + '.' + mappedExt,
    repoFolderName + '.' + subKeyName,
    repoFolderName,
    extension + '.' + subKeyName,
    mappedExt + '.' + subKeyName,
    extension,
    mappedExt,
    subKeyName,
    '',
    'default',
  ]);

  if (!repoFolderName || repoFolderName === '') {
    // prefixSet.delete('');
  }
  const prefixList = Array.from(prefixSet).filter(a => !a.startsWith('.'));
  return getConfigValueByPriorityList(prefixList, configTailKey, allowEmpty);
}

export function getConfigValueByPriorityList(priorityPrefixList: string[], configNameTail: string, allowEmpty: boolean = true): string {
  const config = vscode.workspace.getConfiguration('msr');
  for (let k = 0; k < priorityPrefixList.length; k++) {
    const name = (priorityPrefixList[k].length > 0 ? priorityPrefixList[k] + '.' : priorityPrefixList[k]) + configNameTail;
    let valueObject = config.get(name);
    if (valueObject === undefined || valueObject === null || typeof (valueObject) === 'object') {
      continue;
    }

    const valueText = String(valueObject);
    if (valueText.length > 0 || allowEmpty) {
      return valueText;
    }
  }

  return '';
}

export function getPostInitCommands(terminalType: TerminalType, repoFolderName: string) {
  const terminalTypeName = TerminalType[terminalType].toString();
  const typeName = (terminalTypeName[0].toLowerCase() + terminalTypeName.substring(1))
    .replace(/CMD/i, 'cmd')
    .replace(/MinGW/i, 'mingw')
    .replace(/^(Linux|WSL)Bash/i, 'bash');
  const configTailKey = typeName + '.postInitTerminalCommandLine';
  return getConfigValueOfProject(repoFolderName, configTailKey, true);
}
