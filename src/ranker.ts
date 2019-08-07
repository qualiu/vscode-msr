'use strict';

import * as vscode from 'vscode';
import { ParsedPath } from 'path';
import path = require('path');
import { getAllSingleWords } from './regexUtils';
import { outputError, outputDebug } from './outputUtils';
import { getConfig, getOverrideOrDefaultConfig, SearchTextHolderReplaceRegex, SearchTextHolder } from './dynamicConfig';
import { strict } from 'assert';
import { stringify } from 'querystring';

export enum FindType {
	Definition = 1,
	Reference = 2,
}

let RootConfig = getConfig().RootConfig || vscode.workspace.getConfiguration('msr');

const EmptyRegex: RegExp = new RegExp('^\\.#x#'); // Workaround for empty RegExp.

export const FileExtensionToConfigExtMap = new Map<string, string>()
	.set('cxx', 'cpp')
	.set('c++', 'cpp')
	.set('cc', 'cpp')
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
	.set('default', '')
	;

export class SearchProperty {
	public currentFile: ParsedPath;
	public mappedExt: string;
	public currentWord: string;

	public currentWordRegex: RegExp;
	public scoreWordsText: string;

	private scoreWordSet: Set<string>;
	private findType: FindType;
	private currentText: string;
	private currentWordRange: vscode.Range;
	private extension: string;

	private isClassPattern: string;
	private isMethodPattern: string;
	private isEnumValuePattern: string;
	private isMemberPattern: string;
	private isClassOrEnumPattern: string;

	private isClassRegex: RegExp;
	private isMethodRegex: RegExp;
	private isMemberRegex: RegExp;
	private isEnumValueRegex: RegExp;
	private isClassOrEnumRegex: RegExp;

	private isClass: boolean;
	private isMethod: boolean;
	private isMember: boolean;
	private isConstant: boolean;
	private isEnumValue: boolean;
	private isClassOrEnum: boolean;

	private methodQuoteRegex: RegExp;
	private enumOrConstantValueRegex: RegExp;

	private classDefinitionRegex: RegExp;
	private memberDefinitionRegex: RegExp;
	private enumDefinitionRegex: RegExp;
	private methodDefinitionRegex: RegExp;

	private currentWordSet: Set<string>;
	private currentFileNameWordSet: Set<string>;
	private currentFilePathWordSet: Set<string>;

