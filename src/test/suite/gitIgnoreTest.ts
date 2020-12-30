import * as assert from 'assert';
import { TerminalType } from '../../enums';
// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import { GitIgnore } from '../../gitUtils';

export function comparePattern(parser: GitIgnore, rawPattern: string, expected: string | null = null) {
  const result = parser.getPattern(rawPattern);
  if (expected == null) {
    console.info("comparePattern(parser, '" + rawPattern + "', String.raw`" + result + "`);");
  } else {
    console.info('RawIgnore = ' + rawPattern);
    console.info('Result    = ' + result);
    console.info('Expected  = ' + expected);
    assert.strictEqual(result, expected || '');
    console.info('');
  }
}

export function testNotSkipDotPaths() {
  const parser = new GitIgnore('', true, true, false, TerminalType.LinuxBash);
  comparePattern(parser, '.git', String.raw`\.git`);
}

export function testOmitExemptions() {
  const parser = new GitIgnore('', true, false, true, TerminalType.LinuxBash);
  comparePattern(parser, '!out/my.txt', '');
}

export function testLinuxTerminal() {
  // Copy output from vscode: msr -p MSR-Def-Ref-output.txt -b "^Input_Git_Ignore =" -Q "^Skip_Paths_Regex|^\s*$" -S -t "^Input_Git_Ignore = (.+?)[\r\n]+Skip_Paths_Regex = (.+?)[\r\n]" -o "comparePattern(parser, '\1', String.raw`\2`);" -P
  const parser = new GitIgnore('', true, true, true, TerminalType.LinuxBash);
  // Generate test below: msr -p src\test\suite\gitIgnoreTest.ts -b "function testLinuxTerminal" -q "^\s*\}" -t "^(\s*comparePattern\(\w+, [^,]+).*" -o "\1);" -P
  comparePattern(parser, '[Bb]in', String.raw`[Bb]in`);
  comparePattern(parser, '[Bb]in/', String.raw`[Bb]in/`);
  comparePattern(parser, '/[Bb]in/', String.raw`/[Bb]in/`);
  comparePattern(parser, '/.[Bb]in/', String.raw`/\.[Bb]in/`);
  comparePattern(parser, 'build', String.raw`build`);
  comparePattern(parser, '/build/', String.raw`/build/`);
  comparePattern(parser, 'build/', String.raw`build/`);
  comparePattern(parser, '/.history/*', String.raw`/\.history/`);
  comparePattern(parser, '/.code', String.raw`/\.code`);
  comparePattern(parser, '*.txt', String.raw`\.txt$`);
  comparePattern(parser, '*.mid.ext', String.raw`\.mid\.ext$`);
  comparePattern(parser, '*.mid.ext/', String.raw`[^/]*\.mid\.ext/`);
  comparePattern(parser, '*.mid.*', String.raw`\.mid\.[^/]*$`);
  comparePattern(parser, '*.mid.*/', String.raw`[^/]*\.mid\.[^/]*/`);
  comparePattern(parser, '/src/**/*.doc', String.raw`/src/.*/[^/]*\.doc`);
  comparePattern(parser, '/src/test/**/*.mid', String.raw`/src/test/.*/[^/]*\.mid`);
  comparePattern(parser, '/src/**/build.info', String.raw`/src/.*/build\.info`);
  comparePattern(parser, 'deploy/my/.config/*', String.raw`deploy/my/\.config/`);
  comparePattern(parser, '__pycache__/', String.raw`__pycache__/`);
  comparePattern(parser, 'Settings.Cache', String.raw`Settings\.Cache`);
  comparePattern(parser, '/web/.vscode', String.raw`/web/\.vscode`);
  comparePattern(parser, '/tools/build/', String.raw`/tools/build/`);
  comparePattern(parser, '/tools/bin/*.xml', String.raw`/tools/bin/[^/]*\.xml`);
  comparePattern(parser, '/build/obj', String.raw`/build/obj`);
  comparePattern(parser, 'src/**/obj', String.raw`src/.*/obj`);
}

