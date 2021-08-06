import * as assert from 'assert';
import { replaceForLoopVariableOnWindows } from '../../cookCommandAlias';

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
