'use strict';

import * as vscode from 'vscode';
import { ParsedPath } from 'path';
import path = require('path');
import { getAllSingleWords } from './singleWordRegex';
import { outputError, outDebug } from './outputUtils';
import { getConfig, getOverrideOrDefaultConfig } from './dynamicConfig';
import { strict } from 'assert';

export enum FindType {
	Definition = 1,
	Reference = 2,
}

let RootConfig = getConfig().RootConfig || vscode.workspace.getConfiguration('msr');

const EmptyRegexp: RegExp = new RegExp('^\\.#x#'); // Workaround for empty RegExp.

export const FileExtensionToConfigExtMap = new Map<string, string>()
	.set('cxx', 'cpp')
	.set('hpp', 'cpp')
	.set('h', 'cpp')
	.set('c', 'cpp')
	.set('scala', 'java')
	.set('vue', 'ui')
	.set('js', 'ui')
	.set('ts', 'ui')
	.set('jsx', 'ui')
	.set('tsx', 'ui')
	;

const MappedExtToCodeFileNamePatternMap = new Map<string, string>()
	.set('java', RootConfig.get('java.codeFiles') as string)
	.set('ui', RootConfig.get('ui.codeFiles') as string)
	.set('cpp', RootConfig.get('cpp.codeFiles') as string)
	.set('default', '.?')
	;

export class SearchProperty {
	public findType: FindType;
	public currentWord: string;
	public currentText: string;
	public currentPosition: vscode.Position;
	public currentFile: ParsedPath;
	public mappedExt: string;

	public isClassPattern: string;
	public isMethodPattern: string;
	public isClass: boolean;
	public isMethod: boolean;
	public isClassOrMethodPattern: string;
	public isClassOrMethod: boolean;
	public isEnumOrMemberPattern: string;
	public isEnumOrMember: boolean;
	public isMemberPattern: string;
	public isMember: boolean;
	public isConstant: boolean;

	public currentWordRegex: RegExp;

	public isClassRegex: RegExp;
	public isMethodRegex: RegExp;
	public isClassOrMethodRegex: RegExp;
	public isEnumOrMemberRegex: RegExp;
	public isMemberRegex: RegExp;

	public nonConstRegex: RegExp;

	constructor(findType: FindType, currentWord: string, currentText: string, currentPosition: vscode.Position, currentFile: ParsedPath, mappedExt: string) {
		const MyConfig = getConfig();
		this.findType = findType;
		this.currentWord = currentWord;
		this.currentText = currentText;
		this.currentPosition = currentPosition;
		this.currentFile = currentFile;
		this.mappedExt = mappedExt;

		this.isClassPattern = getOverrideOrDefaultConfig(mappedExt, '.isClass', false).replace(MyConfig.SearchTextHolderReplaceRegex, currentWord);
		this.isMethodPattern = getOverrideOrDefaultConfig(mappedExt, '.isMethod', false).replace(MyConfig.SearchTextHolderReplaceRegex, currentWord);
		this.isClassOrMethodPattern = getOverrideOrDefaultConfig(mappedExt, '.isClassOrMethod', false).replace(MyConfig.SearchTextHolderReplaceRegex, currentWord);
		this.isMemberPattern = getOverrideOrDefaultConfig(mappedExt, '.isMember', false).replace(MyConfig.SearchTextHolderReplaceRegex, currentWord);
		this.isEnumOrMemberPattern = getOverrideOrDefaultConfig(mappedExt, '.isEnumOrMember', false).replace(MyConfig.SearchTextHolderReplaceRegex, currentWord);

		this.isClassRegex = this.isClassPattern.length < 1 ? EmptyRegexp : new RegExp(this.isClassPattern);
		this.isMethodRegex = this.isMethodPattern.length < 1 ? EmptyRegexp : new RegExp(this.isMethodPattern);
		this.isClassOrMethodRegex = this.isClassOrMethodPattern.length < 1 ? EmptyRegexp : new RegExp(this.isClassOrMethodPattern);
		this.isMemberRegex = this.isMemberPattern.length < 1 ? EmptyRegexp : new RegExp(this.isMemberPattern);
		this.isEnumOrMemberRegex = this.isEnumOrMemberPattern.length < 1 ? EmptyRegexp : new RegExp(this.isEnumOrMemberPattern);
		this.nonConstRegex = new RegExp('\\b' + currentWord + '\\b\\s*\\(');

		this.isClass = this.isClassRegex.test(currentText);
		this.isMethod = this.isMethodRegex.test(currentText);
		this.isClassOrMethod = this.isClassOrMethodRegex.test(currentText);
		this.isMember = this.isMemberRegex.test(currentText);
		this.isEnumOrMember = this.isEnumOrMemberRegex.test(currentText);
		this.isConstant = this.isConstantDefinition(currentWord, currentText);

		this.currentWordRegex = new RegExp('\\b' + currentWord + '\\b');

		outDebug('isConstant = ' + this.isConstant + ', mappedExt = ' + mappedExt);
		outDebug('isClass = ' + this.isClass + ', isClassPattern = "' + this.isClassPattern + '"');
		outDebug('isMethod = ' + this.isMethod + ', isMethodPattern = "' + this.isMethodPattern + '"');
		outDebug('isMember = ' + this.isMember + ', isMemberPattern = "' + this.isMemberPattern + '"');
		outDebug('isEnumOrMember = ' + this.isEnumOrMember + ', isEnumOrMemberPattern = "' + this.isEnumOrMemberPattern + '"');
		outDebug('isClassOrMethod = ' + this.isClassOrMethod + ', isClassOrMethodPattern = "' + this.isClassOrMethodPattern + '"');
	}