export function testCmdTerminal() {
  const parser = new GitIgnore('', true, true, true, TerminalType.CMD, false);
  // Generate test below: msr -p src\test\suite\gitIgnoreTest.ts -b "function testLinuxTerminal" -q "^\s*\}" -t "^(\s*comparePattern\(\w+, [^,]+).*" -o "\1);" -P
  comparePattern(parser, '[Bb]in', String.raw`[Bb]in`);
  comparePattern(parser, '[Bb]in/', String.raw`[Bb]in\\`);
  comparePattern(parser, '/[Bb]in/', String.raw`\\[Bb]in\\`);
  comparePattern(parser, '/.[Bb]in/', String.raw`\\\.[Bb]in\\`);
  comparePattern(parser, 'build', String.raw`build`);
  comparePattern(parser, '/build/', String.raw`\\build\\`);
  comparePattern(parser, 'build/', String.raw`build\\`);
  comparePattern(parser, '/.history/*', String.raw`\\\.history\\`);
  comparePattern(parser, '/.code', String.raw`\\\.code`);
  comparePattern(parser, '*.txt', String.raw`\.txt$`);
  comparePattern(parser, '*.mid.ext', String.raw`\.mid\.ext$`);
  comparePattern(parser, '*.mid.ext/', String.raw`[^\\]*\.mid\.ext\\`);
  comparePattern(parser, '*.mid.*', String.raw`\.mid\.[^\\]*$`);
  comparePattern(parser, '*.mid.*/', String.raw`[^\\]*\.mid\.[^\\]*\\`);
  comparePattern(parser, '/src/**/*.doc', String.raw`\\src\\.*\\[^\\]*\.doc`);
  comparePattern(parser, '/src/test/**/*.mid', String.raw`\\src\\test\\.*\\[^\\]*\.mid`);
  comparePattern(parser, '/src/**/build.info', String.raw`\\src\\.*\\build\.info`);
  comparePattern(parser, 'deploy/my/.config/*', String.raw`deploy\\my\\\.config\\`);
  comparePattern(parser, '__pycache__/', String.raw`__pycache__\\`);
  comparePattern(parser, 'Settings.Cache', String.raw`Settings\.Cache`);
  comparePattern(parser, '/web/.vscode', String.raw`\\web\\\.vscode`);
  comparePattern(parser, '/tools/build/', String.raw`\\tools\\build\\`);
  comparePattern(parser, '/tools/bin/*.xml', String.raw`\\tools\\bin\\[^\\]*\.xml`);
  comparePattern(parser, '/build/obj', String.raw`\\build\\obj`);
  comparePattern(parser, 'src/**/obj', String.raw`src\\.*\\obj`);
}

export function testCmdTerminalWithForwardingSlash() {
  const parser = new GitIgnore('', true, true, true, TerminalType.CMD, true);
  // Generate test below: msr -p src\test\suite\gitIgnoreTest.ts -b "function testLinuxTerminal" -q "^\s*\}" -t "^(\s*comparePattern\(\w+, [^,]+).*" -o "\1);" -P
  comparePattern(parser, '[Bb]in', String.raw`[Bb]in`);
  comparePattern(parser, '[Bb]in/', String.raw`[Bb]in/`);
  comparePattern(parser, '/[Bb]in/', String.raw`/[Bb]in/`);
  comparePattern(parser, '/.[Bb]in/', String.raw`/\.[Bb]in/`);
  comparePattern(parser, 'build', String.raw`build`);
  comparePattern(parser, '/build/', String.raw`/build/`);
  comparePattern(parser, 'build/', String.raw`build/`);
  comparePattern(parser, '/.history/*', String.raw`/\.history/`);
  comparePattern(parser, '/.code', String.raw`/\.code`);
  comparePattern(parser, '*.txt', String.raw`\.txt$`);
  comparePattern(parser, '*.mid.ext', String.raw`\.mid\.ext$`);
  comparePattern(parser, '*.mid.ext/', String.raw`[^/]*\.mid\.ext/`);
  comparePattern(parser, '*.mid.*', String.raw`\.mid\.[^/]*$`);
  comparePattern(parser, '*.mid.*/', String.raw`[^/]*\.mid\.[^/]*/`);
  comparePattern(parser, '/src/**/*.doc', String.raw`/src/.*/[^/]*\.doc`);
  comparePattern(parser, '/src/test/**/*.mid', String.raw`/src/test/.*/[^/]*\.mid`);
  comparePattern(parser, '/src/**/build.info', String.raw`/src/.*/build\.info`);
  comparePattern(parser, 'deploy/my/.config/*', String.raw`deploy/my/\.config/`);
  comparePattern(parser, '__pycache__/', String.raw`__pycache__/`);
  comparePattern(parser, 'Settings.Cache', String.raw`Settings\.Cache`);
  comparePattern(parser, '/web/.vscode', String.raw`/web/\.vscode`);
  comparePattern(parser, '/tools/build/', String.raw`/tools/build/`);
  comparePattern(parser, '/tools/bin/*.xml', String.raw`/tools/bin/[^/]*\.xml`);
  comparePattern(parser, '/build/obj', String.raw`/build/obj`);
  comparePattern(parser, 'src/**/obj', String.raw`src/.*/obj`);
}
