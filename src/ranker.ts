import { ParsedPath } from 'path';
import * as vscode from 'vscode';
import { GetConfigPriorityPrefixes, getConfigValueByRoot, getOverrideConfigByPriority, getSubConfigValue } from './configUtils';
import { SearchTextHolder } from './constants';
import { getConfig, MappedExtToCodeFilePatternMap, MyConfig } from './dynamicConfig';
import { FindType, ForceFindType } from './enums';
import { ForceSetting } from './forceSettings';
import { outputDebug, outputError } from './outputUtils';
import { EmptyRegex, getAllSingleWords } from './regexUtils';
import { ResultType } from './ScoreTypeResult';
import { SearchChecker } from './searchChecker';
import { getRootFolderName, isNullOrEmpty, nowText } from './utils';
import path = require('path');

export class Ranker {
	public searchChecker: SearchChecker;
	public isOneFileOrFolder: boolean;
	public canRunCommandInTerminalWhenNoResult: boolean = false;
	public canRunCommandInTerminalWhenManyResults: boolean = true;
	public rootFolderName: string;

	public scoreWordsText: string;
	private scoreWordSet: Set<string>;
	private isFindClass: boolean;
	private isFindMethod: boolean;
	private isFindMember: boolean;
	private isFindConstant: boolean = false;
	private isFindEnum: boolean;
	private isFindClassOrEnum: boolean;
	private isFindClassOrMethod: boolean;

	private currentWordSet: Set<string>;
	private currentFileNameWordSet: Set<string>;
	private currentFilePathWordSet: Set<string>;
	private highScoreWordSet: Set<string> = new Set<string>();
	private ForceSetting: ForceSetting;
	private currentWord: string;
	private promoteSelfFileMatchScore: number = 200;

	constructor(searchChecker: SearchChecker, isOneFileOrFolder = false, forceFindType: ForceFindType = ForceFindType.None) {
		this.searchChecker = searchChecker;
		this.currentWord = searchChecker.currentWord;
		this.isOneFileOrFolder = isOneFileOrFolder;
		this.ForceSetting = new ForceSetting(forceFindType);
		const MyConfig = getConfig();
		this.rootFolderName = getRootFolderName(searchChecker.currentFilePath);

		this.isFindClass = this.ForceSetting.hasFlag(ForceFindType.FindClass) && searchChecker.isFindClass;
		this.isFindMethod = this.ForceSetting.hasFlag(ForceFindType.FindMethod) && searchChecker.isFindMethod;
		this.isFindMember = this.ForceSetting.hasFlag(ForceFindType.FindMember) && searchChecker.isFindMember;
		this.isFindEnum = !this.ForceSetting.isFindClassOrMethod() && searchChecker.isFindEnum;
		this.isFindClassOrEnum = !this.ForceSetting.isFindClassOrMethod() && searchChecker.isFindClassOrEnum;
		this.isFindClassOrMethod = this.ForceSetting.hasAnyFlag([ForceFindType.FindClass, ForceFindType.FindMethod]) && searchChecker.isFindClassOrMethod;
		this.isFindConstant = this.searchChecker.isFindConstant;

		this.scoreWordsText = this.getScoreText();
		this.scoreWordSet = getAllSingleWords(this.scoreWordsText);
		this.currentWordSet = getAllSingleWords(this.currentWord);
		this.currentFileNameWordSet = getAllSingleWords(searchChecker.currentFile.name);
		this.scoreWordSet = getAllSingleWords(this.scoreWordsText);

		this.currentFilePathWordSet = getAllSingleWords(searchChecker.currentFilePath);
		const highScoreRegex = new RegExp('(\\w+)(?:\\.|::|->)' + this.currentWord + '\\b' + '|' + '\\b(' + this.currentWord + ')(?:\\.|::|->)\\w+');
		const highScoreMatch = highScoreRegex.exec(searchChecker.currentText);
		if (highScoreMatch) {
			if (highScoreMatch[1]) {
				getAllSingleWords(highScoreMatch[1]).forEach(a => this.highScoreWordSet.add(a));
			}

			if (highScoreMatch[2]) {
				getAllSingleWords(highScoreMatch[2]).forEach(a => this.highScoreWordSet.add(a));
			}
		}

		outputDebug('IsJustFindingClassOrMethod = ' + this.ForceSetting.isFindClassOrMethod());
		if (!this.ForceSetting.isFindClassOrMethod()) {
			outputDebug('isFindConstant = ' + this.isFindConstant + ' , isConstantPattern = "' + MyConfig.DefaultConstantsRegex.source
				+ '" , nonConstRegex = "' + searchChecker.methodQuoteRegex.source + '"');
			outputDebug('isFindClass = ' + this.isFindClass + ' , isClassPattern = "' + searchChecker.isFindClassRegex.source + '"');
			outputDebug('isFindEnum = ' + this.isFindEnum + ' , isEnumPattern = "' + searchChecker.isFindEnumRegex.source + '"');
			outputDebug('isFindMethod = ' + this.isFindMethod + ' , isMethodPattern = "' + searchChecker.isFindMethodRegex.source + '"');
			outputDebug('isFindMember = ' + this.isFindMember + ' , isMemberPattern = "' + searchChecker.isFindMemberRegex.source + '"');
			outputDebug('isFindClassOrEnum = ' + this.isFindClassOrEnum + ' , isClassOrEnumPattern = "' + searchChecker.isFindClassOrEnumRegex.source + '"');
			outputDebug('isFindClassOrMethod = ' + this.isFindClassOrMethod + ' , isFindClassOrMethodPattern = "' + searchChecker.isFindClassOrMethodRegex.source + '"');
			outputDebug('isOnlyFindClass = ' + searchChecker.isOnlyFindClass + ' , isOnlyFindMember = ' + searchChecker.isOnlyFindMember);
			outputDebug('scoreWordsText = ' + this.scoreWordsText);
		}

		outputDebug(nowText() + 'scoreWordSet[' + this.scoreWordSet.size + '] = ' + Array.from(this.scoreWordSet).join(' '));
		outputDebug(nowText() + 'Final-Check: isFindMember = ' + this.isFindMember + ', isFindClass = ' + this.isFindClass + ' , isFindMethod = ' + this.isFindMethod + ' , isFindEnum = ' + this.isFindEnum);
	}

