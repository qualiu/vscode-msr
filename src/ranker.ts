import { ParsedPath } from 'path';
import * as vscode from 'vscode';
import { SearchTextHolder, SearchTextHolderReplaceRegex } from './constants';
import { getConfig, getOverrideConfigByPriority, getOverrideOrDefaultConfig, getRootFolderName, MappedExtToCodeFilePatternMap } from './dynamicConfig';
import { FindType } from './enums';
import { outputDebug, outputError } from './outputUtils';
import { createRegex, EmptyRegex, getAllSingleWords } from './regexUtils';
import { toPath } from './utils';
import path = require('path');

let RootConfig = getConfig().RootConfig || vscode.workspace.getConfiguration('msr');

export class SearchProperty {
	public isSearchOneFile: boolean;

	public currentFile: ParsedPath;
	public currentFilePath: string;
	public extension: string;
	public mappedExt: string;
	public currentWord: string;

	public currentWordRegex: RegExp;
	public scoreWordsText: string;

	public findType: FindType;

	private scoreWordSet: Set<string>;
	private currentText: string;
	private currentWordRange: vscode.Range;

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
	private highScoreWordSet: Set<string> = new Set<string>();

	private promoteFolderRegex: RegExp;
	private promoteFolderScore: number;
	private promotePathRegex: RegExp;
	private promotePathScore: number;

	private demoteFolderRegex: RegExp;
	private demoteFolderScore: number;
	private demotePathRegex: RegExp;
	private demotePathScore: number;
	private promoteSelfFileMatchScore: number = 200;

