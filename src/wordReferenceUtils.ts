import { ParsedPath } from "path";
import { FileExtensionToMappedExtensionMap, MyConfig } from "./dynamicConfig";

export const FindJavaSpringReferenceCodeInPowerShell = `
  $word = '%1';
  $pure = msr -z $word -t '^(is|get|set)([A-Z])' -o \\2 -aPAC;
  $cap = [Char]::ToUpper($pure[0]) + $pure.Substring(1);
  $camel = [Char]::ToLower($pure[0]) + $pure.Substring(1);
  $set = New-Object System.Collections.Generic.HashSet[string];
  [void] $set.Add($word);
  if ($pure.Length -lt $word.Length) { 
      if([Char]::IsUpper($pure[0])) {
          [void] $set.Add($camel);
      } else {
          [void] $set.Add($cap);
      }
  }
  [void] $set.Add('is' + $cap);
  [void] $set.Add('get' + $cap);
  [void] $set.Add('set' + $cap);
  $pattern = '\\b(' + [String]::Join('|', $set) +  ')\\b';
  `.trim();

export function changeToReferencePattern(rawWord: string, parsedFile: ParsedPath): string {
  if (!MyConfig.AutoChangeSearchWordForReference) {
    return rawWord;
  }

  if (!rawWord.match(/^\w+$/)) {
    return rawWord;
  }

  const extension = parsedFile.ext;
  // Check current supported languages:
  const mappedExt = FileExtensionToMappedExtensionMap.get(extension) || extension;
  if (mappedExt !== '.java') {
    return rawWord;
  }

  let pureName = rawWord.replace(/^(is|get|set)([A-Z])/, '$2');
  let wordSet = new Set<string>()
    .add(rawWord);

  const capitalName = pureName[0].toUpperCase() + pureName.substring(1);
  const camelName = pureName[0].toLowerCase() + pureName.substring(1);
  if (capitalName.length < rawWord.length) {
    if (pureName[0].toUpperCase() === pureName[0]) {
      wordSet.add(camelName);
    } else {
      wordSet.add(capitalName);
    }
  }

  wordSet
    .add('is' + capitalName)
    .add('get' + capitalName)
    .add('set' + capitalName);

  const text = "\\b"
    + (wordSet.size > 1 ? "(" : "")
    + Array.from(wordSet).join("|")
    + (wordSet.size > 1 ? ")" : "")
    + "\\b";
  return text;
}