
export enum FindType {
    None = 0,
    Definition = 1,
    Reference = 2,
}

export enum TerminalType {
    None = 0,
    CMD = 1,
    PowerShell = 2,
    LinuxBash = 3,
    CygwinBash = 4,
    MinGWBash = 5,
    WslBash = 6,
    Pwsh = 7, // PowerShell on Linux/MacOS
}

export enum ForceFindType {
    None = 0,
    FindClass = 1 << 1,
    FindMethod = 1 << 2,
    FindMember = 1 << 3,
    FindLocalVariable = 1 << 4
}

export enum FindCommandType {
    None = 0,
    RegexFindAsClassOrMethodDefinitionInCodeFiles,
    RegexFindDefinitionInCurrentFile,
    RegexFindReferencesInCurrentFile,
    RegexFindReferencesInCodeFiles,
    RegexFindPureReferencesInCodeFiles,
    RegexFindPureReferencesInAllSourceFiles,
    RegexFindReferencesInConfigFiles,
    RegexFindReferencesInDocs,
    RegexFindReferencesInAllSourceFiles,
    RegexFindReferencesInSameTypeFiles,
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