	constructor(findType: FindType, currentWord: string, currentWordRange: vscode.Range, currentText: string, currentFile: ParsedPath, mappedExt: string, isSearchOneFile: boolean = false) {
		this.isSearchOneFile = isSearchOneFile;
		const MyConfig = getConfig();
		this.findType = findType;
		this.currentWord = currentWord;
		this.currentText = currentText;
		this.currentWordRange = currentWordRange;
		this.currentFile = currentFile;
		this.mappedExt = mappedExt;
		this.extension = currentFile.ext.replace(/^\./, '').toLowerCase();

		this.isClassPattern = getOverrideConfigByPriority([this.extension, this.mappedExt, 'default', ''], 'isClass', false).replace(SearchTextHolderReplaceRegex, currentWord);
		this.isMethodPattern = getOverrideConfigByPriority([this.extension, this.mappedExt, 'default', ''], 'isMethod', false).replace(SearchTextHolderReplaceRegex, currentWord);
		this.isMemberPattern = getOverrideConfigByPriority([this.extension, this.mappedExt, 'default', ''], 'isMember', false).replace(SearchTextHolderReplaceRegex, currentWord);
		this.isEnumValuePattern = getOverrideConfigByPriority([this.extension, this.mappedExt, 'default', ''], 'isEnumValue', false).replace(SearchTextHolderReplaceRegex, currentWord);
		this.isClassOrEnumPattern = getOverrideConfigByPriority([this.extension, this.mappedExt, 'default', ''], 'isClassOrEnum', false).replace(SearchTextHolderReplaceRegex, currentWord);

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

		this.currentWordRegex = new RegExp((/^\W/.exec(this.currentWord) ? '' : '\\b') + currentWord + '\\b');

		this.enumOrConstantValueRegex = new RegExp('^\\s*' + this.currentWord + '\\s*=');

		this.scoreWordsText = this.getScoreText();
		this.scoreWordSet = getAllSingleWords(this.scoreWordsText);
		this.currentWordSet = getAllSingleWords(this.currentWord);
		this.currentFileNameWordSet = getAllSingleWords(this.currentFile.name);
		this.scoreWordSet = getAllSingleWords(this.scoreWordsText);

		this.currentFilePath = toPath(this.currentFile);
		this.currentFilePathWordSet = getAllSingleWords(this.currentFilePath);
		const highScoreRegex = new RegExp('(\\w+)(?:\\.|::|->)' + this.currentWord + '\\b' + '|' + '\\b(' + this.currentWord + ')(?:\\.|::|->)\\w+');
		const highScoreMatch = highScoreRegex.exec(this.currentText);
		if (highScoreMatch) {
			if (highScoreMatch[1]) {
				getAllSingleWords(highScoreMatch[1]).forEach(a => this.highScoreWordSet.add(a));
			}

			if (highScoreMatch[2]) {
				getAllSingleWords(highScoreMatch[2]).forEach(a => this.highScoreWordSet.add(a));
			}
		}

		const rootFolderName = getRootFolderName(this.currentFilePath) || '';
		const promoteFolderPattern = (RootConfig.get(rootFolderName + '.promoteFolderPattern') as string || '').trim();
		const promotePathPattern = (RootConfig.get(rootFolderName + '.promotePathPattern') as string || '').trim();
		this.promoteFolderRegex = createRegex(promoteFolderPattern, 'i');
		this.promotePathRegex = createRegex(promotePathPattern, 'i');
		this.promoteFolderScore = parseInt(getOverrideOrDefaultConfig(rootFolderName, 'promoteFolderScore') || '200');
		this.promotePathScore = parseInt(getOverrideOrDefaultConfig(rootFolderName, 'promotePathScore') || '200');

		const demoteFolderPattern = (RootConfig.get(rootFolderName + '.demoteFolderPattern') as string || '').trim();
		const demotePathPattern = (RootConfig.get(rootFolderName + '.demotePathPattern') as string || '').trim();
		this.demoteFolderRegex = createRegex(demoteFolderPattern, 'i');
		this.demotePathRegex = createRegex(demotePathPattern, 'i');
		this.demoteFolderScore = parseInt(getOverrideOrDefaultConfig(rootFolderName, 'demoteFolderScore') || '200');
		this.demotePathScore = parseInt(getOverrideOrDefaultConfig(rootFolderName, 'demotePathScore') || '200');

		const isUpperCaseWord = /^[A-Z]\w+$/.test(this.currentWord);
		if (!this.isClass && !this.isMember && !this.isMethod && !this.isEnumValue) {
			if (isUpperCaseWord && new RegExp('^\\s*' + this.currentWord + '\\s*=').test(this.currentText)) {
				this.isMember = true;
			}

			if (isUpperCaseWord && new RegExp('[^\.\w]' + this.currentWord + '(\\.|::|->)\\w+').test(this.currentText)) {
				this.isClass = true;
			}
		} else if (!this.isClass && isUpperCaseWord && /^(py|cpp)$/.test(mappedExt) && /^[A-Z]\w+/.test(this.currentWord) && this.methodQuoteRegex.test(currentText)) {
			this.isClass = true;
		}

		outputDebug('Final-Check: isMember = ' + this.isMember + ', isClass = ' + this.isClass + ' , isMethod = ' + this.isMethod + ' , isEnumValue = ' + this.isEnumValue);

		const classPattern = getOverrideConfigByPriority([this.extension, this.mappedExt, 'default', ''], 'class.definition', false).replace(SearchTextHolderReplaceRegex, currentWord);
		this.classDefinitionRegex = classPattern.length < 1 ? EmptyRegex : new RegExp(classPattern);

		const methodPattern = getOverrideConfigByPriority([this.extension, this.mappedExt, 'default', ''], 'method.definition', false).replace(SearchTextHolderReplaceRegex, currentWord);
		this.methodDefinitionRegex = methodPattern.length < 1 ? EmptyRegex : new RegExp(methodPattern);

		const memberPattern = getOverrideConfigByPriority([this.extension, this.mappedExt, 'default', ''], 'member.definition', false).replace(SearchTextHolderReplaceRegex, currentWord);
		this.memberDefinitionRegex = memberPattern.length < 1 ? EmptyRegex : new RegExp(memberPattern);

		const enumPattern = getOverrideConfigByPriority([this.extension, this.mappedExt, 'default', ''], 'enum.definition', false).replace(SearchTextHolderReplaceRegex, currentWord);
		this.enumDefinitionRegex = enumPattern.length < 1 ? EmptyRegex : new RegExp(enumPattern);

		outputDebug('promoteFolderScore = ' + this.promoteFolderScore + ' , promoteFolderPattern = "' + this.promoteFolderRegex.source + '"');
		outputDebug('promotePathScore = ' + this.promotePathScore + ' , promotePathPattern = "' + this.promotePathRegex.source + '"');
		outputDebug('demoteFolderScore = ' + this.demoteFolderScore + ' , demoteFolderPattern = "' + this.demoteFolderRegex.source + '"');
		outputDebug('demotePathScore = ' + this.demotePathScore + ' , demotePathPattern = "' + this.demotePathRegex.source + '"');

		outputDebug('isConstant = ' + this.isConstant + ' , isConstantPattern = "' + MyConfig.DefaultConstantsRegex.source + '" , nonConstRegex = "' + this.methodQuoteRegex.source + '"');
		outputDebug('isClass = ' + this.isClass + ' , isClassPattern = "' + this.isClassPattern + '"');
		outputDebug('isEnumValue = ' + this.isEnumValue + ' , isEnumPattern = "' + this.isEnumValuePattern + '"');
		outputDebug('isMethod = ' + this.isMethod + ' , isMethodPattern = "' + this.isMethodPattern + '"');
		outputDebug('isMember = ' + this.isMember + ' , isMemberPattern = "' + this.isMemberPattern + '"');
		outputDebug('isClassOrEnum = ' + this.isClassOrEnum + ' , isClassOrEnumPattern = "' + this.isClassOrEnumPattern + '"');

		outputDebug('classDefinitionRegex = "' + this.classDefinitionRegex.source + '"');
		outputDebug('methodDefinitionRegex = "' + this.methodDefinitionRegex.source + '"');
		outputDebug('memberDefinitionRegex = "' + this.memberDefinitionRegex.source + '"');
		outputDebug('enumDefinitionRegex = "' + this.enumDefinitionRegex.source + '"');

		outputDebug('scoreWordsText = ' + this.scoreWordsText);
		outputDebug('promoteSelfFileMatchScore = ' + this.promoteSelfFileMatchScore);
		outputDebug('scoreWordSet[' + this.scoreWordSet.size + '] = ' + Array.from(this.scoreWordSet).join(' '));
	}

