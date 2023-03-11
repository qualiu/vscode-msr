import { ParsedPath } from "path";
import { FileExtensionToMappedExtensionMap, MyConfig } from "./dynamicConfig";

export const FindJavaSpringReferenceByPowerShellAlias = `
  $rawWord = '%1';
  if ([string]::IsNullOrWhiteSpace($rawWord)) {
    return;
  }
  $checkWords = New-Object System.Collections.Generic.HashSet[string];
  [void] $checkWords.Add($rawWord);
  $memberPattern = '(^m?_+|_+$)';
  if ($rawWord -match $memberPattern) {
    [void] $checkWords.Add(($rawWord -replace $memberPattern, ''));
  } else {
    [void] $checkWords.Add('m_' + $rawWord);
    [void] $checkWords.Add('_' + $rawWord);
    [void] $checkWords.Add($rawWord + '_');
  }
  $wordSet = New-Object System.Collections.Generic.HashSet[string];
  [void] $wordSet.Add($rawWord);
  foreach ($word in $checkWords) {
    if ($word -match $memberPattern) {
      continue;
    }
    $pure = msr -z $word -t '^(is|get|set)([A-Z])' -o \\2 -aPAC;
    $cap = [Char]::ToUpper($pure[0]) + $pure.Substring(1);
    $camel = [Char]::ToLower($pure[0]) + $pure.Substring(1);
    if ($pure.Length -lt $word.Length) { 
        if([Char]::IsUpper($pure[0])) {
            [void] $wordSet.Add($camel);
        } else {
            [void] $wordSet.Add($cap);
        }
    }
    [void] $wordSet.Add('is' + $cap);
    [void] $wordSet.Add('get' + $cap);
    [void] $wordSet.Add('set' + $cap);
  }
  $pattern = '\\b(' + [String]::Join('|', $wordSet) +  ')\\b';
  if ([regex]::IsMatch($rawWord, '^[A-Z_]+$')) {
    $pattern = '\\b' + $rawWord + '\\b';
  }
  `.trim();

export function changeToReferencePattern(rawWord: string, parsedFile: ParsedPath): string {
  if (!MyConfig.AutoChangeSearchWordForReference) {
    return rawWord;
  }

  // skip if contains non-alphabetic char, or whole word is upper case:
  if (!rawWord.match(/^\w+$/) || rawWord.match(/^[A-Z_]+$/)) {
    return rawWord;
  }

  const extension = parsedFile.ext.replace(/^\./, '');
  const memberPattern = /^m?_+|_+$/;

  const mappedExt = FileExtensionToMappedExtensionMap.get(extension) || extension;

  if (!rawWord.startsWith('m_') // cpp member style
    && mappedExt !== 'java' // java spring members
    && mappedExt !== 'bp' // bond/proto members
  ) {
    return rawWord;
  }

  let checkWords = new Set<String>()
    .add(rawWord);
  if (rawWord.match(memberPattern)) {
    checkWords.add(rawWord.replace(memberPattern, ''));
  } else {
    checkWords.add('m_' + rawWord)
      .add('_' + rawWord)
      .add(rawWord + '_');
  }

  let wordSet = new Set<string>()
    .add(rawWord);

  checkWords.forEach(word => {
    if (word.match(memberPattern)) {
      return;
    }

    const pure = word.replace(/^(is|get|set)([A-Z])/, '$2');
    const cap = pure[0].toUpperCase() + pure.substring(1);
    const camel = pure[0].toLowerCase() + pure.substring(1);
    if (cap.length < word.length) {
      if (pure[0].toUpperCase() === pure[0]) {
        wordSet.add(camel);
      } else {
        wordSet.add(cap);
      }
    }

    wordSet
      .add('is' + cap)
      .add('get' + cap)
      .add('set' + cap);

  });

  const text = "\\b"
    + (wordSet.size > 1 ? "(" : "")
    + Array.from(wordSet).join("|")
    + (wordSet.size > 1 ? ")" : "")
    + "\\b";
  return text;
}
