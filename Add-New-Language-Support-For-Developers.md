# Add Supports to New Languages by Developers and Contributors

**Two methods** to support a new language. (Normal user see [here](https://github.com/qualiu/vscode-msr/blob/master/README.md#easy-to-support-new-languages))

Suggest: Change the user settings: Un-check `msr.quiet` (and check `msr.debug` if need) when you're debugging this extension.

## File to Add New Language Settings

For developer/contributors: [package.json](https://github.com/qualiu/vscode-msr/blob/master/package.json)

Take **finding definition** for **batch** files (`*.bat` and `*.cmd`) as an example.

## Method-1: Only Add One Extension of the New Language You Want to Support

If you only want to support finding definition for `*.bat` files other than all `batch` script (`*.bat` + `*.cmd`):

Add **lower case** `extension name`: "**msr.{extension}.definition**" (here `{extension}` = **bat** ) into the [file](#file-to-add-new-language-settings):

```json
  "msr.bat.definition": {
    "description": "Batch file extension of *.bat file only (Not support *.cmd file).",
    "type": "string",
    "default": "^\\s*:\\s*(%1)\\b|(^|\\s)set\\s+(/a\\s+)?\\\"?(%1)="
  }
```

## Method-2: Support All Extensions of the New Language by Adding 2 Mandatory Settings

- Add **lower case** `language name` (as you want): "**msr.fileExtensionMap**.`{Name}`" (here `{Name}` = **batch** ) into the [file](#file-to-add-new-language-settings):

```json
  "msr.fileExtensionMap.batch": {
    "description": "Batch file extensions (*.bat + *.cmd files)",
    "type": "string",
    "default": "bat cmd"
  }
```

- Add Regex match pattern to find definition (lower case name `msr.batch.definition`):

```json
  "msr.batch.definition": {
    "description": "Regex pattern to search batch file definitions of a function or variable.",
    "type": "string",
    "default": "^\\s*:\\s*(%1)\\b|(^|\\s)set\\s+(/a\\s+)?\\\"?(%1)="
  }
```

## Optional: Add Other Settings if Necessary

For example, if you want to overwrite `default.skip.definition` for **batch** files, add "**msr.{name}.skip.definition**" in [file](#file-to-add-new-language-settings):

```json
  "msr.batch.skip.definition": {
    "type": "string",
    "default": ""
  }
```

### Many Other Settings if You Want to Override or Add or Update

- Specific type of definition Regex like:
  - C# class: `msr.cs.class.definition`
  - C# method: `msr.cs.method.definition`
  - C# enumerate: `msr.cs.enum.definition`
  - Python class: `msr.py.class.definition`
- Skip definition (exclude some search results from search patterns like `msr.py.class.definition`):
  - Java `msr.java.skip.definition` for `Java` + `Scala` (see `msr.fileExtensionMap.java`)
  - C#: `msr.cs.skip.definition` for `C#` (`*.cs` + `*.cshtml`) (see `msr.fileExtensionMap.cs`)
  - UI: `msr.ui.skip.definition` for `JavaScript` (`*.js`, `*.jsx`) + `TypeScript`(`*.ts` + `*.tsx`) + `Vue` (`*.vue`)
- Specific type checking before search (like determine how many Regex pattern to use: `class`, `method` and `enum` etc.):
  - Python class check: `msr.py.isClass`
  - Python member check: `ms.py.isMember` (for a class `members`, like `property`/`field` in C#)

## Note: Override Rule for the Language Settings in the File

The explicit settings are over general settings in the [file](#file-to-add-new-language-settings).

For example as above: `bat` = `*.bat file`, `batch` = `*.bat + *.cmd files`, so the override results as following:

- `msr.bat.definition` overrides `msr.batch.definition` overrides `msr.default.definition`
- `msr.bat.skip.definition` overrides `msr.batch.skip.definition` overrides `msr.default.skip.definition`

## Additional Explanation for the Regex Pattern Used above when Support Batch Scripts

- Batch script's function definition match pattern (Functions are often written at the head of a line):
  - `^\s*:MyFunction` to match functions like `:{MyFunction}` at head of lines.
- Batch script's variable definition match pattern:
  - String variable: `set Folder=` to match variables like `set Folder=D:\TEMP`
  - Quoted strings: `set \"PATH=` to match variables like `set "PATH=Value"`
  - Numeric variable: `set /a Count=` to match variables like `set /a Count=3`
- So the merged Regex pattern is:
  - `^\s*:\w+|set \w+=|set \"\w+=|set /a \w+=`
- We need to capture/replace the name of `functions` or `variables` under mouse/cursor, use `%1` as a `place holder`:
  - `^\s*:%1|set %1=|set \"%1=|set /a %1=`
- More robust Regex to be:
  - `^\s*:\s*(%1)\b|(^|\s)set\s+(/a\\s+)?\\"?(%1)=`
- Finally, escape the slash `\` to `\\` for JSON file content:
  - `"^\\s*:\\s*(%1)\\b|(^|\\s)set\\s+(/a\\s+)?\\\"?(%1)="`
