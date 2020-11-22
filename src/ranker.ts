import { ParsedPath } from 'path';
import * as vscode from 'vscode';
import { SearchTextHolder, SearchTextHolderReplaceRegex } from './constants';
import { getConfig, GetConfigPriorityPrefixes, getConfigValue, getOverrideConfigByPriority, getOverrideOrDefaultConfig, getRootFolderName, MappedExtToCodeFilePatternMap } from './dynamicConfig';
import { FindType } from './enums';
import { outputDebug, outputError } from './outputUtils';
import { createRegex, EmptyRegex, getAllSingleWords } from './regexUtils';
import { ResultType } from './ScoreTypeResult';
import { getExtensionNoHeadDot, isNullOrEmpty, nowText, toPath } from './utils';
import path = require('path');

let RootConfig = getConfig().RootConfig || vscode.workspace.getConfiguration('msr');

export class SearchProperty {
	public isOneFileOrFolder: boolean;

	public currentFile: ParsedPath;
	public currentFilePath: string;
	public extension: string;
	public mappedExt: string;
	public rootFolderName: string;

	public currentWord: string;
	public currentWordRegex: RegExp;
	public scoreWordsText: string;

	public findType: FindType;

	private scoreWordSet: Set<string>;
	private currentText: string;
	private currentWordRange: vscode.Range;

	private isClassResultRegex: RegExp;
	private isEnumResultRegex: RegExp;
	private isMethodResultRegex: RegExp;
	private isInterfaceResultRegex: RegExp;
	private isConstantResultRegex: RegExp;

	private isFindClassRegex: RegExp;
	private isFindMethodRegex: RegExp;
	private isFindMemberRegex: RegExp;
	private isFindConstantRegex: RegExp;
	private isFindEnumRegex: RegExp;
	private isFindClassOrEnumRegex: RegExp;

	private isFindClass: boolean;
	private isFindMethod: boolean;
	private isFindMember: boolean;
	private isFindConstant: boolean = false;
	private isFindEnum: boolean;
	private isFindClassOrEnum: boolean;

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

