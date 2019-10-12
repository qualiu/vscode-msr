import path = require('path');

export const IsDebugMode = false; // process.execArgv && process.execArgv.length > 0 && process.execArgv.some((arg) => /^--debug=?/.test(arg) || /^--(debug|inspect)-brk=?/.test(arg));
export const SearchTextHolder = '%1';
export const SearchTextHolderReplaceRegex = /%~?1/g;
export const IsSupportedSystem = /win32|Windows|Linux/i.test(process.platform);
export const SkipJumpOutForHeadResultsRegex = /\s+(-J\s+-H|-J?H)\s*\d+(\s+-J)?(\s+|$)/;
export const TrimSearchTextRegex = /^[^\w\.-]+|[^\w\.-]+$/g;

export const IsWindows = /win32|windows/i.test(process.platform);

export const ShouldQuotePathRegex = IsWindows ? /[^\w,\.\\/:-]/ : /[^\w,\.\\/-]/;
export const HomeFolder = IsWindows ? path.join(process.env['USERPROFILE'] || '', 'Desktop') : process.env['HOME'] || '.';
