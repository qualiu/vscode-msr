# vscode-msr

Have you suffered issues of finding `definitions` and `references`:
- **Unable to `jump-to-definition` or `find-references`** if `IDE has problems` or `build failed` or `lack of packages` ?
- **Unable to coding in IDE for one entire repository** due to `multpile types of coding languages` (`C#` , `C++` , `Java`/`Scala`, `Python`, `Vue` , etc.)
- **Unable to coding in IDE for multiple related repositories** ?
- **Missed updates to some types of files** when performed changes like `rename`, `refactor`, `update-versions`, etc.
- **Quite slow to take a full search** but have to do it and wait ?
  
Then it's the light and right tool for you: (Take **less than 1 minute** for [requirements](#Requirements) before using)

- Fast find **definitions** + **references** for **all types** of coding languages files, acrosss **multiple related repositories** on local.
- Also support searching references for:
  - Configuration files (`json`, `yaml`, `xml`, `ini`, etc.)
  - Document files (`md`, `readme.txt`, etc.)
- Easy and repeatible to **replace files**: Change all related types of files when you take a `code refactoring` or `configuration updates`.
  - Just copy the `find referece` command line shown on VS code;
  - Then add [`-o` `replace-to-text`](https://github.com/qualiu/msr/blob/master/README.md) and `-R` (replace files).
  - Also can use `-j` to just show changed files before use `-R`. More types of filters see [doc](https://github.com/qualiu/msr/blob/master/README.md) or just run the [msr-EXE](https://qualiu.github.io/msr/usage-by-running/msr-Windows.html).

## Features

- Got search results in **1~3 seconds** for 20000~30000+ code files (stored on a hard drive **not SSD**) after first time.

- Just leverage [one tiny exe: msr-EXE](https://github.com/qualiu/msr/blob/master/README.md), without `storage/cache`, `server/service`, `network`, etc.

- You can find **definitions** + **references** of source code from `configuration files` or `readme document files`.

- Flexible + simple configuration (`just general Regex` of `C++`,`Java`,`C#`,`Scala`,`Python`) to:
  - Finding definitions and references without knowledge, you can even find it from configuration files or documents.
  - Support all types of coding languages, just add `Regex` patterns.
  - Provide command line to search, or replace (just add `-o` `replace-text`), helpful to rename/update all types of files..
  - Set **include** + **exclude** conditions to filter file, folder, path, size, time, search-depth etc.

- You can also directly use the [msr.EXE](https://github.com/qualiu/msr/tree/master/tools) command line in `Visual Studio Code` output channel `MSR-Def-Ref` to **search** + **replace** files.

- This extension support `Windows` + `Linux` (`Ubuntu` / `CentOS` / `Fedora`).

Search **Definitions** + **References** for **C++** / **Python** / **Java** in `Visual Studio Code`:  ([Can't see gif ? open in browser](https://raw.githubusercontent.com/qualiu/vscode-msr/master/images/find-def-ref.gif))
<img src=https://github.com/qualiu/vscode-msr/blob/master/images/find-def-ref.gif width=956 height=480>

## Requirements

Just **download** the tiny [msr.EXE](https://github.com/qualiu/msr/tree/master/tools) (of your system type) , then **add** it to `%PATH%` or `$PATH`. You can try below command lines:

- **Windows**：Download + copy to a folder like `%SystemRoot%` (Use **[msr-Win32.exe](https://github.com/qualiu/msr/raw/master/tools/msr-Win32.exe)** for 32-bit system)

     **Powershell** `-Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri https://github.com/qualiu/msr/blob/master/tools/msr.exe?raw=true -OutFile msr.exe"` && **copy** [msr.exe](https://github.com/qualiu/msr/raw/master/tools/msr.exe) `%SystemRoot%\`
  
- **Cygwin**: copy or make a link (`ln -s msr.cygwin /usr/bin/msr`)

     **wget** https://github.com/qualiu/msr/raw/master/tools/msr.cygwin && `chmod +x msr.cygwin` && `cp msr.cygwin /usr/bin/msr`
  
- **Linux**: `Ubuntu`,`CentOS`,`Fedora`: (gcc/g++ >= 4.8, Use **[msr-i386.gcc48](https://github.com/qualiu/msr/raw/master/tools/msr-i386.gcc48)** for 32-bit system)

    **wget** https://github.com/qualiu/msr/raw/master/tools/msr.gcc48 && `chmod +x msr.gcc48` && `cp msr.gcc48 /usr/bin/msr`

If succeeded, run **msr --help** (or **msr -h** or just **msr**) should display colorful usages and examples.

## Avoid Security Softwares Downgrade Search Performance

Add exclusion to avoid performance big impact from system security softwares, just like the impacts to `node.exe` , `pip.exe` and `python.exe` etc.

For example on **Windows** see official doc: [Add an exclusion to Windows Security](https://support.microsoft.com/en-us/help/4028485/windows-10-add-an-exclusion-to-windows-security).

Add **Process** type (name) + **File** type (path) exclusions for [msr.EXE](https://github.com/qualiu/msr/tree/master/tools).

## Extension Settings

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

For example, this extension contributes the following settings:

### General/Default Settings Examples

- `msr.enabled`: Enable/disable this extension.
- `msr.enable.findDef`: Enable/disable `find definitions`.
- `msr.enable.findRef`: Enable/disable `find references`.
- `msr.default.maxSearchDepth`: Set `max search depth` when finding definitions or references.
- `msr.default.codeFiles`: Set `default` Regex pattern for `source code files`.
- `msr.descendingSortForVSCode`: Descending sort search results for `vscode`.
- `msr.descendingSortForConsoleOutput`: Descending sort search results for output channel in `vscode` bottom.
- `msr.default.extraSearchPaths`: **Extra search paths** of external repositories, dependency sources, or libraries, etc.
- `msr.default.extraSearchPathListFiles`: **Read extra search path list files** of external repositories, dependency sources, or libraries, etc.

These **extra search paths** settings enable searching related files **without loading** them into `Visual Studio Code`.

You can also set extra search paths for each type of coding language.

### Specific Coding Language Settings Examples

- `msr.cs.codeFiles`: Regex pattern of `C#` source code file names (extensions).**
- `msr.cpp.codeAndConfigDocs`: Regex pattern of `C++`  code + configuration + document files.
- `msr.py.extraSearchPaths`: **Extra search paths** for `Python` code's external repositories, dependency sources, or libraries, etc.

## Welcome to Contribute

Github repository: https://github.com/qualiu/vscode-msr

You may just need to add or update the [configuration file](https://github.com/qualiu/vscode-msr/blob/master/package.json): Add or update `Regex` patterns of `find-references` or `find-definitions` for various coding languages.

### Add New Support or Improve

Please help to set the `Regex` patterns for them if you want. You can:

- Reference the `findDef` or `findRef` Regex patterns of **default** or a specific language type.
- Use the rich searching options of [msr-EXE](https://github.com/qualiu/msr/blob/master/README.md) like below, **combine** these **optional** options:
  - **-t** `should-match-Regex-pattern`
  - **--nt** `should-not-match-Regex-pattern`
  - **-x** `should-contain-plain-text`
  - **--nx** `should-not-contains-plain-text`
  - Filter `file name`: **-f** `should-match-Regex` , **--nf** `should-not-match`
  - Filter `directory name`: **-d** `at-least-one-match` , **--nd** `none-should-match`
  - Filter `full path pattern`: **--pp** `should-match` , **--np** `should-not-match`
  - Filter `file size`: **--s1** <= size <= **s2** , like set one or two: **--s1** `1B` **--s2** `1.5MB`
  - Filter `file time`: like **--w1** `2019-07`, **--w2** `"2019-07-16 13:20"` or `2019-07-16T13:20:01` (quote it if has spaces).
  - Filter rows by row number range: like **-L** 10 **-N** 200 (for each file).
  - Filter rows by begin + end Regex: like **-b** `"^\s*public.*?class"` **-q** `"^\s*\}\s*$"`
  - Filter rows by 1 or more blocks: **-b** `"^\s*public.*?class"` **-Q** `"^\s*\}\s*$"`
  - Filter rows by 1 or more blocks + **stop** like: **-b** `"^\s*public.*?class"` **-Q** `"^\s*\}\s*$"` **-q** `stop-matching-regex`

### Check and Update this doc
  
  Easy to check consistency of [configurations](https://github.com/qualiu/vscode-msr/blob/master/package.json) with `this document` by command lines below:

  **[nin](https://github.com/qualiu/msr/tree/master/tools)** `README.md` [package.json](https://github.com/qualiu/vscode-msr/blob/master/package.json) **"(msr\\.[\w\\.]+)"** --nt `"msr\.(exe|gcc\w+|cygwin)"` -i -c Should no result

  **[nin](https://github.com/qualiu/msr/tree/master/tools)** `README.md` [package.json](https://github.com/qualiu/vscode-msr/blob/master/package.json) **"(msr\\.[\w\\.]+)"** --nt `"msr\.(exe|gcc\w+|cygwin)"` -i **-m** -c Should have results

## Known Issues

- Performance Depends on system hardware conditions.
  
  For example, it may slower than usual if disk (where code files stored) is busy, or slower than expected if the hardware is old.

- Currently Just for Class and Method.

  Just search definitions and references for `classes` and `methods`, not for `enum` , `property`, `field` etc.

  Welcome + Please help to improve it: See [Add New Support or Improve](#Add-New-Support-or-Improve).

## Release Notes

### 1.0.0

Initial release of `vscode-msr` extension.

-----------------------------------------------------------------------------------------------------------

**Enjoy!**