	public isConstantDefinition(word: string, lineText: string): boolean {
		const MyConfig = getConfig();
		return MyConfig.DefaultConstantsRegex.test(word) && !this.nonConstRegex.test(lineText);
	}

	public getFileNamePatternAndSearchOption(
		searchProperty: SearchProperty,
		extension: string,
		configKeyName: string,
		parsedFile: ParsedPath): [string, string] {
		const mappedExt = searchProperty.mappedExt;
		const MyConfig = getConfig();

		let searchPattern = getOverrideOrDefaultConfig(mappedExt, '.' + configKeyName, false);
		if (searchPattern.indexOf(MyConfig.SearchTextHolder) < 0) {
			outputError('Not found word-holder: "' + MyConfig.SearchTextHolder + '" in search option, please check configuration of "' + configKeyName + '": ' + searchPattern);
			return ['', ''];
		}

		const RootConfig = vscode.workspace.getConfiguration('msr');

		let filePattern = MappedExtToCodeFileNamePatternMap.get(mappedExt) || '\\.' + extension + '$';
		if (MyConfig.SearchAllFilesWhenFindingReferences && configKeyName === 'reference') {
			filePattern = RootConfig.get('default.allFiles') as string;
			const defaultFindRef = RootConfig.get('default.reference') as string;
			if (defaultFindRef.length > 1) {
				searchPattern = defaultFindRef;
			}
		} else if (MyConfig.SearchAllFilesWhenFindingDefinitions && configKeyName === 'definition') {
			const codeFilesKey = mappedExt === 'ui' ? 'default.codeFilesPlusUI' : 'default.codeFiles';
			filePattern = RootConfig.get(codeFilesKey) as string;
			const defaultFindDef = RootConfig.get('default.definition') as string;
			if (defaultFindDef.length > 1) {
				searchPattern = defaultFindDef;
			}
		}
		if (!MyConfig.SearchAllFilesWhenFindingDefinitions && !MyConfig.SearchAllFilesWhenFindingReferences) {
			if (MyConfig.ConfigAndDocFilesRegex.test(parsedFile.base)) {
				filePattern = configKeyName === 'definition'
					? RootConfig.get('default.codeFiles') as string
					: MyConfig.CodeAndConfigAndDocFilesRegex.source;
			}

			if (configKeyName === 'definition') {
				let specificPatterns = new Set<string>();
				if (searchProperty.isConstant) {
					specificPatterns.add(getOverrideOrDefaultConfig(mappedExt, '.constant.definition', false));
				} else if (searchProperty.isEnumOrMember) {
					specificPatterns.add(getOverrideOrDefaultConfig(mappedExt, '.enum.definition'));
					specificPatterns.add(getOverrideOrDefaultConfig(mappedExt, '.member.definition'));
				} else if (searchProperty.isMember) {
					specificPatterns.add(getOverrideOrDefaultConfig(mappedExt, '.member.definition'));
				} else if (searchProperty.isClass) { // || (!isEnumOrMember && !isMember && !isMethod && !isClassOrMethod)) {
					specificPatterns.add(getOverrideOrDefaultConfig(mappedExt, '.class.definition'));
				} else if (searchProperty.isMethod) {
					specificPatterns.add(getOverrideOrDefaultConfig(mappedExt, '.method.definition'));
				} else if (searchProperty.isClassOrMethod) {
					specificPatterns.add(getOverrideOrDefaultConfig(mappedExt, '.class.definition'));
					specificPatterns.add(getOverrideOrDefaultConfig(mappedExt, '.method.definition'));
				}

				specificPatterns.delete('');
				const specificPatternList = Array.from(specificPatterns); //.filter(a => a !== undefined);
				if (specificPatternList.length > 0) {
					searchPattern = specificPatternList.join('|');
				}
			}
		}

		searchPattern = '-t "' + searchPattern + '"';
		let skipPatternSet = new Set<string>();
		if (this.findType === FindType.Definition) {
			if (this.isClass) {
				skipPatternSet.add(getOverrideOrDefaultConfig(mappedExt, '.class.skip.definition'));
			}

			if (this.isMember) {
				skipPatternSet.add(getOverrideOrDefaultConfig(mappedExt, '.member.skip.definition'));
			}

			skipPatternSet.add(getOverrideOrDefaultConfig(mappedExt, '.skip.definition'));
			skipPatternSet.delete('');
		}

		const skipPattern = Array.from(skipPatternSet).join('|');
		if (skipPattern.length > 1) {
			searchPattern += ' --nt "' + skipPattern + '"';
		}

		filePattern = '"' + filePattern + '"';
		return [filePattern, searchPattern];
	}

