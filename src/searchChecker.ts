import { ParsedPath } from 'path';
import * as vscode from 'vscode';
import { GetConfigPriorityPrefixes, getConfigValueByPriorityList, getConfigValueByProjectAndExtension } from './configUtils';
import { SearchTextHolder } from './constants';
import { getConfig, MyConfig } from './dynamicConfig';
import { FindType, ForceFindType } from './enums';
import { ForceSetting } from './forceSettings';
import { outputDebug, outputDebugByTime, outputErrorByTime } from './outputUtils';
import { createRegex, EmptyRegex, getAllSingleWords } from './regexUtils';
import { getExtensionNoHeadDot, getRootFolderName, isNullOrEmpty, replaceSearchTextHolder, toPath } from './utils';

export class SearchChecker {
	public currentFile: ParsedPath;
	public currentFilePath: string;
	public extension: string;
	public mappedExt: string;
	public rootFolderName: string;

	public isCodeFile: boolean;
	public isScriptFile: boolean;

	public Document: vscode.TextDocument;
	public currentWord: string;
	public currentWordRegex: RegExp;

	public findType: FindType;

	public currentText: string;
	public currentWordRange: vscode.Range;
	public currentTextMaskCurrentWord: string;

	public isCapitalizedWord: boolean;
	public isUpperCaseWord: boolean;

	public isClassResultRegex: RegExp;
	public isEnumResultRegex: RegExp;
	public isMethodResultRegex: RegExp;
	public isInterfaceResultRegex: RegExp;
	public isConstantResultRegex: RegExp;
	public isMemberResultRegex: RegExp;
	public isLocalVariableResultRegex: RegExp;

	public isFindClassRegex: RegExp;
	public isFindMethodRegex: RegExp;
	public isFindMemberRegex: RegExp;
	public isFindConstantRegex: RegExp;
	public isFindEnumRegex: RegExp;
	public isFindClassOrEnumRegex: RegExp;
	public isFindClassOrMethodRegex: RegExp;
	public isFindClassWithWordCheckRegex: RegExp;
	public isFindMemberOrLocalVariableRegex: RegExp;

	public isOnlyFindClass: boolean;
	public isProbablyFindClass: boolean;
	public isOnlyFindMember: boolean;
	public isFindClass: boolean;
	public isFindMethod: boolean;
	public isFindMember: boolean;
	public isFindConstant: boolean = false;
	public isFindEnum: boolean;
	public isFindClassOrEnum: boolean;
	public isFindClassOrMethod: boolean;
	public isFindMemberOrLocalVariable: boolean;
	public maybeFindLocalVariable: boolean;
	public isProbablyFindLocalVariable: boolean;
	public canAcceptMemberResult: boolean;

	public maybeEnum: boolean;
	public maybeEnumResultRegex: RegExp;
	public isInTestPath: boolean;
	public isInTestFolder: boolean;
	public isTestFileName: boolean;

	public classFileNamePattern: string = '';
	public fileNameHighScoreWord: string = '';
	public classFileNameScoreRegex: RegExp;

	public enumOrConstantValueRegex: RegExp;

	public classDefinitionRegex: RegExp;
	public memberDefinitionRegex: RegExp;
	public enumDefinitionRegex: RegExp;
	public methodDefinitionRegex: RegExp;

	public Position: vscode.Position;
	public currentWordSet: Set<string>;
	public currentFileNameWordSet: Set<string>;
	public currentFilePathWordSet: Set<string>;
	public highScoreWordSet: Set<string> = new Set<string>();

	public promoteFolderRegex: RegExp;
	public promoteFolderScore: number;
	public promotePathRegex: RegExp;
	public promotePathScore: number;

	public demoteFolderRegex: RegExp;
	public demoteFolderScore: number;
	public demotePathRegex: RegExp;
	public demotePathScore: number;
	public ForceUseDefaultFindingDefinition: boolean = true;
	public methodQuoteRegex: RegExp;

