import * as assert from 'assert';
import { escapeRegExpForFindingCommand } from '../../commands';
import { escapeRegExp } from '../../regexUtils';
import { IsWindowsTerminalOnWindows, replaceSearchTextHolder } from '../../utils';
// You can import and use all API from the 'vscode' module
// as well as import your extension to test it

export function testEscapeRegex() {
  const textToExpectedResultMap = new Map<string, string>()
    .set(String.raw`\text`, String.raw`\\text`)
    .set('$text$', '\\$text\\$')
    .set('^text$', '\\^text\\$')
    .set('.test*', '\\.test\\*')
    .set('text+', 'text\\+')
    .set('text?', 'text\\?')
    .set('{text}', '\\{text\\}')
    .set('(text)', '\\(text\\)')
    .set('[text]', '\\[text\\]')
    .set('text|', 'text\\|')
    ;

  textToExpectedResultMap.forEach((expected, source, _) => {
    const result = escapeRegExp(source);
    assert.strictEqual(result, expected, `Source = ${source} , expected = ${expected}, but result = ${result}`);
  });
}

export function testEscapeRegexForFindingCommands() {
  const textToExpectedResultMap = new Map<string, string>()
    .set(String.raw`\text`, IsWindowsTerminalOnWindows ? String.raw`\\text` : String.raw`\\\\text`)
    .set('$text$', '\\$text\\$')
    .set('^text$', '\\^text\\$')
    .set('.test*', '\\.test\\*')
    .set('text+', 'text\\+')
    .set('text?', 'text\\?')
    .set('{text}', '\\{text\\}')
    .set('(text)', '\\(text\\)')
    .set('[text]', '\\[text\\]')
    .set('text|', 'text\\|')
    ;

  textToExpectedResultMap.forEach((expected, source, _) => {
    const result = escapeRegExpForFindingCommand(source);
    assert.strictEqual(result, expected, `Source = ${source} , expected = ${expected}, but result = ${result}`);
  });
}

export function testSpecialCaseReplacing() {
  const source = String.raw`-t "%1" -e "%~1"`;
  const patternToExpectedResultMap = new Map<string, string>()
    .set(String.raw`'Macro'`, String.raw`-t "'Macro'" -e "'Macro'"`)
    .set(String.raw`"Macro"`, String.raw`-t ""Macro"" -e ""Macro""`)
    .set(String.raw`'\$Macro\$'`, String.raw`-t "'\$Macro\$'" -e "'\$Macro\$'"`)
    .set(String.raw`"\$Macro\$"`, String.raw`-t ""\$Macro\$"" -e ""\$Macro\$""`)
    ;

  patternToExpectedResultMap.forEach((expected, pattern, _) => {
    const result = replaceSearchTextHolder(source, pattern);
    assert.strictEqual(result, expected, `Pattern = ${pattern} , expected = ${expected}, but result = ${result}`);
  });
}
