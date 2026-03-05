import * as assert from 'assert';
import { replaceForLoopVariableForWindowsScript } from '../../commonAlias';
import { hasSpecificDefinitionConfig, shouldGenerateDefinitionAlias } from '../../configUtils';
import { getCommandAliasMap } from '../../cookCommandAlias';
import { TerminalType } from '../../enums';

// Tail args: $* or $@ or ${@} or "${@}"
const TailArgsRegex: RegExp = /\$([\*@]|\{@\})\W*$/; // Linux + Windows-doskey-file
const LinuxFunctionTailArgsRegex: RegExp = /\$([\*@]|\{@\})\W*[\r\n]+/; // Linux-bash-file
const WindowsBatchScriptArg1Regex: RegExp = /%~?1\b/; // Windows-batch-file (.cmd or .bat)
const WindowsBatchScriptTailArgsRegex: RegExp = /%\*\W*$/; // Windows-batch-file (.cmd or .bat)
const IsForLoopExists: RegExp = /\bfor\s+\/[fl]\b(\s+".+?")?\s+%+[a-z]\s+in\s+\(/i;
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
      `for /L %k in (1,1,3) do echo %k`,
      `for /L %%k in (1,1,3) do echo %%k`
    )
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
    .set(
      `for /L %k in (1,1,3) do ( echo %k && for /f %a in ('dir /b *.txt') do ( do echo %k: %~dpa ) )`,
      `for /L %%k in (1,1,3) do ( echo %%k && for /f %%a in ('dir /b *.txt') do ( do echo %%k: %%~dpa ) )`
    )
    ;

  doskeyBodyToExpectedMap.forEach((expected, doskey, _) => {
    const result = replaceForLoopVariableForWindowsScript(doskey);
    console.info('doskey   = ' + doskey);
    console.info('Result   = ' + result);
    console.info('Expected = ' + expected);
    assert.strictEqual(result, expected || '');
    console.info('');
  });
}

// Test hasSpecificDefinitionConfig function
export function testHasSpecificDefinitionConfig() {
  // Extensions without specific definition config should return false
  assert.strictEqual(hasSpecificDefinitionConfig('', 'xyz', 'xyz'), false);
  assert.strictEqual(hasSpecificDefinitionConfig('', 'unknown', 'unknown'), false);
  
  // Common languages with definition patterns should return true
  // These are configured in package.json with specific definition patterns
  assert.strictEqual(hasSpecificDefinitionConfig('', 'cs', 'cs'), true);
  assert.strictEqual(hasSpecificDefinitionConfig('', 'java', 'java'), true);
  assert.strictEqual(hasSpecificDefinitionConfig('', 'py', 'py'), true);
  assert.strictEqual(hasSpecificDefinitionConfig('', 'go', 'go'), true);
  assert.strictEqual(hasSpecificDefinitionConfig('', 'cpp', 'cpp'), true);
  
  console.info('testHasSpecificDefinitionConfig passed');
}

// Test shouldGenerateDefinitionAlias function
export function testShouldGenerateDefinitionAlias() {
  const emptyRegex = new RegExp('^$');     // Disabled - matches nothing
  const allRegex = new RegExp('.');         // Enable all - matches any character
  const specificRegex = new RegExp('^(cs|java)$');  // Only cs and java
  
  // Case 1: Extension with specific definition config - always generates regardless of regex
  assert.strictEqual(shouldGenerateDefinitionAlias('', 'cs', 'cs', emptyRegex), true);
  assert.strictEqual(shouldGenerateDefinitionAlias('', 'java', 'java', emptyRegex), true);
  
  // Case 2: Extension without specific config + empty regex = no generation
  assert.strictEqual(shouldGenerateDefinitionAlias('', 'xyz', 'xyz', emptyRegex), false);
  assert.strictEqual(shouldGenerateDefinitionAlias('', 'txt', 'txt', emptyRegex), false);
  
  // Case 3: Extension without specific config + matching regex = generate
  assert.strictEqual(shouldGenerateDefinitionAlias('', 'xyz', 'xyz', allRegex), true);
  assert.strictEqual(shouldGenerateDefinitionAlias('', 'txt', 'txt', allRegex), true);
  
  // Case 4: Extension without specific config + specific regex
  assert.strictEqual(shouldGenerateDefinitionAlias('', 'md', 'md', specificRegex), false);
  
  console.info('testShouldGenerateDefinitionAlias passed');
}

// Test rgfind-xxx alias generation control
export function testRgfindAliasGeneration() {
  // Get the command alias map and check for rgfind-xxx patterns
  const [mapCmd] = getCommandAliasMap(TerminalType.CMD, '', false, false);
  const [mapLinux] = getCommandAliasMap(TerminalType.LinuxBash, '', false, false);
  
  // Check if any rgfind-xxx aliases exist (depends on CookRecursiveGitFindExtensionRegex config)
  const cmdRgfindAliases = Array.from(mapCmd.keys()).filter(k => k.startsWith('rgfind-'));
  const linuxRgfindAliases = Array.from(mapLinux.keys()).filter(k => k.startsWith('rgfind-'));
  
  console.info('CMD rgfind aliases count: ' + cmdRgfindAliases.length);
  console.info('Linux rgfind aliases count: ' + linuxRgfindAliases.length);
  
  // With default empty regex ('^$'), no rgfind-xxx should be generated
  // If config is changed to '.', rgfind-xxx will be generated for all find-xxx aliases
  // This test validates the mechanism works - actual count depends on configuration
  
  // Verify any generated rgfind aliases have proper format
  cmdRgfindAliases.forEach(alias => {
    const body = mapCmd.get(alias) || '';
    assert.ok(body.includes('for /f') || body.includes('for %'),
      'CMD rgfind alias should use for loop: ' + alias);
  });
  
  linuxRgfindAliases.forEach(alias => {
    const body = mapLinux.get(alias) || '';
    assert.ok(body.includes('for ') && body.includes(' in '),
      'Linux rgfind alias should use for loop: ' + alias);
  });
  
  console.info('testRgfindAliasGeneration passed');
}
