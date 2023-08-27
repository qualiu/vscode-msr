import * as vscode from 'vscode';
import { getDefaultRootFolderByActiveFile } from './utils';
import path = require('path');

export function getConfigValueOfActiveProject(configTailKey: string, allowEmpty = false, addDefault: boolean = true): string {
  const rootFolder = getDefaultRootFolderByActiveFile();
  const rootFolderName = path.basename(rootFolder);
  return getConfigValueOfProject(rootFolderName, configTailKey, allowEmpty, addDefault);
}

export function getConfigValueOfProject(rootFolderName: string, configTailKey: string, allowEmpty = false, addDefault: boolean = true): string {
  const prefixSet = GetConfigPriorityPrefixes(rootFolderName, 'default', '', addDefault);
  return getConfigValueByPriorityList(prefixSet, configTailKey, allowEmpty);
}

export function getConfigValueByProjectAndExtension(rootFolderName: string, extension: string, mappedExt: string, configTailKey: string, allowEmpty = false, addDefault: boolean = true): string {
  const prefixSet = GetConfigPriorityPrefixes(rootFolderName, extension, mappedExt, addDefault);
  return getConfigValueByPriorityList(prefixSet, configTailKey, allowEmpty);
}

export function GetConfigPriorityPrefixes(rootFolderName: string, extension: string, mappedExt: string, addDefault: boolean = true): string[] {
  let prefixSet = new Set<string>([
    (rootFolderName + '.' + extension).replace(/\.$/, ''),
    (rootFolderName + '.' + mappedExt).replace(/\.$/, ''),
    rootFolderName,
    extension,
    mappedExt,
    '',
    'default',
  ]);

  if (!rootFolderName || rootFolderName === '') {
    prefixSet.delete('');
  }

  if (!addDefault) {
    prefixSet.delete('default');
    prefixSet.delete('');
  }

  return Array.from(prefixSet).filter(a => !a.startsWith('.'));
}

export function getConfigValueByAllParts(rootFolderName: string, extension: string, mappedExt: string, subKeyName: string, configTailKey: string, allowEmpty = false): string {
  let prefixSet = new Set<string>([
    rootFolderName + '.' + extension + '.' + subKeyName,
    rootFolderName + '.' + mappedExt + '.' + subKeyName,
    rootFolderName + '.' + extension,
    rootFolderName + '.' + mappedExt,
    rootFolderName + '.' + subKeyName,
    rootFolderName,
    extension + '.' + subKeyName,
    mappedExt + '.' + subKeyName,
    extension,
    mappedExt,
    subKeyName,
    '',
    'default',
  ]);

  if (!rootFolderName || rootFolderName === '') {
    prefixSet.delete('');
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
