import { before } from 'mocha';
// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { checkConfigKeysInDoc, checkDuplicateDescription, validateRegexPatterns } from './configAndDocTest';
import { testForLoopCmdAlias, testLinuxGeneralCmdAlias, testLinuxGeneralCmdAliasScript, testWindowsGeneralCmdAlias, testWindowsGeneralCmdAliasScript } from './cookCmdAliasTest';
import { testCmdTerminalWithBackSlash, testCmdTerminalWithForwardSlash, testLinuxTerminal, testNotSkipDotPaths, testOmitExemptions } from './gitIgnoreTest';
import { testEscapeRegex, testEscapeRegexForFindingCommands, testSpecialCaseReplacing } from './utilsTest';

suite('Test-1: Basic utils test', () => {
    before(() => {
        vscode.window.showInformationMessage('Begin of testing basic utils.');
    });
    test('Test escaping Regex.', testEscapeRegex);
    test('Test escaping Regex for finding commands in terminal.', testEscapeRegexForFindingCommands);
    test('Test special cases replacing.', testSpecialCaseReplacing);
});

suite('Test-2: Configuration and doc test suite', () => {
    before(() => {
        vscode.window.showInformationMessage('Start testing configuration keys + keys in readme doc.');
    });

    test('Configuration keys can be read and Regex patterns are correct.', validateRegexPatterns);

    test('Keys referenced in readme doc must be defined in configuration.', checkConfigKeysInDoc);

    test('Check duplicate descriptions in config file.', checkDuplicateDescription);
});

suite('Test-3: Parsing .gitignore test', () => {
    before(() => {
        vscode.window.showInformationMessage('Will start parsing .gitignore test for terminals: CMD + MinGW + Cygwin + WSL + Bash.');
    });

    test('Parsing .gitignore with relative path for Linux terminal or Windows WSL/Cygwin/MinGW terminal.', () => {
        testLinuxTerminal();
    });

    test('Parsing .gitignore with relative path for Windows CMD terminal.', () => {
        testCmdTerminalWithBackSlash();
    });

    test('Parsing .gitignore omit exemptions.', () => {
        testOmitExemptions();
    });

    test('Parsing .gitignore not skip dot/dollar paths.', () => {
        testNotSkipDotPaths();
    });

    test('Parsing .gitignore with relative path + forwarding slash for Windows CMD terminal.', () => {
        testCmdTerminalWithForwardSlash();
    });
});

suite('Test-4: Cook each doskey/alias to a batch script file for Windows doskey', () => {
    test('Test Windows doskey/alias of one file.', testWindowsGeneralCmdAlias);
    test('Test Windows doskey/alias of multiple scripts.', testWindowsGeneralCmdAliasScript);
    test('Test Linux alias of multiple scripts.', testLinuxGeneralCmdAlias);
    test('Test Linux alias of multiple scripts.', testLinuxGeneralCmdAliasScript);
    test('Test use "%%x" for looping variable "%x" when cooking doskey/alias to files on Windows.', testForLoopCmdAlias);
});
