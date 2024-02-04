import * as assert from 'assert';
import { replaceForLoopVariableOnWindows } from '../../commonAlias';
import { getCommandAliasMap } from '../../cookCommandAlias';
import { TerminalType } from '../../enums';
import { IsWindows } from '../../constants';

// Tail args: $* or $@ or ${@} or "${@}"
const TailArgsRegex: RegExp = /\$([\*@]|\{@\})\W*$/; // Linux + Windows-doskey-file
const LinuxFunctionTailArgsRegex: RegExp = /\$([\*@]|\{@\})\W*[\r\n]+/; // Linux-bash-file
const WindowsBatchScriptArg1Regex: RegExp = /%~?1\b/; // Windows-batch-file (.cmd or .bat)
const WindowsBatchScriptTailArgsRegex: RegExp = /%\*\W*$/; // Windows-batch-file (.cmd or .bat)
const IsForLoopExists: RegExp = /\bfor\s+\/f\b(\s+".+?")?\s+%+[a-z]\s+in\s+\(/i;
const WindowsForLoopScriptArgRegex: RegExp = /%%[a-zA-Z]\b/; // Windows-batch-file (.cmd or .bat)
const WindowsAliasForLoopScriptArgRegex: RegExp = /[^\w%]%[a-zA-Z]\b/; // Windows-doskey-file

function checkWindowsForLoop(command: string, isScriptFile: boolean) {
  if (IsForLoopExists.test(command)) {
    if (isScriptFile) {
      assert.ok(WindowsForLoopScriptArgRegex.test(command));
    } else {
      assert.ok(WindowsAliasForLoopScriptArgRegex.test(command));
    }
  }
}

export function testWindowsGeneralCmdAlias() {
  const [map] = getCommandAliasMap(TerminalType.CMD, '', false, false);
  let alias = map.get('git-add-safe-dir') || '';
  assert.ok(alias.startsWith('git-add-safe-dir='));
  assert.ok(!TailArgsRegex.test(alias));
  checkWindowsForLoop(alias, false);

  alias = map.get('wcopy') || '';
  assert.ok(alias.startsWith('wcopy='));
  assert.ok(!TailArgsRegex.test(alias));
  assert.ok(alias.includes('$1'));
  checkWindowsForLoop(alias, false);

  alias = map.get('find-ref') || '';
  assert.ok(alias.startsWith('find-ref='));
  assert.ok(TailArgsRegex.test(alias));
  assert.ok(alias.includes('$1'));
  checkWindowsForLoop(alias, false);

  alias = map.get('sfs') || '';
  assert.ok(alias.startsWith('sfs='));
  assert.ok(TailArgsRegex.test(alias));
  assert.ok(!alias.includes('$1'));
  checkWindowsForLoop(alias, false);

  alias = map.get('add-user-path') || '';;
  assert.ok(alias.startsWith('add-user-path='));
  assert.ok(!alias.endsWith('$*'));
  assert.ok(!alias.includes('$1'));
  checkWindowsForLoop(alias, false);

  alias = map.get('reset-env') || '';
  assert.ok(alias.startsWith('reset-env='));
  assert.ok(alias.includes(String.raw`+ '^=\"'`));
  checkWindowsForLoop(alias, false);

  alias = map.get('reload-env') || '';
  assert.ok(alias.startsWith('reload-env='));
  assert.ok(alias.includes(String.raw`+ '^='`));
  checkWindowsForLoop(alias, false);

  alias = map.get('find-spring-ref') || '';
  assert.ok(alias.startsWith('find-spring-ref='));
  assert.ok(alias.includes('$1'));
  assert.ok(alias.includes('$2 $3 $4 $5 $6 $7 $8 $9'));
  checkWindowsForLoop(alias, false);
}

export function testWindowsGeneralCmdAliasScript() {
  const [map] = getCommandAliasMap(TerminalType.CMD, '', false, true);
  let alias = map.get('git-add-safe-dir') || '';
  assert.ok(!alias.startsWith('git-add-safe-dir='));
  assert.ok(!WindowsBatchScriptTailArgsRegex.test(alias));
  checkWindowsForLoop(alias, true);

  alias = map.get('wcopy') || '';
  assert.ok(!alias.startsWith('wcopy='));
  assert.ok(!WindowsBatchScriptTailArgsRegex.test(alias));
  assert.ok(WindowsBatchScriptArg1Regex.test(alias));
  checkWindowsForLoop(alias, true);

  alias = map.get('find-ref') || '';
  assert.ok(!alias.startsWith('find-ref='));
  assert.ok(WindowsBatchScriptTailArgsRegex.test(alias));
  assert.ok(WindowsBatchScriptArg1Regex.test(alias));
  checkWindowsForLoop(alias, true);

  alias = map.get('sfs') || '';
  assert.ok(!alias.startsWith('sfs='));
  assert.ok(WindowsBatchScriptTailArgsRegex.test(alias));
  assert.ok(!WindowsBatchScriptArg1Regex.test(alias));
  checkWindowsForLoop(alias, true);

  alias = map.get('add-user-path') || '';;
  assert.ok(!alias.startsWith('add-user-path='));
  assert.ok(!WindowsBatchScriptTailArgsRegex.test(alias));
  assert.ok(!WindowsBatchScriptArg1Regex.test(alias));
  assert.ok(alias.includes("'%*'.Trim"));
  checkWindowsForLoop(alias, true);

  alias = map.get('reset-env') || '';
  assert.ok(!alias.startsWith('reset-env='));
  assert.ok(alias.includes(String.raw`+ '^=\"'`));
  checkWindowsForLoop(alias, true);

  alias = map.get('reload-env') || '';
  assert.ok(!alias.startsWith('reload-env='));
  assert.ok(alias.includes(String.raw`+ '^='`));
  checkWindowsForLoop(alias, true);

  alias = map.get('find-spring-ref') || '';
  assert.ok(!alias.startsWith('find-spring-ref='));
  assert.ok(WindowsBatchScriptArg1Regex.test(alias));
  checkWindowsForLoop(alias, true);
}

export function testLinuxGeneralCmdAlias() {
  const [map] = getCommandAliasMap(TerminalType.LinuxBash, '', false, false);
  let alias = map.get('git-add-safe-dir') || '';
  assert.ok(alias.startsWith('alias git-add-safe-dir='));
  assert.ok(!TailArgsRegex.test(alias) && !LinuxFunctionTailArgsRegex.test(alias));

  alias = map.get('find-ref') || '';
  assert.ok(alias.startsWith('alias find-ref='));
  assert.ok(!TailArgsRegex.test(alias) && !LinuxFunctionTailArgsRegex.test(alias));
  assert.ok(alias.includes('$1'));

  alias = map.get('sfs') || '';
  assert.ok(alias.startsWith('alias sfs='));
  assert.ok(LinuxFunctionTailArgsRegex.test(alias));
  assert.ok(!alias.includes('$1'));

  alias = map.get('find-spring-ref') || '';
  assert.ok(alias.startsWith('alias find-spring-ref='));
  assert.ok(alias.includes('$1'));
  assert.ok(alias.includes('${@:2}'));
}

export function testLinuxGeneralCmdAliasScript() {
  const [map] = getCommandAliasMap(TerminalType.LinuxBash, '', false, true);
  let alias = map.get('git-add-safe-dir') || '';
  assert.ok(!alias.startsWith('alias '));
  assert.ok(!TailArgsRegex.test(alias));

  alias = map.get('find-ref') || '';
  assert.ok(!alias.startsWith('alias '));
  assert.ok(alias.includes('$1'));
  assert.ok(alias.includes('${@:2}'));

  alias = map.get('sfs') || '';
  assert.ok(!alias.startsWith('alias '));
  assert.ok(TailArgsRegex.test(alias));
  assert.ok(!alias.includes('$1'));

  alias = map.get('find-spring-ref') || '';
  assert.ok(!alias.startsWith('alias '));
  assert.ok(alias.includes('$1'));
  assert.ok(alias.includes('${@:2}'));
}


export function testForLoopCmdAlias() {
  const doskeyBodyToExpectedMap = new Map<string, string>()
    .set(
      `for /f %a in ('xxx') do echo %a %A %B %b`,
      `for /f %%a in ('xxx') do echo %%a %A %B %b`
    )
    .set(
      `for /f "tokens=*" %a in ('xxx') do echo %a %A %B %b`,
      `for /f "tokens=*" %%a in ('xxx') do echo %%a %A %B %b`,
    )
    .set(
      `for /f "tokens=1,2,3" %a in ('xxx') do echo %a %b %c %A %B %C %d`,
      `for /f "tokens=1,2,3" %%a in ('xxx') do echo %%a %%b %%c %A %B %C %d`,
    )
    .set(
      `for /f "tokens=1,3" %a in ('xxx') do echo %a %b %c %d %A %B %C %a`,
      `for /f "tokens=1,3" %%a in ('xxx') do echo %%a %b %%c %d %A %B %C %%a`,
    )
    .set(
      String.raw`for /f "tokens=1,2,3" %a in ('xxx') do echo %a%b%c\%c/%b\%%a %d %A %B %C`,
      String.raw`for /f "tokens=1,2,3" %%a in ('xxx') do echo %%a%%b%%c\%%c/%%b\%%%a %d %A %B %C`,
    )
    .set(
      `for /f "tokens=1,3 delime=;" %a in ('xxx') do ( for /f "tokens=*" %d in ('loop2') do Loop1 %a %b %c Loop2 %d %D %e Mix %a-%b-%c-%d )`,
      `for /f "tokens=1,3 delime=;" %%a in ('xxx') do ( for /f "tokens=*" %%d in ('loop2') do Loop1 %%a %b %%c Loop2 %%d %D %e Mix %%a-%b-%%c-%%d )`,
    )
    .set(
      `for /f "tokens=1,3 delime=; " %a in ('xxx') do ( for /f %d in ('loop2') do Loop1 %a %b %c Loop2 %d %D %e Mix %a-%b-%c-%d )`,
      `for /f "tokens=1,3 delime=; " %%a in ('xxx') do ( for /f %%d in ('loop2') do Loop1 %%a %b %%c Loop2 %%d %D %e Mix %%a-%b-%%c-%%d )`,
    )
    .set(
      `for /f %a in ('dir /b *.txt') do ( for /f %b in ('dir /a:d /b %~dpa') do echo %~dpa%~nxb )`,
      `for /f %%a in ('dir /b *.txt') do ( for /f %%b in ('dir /a:d /b %%~dpa') do echo %%~dpa%%~nxb )`
    )
    ;

  doskeyBodyToExpectedMap.forEach((expected, doskey, _) => {
    const result = replaceForLoopVariableOnWindows(doskey);
    console.info('doskey   = ' + doskey);
    console.info('Result   = ' + result);
    console.info('Expected = ' + expected);
    assert.strictEqual(result, expected || '');
    console.info('');
  });
}