	public getScore(resultFilePath: string, resultRow: Number, resultText: string): Number {
		let score = 1;
		if (this.isConstantDefinition(this.currentWord, resultText)) {
			if (resultText.indexOf('=') > 0) {
				score += 1000;
			}
		}

		if (this.isClassRegex.test(resultText)) {
			score += 1000;
		}

		if (this.isMethodRegex.test(resultText)) {
			score += 1000;
		}

		const parsedResultPath = path.parse(resultFilePath);
		if (!resultText.match('^\\s*(//|#)') && parsedResultPath.name.endsWith('.md')) {
			score += 100;
		}

		if (!resultText.match(/;\s*$/)) {
			score += 20;
		}

		if (!parsedResultPath.name.match(/test/i)) {
			score += 200;
		}

		if (!resultFilePath.match(/test/i)) {
			score += 100;
		}

		if (!parsedResultPath.name.match(/^I[A-Z][a-z]/)) {
			score += 10;
		}

		if (resultText.match(/^\s*public\s+/)) {
			score += 50;
		}

		if (resultText.match(/^\s*(\w+\s+)?static\s+/)) {
			score += 20;
		}

		if (resultText.match(/^\s*(internal|protected|private)\s+/)) {
			score += 10;
		}

		if (!parsedResultPath.name.match(/\.(json|xml|ya?ml|ini|config|md|txt)$|readme/i)) {
			score += 100;
		}

		if (resultText.match(/^\boverride\b/)) {
			score += 50;
		}

		const currentWordSet = getAllSingleWords(this.currentWord);
		const currentFileNameWordSet = getAllSingleWords(this.currentFile.name);
		const currentTextWordSet = getAllSingleWords(this.currentText);

		const resultFileNameWordSet = getAllSingleWords(parsedResultPath.name);
		const resultWordSet = getAllSingleWords(resultText);

		currentWordSet.forEach(a => {
			if (resultFileNameWordSet.has(a)) {
				score += 20;
			}
		});

		currentFileNameWordSet.forEach(a => {
			if (resultFileNameWordSet.has(a)) {
				score += 10;
			}
		});

		currentTextWordSet.forEach(a => {
			if (resultWordSet.has(a)) {
				score += 10;
			}
		});

		return score;
	}
}