	constructor(findType: FindType, currentWord: string, currentWordRange: vscode.Range, currentText: string, currentFile: ParsedPath, mappedExt: string) {
		const MyConfig = getConfig();
		this.findType = findType;
		this.currentWord = currentWord;
		this.currentText = currentText;
		this.currentWordRange = currentWordRange;
		this.currentFile = currentFile;
		this.mappedExt = mappedExt;
		this.extension = currentFile.ext.replace(/^\./, '');

		this.isClassPattern = getOverrideOrDefaultConfig(mappedExt, '.isClass', false).replace(SearchTextHolderReplaceRegex, currentWord);
		this.isMethodPattern = getOverrideOrDefaultConfig(mappedExt, '.isMethod', false).replace(SearchTextHolderReplaceRegex, currentWord);
		this.isMemberPattern = getOverrideOrDefaultConfig(mappedExt, '.isMember', false).replace(SearchTextHolderReplaceRegex, currentWord);
		this.isEnumValuePattern = getOverrideOrDefaultConfig(mappedExt, '.isEnumValue', false).replace(SearchTextHolderReplaceRegex, currentWord);
		this.isClassOrEnumPattern = getOverrideOrDefaultConfig(mappedExt, '.isClassOrEnum', false).replace(SearchTextHolderReplaceRegex, currentWord);

		this.isClassRegex = this.isClassPattern.length < 1 ? EmptyRegex : new RegExp(this.isClassPattern);
		this.isMethodRegex = this.isMethodPattern.length < 1 ? EmptyRegex : new RegExp(this.isMethodPattern);
		this.isMemberRegex = this.isMemberPattern.length < 1 ? EmptyRegex : new RegExp(this.isMemberPattern);
		this.isEnumValueRegex = this.isEnumValuePattern.length < 1 ? EmptyRegex : new RegExp(this.isEnumValuePattern);
		this.isClassOrEnumRegex = this.isClassOrEnumPattern.length < 1 ? EmptyRegex : new RegExp(this.isClassOrEnumPattern);

		this.methodQuoteRegex = new RegExp('\\b' + currentWord + '\\b\\s*\\(');

		this.isClass = this.isClassRegex.test(currentText);
		this.isMethod = this.isMethodRegex.test(currentText);
		this.isMember = this.isMemberRegex.test(currentText) && !this.methodQuoteRegex.test(currentText);
		this.isConstant = this.isConstantDefinition(currentWord, currentText);
		this.isEnumValue = this.isEnumValueRegex.test(this.currentText);
		this.isClassOrEnum = this.isClassOrEnumRegex.test(this.currentText);

		this.currentWordRegex = new RegExp('\\b' + currentWord + '\\b');
		this.enumOrConstantValueRegex = new RegExp('^\\s*' + this.currentWord + '\\s*=');

		this.scoreWordsText = this.getScoreText();
		this.scoreWordSet = getAllSingleWords(this.scoreWordsText);
		this.currentWordSet = getAllSingleWords(this.currentWord);
		this.currentFileNameWordSet = getAllSingleWords(this.currentFile.name);
		this.scoreWordSet = getAllSingleWords(this.scoreWordsText);
		this.currentFilePathWordSet = getAllSingleWords(path.join(this.currentFile.dir, this.currentFile.name));

		outputDebug('isConstant = ' + this.isConstant + ' , isConstantPattern = "' + MyConfig.DefaultConstantsRegex.source + '" , nonConstRegex = "' + this.methodQuoteRegex.source + '"');
		outputDebug('isClass = ' + this.isClass + ' , isClassPattern = "' + this.isClassPattern + '"');
		outputDebug('isEnumValue = ' + this.isEnumValue + ' , isEnumPattern = "' + this.isEnumValuePattern + '"');
		outputDebug('isMethod = ' + this.isMethod + ' , isMethodPattern = "' + this.isMethodPattern + '"');
		outputDebug('isMember = ' + this.isMember + ' , isMemberPattern = "' + this.isMemberPattern + '"');
		outputDebug('isClassOrEnum = ' + this.isClassOrEnum + ' , isClassOrEnumPattern = "' + this.isClassOrEnumPattern + '"');
		outputDebug('scoreWordsText = "' + this.scoreWordsText + '" , scoreWordSet[' + this.scoreWordSet.size + '] = ' + Array.from(this.scoreWordSet).join(' '));

		const isUpperCaseWord = /^[A-Z]\w+$/.test(this.currentWord);
		if (!this.isClass && !this.isMember && !this.isMethod && !this.isEnumValue) {
			if (isUpperCaseWord && new RegExp('^\\s*' + this.currentWord + '\\s*=').test(this.currentText)) {
				this.isMember = true;
			}

			if (isUpperCaseWord && new RegExp('[^\.\w]' + this.currentWord + '(\\.|::|->)\\w+').test(this.currentText)) {
				this.isClass = true;
			}

			outputDebug('Final-Check: isMember = ' + this.isMember + ', isClass = ' + this.isClass + ' , isMethod = ' + this.isMethod + ' , isEnumValue = ' + this.isEnumValue);
		}

		const classPattern = getOverrideOrDefaultConfig(mappedExt, '.class.definition', false).replace(SearchTextHolderReplaceRegex, currentWord);
		this.classDefinitionRegex = classPattern.length < 1 ? EmptyRegex : new RegExp(classPattern);

		const methodPattern = getOverrideOrDefaultConfig(mappedExt, '.method.definition', false).replace(SearchTextHolderReplaceRegex, currentWord);
		this.methodDefinitionRegex = methodPattern.length < 1 ? EmptyRegex : new RegExp(methodPattern);

		const memberPattern = getOverrideOrDefaultConfig(mappedExt, '.member.definition', false).replace(SearchTextHolderReplaceRegex, currentWord);
		this.memberDefinitionRegex = memberPattern.length < 1 ? EmptyRegex : new RegExp(memberPattern);

		const enumPattern = getOverrideOrDefaultConfig(mappedExt, '.enum.definition', false).replace(SearchTextHolderReplaceRegex, currentWord);
		this.enumDefinitionRegex = enumPattern.length < 1 ? EmptyRegex : new RegExp(enumPattern);

		outputDebug('classDefinitionRegex = "' + this.classDefinitionRegex.source + '"');
		outputDebug('methodDefinitionRegex = "' + this.methodDefinitionRegex.source + '"');
		outputDebug('memberDefinitionRegex = "' + this.memberDefinitionRegex.source + '"');
		outputDebug('enumDefinitionRegex = "' + this.enumDefinitionRegex.source + '"');
	}