	private getScoreText(): string {
		const leftPart = this.currentText.substring(0, this.currentWordRange.start.character);
		const expandLeftRegex = this.isMethod ? /[=\s\w\.:<>-]+$/ : /[\w\.:<>-]+$/;
		const expandMethodLeftRegex = this.isMethod && this.findType === FindType.Definition
			? new RegExp('[\\w\\.:<>-]*\\w+\\s*\\(.*?\\)\\s*(->|\\.)\\s*$')
			: EmptyRegex;

		const leftMethodMatch = expandMethodLeftRegex.exec(leftPart);
		if (this.isMethod && this.findType === FindType.Definition) {
			if (new RegExp("\\b(this|self)(->|\\.)$").test(leftPart)) {
				this.promoteSelfFileMatchScore = 200;
			} else if (new RegExp("\\s+$").test(leftPart)) {
				this.promoteSelfFileMatchScore = 50;
			} else {
				this.promoteSelfFileMatchScore = 5;
			}
		}

		const leftMatch = this.isMethod
			? leftMethodMatch || expandLeftRegex.exec(leftPart)
			: expandLeftRegex.exec(leftPart);

		const leftMatchedText = leftMatch ? leftMatch[0] : '';

		const rightPart = this.currentText.substring(this.currentWordRange.end.character);
		const expandRightRegex = /^[\w\.:<>-]+/;
		const rightMatch = expandRightRegex.exec(rightPart);
		const rightMatchedText = rightMatch ? rightMatch[0] : '';

		let scoreText = leftMatchedText + this.currentWord;
		if (this.isClass || this.isMethod) {
			scoreText += rightPart;
		} else {
			scoreText += rightMatchedText;
		}

		return scoreText.trim();
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

		let searchPattern = getOverrideConfigByPriority([this.extension, this.mappedExt, 'default', ''], configKeyName, false);
		if (searchPattern.indexOf(SearchTextHolder) < 0) {
			outputError('Not found word-holder: "' + SearchTextHolder + '" in search option, please check configuration of "' + configKeyName + '": ' + searchPattern);
			return ['', ''];
		}

		const RootConfig = vscode.workspace.getConfiguration('msr');
		const codeFilesKey = this.mappedExt === 'ui' ? 'default.codeFilesPlusUI' : 'default.codeFiles';
		let filePattern = MappedExtToCodeFilePatternMap.get(this.mappedExt) || '\\.' + extension + '$';
		if (MyConfig.SearchAllFilesWhenFindingReferences && configKeyName === 'reference') {
			filePattern = RootConfig.get('default.allFiles') as string;
			const defaultFindRef = RootConfig.get('default.reference') as string;
			if (defaultFindRef.length > 1) {
				searchPattern = defaultFindRef;
			}

			if (/^\W/.test(this.currentWord) && searchPattern.startsWith('\\b')) {
				searchPattern = searchPattern.substring(2);
			}

			if (/\W$/.test(this.currentWord) && searchPattern.endsWith('\\b')) {
				searchPattern = searchPattern.substring(0, searchPattern.length - 2);
			}
		} else if (MyConfig.SearchAllFilesWhenFindingDefinitions && configKeyName === 'definition') {
			filePattern = RootConfig.get(codeFilesKey) as string;
			const defaultFindDef = RootConfig.get('default.definition') as string;
			if (defaultFindDef.length > 1) {
				searchPattern = defaultFindDef;
			}
		}
		if (!MyConfig.SearchAllFilesWhenFindingDefinitions && !MyConfig.SearchAllFilesWhenFindingReferences) {
			if (MyConfig.ConfigAndDocFilesRegex.test(parsedFile.base)) {
				filePattern = configKeyName === 'definition'
					? RootConfig.get(codeFilesKey) as string
					: MyConfig.CodeAndConfigAndDocFilesRegex.source;
			}

			if (configKeyName === 'definition') {
				let specificPatterns = new Set<string>();
				specificPatterns.add(searchPattern);

				if (this.isClass || this.isClassOrEnum) {
					specificPatterns.add(getOverrideConfigByPriority([this.extension, this.mappedExt, 'default', ''], 'class.definition') as string || '');
				}

				if (this.isConstant) {
					specificPatterns.add(getOverrideConfigByPriority([this.extension, this.mappedExt, 'default', ''], 'constant.definition') as string || '');
					if (this.currentText.indexOf(this.currentWord + '.') >= 0) {
						specificPatterns.add(getOverrideConfigByPriority([this.extension, this.mappedExt, 'default', ''], 'class.definition') as string || '');
					}
				}

				if (this.isEnumValue) {
					specificPatterns.add(getOverrideConfigByPriority([this.extension, this.mappedExt, 'default', ''], 'enum.definition') as string || '');
				}

				if (this.isMember) {
					specificPatterns.add(getOverrideConfigByPriority([this.extension, this.mappedExt, 'default', ''], 'member.definition') as string || '');

					// For languages that can omit quotes for methods: this.mappedExt.match(/py|java/)
					if (this.extension.match(/py|scala/)) {
						specificPatterns.add(getOverrideConfigByPriority([this.extension, this.mappedExt, 'default', ''], 'method.definition') as string || '');
					}
				}

				if (this.isMethod) {
					specificPatterns.add(getOverrideConfigByPriority([this.extension, this.mappedExt, 'default', ''], 'method.definition') as string || '');
				}

				// Default: Will be slower if more items.
				if (specificPatterns.size < 1) { // if (this.isEnumOrMember) {
					specificPatterns.add(getOverrideConfigByPriority([this.extension, this.mappedExt, 'default', ''], 'class.definition') as string || '');
					specificPatterns.add(getOverrideConfigByPriority([this.extension, this.mappedExt, 'default', ''], 'member.definition') as string || '');
					specificPatterns.add(getOverrideConfigByPriority([this.extension, this.mappedExt, 'default', ''], 'method.definition') as string || '');
				}
				else if (this.isMember && !this.isClass) {
					if (this.currentWord.match(/^[A-Z][a-z]+\w+/) && new RegExp('\\w+\.' + this.currentWord + '\\b').test(this.currentText)) {
						specificPatterns.add(getOverrideConfigByPriority([this.extension, this.mappedExt, 'default', ''], 'class.definition') as string || '');
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

		const skipPattern = this.findType === FindType.Definition ? this.getSkipPatternForDefinition() : '';
		if (skipPattern.length > 1) {
			searchPattern += ' --nt "' + skipPattern + '"';
		}

		filePattern = '"' + filePattern + '"';
		return [filePattern, searchPattern];
	}

	public getSkipPatternForDefinition() {
		let skipPatternSet = new Set<string>();
		if (this.isClass) {
			skipPatternSet.add(getOverrideConfigByPriority([this.extension, this.mappedExt, 'default', ''], 'class.skip.definition'));
		}

		if (this.isMember && !this.isEnumValue) {
			skipPatternSet.add(getOverrideConfigByPriority([this.extension, this.mappedExt, 'default', ''], 'member.skip.definition'));
		}

		if (this.isEnumValue) {
			skipPatternSet.add(getOverrideConfigByPriority([this.extension, this.mappedExt, 'default', ''], 'enum.skip.definition'));
		}

		if (this.isMethod) {
			skipPatternSet.add(getOverrideConfigByPriority([this.extension, this.mappedExt, 'default', ''], 'method.skip.definition'));
		}

		skipPatternSet.delete('');

		if (skipPatternSet.size < 1) {
			skipPatternSet.add(getOverrideConfigByPriority([this.extension, this.mappedExt, 'default', ''], 'skip.definition'));
		}

		skipPatternSet.delete('');
		return Array.from(skipPatternSet).join('|');
	}

	public getScore(resultFilePath: string, resultRow: Number, resultText: string): Number {
		let score = 1;
		if (resultFilePath === this.currentFilePath) {
			score += 10000;
		}

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
			if (this.isSearchOneFile) {
				score *= 10;
			}
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
			score += 500;
		}

		if (!resultFilePath.match(/test/i)) {
			score += 300;
		}

		if (!parsedResultPath.name.match(/Mock/i)) {
			score += 300;
		}

		if (!resultFilePath.match(/Mock/i)) {
			score += 200;
		}

		// if not interface in file name
		if (!parsedResultPath.name.match(/^I[A-Z][a-z]/)) {
			score += 100;
		}

		// if not interface
		if (!resultText.match(/\s+(interface|abstract)\s+/)) {
			score += 100;
		}

		if (resultText.match(/^\s*public\s+/)) {
			score += 200 * (this.isSearchOneFile ? 10 : 1);
		}

		if (resultText.match(/^\s*(internal)\s+/)) {
			score += 30 * (this.isSearchOneFile ? 10 : 1);
		}

		if (resultText.match(/^\s*(protected)\s+/)) {
			score += 20 * (this.isSearchOneFile ? 10 : 1);
		}

		if (resultText.match(/^\s*(private)\s+/)) {
			score += 10 * (this.isSearchOneFile ? 10 : 1);
		}

		if (resultText.match(/^\s*(\w+\s+)?static\s+/)) {
			score += 30 * (this.isSearchOneFile ? 10 : 1);
		}

		if (resultText.match(/^\s*(\w+\s+)?(readonly|const)\s+/)) {
			score += 50 * (this.isSearchOneFile ? 10 : 1);
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

		this.highScoreWordSet.forEach(a => {
			if (resultFileNameWordSet.has(a)) {
				score += 200;
			}
		});

		this.highScoreWordSet.forEach(a => {
			if (resultWordSet.has(a)) {
				score += 50;
			}
		});

		this.currentWordSet.forEach(a => {
			if (resultFileNameWordSet.has(a)) {
				score += 100;
			}
		});

		this.scoreWordSet.forEach(a => {
			if (resultFileNameWordSet.has(a)) {
				score += 50;
			}
		});

		this.currentFileNameWordSet.forEach(a => {
			if (resultFileNameWordSet.has(a)) {
				score += this.promoteSelfFileMatchScore / 10;
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
				score += this.promoteSelfFileMatchScore / 40;
			}
		});

		const headSpaces = /^\s+/.exec(resultText);
		if (headSpaces) {
			score -= headSpaces[0].length * 3;
		}

		if (parsedResultPath.dir === this.currentFile.dir) {
			score += this.promoteSelfFileMatchScore / 5;
		}

		if (parsedResultPath.base === this.currentFile.base) {
			score += parsedResultPath.dir === this.currentFile.dir
				? this.promoteSelfFileMatchScore
				: this.promoteSelfFileMatchScore / 5;
		}

		if (this.promoteFolderRegex.source !== EmptyRegex.source || this.demoteFolderRegex.source !== EmptyRegex.source) {
			parsedResultPath.dir.split(/[\\/]/).forEach(a => {
				if (this.promoteFolderRegex.test(a)) {
					score += this.promoteFolderScore;
				}

				if (this.demoteFolderRegex.test(a)) {
					score -= this.demoteFolderScore;
				}
			});
		}

		if (this.promotePathRegex.source !== EmptyRegex.source || this.demotePathRegex.source !== EmptyRegex.source) {
			if (this.promotePathRegex.test(resultFilePath)) {
				score += this.promotePathScore;
			}

			if (this.demotePathRegex.test(resultFilePath)) {
				score -= this.demotePathScore;
			}
		}

		score -= resultFilePath.length;

		return score;
	}
}