	constructor(document: vscode.TextDocument, findType: FindType, currentPosition: vscode.Position, currentWord: string, currentWordRange: vscode.Range,
		currentText: string, currentFile: ParsedPath, mappedExt: string) {
		const MyConfig = getConfig();
		this.Document = document;
		this.findType = findType;
		this.Position = currentPosition;
		this.currentWord = currentWord;
		this.currentText = currentText;
		this.currentWordRange = currentWordRange;

		this.isCapitalizedWord = /^[A-Z]\w+$/.test(this.currentWord);
		this.isUpperCaseWord = /^[A-Z_0-9]+$/.test(this.currentWord);

		// Avoid mis-checking due to multiple occurrences of current word.
		const maskWorkRegex = new RegExp('\\b' + this.currentWord + '\\b', 'g');
		this.currentTextMaskCurrentWord = currentText.substring(0, currentWordRange.start.character).replace(maskWorkRegex, currentWord.substring(0, currentWord.length - 1))
			+ currentWord + currentText.substring(currentWordRange.end.character).replace(maskWorkRegex, currentWord.substring(0, currentWord.length - 1));

		this.currentFile = currentFile;
		this.currentFilePath = toPath(currentFile);
		this.mappedExt = mappedExt;
		this.extension = getExtensionNoHeadDot(currentFile.ext, '');
		this.rootFolderName = getRootFolderName(this.currentFilePath);
		this.isCodeFile = MyConfig.isCodeFiles(this.extension);
		this.isScriptFile = MyConfig.isScriptFile(this.extension);

		// for doc + config
		this.ForceUseDefaultFindingDefinition = FindType.Definition === this.findType && MyConfig.UseDefaultFindingClassCheckExtensionRegex.test(this.currentFile.ext);

		this.isTestFileName = /test/i.test(currentFile.name);
		this.isInTestFolder = /test/i.test(currentFile.dir);
		this.isInTestPath = this.isTestFileName || this.isInTestFolder;

		this.isClassResultRegex = this.getCheckingRegex('isClassResult', true);
		this.isEnumResultRegex = this.getCheckingRegex('isEnumResult', true);
		this.isMethodResultRegex = this.getCheckingRegex('isMethodResult', true);
		this.isInterfaceResultRegex = this.getCheckingRegex('isInterfaceResult', true);
		this.isMemberResultRegex = this.getCheckingRegex('isMemberResult', false);
		this.isLocalVariableResultRegex = this.getCheckingRegex('isLocalVariableResult', false);

		this.isFindClassWithWordCheckRegex = this.getCheckingRegex('isFindClassByWordCheck', false, true);
		this.isFindClassRegex = this.getCheckingRegex('isFindClass', false);
		this.isFindMethodRegex = this.getCheckingRegex('isFindMethod', false);
		this.isFindMemberRegex = this.getCheckingRegex('isFindMember', false);
		this.isFindEnumRegex = this.getCheckingRegex('isFindEnum', false);
		this.isFindClassOrEnumRegex = this.getCheckingRegex('isFindClassOrEnum', false);
		this.isFindClassOrMethodRegex = this.getCheckingRegex('isFindClassOrMethod', false);
		this.isFindMemberOrLocalVariableRegex = this.getCheckingRegex('isFindMemberOrLocalVariable', false);
		this.methodQuoteRegex = new RegExp('\\b' + currentWord + '\\b\\s*\\(');
		const isTypeAfterObject = this.extension.match(/^(go|scala)$/);
		const isGenericMethodOrConstructor = new RegExp('\\b' + currentWord + '\\s*<[\\s\\w\\.:]+>\\s*\\(').test(this.currentTextMaskCurrentWord);
		const onlyFindClassRegex = new RegExp(
			'\\bclass\\s+\\w+'
			+ '|' + '((new|is|as)\\s+|typeof\\W*)[\\w\\.:]*?\\b' + currentWord + "\\b" // new Class
			+ '|' + '\\b' + currentWord + '\\s*(<|[&\\*]+|\\?)\\s*\\w+' // Class*& var
			+ '|' + '\\b' + currentWord + '\\.class\\b' // Like Java/Scala
			+ '|' + '\\b' + currentWord + '\\s*\\[\\]' // Array type like C#
			+ '|' + '\\w+\\s+\\[\\]' + currentWord + '\\b' // Array type like Golang
			+ '|' + '\\(\\S*?\\b' + currentWord + '\\)\\s*\\w+'	// (Class)var -- type cast
			+ '|' + '<\\S*?\\b' + currentWord + '\\b' + '[\\w,:\\s]*?>'	// generic
			+ '|' + '<[\\s\\w,]*?\\b' + currentWord + '\\b' + '[\\w,:\\s]*?>' // generic
			+ '|' + '<[\\w,:\\s]*?\\b' + currentWord + '\\s*>' // generic
			+ '|' + '<[\\w,:\\s]*?\\b' + currentWord + '\\b[\\s\\w,]*?>' // generic
			+ '|' + '^\\s*((public|private|protected|internal|static|readonly|const|final|val|virtual|volatile)\\s+)+\\s*' + currentWord + '[^\\w,;=]*\\s+[\\*\\&\\?]?\\w+'
		);

		this.isOnlyFindClass = !isGenericMethodOrConstructor && (
			onlyFindClassRegex.test(this.currentTextMaskCurrentWord)
			|| (this.isCapitalizedWord &&
				(
					// left style like C++/C#/Java: Class var
					!isTypeAfterObject && new RegExp('(^\\s*|\\(\\s*|,\\s*|\\b[A-Z]\\w+(\\.|::))\\b' + currentWord + '[\\s&\\*\\?]+[a-z_A-Z]\\w+').test(this.currentTextMaskCurrentWord)

					// right style like Golang: var Class
					|| isTypeAfterObject && new RegExp('(^\\s*|\\(|,)\\s*\\w+\\s*:\\s+\\*?(\\w+\\S+\\.)?' + currentWord + '\\s*(,|\\)|\\s*`)').test(this.currentTextMaskCurrentWord)

					// Scala function return type
					|| new RegExp('\\b(def\\s+\\w+).*?\\s+' + currentWord + '\\s+').test(this.currentTextMaskCurrentWord)

					// Python params comment
					|| this.extension === 'py' && new RegExp('^\\s*:\\s*type\\s+\\w+.*?\\b' + this.currentWord + '\\W*$').test(this.currentTextMaskCurrentWord)
				)
			)
		);

		const onlyFindMemberRegex = new RegExp('(this|self)[->\\.]{1,2}' + currentWord + '\\b');
		this.isOnlyFindMember = !this.isOnlyFindClass && !this.methodQuoteRegex.test(this.currentTextMaskCurrentWord) && (
			onlyFindMemberRegex.test(this.currentTextMaskCurrentWord) || (
				!(new RegExp('\\b(def\\s+\\w+).*?\\s+').test(this.currentTextMaskCurrentWord)) && new RegExp('\\b' + currentWord + '\\s*=').test(this.currentTextMaskCurrentWord)
			)
		);

		this.isFindClass = this.isOnlyFindClass
			|| (isGenericMethodOrConstructor && onlyFindClassRegex.test(this.currentTextMaskCurrentWord))
			|| this.isFindClassRegex.test(this.currentTextMaskCurrentWord) && this.isFindClassWithWordCheckRegex.test(currentWord);

		this.isFindMethod = isGenericMethodOrConstructor ||
			(!this.isOnlyFindClass && !this.isOnlyFindMember) && this.isFindMethodRegex.test(this.currentTextMaskCurrentWord);

		this.isFindMember = this.isOnlyFindMember || !this.isOnlyFindClass && this.isFindMemberRegex.test(this.currentTextMaskCurrentWord) && !this.methodQuoteRegex.test(this.currentTextMaskCurrentWord);
		this.isFindEnum = !this.isOnlyFindClass && this.isFindEnumRegex.test(this.currentTextMaskCurrentWord);
		this.isFindClassOrEnum = !this.isOnlyFindMember && this.isCapitalizedWord && this.isFindClassOrEnumRegex.test(this.currentTextMaskCurrentWord);
		this.isFindClassOrMethod = !this.isOnlyFindMember && !this.isOnlyFindClass && this.isFindClassOrMethodRegex.test(this.currentTextMaskCurrentWord);
		this.isFindMemberOrLocalVariable = this.isOnlyFindMember || !this.isOnlyFindClass && this.isFindMemberOrLocalVariableRegex.test(this.currentTextMaskCurrentWord);

		this.isProbablyFindClass = this.isCapitalizedWord && (
			// class.method()
			new RegExp('(^|[^\\w\\.:>])' + currentWord + '(\\.|->|::)\\w+\\(').test(this.currentTextMaskCurrentWord)
			// class.Constant
			|| new RegExp('(^|[^\\w\\.:>])' + currentWord + '(\\.|->|::)[A-Z]\\w+').test(this.currentTextMaskCurrentWord)
		);

		if (!this.isFindClass && !this.isOnlyFindMember && !this.isFindClassOrEnum && !this.isFindEnum
			&& this.isCapitalizedWord
			&& new RegExp("\\b" + this.currentWord + "\\s+\\w+").test(this.currentTextMaskCurrentWord)) {
			this.isFindClass = true;
		}

		this.canAcceptMemberResult = /^_?[a-z_]\w+$/.test(this.currentWord)
			&& !this.methodQuoteRegex.test(this.currentTextMaskCurrentWord);

		this.maybeFindLocalVariable = this.canAcceptMemberResult
			&& new RegExp('\\b' + this.currentWord + '\\b\\S*\\s*=').test(this.currentTextMaskCurrentWord);

		this.isProbablyFindLocalVariable = !this.isCapitalizedWord
			&& new RegExp('([^\\w\\.:>])' + this.currentWord + '(\\s*$|[^\\w:-]|\\.\\w+\\()').test(this.currentTextMaskCurrentWord);

		this.isFindConstantRegex = this.getCheckingRegex('isFindConstant', false);
		if (this.isCapitalizedWord) {
			this.isFindConstant = (this.isFindConstantRegex.source === EmptyRegex.source
				? MyConfig.DefaultConstantsRegex.test(this.currentWord)
				: this.isFindConstantRegex.test(this.currentWord)
			) && !this.methodQuoteRegex.test(this.currentTextMaskCurrentWord);
		}

		this.isConstantResultRegex = this.getCheckingRegex('isConstantResult', true);
		if (this.isConstantResultRegex.source === EmptyRegex.source) {
			this.isConstantResultRegex = new RegExp('\\b' + this.currentWord + '\\s*=');
		}

		this.currentWordRegex = new RegExp((/^\W/.exec(this.currentWord) ? '' : '\\b') + currentWord + '\\b');
		this.enumOrConstantValueRegex = new RegExp('^\\s*' + this.currentWord + '\\s*=\\s*(-?\\d+|["\']\\w+)');

		if (!this.isFindClass && !this.isFindMember && !this.isFindMethod && !this.isFindEnum) {
			if (this.isCapitalizedWord && new RegExp('^\\s*' + this.currentWord + '\\s*=').test(this.currentTextMaskCurrentWord)) {
				this.isFindMember = true;
			}

			if (this.isCapitalizedWord && new RegExp('[^\.\w]' + this.currentWord + '(\\??\\.|::|->)\\w+').test(this.currentTextMaskCurrentWord)) {
				this.isFindClass = true;
			}
		} else if (!this.isFindClass && !this.isOnlyFindMember && this.isCapitalizedWord && /^(py|cpp)$/.test(mappedExt) && /^[A-Z]\w+/.test(this.currentWord) && this.methodQuoteRegex.test(currentText)) {
			this.isFindClass = true;
		}

		this.maybeEnum = this.isCapitalizedWord && new RegExp('\\w+(::|\\.|->)\\s*' + currentWord + '([^\\w\\.:-]|$)').test(this.currentTextMaskCurrentWord);
		if (!this.isOnlyFindClass && !this.isOnlyFindMember && this.isCapitalizedWord && !this.isFindClass && !this.isFindMember
			&& !this.isFindClassOrEnum && !this.isFindEnum && !this.isFindMethod && !this.isFindConstant) {
			this.maybeEnum = true;
			this.isFindClassOrMethod = true;
		}

		if (!this.isOnlyFindClass && !this.isOnlyFindMember && !this.maybeEnum) {
			this.maybeEnum = this.isCapitalizedWord && new RegExp('(=|return|case|,)\\s*\\w+\\S*(\\.|->|::)' + currentWord + '\\s*(\\)|[,;:]?\\s*$)').test(this.currentTextMaskCurrentWord);
		}

		this.maybeEnumResultRegex = new RegExp('^\\s*' + this.currentWord + '\\b\\s*(' + ',?\\s*$' + '|' + '=\\s*(-?\\d|[\'"])' + ')');
		let classNameWords = [];
		if ((this.isFindMember || this.isFindMethod)) {
			const leftText = this.currentText.substring(0, this.currentWordRange.start.character);
			const rightText = this.currentText.substring(this.currentWordRange.end.character);
			const classNameMatch = leftText.match(new RegExp('\\b(\\w+)(\\??\\.|::|->)\\s*$'));
			if (classNameMatch) {
				classNameWords.push(classNameMatch[1]);

				// for case like xxx.ClassName
				if (this.isFindMember && this.isCapitalizedWord
					&& leftText.match(new RegExp('\\b([A-Z]\\w+)(\\??\\.|::|->)\\s*$')) && rightText.match(new RegExp('[\\W\\s]*$'))) {
					if (classNameWords[0].toLowerCase() !== currentWord.toLowerCase()) {
						classNameWords.push(currentWord);
					}
				}
			}
		} else if (this.isOnlyFindClass || this.isProbablyFindClass || this.isFindClassOrMethod || this.isFindClassOrEnum) {
			classNameWords.push(currentWord);
		}

		classNameWords = classNameWords.map(a => this.getClassFileNamePattern(a));
		this.classFileNamePattern = classNameWords.join('|');
		if (classNameWords.length > 1) {
			this.classFileNamePattern = '(' + this.classFileNamePattern + ')';
		}

		const fileNameHighScoreWordMatch = this.currentTextMaskCurrentWord.match(new RegExp('(^|[^\\w:\\.>])m?_?([a-zA-Z]\\w{2,})(\\??\\.|::|->)' + currentWord + '\\b'));
		this.fileNameHighScoreWord = fileNameHighScoreWordMatch ? fileNameHighScoreWordMatch[2] : '';
		this.classFileNameScoreRegex = createRegex((this.classFileNamePattern || this.fileNameHighScoreWord).replace(/^m?_+|_+$/g, ''), 'i');

		this.currentWordSet = getAllSingleWords(this.currentWord);
		this.currentFileNameWordSet = getAllSingleWords(this.currentFile.name);
		this.currentFilePathWordSet = getAllSingleWords(this.currentFilePath);
		const highScoreRegex = new RegExp('(\\w+)(?:\\??\\.|::|->)' + this.currentWord + '\\b' + '|' + '\\b(' + this.currentWord + ')(?:\\??\\.|::|->)\\w+');
		const highScoreMatch = highScoreRegex.exec(this.currentText);
		if (highScoreMatch) {
			if (highScoreMatch[1]) {
				getAllSingleWords(highScoreMatch[1]).forEach(a => this.highScoreWordSet.add(a));
			}

			if (highScoreMatch[2]) {
				getAllSingleWords(highScoreMatch[2]).forEach(a => this.highScoreWordSet.add(a));
			}
		}

		const classPattern = replaceSearchTextHolder(this.getSpecificConfigValue('class.definition', false), currentWord);
		this.classDefinitionRegex = classPattern.length < 1 ? EmptyRegex : new RegExp(classPattern);

		const methodPattern = replaceSearchTextHolder(this.getSpecificConfigValue('method.definition', false), currentWord);
		this.methodDefinitionRegex = methodPattern.length < 1 ? EmptyRegex : new RegExp(methodPattern);

		const memberPattern = replaceSearchTextHolder(this.getSpecificConfigValue('member.definition', false), currentWord);
		this.memberDefinitionRegex = memberPattern.length < 1 ? EmptyRegex : new RegExp(memberPattern);

		const enumPattern = replaceSearchTextHolder(this.getSpecificConfigValue('enum.definition', false), currentWord);
		this.enumDefinitionRegex = enumPattern.length < 1 ? EmptyRegex : new RegExp(enumPattern);

		const promoteFolderPattern = getConfigValueByProjectAndExtension(this.rootFolderName, this.extension, mappedExt, 'promoteFolderPattern');
		const promotePathPattern = getConfigValueByProjectAndExtension(this.rootFolderName, this.extension, mappedExt, 'promotePathPattern');
		this.promoteFolderRegex = createRegex(promoteFolderPattern, 'i');
		this.promotePathRegex = createRegex(promotePathPattern, 'i');
		this.promoteFolderScore = parseInt(getConfigValueByProjectAndExtension(this.rootFolderName, this.extension, mappedExt, 'promoteFolderScore') || '200');
		this.promotePathScore = parseInt(getConfigValueByProjectAndExtension(this.rootFolderName, this.extension, mappedExt, 'promotePathScore') || '200');

		const demoteFolderPattern = getConfigValueByProjectAndExtension(this.rootFolderName, this.extension, mappedExt, 'demoteFolderPattern');
		const demotePathPattern = getConfigValueByProjectAndExtension(this.rootFolderName, this.extension, mappedExt, 'demotePathPattern');
		this.demoteFolderRegex = createRegex(demoteFolderPattern, 'i');
		this.demotePathRegex = createRegex(demotePathPattern, 'i');
		this.demoteFolderScore = parseInt(getConfigValueByProjectAndExtension(this.rootFolderName, this.extension, mappedExt, 'demoteFolderScore') || '200');
		this.demotePathScore = parseInt(getConfigValueByProjectAndExtension(this.rootFolderName, this.extension, mappedExt, 'demotePathScore') || '200');
	}