	private getScoreText() {
		const expandRegex = /[\w\.:>-]/;

		let leftIndex = this.currentWordRange.start.character;
		for (; leftIndex > 0 && expandRegex.test(this.currentText[leftIndex]); leftIndex--) {
		}

		leftIndex = Math.max(0, leftIndex);

		if (!expandRegex.test(this.currentText[leftIndex])) {
			leftIndex += 1;
		}

		let rightIndex = this.isClass || this.isMethod ? this.currentText.length - 1 : this.currentWordRange.end.character;
		if (!this.isClass && !this.isMethod) {
			for (; rightIndex < this.currentText.length - 1 && expandRegex.test(this.currentText[rightIndex]); rightIndex++) {
			}

			rightIndex = Math.min(rightIndex, this.currentText.length - 1);
		}

		if (!expandRegex.test(this.currentText[rightIndex])) {
			rightIndex -= 1;
		}

		return this.currentText.substring(leftIndex, rightIndex + 1);
	}

	private isConstantDefinition(word: string, lineText: string): boolean {
		const MyConfig = getConfig();
		return MyConfig.DefaultConstantsRegex.test(word) && !this.methodQuoteRegex.test(lineText);
	}

	public getFileNamePatternAndSearchOption(
		extension: string,
		configKeyName: string,
		parsedFile: ParsedPath): [string, string] {
		const MyConfig = getConfig();

		let searchPattern = getOverrideOrDefaultConfig(this.mappedExt, '.' + configKeyName, false);
		if (searchPattern.indexOf(SearchTextHolder) < 0) {
			outputError('Not found word-holder: "' + SearchTextHolder + '" in search option, please check configuration of "' + configKeyName + '": ' + searchPattern);
			return ['', ''];
		}

		const RootConfig = vscode.workspace.getConfiguration('msr');

		let filePattern = MappedExtToCodeFileNamePatternMap.get(this.mappedExt) || '\\.' + extension + '$';
		if (MyConfig.SearchAllFilesWhenFindingReferences && configKeyName === 'reference') {
			filePattern = RootConfig.get('default.allFiles') as string;
			const defaultFindRef = RootConfig.get('default.reference') as string;
			if (defaultFindRef.length > 1) {
				searchPattern = defaultFindRef;
			}
		} else if (MyConfig.SearchAllFilesWhenFindingDefinitions && configKeyName === 'definition') {
			const codeFilesKey = this.mappedExt === 'ui' ? 'default.codeFilesPlusUI' : 'default.codeFiles';
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

				if (this.isClass || this.isClassOrEnum) {
					specificPatterns.add(getOverrideOrDefaultConfig(this.mappedExt, '.class.definition'));
				}

				if (this.isConstant) {
					specificPatterns.add(getOverrideOrDefaultConfig(this.mappedExt, '.constant.definition', false));
					if (this.currentText.indexOf(this.currentWord + '.') >= 0) {
						specificPatterns.add(getOverrideOrDefaultConfig(this.mappedExt, '.class.definition'));
					}
				}

				if (this.isEnumValue) {
					specificPatterns.add(getOverrideOrDefaultConfig(this.mappedExt, '.enum.definition'));
				}

				if (this.isMember) {
					specificPatterns.add(getOverrideOrDefaultConfig(this.mappedExt, '.member.definition'));

					// For languages that can omit quotes for methods: this.mappedExt.match(/py|java/)
					if (this.extension.match(/py|scala/)) {
						specificPatterns.add(getOverrideOrDefaultConfig(this.mappedExt, '.method.definition'));
					}
				}

				if (this.isMethod) {
					specificPatterns.add(getOverrideOrDefaultConfig(this.mappedExt, '.method.definition'));
				}

				// Default: Will be slower if more items.
				if (specificPatterns.size < 1) { // if (this.isEnumOrMember) {
					specificPatterns.add(getOverrideOrDefaultConfig(this.mappedExt, '.class.definition'));
					specificPatterns.add(getOverrideOrDefaultConfig(this.mappedExt, '.member.definition'));
					specificPatterns.add(getOverrideOrDefaultConfig(this.mappedExt, '.method.definition'));
				}
				else if (this.isMember && !this.isClass) {
					if (this.currentWord.match(/^[A-Z][a-z]+\w+/) && new RegExp('\\w+\.' + this.currentWord + '\\b').test(this.currentText)) {
						specificPatterns.add(getOverrideOrDefaultConfig(this.mappedExt, '.class.definition'));
					}
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
				skipPatternSet.add(getOverrideOrDefaultConfig(this.mappedExt, '.class.skip.definition'));
			}

			if (this.isMember && !this.isEnumValue) {
				skipPatternSet.add(getOverrideOrDefaultConfig(this.mappedExt, '.member.skip.definition'));
			}

			skipPatternSet.add(getOverrideOrDefaultConfig(this.mappedExt, '.skip.definition'));
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
				score += 100;
			}
		}

