import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getConfig } from '../../dynamicConfig';
import { isNullOrEmpty, nowText } from '../../utils';

const GitRootPath = path.resolve(__dirname, '../../../');
const ConfigFilePath = path.join(GitRootPath, 'package.json');
const DocFilePath = path.join(GitRootPath, 'README.md');
const KeyRegex = /["`](msr\.\w+[\.\w]*)/g;
const SkipKeysRegex = /^(msr|nin)\.(exe|cygwin|gcc48|xxx|tmp)|\.project\d+|default.extra\w*Groups|\.My|^msr.py.extra\w*|^msr.\w+(\.\w+)?.definition|msr.\w+.codeFiles|fileExtensionMap|\.default\.$|bat\w*\.skipFolders|preferSearchingSpeedOverPrecision/i;
const ExemptDuplicateKeyRegex = /^(msr\.)?\w*(find|sort|make)\w+$|^msr.cookCmdAlias\w*|^msr.\w*GitIgnore\w*$/i;
const ExemptNoValueKeyRegex = /extra|skip.definition|extensionPattern|projectRootFolderNamePattern|cmdAlias\w*|^\w*(find|sort)\w+$|^msr.fileExtensionMap.xxx/i;
const NonStringValueRegex = /^(\d+|bool\w*$)/;

const [AllConfigKeys, AllKeyToNameMap] = readAllKeysAndRegexPatterns();

function readAllKeysAndRegexPatterns(): [Set<string>, Map<string, string>] {
  assert.ok(fs.existsSync(ConfigFilePath), 'Should exist config file: ' + ConfigFilePath);
  const lines = fs.readFileSync(ConfigFilePath).toString();
  const rootConfig = getConfig().RootConfig;

  // Roughly get all possible Regex blocks + Compare and check
  // msr -p package.json -b "^\s*.msr.\w+" -Q "^^\s*\}" -t "^\s*.default.:.*?\\\\[sbwS]|^\s*.description.:.*?Regex" -aPI > %tmp%\all-possible-Regex-blocks.txt
  // npm run test > %tmp%\npm-test-block-name-Regex.txt
  // nin %tmp%\all-possible-Regex-blocks.txt %tmp%\npm-test-block-name-Regex.txt "(msr\.\w+[\.\w]+)" "Validated Regex of (\S+)"
  // nin %tmp%\all-possible-Regex-blocks.txt %tmp%\npm-test-block-name-Regex.txt "(msr\.\w+[\.\w]+)" "Validated Regex of (\S+)" -S -w

  // const matchRegexKeyRegex = /\.(definition|isFind\w+|is\w+Result|\w*reference|codeAndConfig\w*|skipFolders|allFiles)$/i;
  const matchRegexValueRegex = new RegExp(String.raw`\\[sbwS\$]` + String.raw`|^\^` + String.raw`|\)[\$\|]` + String.raw`|[\w\*\+]\?\|` + String.raw`|\[\\` + String.raw`|\S+\|\S+\|/`);

  let keyToRegexMap = new Map<string, string>();
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
      console.info('Found config key = ' + fullKey + ' , value = ' + valueText);

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

      if (!isNullOrEmpty(textValue) && matchRegexValueRegex.test(textValue)) {
        keyToRegexMap.set(key, textValue);
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

  console.log('Total key count = ' + allKeys.length + ' in ' + ConfigFilePath);
  assert.ok(allKeys.length > 1, 'Error key count = ' + allKeys.length + ' in ' + ConfigFilePath);
  console.info(os.EOL);
  return [keySet, keyToRegexMap];
}

export function validateRegexPatterns() {
  const getErrorRegex = /(?!<\\)\|\|/;
  let validatedRegexCount = 0;
  AllKeyToNameMap.forEach((pattern, key, _map) => {
    const keyName = 'msr.' + key;
    try {
      // tslint:disable-next-line: no-unused-expression
      new RegExp(pattern);
      validatedRegexCount++;
      console.info('Validated Regex of ' + keyName + ' = "' + pattern + '"');
    } catch (err) {
      assert.fail('Failed to validate Regex of ' + keyName + ' = "' + pattern + '" , error: ' + err);
    }

    const matched = pattern.match(getErrorRegex);
    if (matched && matched.index) {
      assert.fail('Probably wrong Regex of ' + key + ' = "' + pattern + '"  at "' + pattern.substring(matched.index) + '"');
    }
  });

  console.info(nowText() + 'Validated ' + String(validatedRegexCount) + ' Regex patterns in ' + ConfigFilePath);
  console.info(os.EOL);
}

export function checkConfigKeysInDoc() {
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
      if (!AllConfigKeys.has(fullKey) && !SkipKeysRegex.test(fullKey)) {
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

export function checkDuplicateDescription() {
  const allText = fs.readFileSync(ConfigFilePath).toString();
  const lines = allText.split('\n');
  const descriptionRegex = /^\s*"description"\s*:\s*(.+?)\s*,?\s*$/;
  let descriptionCountMap = new Map<string, number>();
  let total = 0;
  let row = 0;
  let duplicateLines: string[] = [];
  lines.forEach(a => {
    row += 1;
    const match = descriptionRegex.exec(a.trim());
    if (match) {
      const description = match[1];
      total += 1;
      let count = descriptionCountMap.get(description) || 0;
      descriptionCountMap.set(description, count + 1);
      if (count > 0) {
        const message = `Found duplicate description at ${ConfigFilePath}:${row} : ${description}`;
        console.error(`${message}${os.EOL}`);
        duplicateLines.push(message);
      }
    }
  });

  let duplicates: string[] = [];
  descriptionCountMap.forEach((count, description, _) => {
    if (count > 1) {
      const message = `Found ${count} times of duplicate description: ${description}`;
      duplicates.push(message);
      console.error(message);
    }
  });

  // nin package.json nul "(description.:.+)" -pdw -k2
  const errorHead = `Please solve ${duplicates} duplicate descriptions (total = ${total}) in file: ${ConfigFilePath}`;
  assert.strictEqual(duplicates.length, 0, `${errorHead}${os.EOL}${duplicates.join(os.EOL)}${os.EOL}${duplicateLines.join(os.EOL)}`);
}
