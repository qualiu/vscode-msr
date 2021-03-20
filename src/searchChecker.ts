import { ParsedPath } from 'path';
import * as vscode from 'vscode';
import { GetConfigPriorityPrefixes, getConfigValueByRoot, getOverrideConfigByPriority } from './configUtils';
import { SearchTextHolder, SearchTextHolderReplaceRegex } from './constants';
import { getConfig, MyConfig } from './dynamicConfig';
import { FindType, ForceFindType } from './enums';
import { ForceSetting } from './forceSettings';
import { outputDebug, outputError } from './outputUtils';
import { createRegex, EmptyRegex, getAllSingleWords } from './regexUtils';
import { getExtensionNoHeadDot, getRootFolderName, isNullOrEmpty, nowText, toPath } from './utils';

export class SearchChecker {
	public currentFile: ParsedPath;
	public currentFilePath: string;
	public extension: string;
	public mappedExt: string;
	public rootFolderName: string;

	public Document: vscode.TextDocument;
	public currentWord: string;
	public currentWordRegex: RegExp;

	public findType: FindType;

	public currentText: string;
	public currentWordRange: vscode.Range;
	public currentTextMaskCurrentWord: string;

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

	public maybeEnum: boolean;
	public maybeEnumResultRegex: RegExp;

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

		const isCapitalizedWord = /^[A-Z]\w+$/.test(this.currentWord);

		// Avoid mis-checking due to multiple occurrences of current word.
		const maskWorkRegex = new RegExp('\\b' + this.currentWord + '\\b', 'g');
		this.currentTextMaskCurrentWord = currentText.substring(0, currentWordRange.start.character).replace(maskWorkRegex, currentWord.substring(0, currentWord.length - 1))
			+ currentWord + currentText.substring(currentWordRange.end.character).replace(maskWorkRegex, currentWord.substring(0, currentWord.length - 1));

		this.currentFile = currentFile;
		this.currentFilePath = toPath(currentFile);
		this.mappedExt = mappedExt;
		this.extension = getExtensionNoHeadDot(currentFile.ext, '');
		this.rootFolderName = getRootFolderName(this.currentFilePath);

		// for doc + config
		this.ForceUseDefaultFindingDefinition = FindType.Definition === this.findType && MyConfig.UseDefaultFindingClassCheckExtensionRegex.test(this.currentFile.ext);

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

		const onlyFindMemberRegex = new RegExp(
			'\\b' + currentWord + '\\s*='
			+ '|' + '(this|self)[->\\.]{1,2}' + currentWord + '\\b');
		this.isOnlyFindMember = onlyFindMemberRegex.test(this.currentTextMaskCurrentWord);

		const onlyFindClassRegex = new RegExp(
			'((new|is|as)\\s+|typeof\\W*)[\\w\\.:]*?\\b' + currentWord + "\\b"
			+ '|' + '\\b' + currentWord + '\\s*[<&\\*\\?]+\\s*\\w+'
			+ '|' + '\\(\\S*?\\b' + currentWord + '\\)\\s*\\w+'
			+ '|' + '<\\S*?\\b' + currentWord + '\\b' + '[\\w,:\\s]*?>'
			+ '|' + '<[\\s\\w,]*?\\b' + currentWord + '\\b' + '[\\w,:\\s]*?>'
			+ '|' + '<[\\w,:\\s]*?\\b' + currentWord + '\\s*>'
			+ '|' + '<[\\w,:\\s]*?\\b' + currentWord + '\\b[\\s\\w,]*?>'
			+ '|' + '^\\s*((public|private|protected|internal|static|readonly|const|final|val)\\s+)+\\s*' + currentWord + '[^\\w,;=]*\\s+\\W?\\w+'
		);

		this.isOnlyFindClass = !this.isOnlyFindMember && (
			onlyFindClassRegex.test(this.currentTextMaskCurrentWord)
			|| (isCapitalizedWord && new RegExp('^\\s*\\W*' + currentWord + '\\W+\\w+').test(this.currentTextMaskCurrentWord))
		);