	constructor(findType: FindType, currentWord: string, currentWordRange: vscode.Range, currentText: string, currentFile: ParsedPath, mappedExt: string, isOneFileOrFolder = false) {
		this.isOneFileOrFolder = isOneFileOrFolder;
		const MyConfig = getConfig();
		this.findType = findType;
		this.currentWord = currentWord;
		this.currentText = currentText;
		this.currentWordRange = currentWordRange;
		this.currentFile = currentFile;
		this.currentFilePath = toPath(currentFile);
		this.mappedExt = mappedExt;
		this.extension = getExtensionNoHeadDot(currentFile.ext, '');
		this.rootFolderName = getRootFolderName(this.currentFilePath);

		this.isClassResultRegex = this.getCheckingRegex('isClassResult', true);
		this.isEnumResultRegex = this.getCheckingRegex('isEnumResult', true);
		this.isMethodResultRegex = this.getCheckingRegex('isMethodResult', true);
		this.isInterfaceResultRegex = this.getCheckingRegex('isInterfaceResult', true);

		this.isFindClassRegex = this.getCheckingRegex('isFindClass', false);
		this.isFindMethodRegex = this.getCheckingRegex('isFindMethod', false);
		this.isFindMemberRegex = this.getCheckingRegex('isFindMember', false);
		this.isFindEnumRegex = this.getCheckingRegex('isFindEnum', false);
		this.isFindClassOrEnumRegex = this.getCheckingRegex('isFindClassOrEnum', false);
		this.methodQuoteRegex = new RegExp('\\b' + currentWord + '\\b\\s*\\(');

		this.isFindClass = this.isFindClassRegex.test(currentText);
		this.isFindMethod = this.isFindMethodRegex.test(currentText);
		this.isFindMember = this.isFindMemberRegex.test(currentText) && !this.methodQuoteRegex.test(currentText);
		this.isFindEnum = this.isFindEnumRegex.test(this.currentText);
		this.isFindClassOrEnum = this.isFindClassOrEnumRegex.test(this.currentText);
		this.isFindConstantRegex = this.getCheckingRegex('isFindConstant', false);
		if (/^[A-Z]/.test(this.currentWord)) {
			this.isFindConstant = (this.isFindConstantRegex.source === EmptyRegex.source
				? MyConfig.DefaultConstantsRegex.test(this.currentWord)
				: this.isFindConstantRegex.test(this.currentText)
			) && !this.methodQuoteRegex.test(this.currentText);
		}

		this.isConstantResultRegex = this.getCheckingRegex('isConstantResult', true);
		if (this.isConstantResultRegex.source === EmptyRegex.source) {
			this.isConstantResultRegex = new RegExp('\\b' + this.currentWord + '\\s*=');
		}

		this.currentWordRegex = new RegExp((/^\W/.exec(this.currentWord) ? '' : '\\b') + currentWord + '\\b');

		this.enumOrConstantValueRegex = new RegExp('^\\s*' + this.currentWord + '\\s*=');

		this.scoreWordsText = this.getScoreText();
		this.scoreWordSet = getAllSingleWords(this.scoreWordsText);
		this.currentWordSet = getAllSingleWords(this.currentWord);
		this.currentFileNameWordSet = getAllSingleWords(this.currentFile.name);
		this.scoreWordSet = getAllSingleWords(this.scoreWordsText);

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

		const rootFolderName = getRootFolderName(this.currentFilePath);
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
		if (!this.isFindClass && !this.isFindMember && !this.isFindMethod && !this.isFindEnum) {
			if (isUpperCaseWord && new RegExp('^\\s*' + this.currentWord + '\\s*=').test(this.currentText)) {
				this.isFindMember = true;
			}

			if (isUpperCaseWord && new RegExp('[^\.\w]' + this.currentWord + '(\\.|::|->)\\w+').test(this.currentText)) {
				this.isFindClass = true;
			}
		} else if (!this.isFindClass && isUpperCaseWord && /^(py|cpp)$/.test(mappedExt) && /^[A-Z]\w+/.test(this.currentWord) && this.methodQuoteRegex.test(currentText)) {
			this.isFindClass = true;
		}

		outputDebug(nowText() + 'Final-Check: isFindMember = ' + this.isFindMember + ', isFindClass = ' + this.isFindClass + ' , isFindMethod = ' + this.isFindMethod + ' , isFindEnum = ' + this.isFindEnum);

		const classPattern = this.getSpecificConfigValue('class.definition', false).replace(SearchTextHolderReplaceRegex, currentWord);
		this.classDefinitionRegex = classPattern.length < 1 ? EmptyRegex : new RegExp(classPattern);

		const methodPattern = this.getSpecificConfigValue('method.definition', false).replace(SearchTextHolderReplaceRegex, currentWord);
		this.methodDefinitionRegex = methodPattern.length < 1 ? EmptyRegex : new RegExp(methodPattern);

		const memberPattern = this.getSpecificConfigValue('member.definition', false).replace(SearchTextHolderReplaceRegex, currentWord);
		this.memberDefinitionRegex = memberPattern.length < 1 ? EmptyRegex : new RegExp(memberPattern);

		const enumPattern = this.getSpecificConfigValue('enum.definition', false).replace(SearchTextHolderReplaceRegex, currentWord);
		this.enumDefinitionRegex = enumPattern.length < 1 ? EmptyRegex : new RegExp(enumPattern);

		outputDebug('promoteFolderScore = ' + this.promoteFolderScore + ' , promoteFolderPattern = "' + this.promoteFolderRegex.source + '"');
		outputDebug('promotePathScore = ' + this.promotePathScore + ' , promotePathPattern = "' + this.promotePathRegex.source + '"');
		outputDebug('demoteFolderScore = ' + this.demoteFolderScore + ' , demoteFolderPattern = "' + this.demoteFolderRegex.source + '"');
		outputDebug('demotePathScore = ' + this.demotePathScore + ' , demotePathPattern = "' + this.demotePathRegex.source + '"');

		outputDebug('isFindConstant = ' + this.isFindConstant + ' , isConstantPattern = "' + MyConfig.DefaultConstantsRegex.source + '" , nonConstRegex = "' + this.methodQuoteRegex.source + '"');
		outputDebug('isFindClass = ' + this.isFindClass + ' , isClassPattern = "' + this.isFindClassRegex.source + '"');
		outputDebug('isFindEnum = ' + this.isFindEnum + ' , isEnumPattern = "' + this.isFindEnumRegex.source + '"');
		outputDebug('isFindMethod = ' + this.isFindMethod + ' , isMethodPattern = "' + this.isFindMethodRegex.source + '"');
		outputDebug('isFindMember = ' + this.isFindMember + ' , isMemberPattern = "' + this.isFindMemberRegex.source + '"');
		outputDebug('isFindClassOrEnum = ' + this.isFindClassOrEnum + ' , isClassOrEnumPattern = "' + this.isFindClassOrEnumRegex.source + '"');

		outputDebug('isClassResultRegex = "' + this.isClassResultRegex.source + '"');
		outputDebug('isEnumResultRegex = "' + this.isEnumResultRegex.source + '"');
		outputDebug('isMethodResultRegex = "' + this.isMethodResultRegex.source + '"');

		outputDebug('classDefinitionRegex = "' + this.classDefinitionRegex.source + '"');
		outputDebug('methodDefinitionRegex = "' + this.methodDefinitionRegex.source + '"');
		outputDebug('memberDefinitionRegex = "' + this.memberDefinitionRegex.source + '"');
		outputDebug('enumDefinitionRegex = "' + this.enumDefinitionRegex.source + '"');

		outputDebug('scoreWordsText = ' + this.scoreWordsText);
		outputDebug('promoteSelfFileMatchScore = ' + this.promoteSelfFileMatchScore);
		outputDebug(nowText() + 'scoreWordSet[' + this.scoreWordSet.size + '] = ' + Array.from(this.scoreWordSet).join(' '));
	}