		if (this.isEnumValue || this.isMember || this.isClass) {
			if (this.enumOrConstantValueRegex.test(resultText)) {
				score += 100;
			}
		}

		if (new RegExp('\\b(class|enum|Enum)\\s+' + this.currentWord).test(resultText)) {
			score += this.isClass ? 200 : 20;
		}

		const hasMatchedClass = resultText.match(this.classDefinitionRegex);
		if (this.isMember) {
			if (!hasMatchedClass && !resultText.match(/[\(\)]/)) {
				score += 500;
			}
		}

		const parsedResultPath = path.parse(resultFilePath);
		if (!resultText.match('^\\s*(//|#)') && parsedResultPath.name.endsWith('.md')) {
			score += 100;
		}

		// Reduce score of sentences which contains keywords
		if (resultText.replace(/\s*[,;\.]\s*/, '').match(/(\w+ ){7,}/)) {
			score -= 500;
		}

		if (!resultText.match(/;\s*$/)) {
			score += 20;
		}

		if (!parsedResultPath.name.match(/test/i)) {
			score += 300;
		}

		if (!resultFilePath.match(/test/i)) {
			score += 500;
		}

		// if not interface
		if (!parsedResultPath.name.match(/^I[A-Z][a-z]/)) {
			score += 10;
		}

		if (resultText.match(/^\s*public\s+/)) {
			score += 200;
		}

		if (resultText.match(/^\s*(internal)\s+/)) {
			score += 30;
		}

		if (resultText.match(/^\s*(protected)\s+/)) {
			score += 20;
		}

		if (resultText.match(/^\s*(private)\s+/)) {
			score += 10;
		}

		if (resultText.match(/^\s*(\w+\s+)?static\s+/)) {
			score += 30;
		}

		if (!parsedResultPath.name.match(/\.(json|xml|ya?ml|ini|config|md|txt)$|readme/i)) {
			score += 100;
		}

		if (resultText.match(/^\boverride\b/)) {
			score += 50;
		}


		const resultFileNameWordSet = getAllSingleWords(parsedResultPath.name);
		const resultWordSet = getAllSingleWords(resultText);
		const resultFilePathWordSet = getAllSingleWords(resultFilePath);

		this.currentWordSet.forEach(a => {
			if (resultFileNameWordSet.has(a)) {
				score += 20;
			}
		});

		this.scoreWordSet.forEach(a => {
			if (resultFileNameWordSet.has(a)) {
				score += 20;
			}
		});

		this.currentFileNameWordSet.forEach(a => {
			if (resultFileNameWordSet.has(a)) {
				score += 10;
			}
		});


		this.scoreWordSet.forEach(a => {
			if (resultWordSet.has(a)) {
				score += 10;
			}
		});

		this.scoreWordSet.forEach(a => {
			if (resultFilePathWordSet.has(a)) {
				score += 5;
			}
		});

		this.currentFilePathWordSet.forEach(a => {
			if (resultFileNameWordSet.has(a)) {
				score += 5;
			}
		});

		const headSpaces = /^\s+/.exec(resultText);
		if (headSpaces) {
			score -= headSpaces[0].length * 3;
		}

		return score;
	}
}