		this.isFindClass = this.isOnlyFindClass || this.isFindClassRegex.test(this.currentTextMaskCurrentWord) && this.isFindClassWithWordCheckRegex.test(currentWord);
		this.isFindMethod = (!this.isOnlyFindClass && !this.isOnlyFindMember) && this.isFindMethodRegex.test(this.currentTextMaskCurrentWord);
		this.isFindMember = this.isOnlyFindMember || !this.isOnlyFindClass && this.isFindMemberRegex.test(this.currentTextMaskCurrentWord) && !this.methodQuoteRegex.test(this.currentTextMaskCurrentWord);
		this.isFindEnum = !this.isOnlyFindClass && this.isFindEnumRegex.test(this.currentTextMaskCurrentWord);
		this.isFindClassOrEnum = !this.isOnlyFindMember && isCapitalizedWord && this.isFindClassOrEnumRegex.test(this.currentTextMaskCurrentWord);
		this.isFindClassOrMethod = !this.isOnlyFindMember && !this.isOnlyFindClass && this.isFindClassOrMethodRegex.test(this.currentTextMaskCurrentWord);
		this.isFindMemberOrLocalVariable = this.isOnlyFindMember || !this.isOnlyFindClass && this.isFindMemberOrLocalVariableRegex.test(this.currentTextMaskCurrentWord);

		if (!this.isFindClass && !this.isOnlyFindMember && !this.isFindClassOrEnum && !this.isFindEnum
			&& isCapitalizedWord
			&& new RegExp("\\b" + this.currentWord + "\\s+\\w+").test(this.currentTextMaskCurrentWord)) {
			this.isFindClass = true;
		}

		this.maybeFindLocalVariable = /^_?[a-z_]\w+$/.test(this.currentWord)
			&& !this.methodQuoteRegex.test(this.currentTextMaskCurrentWord)
			&& new RegExp('\\b' + this.currentWord + '\\b\\S*\\s*=').test(this.currentTextMaskCurrentWord);

		this.isProbablyFindLocalVariable = !isCapitalizedWord
			&& new RegExp('([^\\w\\.:>])' + this.currentWord + '(\\s*$|[^\\w:-]|\\.\\w+\\()').test(this.currentTextMaskCurrentWord);

		this.isFindConstantRegex = this.getCheckingRegex('isFindConstant', false);
		if (isCapitalizedWord) {
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
			if (isCapitalizedWord && new RegExp('^\\s*' + this.currentWord + '\\s*=').test(this.currentTextMaskCurrentWord)) {
				this.isFindMember = true;
			}

			if (isCapitalizedWord && new RegExp('[^\.\w]' + this.currentWord + '(\\.|::|->)\\w+').test(this.currentTextMaskCurrentWord)) {
				this.isFindClass = true;
			}
		} else if (!this.isFindClass && !this.isOnlyFindMember && isCapitalizedWord && /^(py|cpp)$/.test(mappedExt) && /^[A-Z]\w+/.test(this.currentWord) && this.methodQuoteRegex.test(currentText)) {
			this.isFindClass = true;
		}

		this.maybeEnum = false;
		if (!this.isOnlyFindClass && !this.isOnlyFindMember && isCapitalizedWord && !this.isFindClass && !this.isFindMember
			&& !this.isFindClassOrEnum && !this.isFindEnum && !this.isFindMethod && !this.isFindConstant) {
			this.maybeEnum = true;
			this.isFindClassOrMethod = true;
		}

		if (!this.isOnlyFindClass && !this.isOnlyFindMember && !this.maybeEnum) {
			this.maybeEnum = isCapitalizedWord && new RegExp('(=|return|,)\\s*\\w+\\S*(\\.|->|::)' + currentWord + '\\s*(\\)|[,;]?\\s*$)').test(this.currentTextMaskCurrentWord);
		}

		this.maybeEnumResultRegex = new RegExp("^\\s*" + this.currentWord + "\\s*,?\\s*$");

		this.currentWordSet = getAllSingleWords(this.currentWord);
		this.currentFileNameWordSet = getAllSingleWords(this.currentFile.name);
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

		const classPattern = this.getSpecificConfigValue('class.definition', false).replace(SearchTextHolderReplaceRegex, currentWord);
		this.classDefinitionRegex = classPattern.length < 1 ? EmptyRegex : new RegExp(classPattern);