	private getCheckingRegex(configKeyTail: string, allowEmpty: boolean): RegExp {
		const rawPattern = getConfigValue(this.rootFolderName, this.extension, this.mappedExt, configKeyTail, allowEmpty);
		const pattern = rawPattern.replace(SearchTextHolderReplaceRegex, this.currentWord);
		return createRegex(pattern);
	}

	private getScoreText(): string {
		const leftPart = this.currentText.substring(0, this.currentWordRange.start.character);
		const expandLeftRegex = this.isFindMethod ? /[=\s\w\.:<>-]+$/ : /[\w\.:<>-]+$/;
		const expandMethodLeftRegex = this.isFindMethod && this.findType === FindType.Definition
			? new RegExp('[\\w\\.:<>-]*\\w+\\s*\\(.*?\\)\\s*(->|\\.)\\s*$')
			: EmptyRegex;

		const leftMethodMatch = expandMethodLeftRegex.exec(leftPart);
		if (this.isFindMethod && this.findType === FindType.Definition) {
			if (new RegExp("\\b(this|self)(->|\\.)$").test(leftPart)) {
				this.promoteSelfFileMatchScore = 200;
			} else if (new RegExp("\\s+$").test(leftPart)) {
				this.promoteSelfFileMatchScore = 50;
			} else {
				this.promoteSelfFileMatchScore = 5;
			}
		}

		const leftMatch = this.isFindMethod
			? leftMethodMatch || expandLeftRegex.exec(leftPart)
			: expandLeftRegex.exec(leftPart);

		const leftMatchedText = leftMatch ? leftMatch[0] : '';

		const rightPart = this.currentText.substring(this.currentWordRange.end.character);
		const expandRightRegex = /^[\w\.:<>-]+/;
		const rightMatch = expandRightRegex.exec(rightPart);
		const rightMatchedText = rightMatch ? rightMatch[0] : '';

		let scoreText = leftMatchedText + this.currentWord;
		if (this.isFindClass || this.isFindMethod) {
			scoreText += rightPart;
		} else {
			scoreText += rightMatchedText;
		}

		return scoreText.trim();
	}

	private getSpecificConfigValue(configKeyTail: string, addDefault: boolean = true, allowEmpty: boolean = true): string {
		let prefixes = GetConfigPriorityPrefixes(this.rootFolderName, this.extension, this.mappedExt, addDefault);
		const pattern = getOverrideConfigByPriority(prefixes, configKeyTail, allowEmpty) as string || '';
		if (!isNullOrEmpty(pattern) && configKeyTail.includes('definition') && !configKeyTail.includes('skip') && pattern.indexOf(SearchTextHolder) < 0) {
			const keys = prefixes.join('.' + configKeyTail + ' or ');
			outputError(nowText() + 'Not found word-holder: "' + SearchTextHolder + '" in search option, please check configuration of ' + keys + ', searchPattern = ' + pattern);
			return '';
		}

		return pattern;
	}

