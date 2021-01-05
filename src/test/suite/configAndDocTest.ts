import * as assert from 'assert';
import * as path from 'path';
import { getConfig } from '../../dynamicConfig';

import fs = require('fs');

const GitRootPath = path.resolve(__dirname, '../../../');
const ConfigFilePath = path.join(GitRootPath, 'package.json');
const DocFilePath = path.join(GitRootPath, 'README.md');
const KeyRegex = /["`](msr\.\w+[\.\w]*)/g;
const SkipKeysRegex = /^(msr|nin)\.(exe|cygwin|gcc48|xxx)|\.project\d+|default.extra\w*Groups|\.My|^msr.py.extra\w*|^msr.\w+(\.\w+)?.definition|msr.\w+.codeFiles|fileExtensionMap|\.default\.$|bat\w*\.skipFolders/i;
const ExemptDuplicateKeyRegex = /^(msr\.)?\w*(find|sort|make)\w+$|^msr.cookCmdAlias\w*|^msr.\w*GitIgnore\w*$/i;
const ExemptNoValueKeyRegex = /extra|skip.definition|extensionPattern|projectRootFolderNamePattern|cmdAlias\w*|^\w*(find|sort)\w+$/i;
const NonStringValueRegex = /^(\d+|bool\w*$)/;

export function readAllKeys(printInfo: boolean = false): Set<string> {
  assert.ok(fs.existsSync(ConfigFilePath), 'Should exist config file: ' + ConfigFilePath);
  const lines = fs.readFileSync(ConfigFilePath).toString();
  const rootConfig = getConfig().RootConfig;

  let allKeys: string[] = [];
  let m;
  do {
    m = KeyRegex.exec(lines);
    if (m) {
      const fullKey = m[1];
      allKeys.push(fullKey);
      const key = fullKey.replace(/^msr\./, '');
      const value = rootConfig.get(key);
      const valueText = !value || NonStringValueRegex.test(value as string || '') ? value : '"' + value + '"';
      if (printInfo) {
        console.info('Found config key = ' + fullKey + ' , value = ' + valueText);
      }

      if (ExemptDuplicateKeyRegex.test(key) === false && !key.endsWith('.')) {
        assert.notStrictEqual(value, undefined, 'Value should not be undefined for key = ' + fullKey);
      }

      const textValue = String(value);
      if (ExemptNoValueKeyRegex.test(key) === false) {
        assert.notStrictEqual(0, textValue.length, 'Value should not be empty for key = ' + fullKey);
        if (textValue.length > 0) {
          const paths = textValue.split(/\s*[,;]\s*/).map(a => a.trim());
          paths.forEach(a => {
            if (a.length > 1 && fs.existsSync(a)) {
              assert.fail('Should not store personal or test settings: Key = ' + fullKey + ' , local path value = ' + a + ' , fullValue = ' + textValue);
            }
          });
        }
      }
    }
  } while (m);

  let keySet = new Set<string>();
  allKeys.forEach(a => {
    if (keySet.has(a)) {
      if (!ExemptDuplicateKeyRegex.test(a)) {
        assert.fail('Duplicate key: ' + a + ' in ' + ConfigFilePath);
      }
    } else {
      keySet.add(a);
    }
  });

  if (printInfo) {
    console.log('Total key count = ' + allKeys.length + ' in ' + ConfigFilePath);
  }

  assert.ok(allKeys.length > 1, 'Error key count = ' + allKeys.length + ' in ' + ConfigFilePath);
  return keySet;
}

export function checkConfigKeysInDoc() {
  const allKeys = readAllKeys();

  assert.ok(fs.existsSync(DocFilePath), 'Should exist doc file: ' + DocFilePath);
  const lines = fs.readFileSync(DocFilePath).toString();
  let errorMessages = [];
  const rootConfig = getConfig().RootConfig;

  let keyCount = 0;
  let m;
  do {
    m = KeyRegex.exec(lines);
    if (m) {
      keyCount++;
      const fullKey = m[1];
      console.log('Found doc key = ' + fullKey + ' in ' + DocFilePath);
      if (!allKeys.has(fullKey) && !SkipKeysRegex.test(fullKey)) {
        const shortKey = fullKey.replace(/^msr\./, '');
        const configValue = rootConfig.get(shortKey);
        if (configValue === undefined) {
          errorMessages.push('Not found in configuration file: Key = ' + fullKey + ' in ' + DocFilePath);
        }
      }
    }
  } while (m);

  console.log('Found ' + keyCount + ' in ' + DocFilePath);
  assert.ok(keyCount > 0, 'Just found ' + keyCount + ' keys in ' + DocFilePath);
  assert.ok(errorMessages.length < 1, 'Caught ' + errorMessages.length + ' errors as below:\n' + errorMessages.join('\n'));
}