	public getDefaultForceSettings(): ForceSetting {
		let flag = ForceFindType.None;
		if (this.isFindClass) {
			flag |= ForceFindType.FindClass;
		}

		if (this.isFindMethod) {
			flag |= ForceFindType.FindMethod;
		}

		if (this.isFindMember) {
			flag |= ForceFindType.FindMember;
		}

		if (this.maybeFindLocalVariable) {
			flag |= ForceFindType.FindLocalVariable;
		}

		return new ForceSetting(flag);
	}

	public outputSearchInfo() {
		outputDebug('ForceUseDefaultFindingDefinition = ' + this.ForceUseDefaultFindingDefinition);
		outputDebug('promoteFolderScore = ' + this.promoteFolderScore + ' , promoteFolderPattern = "' + this.promoteFolderRegex.source + '"');
		outputDebug('promotePathScore = ' + this.promotePathScore + ' , promotePathPattern = "' + this.promotePathRegex.source + '"');
		outputDebug('demoteFolderScore = ' + this.demoteFolderScore + ' , demoteFolderPattern = "' + this.demoteFolderRegex.source + '"');
		outputDebug('demotePathScore = ' + this.demotePathScore + ' , demotePathPattern = "' + this.demotePathRegex.source + '"');

		outputDebug('isFindConstant = ' + this.isFindConstant + ' , isConstantPattern = "' + MyConfig.DefaultConstantsRegex.source + '" , nonConstRegex = "' + this.methodQuoteRegex.source + '"');
		outputDebug('isFindClass = ' + this.isFindClass + ' , isClassPattern = "' + this.isFindClassRegex.source + '"');
		outputDebug('word = "' + this.currentWord + '" , isFindClassWithWordCheckRegex = "' + this.isFindClassWithWordCheckRegex.source + '"');
		outputDebug('isFindEnum = ' + this.isFindEnum + ' , isEnumPattern = "' + this.isFindEnumRegex.source + '"');
		outputDebug('isFindMethod = ' + this.isFindMethod + ' , isMethodPattern = "' + this.isFindMethodRegex.source + '"');
		outputDebug('isFindMember = ' + this.isFindMember + ' , isMemberPattern = "' + this.isFindMemberRegex.source + '"');
		outputDebug('isFindClassOrEnum = ' + this.isFindClassOrEnum + ' , isClassOrEnumPattern = "' + this.isFindClassOrEnumRegex.source + '"');
		outputDebug('isFindClassOrMethod = ' + this.isFindClassOrMethod + ' , isFindClassOrMethodPattern = "' + this.isFindClassOrMethodRegex.source + '"');
		outputDebug('isFindMemberOrLocalVariable = ' + this.isFindMemberOrLocalVariable + ' , isFindMemberOrLocalVariablePattern = "' + this.isFindMemberOrLocalVariableRegex.source + '"');

		outputDebug('isClassResultRegex = "' + this.isClassResultRegex.source + '"');
		outputDebug('isEnumResultRegex = "' + this.isEnumResultRegex.source + '"');
		outputDebug('isMethodResultRegex = "' + this.isMethodResultRegex.source + '"');

		outputDebug('classDefinitionRegex = "' + this.classDefinitionRegex.source + '"');
		outputDebug('methodDefinitionRegex = "' + this.methodDefinitionRegex.source + '"');
		outputDebug('memberDefinitionRegex = "' + this.memberDefinitionRegex.source + '"');
		outputDebug('enumDefinitionRegex = "' + this.enumDefinitionRegex.source + '"');
		outputDebugByTime('Final-Check: isFindMember = ' + this.isFindMember + ', isFindClass = ' + this.isFindClass + ' , isFindMethod = ' + this.isFindMethod + ' , isFindEnum = ' + this.isFindEnum);
	}