		const methodPattern = this.getSpecificConfigValue('method.definition', false).replace(SearchTextHolderReplaceRegex, currentWord);
		this.methodDefinitionRegex = methodPattern.length < 1 ? EmptyRegex : new RegExp(methodPattern);

		const memberPattern = this.getSpecificConfigValue('member.definition', false).replace(SearchTextHolderReplaceRegex, currentWord);
		this.memberDefinitionRegex = memberPattern.length < 1 ? EmptyRegex : new RegExp(memberPattern);

		const enumPattern = this.getSpecificConfigValue('enum.definition', false).replace(SearchTextHolderReplaceRegex, currentWord);
		this.enumDefinitionRegex = enumPattern.length < 1 ? EmptyRegex : new RegExp(enumPattern);

		const promoteFolderPattern = getConfigValueByRoot(this.rootFolderName, this.extension, mappedExt, 'promoteFolderPattern');
		const promotePathPattern = getConfigValueByRoot(this.rootFolderName, this.extension, mappedExt, 'promotePathPattern');
		this.promoteFolderRegex = createRegex(promoteFolderPattern, 'i');
		this.promotePathRegex = createRegex(promotePathPattern, 'i');
		this.promoteFolderScore = parseInt(getConfigValueByRoot(this.rootFolderName, this.extension, mappedExt, 'promoteFolderScore') || '200');
		this.promotePathScore = parseInt(getConfigValueByRoot(this.rootFolderName, this.extension, mappedExt, 'promotePathScore') || '200');

		const demoteFolderPattern = getConfigValueByRoot(this.rootFolderName, this.extension, mappedExt, 'demoteFolderPattern');
		const demotePathPattern = getConfigValueByRoot(this.rootFolderName, this.extension, mappedExt, 'demotePathPattern');
		this.demoteFolderRegex = createRegex(demoteFolderPattern, 'i');
		this.demotePathRegex = createRegex(demotePathPattern, 'i');
		this.demoteFolderScore = parseInt(getConfigValueByRoot(this.rootFolderName, this.extension, mappedExt, 'demoteFolderScore') || '200');
		this.demotePathScore = parseInt(getConfigValueByRoot(this.rootFolderName, this.extension, mappedExt, 'demotePathScore') || '200');
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
		outputDebug(nowText() + 'Final-Check: isFindMember = ' + this.isFindMember + ', isFindClass = ' + this.isFindClass + ' , isFindMethod = ' + this.isFindMethod + ' , isFindEnum = ' + this.isFindEnum);
	}

	public getCheckingRegex(configKeyTail: string, allowEmpty: boolean, matchAnyIfEmpty: boolean = false): RegExp {
		const useDefault = configKeyTail === 'isFindClass' && MyConfig.UseDefaultFindingClassCheckExtensionRegex.test(this.currentFile.ext);
		const rawPattern = useDefault
			? getConfigValueByRoot(this.rootFolderName, 'default', '', configKeyTail, allowEmpty)
			: getConfigValueByRoot(this.rootFolderName, this.extension, this.mappedExt, configKeyTail, allowEmpty);
		const pattern = rawPattern.replace(SearchTextHolderReplaceRegex, this.currentWord);
		return matchAnyIfEmpty && isNullOrEmpty(pattern) ? new RegExp(".?") : createRegex(pattern);
	}

	public getSpecificConfigValue(configKeyTail: string, addDefault: boolean = true, allowEmpty: boolean = true): string {
		let prefixes = this.ForceUseDefaultFindingDefinition
			? GetConfigPriorityPrefixes(this.rootFolderName, '', '', true)
			: GetConfigPriorityPrefixes(this.rootFolderName, this.extension, this.mappedExt, addDefault);
		const pattern = getOverrideConfigByPriority(prefixes, configKeyTail, allowEmpty) as string || '';
		if (!isNullOrEmpty(pattern) && configKeyTail.includes('definition') && !configKeyTail.includes('skip') && pattern.indexOf(SearchTextHolder) < 0) {
			const keys = prefixes.join('.' + configKeyTail + ' or ');
			outputError(nowText() + 'Not found word-holder: "' + SearchTextHolder + '" in search option, please check configuration of ' + keys + ', searchPattern = ' + pattern);
			return '';
		}

		return pattern;
	}
}