	public getFileNamePatternAndSearchOption(
		extension: string,
		configKeyName: string,
		parsedFile: ParsedPath): [string, string] {
		const MyConfig = getConfig();

		let specificPatterns = new Set<string>();
		if (configKeyName === 'definition') {
			if (this.isFindClass || this.isFindClassOrEnum) {
				specificPatterns.add(this.getSpecificConfigValue('class.definition'));
			}

			if (this.isFindConstant) {
				specificPatterns.add(this.getSpecificConfigValue('constant.definition'));
				if (this.currentText.indexOf(this.currentWord + '.') >= 0) {
					specificPatterns.add(this.getSpecificConfigValue('class.definition'));
				}
			}

			if (this.isFindEnum) {
				specificPatterns.add(this.getSpecificConfigValue('enum.definition'));
			}

			if (this.isFindMember) {
				specificPatterns.add(this.getSpecificConfigValue('member.definition'));

				// For languages that can omit quotes for methods: this.mappedExt.match(/py|java/)
				if (this.extension.match(/py|scala/)) {
					specificPatterns.add(this.getSpecificConfigValue('method.definition'));
				}
			}

			if (this.isFindMethod) {
				specificPatterns.add(this.getSpecificConfigValue('method.definition'));
			}

			specificPatterns.delete('');
			if (specificPatterns.size < 1) {
				specificPatterns.add(this.getSpecificConfigValue('definition', false, false));
				specificPatterns.delete('');
			}

			// Default: Will be slower if more items.
			if (specificPatterns.size < 1) { // if (this.isEnumOrMember) {
				specificPatterns.add(this.getSpecificConfigValue('class.definition'));
				specificPatterns.add(this.getSpecificConfigValue('member.definition'));
				specificPatterns.add(this.getSpecificConfigValue('method.definition'));
			}
			else if (this.isFindMember && !this.isFindClass) {
				if (this.currentWord.match(/^[A-Z][a-z]+\w+/) && new RegExp('\\w+\.' + this.currentWord + '\\b').test(this.currentText)) {
					specificPatterns.add(this.getSpecificConfigValue('class.definition'));
				}
			}

			specificPatterns.delete('');
		}

		let searchPattern = this.getSpecificConfigValue(configKeyName, this.findType !== FindType.Definition, false);

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
				if (specificPatterns.size < 1) {
					const generalPattern = getOverrideConfigByPriority(['default', ''], configKeyName, false);
					if (!isNullOrEmpty(generalPattern)) {
						specificPatterns.add(generalPattern);
					}
				}

				specificPatterns.delete('');
				const specificPatternList = Array.from(specificPatterns); //.filter(a => a !== undefined);
				if (specificPatternList.length > 0) {
					searchPattern = specificPatternList.join('|');
				}
			}
		}

		if (isNullOrEmpty(searchPattern)) {
			searchPattern = "-t Not-Found-SearchPattern";
			outputError(nowText() + 'Not found search pattern for search word: ' + this.currentWord);
		} else {
			searchPattern = '-t "' + searchPattern + '"';
		}

		const skipPattern = this.findType === FindType.Definition ? this.getSkipPatternForDefinition() : '';
		if (skipPattern.length > 1) {
			searchPattern += ' --nt "' + skipPattern + '"';
		}

		filePattern = '"' + filePattern + '"';
		return [filePattern, searchPattern];
	}

	public getSkipPatternForDefinition() {
		let skipPatternSet = new Set<string>();
		if (this.isFindClass) {
			skipPatternSet.add(this.getSpecificConfigValue('class.skip.definition'));
		}

		if (this.isFindMember && !this.isFindEnum) {
			skipPatternSet.add(this.getSpecificConfigValue('member.skip.definition'));
		}

		if (this.isFindEnum) {
			skipPatternSet.add(this.getSpecificConfigValue('enum.skip.definition'));
		}

		if (this.isFindMethod) {
			skipPatternSet.add(this.getSpecificConfigValue('method.skip.definition'));
		}

		skipPatternSet.delete('');

		if (skipPatternSet.size < 1) {
			skipPatternSet.add(this.getSpecificConfigValue('skip.definition'));
		}

		skipPatternSet.delete('');
		return Array.from(skipPatternSet).join('|');
	}

	public getTypeAndScore(resultFilePath: string, resultText: string): [ResultType, Number] {
		if (this.findType !== FindType.Definition) {
			return [ResultType.Other, 1];
		}

		let score = 1;
		const isSameFile = resultFilePath === this.currentFilePath;
		const isInSameFolder = path.dirname(resultFilePath) === this.currentFile.dir;
		const boostFactor = isSameFile ? 2 : (isInSameFolder ? 1.5 : 1);

		if (this.isFindConstant) {
			if (this.isConstantResultRegex.test(resultText)) {
				score += 100 * boostFactor;
			}
		}

		if (this.isFindEnum || this.isFindMember || this.isFindClass) {
			if (this.enumOrConstantValueRegex.test(resultText)) {
				score += 100 * boostFactor;
			}
		}

		const hasMatchedClass = resultText.match(this.classDefinitionRegex);
		if (this.isFindMember) {
			if (!hasMatchedClass && !resultText.match(/[\(\)]/)) {
				score += 500 * boostFactor;
			}
		}

		const parsedResultPath = path.parse(resultFilePath);
		if (!resultText.match('^\\s*(//|#)') && parsedResultPath.name.endsWith('.md')) {
			score += 100 * boostFactor;
		}

		// Reduce score of sentences which contains keywords
		if (resultText.replace(/\s*[,;\.]\s*/, '').match(/(\w+ ){7,}/)) {
			score -= 500 * boostFactor;
		}

		if (!resultText.match(/;\s*$/)) {
			score += 20 * boostFactor;
		}

		if (!parsedResultPath.name.match(/test/i)) {
			score += 500 * boostFactor;
		}

		if (!resultFilePath.match(/test/i)) {
			score += 300 * boostFactor;
		}

		if (!parsedResultPath.name.match(/Mock/i)) {
			score += 300 * boostFactor;
		}

		if (!resultFilePath.match(/Mock/i)) {
			score += 200 * boostFactor;
		}

		// if not interface in file name
		if (!parsedResultPath.name.match(/^I[A-Z][a-z]/)) {
			score += 100 * boostFactor;
		}

		// if not interface
		if (!resultText.match(/\s+(interface|abstract)\s+/)) {
			score += 100 * boostFactor;
		}

		if (resultText.match(/^\s*public\s+/)) {
			score += 200 * boostFactor;
		}

		if (resultText.match(/^\s*(internal)\s+/)) {
			score += 30 * boostFactor;
		}

		if (resultText.match(/^\s*(protected)\s+/)) {
			score += 20 * boostFactor;
		}

		if (resultText.match(/^\s*(private)\s+/)) {
			score += 10 * boostFactor;
		}

		if (resultText.match(/^\s*(\w+\s+)?static\s+/)) {
			score += 30 * boostFactor;
		}

		if (resultText.match(/^\s*(\w+\s+)?(readonly|const)\s+/)) {
			score += 50 * boostFactor;
		}

		if (!parsedResultPath.name.match(/\.(json|xml|ya?ml|ini|config|md|txt)$|readme/i)) {
			score += 100 * boostFactor;
		}

		if (resultText.match(/^\boverride\b/)) {
			score += 50 * boostFactor;
		}

		const resultFileNameWordSet = getAllSingleWords(parsedResultPath.name);
		const resultWordSet = getAllSingleWords(resultText);
		const resultFilePathWordSet = getAllSingleWords(resultFilePath);

		this.highScoreWordSet.forEach(a => {
			if (resultFileNameWordSet.has(a)) {
				score += 200 * boostFactor;
			}
		});

		this.highScoreWordSet.forEach(a => {
			if (resultWordSet.has(a)) {
				score += 50 * boostFactor;
			}
		});

		this.currentWordSet.forEach(a => {
			if (resultFileNameWordSet.has(a)) {
				score += 100 * boostFactor;
			}
		});

		this.scoreWordSet.forEach(a => {
			if (resultFileNameWordSet.has(a)) {
				score += 50 * boostFactor;
			}
		});

		this.currentFileNameWordSet.forEach(a => {
			if (resultFileNameWordSet.has(a)) {
				score += this.promoteSelfFileMatchScore / 10;
			}
		});

		this.scoreWordSet.forEach(a => {
			if (resultWordSet.has(a)) {
				score += 10 * boostFactor;
			}
		});

		this.scoreWordSet.forEach(a => {
			if (resultFilePathWordSet.has(a)) {
				score += 5 * boostFactor;
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

		let type = ResultType.Other;
		if (this.isClassResultRegex.test(resultText)) {
			score += (this.isFindClass ? 200 : 20) * boostFactor;
			type = ResultType.Class;
		} else if (this.isEnumResultRegex.test(resultText)) {
			score += (this.isFindEnum ? 200 : 20) * boostFactor;
			type = ResultType.Enum;
		} else if (this.isMethodResultRegex.test(resultText)) {
			type = ResultType.Method;
			if (this.mappedExt === 'cpp' && FindType.Definition === this.findType && !/;\s*$/.test(resultText)) {
				score *= 100;
			}
		} else if (this.isInterfaceResultRegex.test(resultText)) {
			type = ResultType.Interface;
			score *= 10;
		}
		return [type, score];
	}
}
