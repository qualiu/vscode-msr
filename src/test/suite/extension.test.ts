import * as assert from 'assert';
import { before } from 'mocha';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as path from 'path';
// import * as myExtension from '../extension';
import os = require('os');
import fs = require('fs');
import http = require('https');
import { execSync } from 'child_process';
import { IsWindows } from '../../checkTool';
import { getConfig } from '../../dynamicConfig';
import { match } from 'minimatch';
import { outputLogInfo } from '../../outputUtils';
import { stringify } from 'querystring';

suite('Extension Test Suite', () => {
    const GitRootPath = path.resolve(__dirname, '../../../');
    const ConfigFilePath = path.join(GitRootPath, 'package.json');
    const DocFilePath = path.join(GitRootPath, 'README.md');
    const KeyRegex = /["`](msr[\.\w]+)/g;
    const ExemptFindAllKeyRegex = /^(msr\.)?find\w+$/;
    const ExemptNoValueKeyRegex = /extra|skip.definition|^find\w+$/i;
    const NonStringValueRegex = /^(\d+|bool\w*$)/;

    before(() => {
        vscode.window.showInformationMessage('Start all tests.');
    });

    test('Configuration keys call be all successfully retrieved', () => {
        readAllKeys(true);
    });

    test('Keys referenced in readme doc must be defined in configuration.', () => {
        const allKeys = readAllKeys();

        assert.ok(fs.existsSync(DocFilePath), 'Should exist doc file: ' + DocFilePath);
        const lines = fs.readFileSync(DocFilePath).toString();

        let keyCount = 0;
        let m;
        do {
            m = KeyRegex.exec(lines);
            if (m) {
                keyCount++;
                const fullKey = m[1];
                console.log('Found doc key = ' + fullKey + ' in ' + DocFilePath);
                assert.ok(allKeys.has(fullKey), 'Not found in configuration file: Key = ' + fullKey + ' in ' + DocFilePath);
            }
        } while (m);

        console.log('Found ' + keyCount + ' in ' + DocFilePath);
        assert.ok(keyCount > 0, 'Just found ' + keyCount + ' keys in ' + DocFilePath);
    });

    function readAllKeys(printInfo: boolean = false): Set<string> {
        assert.ok(fs.existsSync(ConfigFilePath), 'Should exist config file: ' + ConfigFilePath);
        const lines = fs.readFileSync(ConfigFilePath).toString();

        let allKeys: string[] = [];
        let m;
        do {
            m = KeyRegex.exec(lines);
            if (m) {
                const fullKey = m[1];
                allKeys.push(fullKey);
                const key = fullKey.replace(/^msr\./, '');
                const value = getConfig().RootConfig.get(key);
                const valueText = !value || NonStringValueRegex.test(value as string || '') ? value : '"' + value + '"';
                if (printInfo) {
                    console.info('Key = ' + fullKey + ' , value = ' + valueText);
                }

                if (ExemptFindAllKeyRegex.test(key) === false) {
                    assert.notEqual(value, undefined, 'Value should not be undefined for key = ' + fullKey);
                }

                const textValue = String(value);
                if (ExemptNoValueKeyRegex.test(key) === false) {
                    assert.notEqual(0, textValue.length, 'Value should not be empty for key = ' + fullKey);
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
                if (!ExemptFindAllKeyRegex.test(a)) {
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
});