	private getScoreText(): string {
		const leftPart = this.searchChecker.currentText.substring(0, this.searchChecker.currentWordRange.start.character);
		const expandLeftRegex = this.isFindMethod ? /[=\s\w\.:<>-]+$/ : /[\w\.:<>-]+$/;
		const expandMethodLeftRegex = this.isFindMethod && this.searchChecker.findType === FindType.Definition
			? new RegExp('[\\w\\.:<>-]*\\w+\\s*\\(.*?\\)\\s*(->|\\.)\\s*$')
			: EmptyRegex;

		const leftMethodMatch = expandMethodLeftRegex.exec(leftPart);
		if (this.isFindMethod && this.searchChecker.findType === FindType.Definition) {
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

		const rightPart = this.searchChecker.currentText.substring(this.searchChecker.currentWordRange.end.character);
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

	public getConfigValue(configKeyTail: string, addDefault: boolean = true, allowEmpty: boolean = true): string {
		let prefixes = this.searchChecker.ForceUseDefaultFindingDefinition
			? GetConfigPriorityPrefixes(this.rootFolderName, '', '', true)
			: GetConfigPriorityPrefixes(this.rootFolderName, this.searchChecker.extension, this.searchChecker.mappedExt, addDefault);
		const pattern = getOverrideConfigByPriority(prefixes, configKeyTail, allowEmpty) as string || '';
		if (!isNullOrEmpty(pattern) && configKeyTail.includes('definition') && !configKeyTail.includes('skip') && pattern.indexOf(SearchTextHolder) < 0) {
			const keys = prefixes.join('.' + configKeyTail + ' or ');
			outputError(nowText() + 'Not found word-holder: "' + SearchTextHolder + '" in search option, please check configuration of ' + keys + ', searchPattern = ' + pattern);
			return '';
		}

		return pattern;
	}

	public getSubConfigValue(subKey: string, configKeyTail: string, _addDefault: boolean = true, allowEmpty: boolean = true): string {
		const pattern = this.searchChecker.ForceUseDefaultFindingDefinition
			? getSubConfigValue(this.rootFolderName, '', '', subKey, configKeyTail, allowEmpty)
			: getSubConfigValue(this.rootFolderName, this.searchChecker.extension, this.searchChecker.mappedExt, subKey, configKeyTail, allowEmpty);
		if (!isNullOrEmpty(pattern) && configKeyTail.includes('definition') && !configKeyTail.includes('skip') && pattern.indexOf(SearchTextHolder) < 0) {
			const keys = subKey + '.' + configKeyTail;
			outputError(nowText() + 'Not found word-holder: "' + SearchTextHolder + '" in search option, please check configuration of ' + keys + ', searchPattern = ' + pattern);
			return '';
		}

		return pattern;
	}

	public getFileNamePatternAndSearchOption(
		extension: string,
		configKeyName: string,
		parsedFile: ParsedPath): [string, string] {
		const config = getConfig();
		let specificPatterns = new Set<string>();
		if (configKeyName === 'definition') {
			if (this.searchChecker.isUpperCaseWord) {
				specificPatterns.add('^\\s*[a-z\\s]{0,30}\\b' + this.currentWord + '\\s*=\\s*\\S+');
			}

			if (this.isFindConstant) {
				specificPatterns.add(this.getSubConfigValue('constant', 'definition'));
				if (this.searchChecker.currentText.indexOf(this.currentWord + '.') >= 0) {
					specificPatterns.add(this.getSubConfigValue('class', 'definition'));
				}
			} else {
				if (this.isFindClass || this.isFindClassOrEnum) {
					specificPatterns.add(this.getSubConfigValue('class', 'definition'));
				}

				if (this.isFindEnum || this.searchChecker.maybeEnum) {
					specificPatterns.add(this.getSubConfigValue('enum', 'definition'));
				}

				if (this.isFindMember) {
					specificPatterns.add(this.getSubConfigValue('member', 'definition'));

					// For languages that can omit quotes for methods:
					if (this.searchChecker.extension.match(/py|scala/)) {
						specificPatterns.add(this.getSubConfigValue('method', 'definition'));
					}
				}

				if (this.isFindMethod) {
					specificPatterns.add(this.getSubConfigValue('method', 'definition'));
				}

				if (this.isFindClassOrMethod) {
					specificPatterns.add(this.getSubConfigValue('class', 'definition'));
					specificPatterns.add(this.getSubConfigValue('method', 'definition'));
				}
			}

			specificPatterns.delete('');
			if (specificPatterns.size < 1) {
				specificPatterns.add(this.getConfigValue('definition', false, false));

				// Default: Will be slower if more items.
				// specificPatterns.add(this.getSpecificConfigValue('class.definition'));
				// specificPatterns.add(this.getSpecificConfigValue('method.definition'));
			}
			// else if (this.isFindMember && !this.isFindClass) {
			// 	if (this.currentWord.match(/^[A-Z][a-z]+\w+/) && new RegExp('\\w+\.' + this.currentWord + '\\b').test(this.searchChecker.currentText)) {
			// 		specificPatterns.add(this.getSpecificConfigValue('class.definition'));
			// 	}
			// }

			specificPatterns.delete('');
		}

		let searchPattern = this.getConfigValue(configKeyName, this.searchChecker.findType !== FindType.Definition, false);

		const rootConfig = vscode.workspace.getConfiguration('msr');
		const codeFilesKey = this.searchChecker.mappedExt === 'ui' ? 'default.codeFilesPlusUI' : 'default.codeFiles';
		let filePattern = MappedExtToCodeFilePatternMap.get(this.searchChecker.mappedExt) || '\\.' + extension + '$';
		const searchAllFilesForReferences = getConfigValueByRoot(this.rootFolderName, extension, this.searchChecker.mappedExt, 'searchAllFilesForReferences') === 'true';
		const searchAllFilesForDefinition = getConfigValueByRoot(this.rootFolderName, extension, this.searchChecker.mappedExt, 'searchAllFilesForDefinitions') === 'true';
		if (searchAllFilesForReferences && configKeyName === 'reference') {
			filePattern = rootConfig.get('default.allFiles') as string;
			const defaultFindRef = rootConfig.get('default.reference') as string;
			if (defaultFindRef.length > 1) {
				searchPattern = defaultFindRef;
			}

			if (/^\W/.test(this.currentWord) && searchPattern.startsWith('\\b')) {
				searchPattern = searchPattern.substring(2);
			}

			if (/\W$/.test(this.currentWord) && searchPattern.endsWith('\\b')) {
				searchPattern = searchPattern.substring(0, searchPattern.length - 2);
			}
		} else if (searchAllFilesForDefinition && configKeyName === 'definition') {
			filePattern = rootConfig.get(codeFilesKey) as string;
			const defaultFindDefinitionPattern = rootConfig.get('default.definition') as string;
			if (defaultFindDefinitionPattern.length > 1) {
				searchPattern = defaultFindDefinitionPattern;
			}
		}

		if (!searchAllFilesForDefinition && !searchAllFilesForReferences) {
			if (config.ConfigAndDocFilesRegex.test(parsedFile.base)) {
				filePattern = configKeyName === 'definition'
					? rootConfig.get(codeFilesKey) as string
					: config.CodeAndConfigAndDocFilesRegex.source;
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

		const skipPattern = this.searchChecker.findType === FindType.Definition ? this.getSkipPatternForDefinition() : '';
		if (skipPattern.length > 1 && !this.searchChecker.isOnlyFindClass) {
			searchPattern += ' --nt "' + skipPattern + '"';
		}

		if (this.searchChecker.ForceUseDefaultFindingDefinition) {
			filePattern = getConfigValueByRoot(this.rootFolderName, '', '', 'codeFiles', false, true)
				|| getConfigValueByRoot(this.rootFolderName, '', '', 'allFiles', false, true);
		} else if (MyConfig.isUnknownFileType(this.searchChecker.currentFile.ext)) {
			let patternSet = new Set<string>([
				getConfigValueByRoot(this.rootFolderName, 'default', '', 'codeFiles', false),
				'\\.' + extension + '$'
			]);
			patternSet.delete('');
			filePattern = Array.from(patternSet).join('|');
		}

		filePattern = '"' + filePattern + '"';
		return [filePattern, searchPattern];
	}

	public getSkipPatternForDefinition() {
		let skipPatternSet = new Set<string>();
		if (!this.isFindConstant) {
			if (this.isFindClass && !this.isFindMember && !this.isFindMethod && !this.isFindClassOrMethod) {
				skipPatternSet.add(this.getSubConfigValue('class', 'skip.definition'));
			}

			if (this.isFindMember && !this.isFindEnum && !this.isFindMethod && !this.isFindClass && !this.isFindClassOrEnum && !this.isFindClassOrMethod) {
				skipPatternSet.add(this.getSubConfigValue('member', 'skip.definition'));
			}

			if (this.isFindEnum && !this.isFindClass && !this.isFindMethod && !this.isFindMember && !this.isFindClassOrMethod) {
				skipPatternSet.add(this.getSubConfigValue('enum', 'skip.definition'));
			}

			if (this.isFindMethod && !this.isFindClass && !this.isFindClassOrEnum && !this.isFindMember && !this.isFindEnum && !this.isFindClassOrMethod) {
				skipPatternSet.add(this.getSubConfigValue('method', 'skip.definition'));
			}
		}

		skipPatternSet.delete('');

		if (skipPatternSet.size < 1) {
			skipPatternSet.add(this.getConfigValue('skip.definition'));
		}

		skipPatternSet.delete('');
		return Array.from(skipPatternSet).join('|');
	}

	public getTypeAndScore(position: vscode.Position, resultFilePath: string, resultText: string): [ResultType, Number] {
		if (this.searchChecker.findType !== FindType.Definition) {
			return [ResultType.None, 1];
		}

		const rowSub = position.line - this.searchChecker.Position.line;
		if (resultFilePath === this.searchChecker.currentFilePath) {
			if (rowSub === 0) {
				return [ResultType.None, 0];
			}

			if (!MyConfig.isScriptFile(this.searchChecker.extension) && this.searchChecker.isMethodResultRegex.test(resultText)) {
				if (rowSub < 0 && rowSub >= -5) {
					return [ResultType.None, 0];
				}

				if (rowSub < 0 && rowSub >= -16 && !this.ForceSetting.FindLocalVariableDefinition) {
					let brackets = 0;
					for (let r = position.line + 1; brackets < 2 && r < this.searchChecker.Position.line; r++) {
						const line = this.searchChecker.Document.lineAt(r);
						if (line.text.match(/^\s*\{/)) {
							brackets += 1;
						}
					}

					if (brackets < 2) {
						return [ResultType.None, 0];
					}
				}
			}
		}

		// Skip c++ function definition:
		if (this.searchChecker.mappedExt === 'cpp') {
			if (resultText.match(/;\s*$/)) {
				return [ResultType.Interface, 0];
			}
		}

		let score = 1;
		const isSameFile = resultFilePath === this.searchChecker.currentFilePath;
		const isInSameFolder = path.dirname(resultFilePath) === this.searchChecker.currentFile.dir;
		const boostFactor = isSameFile ? 2 : (isInSameFolder ? 1.5 : 1);

		if (this.isFindConstant) {
			if (this.searchChecker.isConstantResultRegex.test(resultText)) {
				score += 100 * boostFactor;
			}
		}

		if (this.isFindEnum || this.isFindMember || this.isFindClass) {
			if (this.searchChecker.enumOrConstantValueRegex.test(resultText)) {
				score += 100 * boostFactor;
			}
		}

		const hasMatchedClass = resultText.match(this.searchChecker.classDefinitionRegex);
		if (this.isFindMember) {
			if (!hasMatchedClass && !resultText.match(new RegExp('\\b' + this.currentWord + '\\s*\\('))) {
				score += 500 * boostFactor;
			}
		}

		const parsedResultPath = path.parse(resultFilePath);
		if (!resultText.match('^\\s*(//|#)') && parsedResultPath.ext.endsWith('.md')) {
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

		// if not virtual method + not interface or declaration.
		if (!resultText.match(/\s+(interface|abstract|virtual)\s+|;/)) {
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

		if (resultText.match(/^\s*([a-z]+\s+)?(readonly|const|final|val)\s+/)) {
			score += 200 * boostFactor;
		}
		else if (resultText.match(new RegExp('^\\s*' + this.currentWord + '\\s*,?\\s*$'))) {
			score += 50 * boostFactor;
		}
		else if (resultText.match(new RegExp('^\\s*' + this.currentWord + '\\s*='))) {
			if (this.searchChecker.enumOrConstantValueRegex.test(resultText)) {
				score += 200 * boostFactor;
			} else {
				score -= 500 * boostFactor;
			}
		}

		if (!parsedResultPath.ext.match(/\.(json|xml|ya?ml|ini|config|md|txt)$|readme/i)) {
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

		if (parsedResultPath.name.toLowerCase().includes(this.searchChecker.fileNameHighScoreWord.toLowerCase())) {
			score += 300 * boostFactor;
			if (this.searchChecker.classFileNameScoreRegex.test(parsedResultPath.name)) {
				score += 300 * boostFactor;
			}
		}

		const headSpaces = /^\s+/.exec(resultText);
		if (headSpaces) {
			score -= headSpaces[0].length * 3;
		}

		if (parsedResultPath.dir === this.searchChecker.currentFile.dir) {
			score += this.promoteSelfFileMatchScore / 5;
		}

		if (parsedResultPath.base === this.searchChecker.currentFile.base) {
			score += parsedResultPath.dir === this.searchChecker.currentFile.dir
				? this.promoteSelfFileMatchScore
				: this.promoteSelfFileMatchScore / 5;
		}

		if (this.searchChecker.promoteFolderRegex.source !== EmptyRegex.source || this.searchChecker.demoteFolderRegex.source !== EmptyRegex.source) {
			parsedResultPath.dir.split(/[\\/]/).forEach(a => {
				if (this.searchChecker.promoteFolderRegex.test(a)) {
					score += this.searchChecker.promoteFolderScore;
				}

				if (this.searchChecker.demoteFolderRegex.test(a)) {
					score -= this.searchChecker.demoteFolderScore;
				}
			});
		}

		if (this.searchChecker.promotePathRegex.source !== EmptyRegex.source || this.searchChecker.demotePathRegex.source !== EmptyRegex.source) {
			if (this.searchChecker.promotePathRegex.test(resultFilePath)) {
				score += this.searchChecker.promotePathScore;
			}

			if (this.searchChecker.demotePathRegex.test(resultFilePath)) {
				score -= this.searchChecker.demotePathScore;
			}
		}

		let type = ResultType.None;
		const isFindingMember = this.isFindMember || this.searchChecker.isFindMember;
		if (this.searchChecker.isClassResultRegex.test(resultText)) {
			score += (this.isFindClass ? 200 : 20) * boostFactor;
			type = ResultType.Class;
		} else if (this.searchChecker.isEnumResultRegex.test(resultText)) {
			score += (this.isFindEnum ? 200 : 20) * boostFactor;
			type = ResultType.Enum;
		} else if (this.searchChecker.isMethodResultRegex.test(resultText)) {
			type = ResultType.Method;
			if (this.searchChecker.mappedExt === 'cpp' && FindType.Definition === this.searchChecker.findType && !/;\s*$/.test(resultText)) {
				score *= 100;
			}
		} else if (this.searchChecker.isInterfaceResultRegex.test(resultText)) {
			type = ResultType.Interface;
			score *= 10;
		} else if (this.searchChecker.isConstantResultRegex.test(resultText)) {
			type = ResultType.ConstantValue;
			score += 100 * boostFactor;
		}

		if (!this.searchChecker.isInTestPath && resultFilePath.match(/test/i)) {
			score -= 300 * boostFactor;
			// return [type, 0]; // avoid no results for test folder/repo.
		}

		if (ResultType.None === type) {
			if (this.searchChecker.isLocalVariableResultRegex.test(resultText)) {
				type = ResultType.LocalVariable;
				score += 10;
				if (this.searchChecker.isFindMemberOrLocalVariable || this.searchChecker.isProbablyFindLocalVariable) {
					return [type, score];
				}
			}
		}

		if (this.searchChecker.isOnlyFindMember && (ResultType.Class === type || ResultType.Method === type)) {
			return [type, 0];
		}

		if (this.searchChecker.isOnlyFindClass && (ResultType.Class !== type && ResultType.Enum !== type && ResultType.ConstantValue !== type)) {
			return [type, 0];
		}

		if (ResultType.None === type) {
			const isMemberResult = this.searchChecker.isMemberResultRegex.test(resultText);
			if (isMemberResult) {
				type = ResultType.Member;
			}

			if (isFindingMember && !isMemberResult) {
				if (this.searchChecker.maybeEnum && this.searchChecker.maybeEnumResultRegex.test(resultText)) {
					// may be enum result.
					type = ResultType.ConstantValue;
				} else {
					return [type, 0];
				}
			}

			if (!isFindingMember && isMemberResult && this.ForceSetting.ForceFind !== ForceFindType.None) {
				if (!this.searchChecker.maybeFindLocalVariable && !this.searchChecker.isFindMemberOrLocalVariable) {
					return [type, 0];
				}
			}

			if (ResultType.None !== type) {
				score += 10;
			}
		}

		if (ResultType.None === type) {
			return [type, 0];
		}

		if (this.isFindClassOrMethod
			&& ![ResultType.Class, ResultType.Enum, ResultType.Method, ResultType.ConstantValue].includes(type)
			&& !this.ForceSetting.FindLocalVariableDefinition) {
			if (ResultType.Member !== type && !this.searchChecker.maybeEnum) {
				return [type, 0];
			}
		}

		// score -= resultFilePath.length;
		return [type, score];
	}
}
