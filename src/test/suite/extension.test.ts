import { before } from 'mocha';
// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { checkConfigKeysInDoc, readAllKeys } from './configAndDocTest';
import { testCmdTerminalWithBackSlash, testCmdTerminalWithForwardSlash, testLinuxTerminal, testNotSkipDotPaths, testOmitExemptions } from './gitIgnoreTest';


suite('Test-1: Configuration and doc test suite', () => {
    before(() => {
        vscode.window.showInformationMessage('Start testing configuration keys + keys in readme doc.');
    });

    test('Configuration keys call be all successfully retrieved', () => {
        readAllKeys(true);
    });

    test('Keys referenced in readme doc must be defined in configuration.', () => {
        checkConfigKeysInDoc();
    });
});

suite('Test-2: Parsing .gitignore test', () => {
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
