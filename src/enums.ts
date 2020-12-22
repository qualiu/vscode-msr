
export enum FindType {
    Definition = 1,
    Reference = 2,
}

export enum TerminalType {
    CMD = 1,
    PowerShell = 2,
    LinuxBash = 3,
    CygwinBash = 4,
    MinGWBash = 5,
    WslBash = 6
}

export enum FindCommandType {
    RegexFindAsClassOrMethodDefinitionInCodeFiles,
    RegexFindDefinitionInCurrentFile,
    RegexFindReferencesInCurrentFile,
    RegexFindReferencesInCodeFiles,
    RegexFindPureReferencesInCodeFiles,
    RegexFindPureReferencesInAllSourceFiles,
    RegexFindReferencesInConfigFiles,
    RegexFindReferencesInDocs,
    RegexFindReferencesInAllSourceFiles,
    RegexFindReferencesInAllSmallFiles,
    RegexFindReferencesInCodeAndConfig,
    FindPlainTextInCodeFiles,
    FindPlainTextInConfigFiles,
    FindPlainTextInDocFiles,
    FindPlainTextInConfigAndConfigFiles,
    FindPlainTextInAllSourceFiles,
    FindPlainTextInAllSmallFiles,
    SortSourceBySize,
    SortSourceByTime,
    SortBySize,
    SortByTime,
    SortCodeBySize,
    SortCodeByTime,
    FindTopFolder,
    FindTopType,
    FindTopSourceFolder,
    FindTopSourceType,
    FindTopCodeFolder,
    FindTopCodeType
}