	public getCheckingRegex(configKeyTail: string, allowEmpty: boolean, matchAnyIfEmpty: boolean = false): RegExp {
		const useDefault = configKeyTail === 'isFindClass' && MyConfig.UseDefaultFindingClassCheckExtensionRegex.test(this.currentFile.ext);
		const rawPattern = useDefault
			? getConfigValueByProjectAndExtension(this.rootFolderName, '', 'default', configKeyTail, allowEmpty)
			: getConfigValueByProjectAndExtension(this.rootFolderName, this.extension, this.mappedExt, configKeyTail, allowEmpty);
		const pattern = replaceSearchTextHolder(rawPattern, this.currentWord);
		return matchAnyIfEmpty && isNullOrEmpty(pattern) ? new RegExp(".?") : createRegex(pattern);
	}

	public getSpecificConfigValue(configKeyTail: string, addDefault: boolean = true, allowEmpty: boolean = true): string {
		let prefixes = this.ForceUseDefaultFindingDefinition
			? GetConfigPriorityPrefixes(this.rootFolderName, '', '', true)
			: GetConfigPriorityPrefixes(this.rootFolderName, this.extension, this.mappedExt, addDefault);
		const pattern = getConfigValueByPriorityList(prefixes, configKeyTail, allowEmpty) as string || '';
		if (!isNullOrEmpty(pattern) && configKeyTail.includes('definition') && !configKeyTail.includes('skip') && pattern.indexOf(SearchTextHolder) < 0) {
			const keys = prefixes.join('.' + configKeyTail + ' or ');
			outputErrorByTime('Not found word-holder: "' + SearchTextHolder + '" in search option, please check configuration of ' + keys + ', searchPattern = ' + pattern);
			return '';
		}

		return pattern;
	}

	private getClassFileNamePattern(className: string): string {
		let classNamePattern = (className || '').replace(/^m?_+|([0-9]+|i?e?s|[oe]r)_*$/g, '').replace('_', '.?');
		classNamePattern = classNamePattern.replace(/^I([A-Z]\w+)/, '$1');

		if (this.extension === 'py' || this.mappedExt === 'py') {
			classNamePattern = classNamePattern.replace(/([A-Z][a-z]+)/g, '.?$1').replace(/^\.\?|\.\?$/g, '');
		}
		return classNamePattern;
	}
}
