# vscode-msr

Have you suffered issues below in your daily work?

- **Unable to `jump-to-definition` or `find-references`** due to below issues:
  - Basic Issues
    - Lack of dependency packages.
    - Lack of build or build failed.
    - IDE caught some problems.
  - Other issues
    - `Multiple languages` in **one entire repository**: `C#` , `C++` , `Java`/`Scala`, `Python`, `Vue`, etc.
    - `Multiple root folders` of **multiple related repositories**.
- **Search code**: **Clumsy and slow** ?
  - Too **narrow** `vscode` panel to preview?
  - Wasting time to click and expand **each** item ?
  - `What if` a **colorful** + **fast** glance for **all search results** + **rich and powerful filters**?
- **Replace files**: **Lack of a fast + easy + safe + powerful** tool to replace files?
  - Missed updates to multiple coding language files when `rename` or `refactor` ?
  - Missed updates to `doc` + `config` files?
  - Your replacing tool **added** or **removed** the `tail empty line` ? And cause wrong `git diff` ?
  - Your replacing tool changed your file time even nothing changed?
  - `What if` a fast way to replace? Just leverage the powerful search used above?
- Just want to read/review code on laptop **but failed because you haven't done things below** ?
  - **Install X GB** `language plugins` which have a lot of dependencies.
  - **Download Y GB packages** to the disk.
  - **Build Z GB outputs** to the disk.
  - (Of-course: **Offer N GB running memory** to the `language plugins` or `IDE`. ~~)

Then it's the [**light** and **right** tool](https://github.com/qualiu/vscode-msr) for you (Take **less than 1 minute** for [better experience](#more-freely-to-use-and-help-you-more) and [**help you more**](#make-command-shortcuts-to-search-or-replace-in-or-out-of-vscode)).

Note: Support **64-bit** + **32-bit** : **Windows** + **Linux** (`Ubuntu` / `CentOS` / `Fedora` which `gcc`/`g++` version >= `4.8`).

## Features

- Got search results in **1~3 seconds** for 20000+ code files (on hard-drives, **SSD** maybe faster) after first time (cost 10~30+ seconds).

- Fast find **definitions** + **references** for **all types** of coding languages files, across **multiple related repositories** on local.

- Also can find **definitions** + **references** from **any type of files** + **any type** (like text `in comments` or `just typed`).

- Simple + flexible configuration (`just general Regex` of `C++`,`Java`,`C#`,`Python`), overwrite default settings if need.

- [**Normal** + **Extensive Search**](#normal-and-extensive-search) knows and serves you better.

- **Easy** + **Fast** to [**Search Further** or **Replace Files**](#reuse-the-command-to-search-further-or-replace-files): Just **reuse** the search command line by an upper arrow.

- [**Powerful** + **Convenient** **command shortcuts**](#make-command-shortcuts-to-search-or-replace-in-or-out-of-vscode) (alias/doskey) to **search**/**replace** code/config/doc files **in**/**out** `vscode`.

- **Easy** + **Fast** to [**Get the Best Combined Power**](#get-the-best-combined-power) of `vscode-msr` + your language plugins (like `vscode-python` / `vscode-java` etc.).

- [Every function is **under your control**](#every-function-is-under-your-control-and-easy-to-change) and easy to enable or disable.

- [**Easy to Support New Languages**](#easy-to-support-new-languages) with an example of support `batch` scripts (`*.bat` + `*.cmd` files).

- All just leverage one [tiny exe: msr-EXE](https://github.com/qualiu/msr/blob/master/README.md) **without** `storage`/`cache`, `server`/`service`, `network`, etc.
  - This extension costs **2~3 MB** download/storage + **3~10 MB** running memory.
  - Others may cost **X GB** storage for dependencies/packages + **Y GB** running memory + even **requires building**.

[Screenshot GIF](https://raw.githubusercontent.com/qualiu/vscode-msr/master/images/find-def-ref.gif): Search **Definitions** + **References** for **C++** / **Python** / **Java** in `Visual Studio Code`:

<img src='https://raw.githubusercontent.com/qualiu/vscode-msr/master/images/find-def-ref.gif' width=956 height=480>

More powerful usages + examples see [overview doc](https://github.com/qualiu/msr/blob/master/README.md) or just run [msr-EXE](https://qualiu.github.io/msr/usage-by-running/msr-Windows.html) you will see [colorful text doc of usage + examples](https://qualiu.github.io/msr/usage-by-running/msr-Windows.html) (on Windows, [Linux at here](https://qualiu.github.io/msr/usage-by-running/msr-CentOS-7.html)) or [doc without color](https://raw.githubusercontent.com/qualiu/msr/master/tools/readme.txt).

## More Freely to Use and Help You More

Add [msr.EXE](https://github.com/qualiu/msr/tree/master/tools) folder to `%PATH%` (Windows) or `$PATH`(Linux) to more freely to help your [daily file processing + data mining](https://github.com/qualiu/msr/blob/master/README.md).

As default, if not found [msr.EXE](https://github.com/qualiu/msr/blob/master/README.md) in `%PATH%`/`$PATH`, it'll auto download to `~/msr` (on **Linux**) or `%USERPROFILE%\Desktop\msr.exe` (on **Windows**).

You can also manually **download** the tiny [msr.EXE](https://github.com/qualiu/msr/tree/master/tools) (of your system type) , then **add** the folder to `%PATH%` or `$PATH`.

Suggest you use/create a tool folder like `~/tools` or `D:\tools` instead of `system folder` for 1 command line below:

- **Windows**：Download + copy to a folder like `%SystemRoot%` (Use **[msr-Win32.exe](https://github.com/qualiu/msr/raw/master/tools/msr-Win32.exe)** for 32-bit system)

  **Powershell** `-Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/qualiu/msr/blob/master/tools/msr.exe?raw=true' -OutFile msr.exe"` && **copy** [msr.exe](https://github.com/qualiu/msr/raw/master/tools/msr.exe) `%SystemRoot%\`

- **Cygwin**: copy or make a link (`ln -s msr.cygwin /usr/bin/msr`)

  **wget** <https://github.com/qualiu/msr/raw/master/tools/msr.cygwin> && `chmod +x msr.cygwin` && `cp msr.cygwin /usr/bin/msr`

- **Linux**: `Ubuntu`,`CentOS`,`Fedora`: (gcc/g++ >= 4.8; Use **[msr-i386.gcc48](https://github.com/qualiu/msr/raw/master/tools/msr-i386.gcc48)** for 32-bit system)

  **wget** <https://github.com/qualiu/msr/raw/master/tools/msr.gcc48> && `chmod +x msr.gcc48` && `cp msr.gcc48 /usr/bin/msr`

After done, you can directly run **msr --help** (or **msr -h** or just **msr**) should display [colorful usages and examples on Windows](https://qualiu.github.io/msr/usage-by-running/msr-Windows.html) or Linux like: [Fedora](https://qualiu.github.io/msr/usage-by-running/msr-Fedora-25.html) and [CentOS](https://qualiu.github.io/msr/usage-by-running/msr-CentOS-7.html).

## Avoid Security Software Downgrade Search Performance

If you cannot get search results **in 1~2 seconds** for just **10000 code files** (will auto skip other types like `packages`, `build` and `junk files`):

Add an exclusion to avoid performance impact from the system security software, just like the impacts to `node.exe` , `pip.exe` and `python.exe` etc.

Add **Process** type (name) + **File** type (path) exclusions for [msr.EXE](https://github.com/qualiu/msr/tree/master/tools) follow [official Windows doc](https://support.microsoft.com/en-us/help/4028485/windows-10-add-an-exclusion-to-windows-security).

## Make Command Shortcuts to Search or Replace In or Out of VSCODE

You can generate the command shortcuts (alias/doskey) to directly use for searching or replacing in or out of IDE.

- One single shortcuts file: (Press `F1` if not shown in right-pop menu, then search `Cook xxx` as below)
  - Click/Choose `"Cook alias/doskey: Only general finding commands to 1 file"` to make general command shortcuts.
  - Choose `"Cook alias/doskey by project: Only finding commands to 1 file"` to make shortcuts based on current project setting.
- Multiple **script files** choose menus below: More freely to use (**in other script files** or **nested command lines** like pipe)
  - `"Cook script files: Only general finding command alias/doskey."`
  - `"Cook script files by project: Only finding command alias/doskey."`
  - `"Cook general finding + Dump with other command alias/doskey to script files."`
  - `"Cook finding by project + Dump with other command alias/doskey to script files."`

<img align='center' src='https://raw.githubusercontent.com/qualiu/vscode-msr/master/images/cook-command-menu.png'>

### Command Shortcuts

After you cooked command alias/doskeys, you'll see messages below: (You can **write**/**update** doskeys in file)

```bash
Now you can directly use the command shortcuts in/out-of vscode to search + replace like:
find-ndp dir1,dir2,file1,fileN -t MySearchRegex -x AndPlainText
find-nd -t MySearchRegex -x AndPlainText
find-code -it MySearchRegex -x AndPlainText
find-small -it MySearchRegex -U 5 -D 5 : Show up/down lines.
find-doc -it MySearchRegex -x AndPlainText -l -PAC : Show pure path list.
find-py-def MySearchRegex -x AndPlainText : Search definition in python files.
find-py-ref MySearchRegex -x AndPlainText : Search references in python files.
find-ref "class\s+MyClass" -x AndPlainText --np "unit|test" --xp src\ext,src\common -c show command line.
find-def MyClass -x AndPlainText --np "unit|test" --xp src\ext,src\common -c show command line.
find-ref MyClass --pp "test|unit" -U 3 -D 3 -H 20 -T 10 :  Preview Up/Down lines + Set Head/Tail lines in test.
find-ref MyOldClassMethodName -o NewName -j : Just preview changes only.
find-ref MyOldClassMethodName -o NewName -R : Replace files, add -K to backup.
alias find-pure-ref
malias find -x all -H 9
malias "find[\w-]*ref"
malias ".*?(find-\S+)=.*" -o "\2"  :  To see all find-xxx alias/doskeys.
malias use-rp :  To see matched alias/doskeys like 'use-rp', 'out-rp', 'use-wp' and 'out-fp' etc.
use-wp  - Use workspace root paths as input: Root folders of current workspace and extra paths you added.
use-rp  - Use relative path as input: The dynamic current folder.
out-rp  - Output relative path. This will not effect if use-wp which input full paths of current workspace.
out-fp  - Output full path.
Add -W to output full path; -I to suppress warnings; -o to replace text, -j to preview changes, -R to replace files.
You can also create your own command shortcuts in the file: {msr.cmdAlias.saveFolder}\msr-cmd-alias.doskeys
Every time after changes, auto effect for new console/terminal. For current, run `update-doskeys` on Windows.
See + Use command alias(shortcut) in `MSR-RUN-CMD` on `TERMINAL` tab, or start using in a new command window outside.
(if running `find-xxx` in vscode terminals, you can `click` the search results to open in vscode.)
```

You can search **in vscode terminal** like: `find-def MyClass` or `find-ref "class\s+MyClass"` then **click** the results to **open and locate** them.

Each time it will write 1 or multiple script files to the folder of `msr.cmdAlias.saveFolder`, if not set:

- Single alias/doskey file: Save to `%USERPROFILE%\Desktop` on Windows or `~/` on Linux.

- Multiple script files: Save to `%USERPROFILE%\Desktop\cmdAlias` on Windows or `~/cmdAlias/` on Linux.

When you open a new terminal, will [**auto set project specific command shortcuts**](#auto-set-command-shortcuts-for-new-terminals) which most helpful to get a temporary command shortcuts of each project's specific settings plus `.vscode/settings.json` in it's root folder.

## Easy to Support New Languages

**Two methods** to support a new language. (If you're a **developer**/**contributor** see: [here](https://github.com/qualiu/vscode-msr/blob/master/Add-New-Language-Support-For-Developers.md), welcome!)

### File to Add New Language Settings

- Open your [personal settings file](https://code.visualstudio.com/docs/getstarted/settings#_settings-file-locations) like:
  - Windows: `%APPDATA%\Code\User\settings.json`
  - Linux: `$HOME/.config/Code/User/settings.json`

For **normal users**: Take **finding definition** for **batch** files (`*.bat` and `*.cmd`) as an example.

### Method-1: Only Add One Extension of the New Language You Want to Support

If you only want to support finding definition for `*.bat` files other than all `batch` script (`*.bat` + `*.cmd`):

Add **lower case** `extension name`: "**msr.{extension}.definition**" (here `{extension}` = **bat** ) into the [file](#file-to-add-new-language-settings):

```json
  "msr.bat.definition": "^\\s*:\\s*(%1)\\b|(^|\\s)set\\s+(/a\\s+)?\\\"?(%1)="
```

If you're interested about the explanation of the `definition` Regex above and below, see [here](https://github.com/qualiu/vscode-msr/blob/master/Add-New-Language-Support-For-Developers.md#additional-explanation-for-the-regex-pattern-used-above-when-support-batch-scripts).

### Method-2: Support All Extensions of the New Language by Adding 2 Mandatory Settings

- Add **lower case** `language name` (as you want): "**msr.fileExtensionMap**.`{Name}`" (here `{Name}` = **batch** ) into the [file](#file-to-add-new-language-settings):

```json
  "msr.fileExtensionMap.batch": "bat cmd"
```

- Add Regex match pattern to find definition (lower case name `msr.batch.definition`):

```json
  "msr.batch.definition": "^\\s*:\\s*(%1)\\b|(^|\\s)set\\s+(/a\\s+)?\\\"?(%1)="
```

### Optional: Add Other Settings if Necessary

For example, if you want to overwrite `default.skip.definition` for **batch** files, add "**msr.{name}.skip.definition**" in [file](#file-to-add-new-language-settings):

```json
  "msr.batch.skip.definition": ""
```

Other settings if you want to override, add or update: see [here](https://github.com/qualiu/vscode-msr/blob/master/Add-New-Language-Support-For-Developers.md#many-other-settings-if-you-want-to-override-or-add-or-update).

### Note: Override Rule for the Language Settings in the File

Explicit/Specific settings will overwrite general settings in the [file](#file-to-add-new-language-settings).

For example as above: `bat` = `*.bat file`, `batch` = `*.bat + *.cmd files`, so the override results as following:

- `msr.bat.definition` overrides `msr.batch.definition` overrides `msr.default.definition`
- `msr.bat.skip.definition` overrides `msr.batch.skip.definition` overrides `msr.default.skip.definition`

## Every Function is Under Your Control and Easy to Change

### Hide or Show More Context Menus

Default setting just shows a few of 24 provided context menu items of `Plain-text find` + `Regex find` + `Sort`.

To show or hide more menus, [open user settings](https://code.visualstudio.com/docs/getstarted/settings#_creating-user-and-workspace-settings) check/un-check menus like [screenshot](https://raw.githubusercontent.com/qualiu/vscode-msr/master/images/editor-context-menu.png) below:

<img align='center' src='https://raw.githubusercontent.com/qualiu/vscode-msr/master/images/editor-context-menu.png' width=785 height=313>

Set `msr.menu.visible` = `false` to hide all context menus of `Regex find xxx` + `Find xxx` etc.

### Get the Best Combined Power

Just press `Alt+F2` to temporarily toggle `Enable`/`Disable` of `Finding Definition + References`.

This helps your work with **best combined power** of `vscode-msr` + other plugins (like `vscode-python` / `vscode-java` etc.):

- Temporarily enable `vscode-msr` and use it, when the language plugin failed to find definition/references.
- Temporarily disable `vscode-msr`, use the language plugin to find definition/references.

You can [change the default shortcut key](https://code.visualstudio.com/docs/getstarted/keybindings#_keyboard-shortcuts-editor) if got conflict. You can also use 2 other methods below to toggle:

- Press `F1` to open command palette, then type `msr temp` or `msr toggle` etc.
- Make visible of the right-pop menu and use it: Press `F1` -> type `Open User Settings` -> type + change `msr.tmpToggleEnableForFindDefinitionAndReference.menu.visible`.

[Set **quiet mode**](#more-settings-like-quiet-mode) if you don't want to activate vscode tabs like `OUTPUT` and `TERMINAL`.

### Disable Finding Definition or References for Specific File Types

- `msr.disable.extensionPattern`

  Regex pattern of **file name extensions** to **disable** `find definition and references`.

  For example:

  - Set `tsx?|jsx?` for `TypeScript` and `JavaScript` files.
  - Set `py|cs|java|scala` for `python`, `C#` and `Java`/`Scala` files .

### Disable Finding Definition for Specific File Types

- `msr.disable.findDef.extensionPattern`

  Regex pattern of **file name extensions** to **disable** `find definition`.

  For example:

  - Set `tsx?|jsx?` for `TypeScript` and `JavaScript` files.

### Disable Finding for Specific Projects By Root Folder Name

- `msr.disable.projectRootFolderNamePattern` (**case sensitive**)

  Regex pattern of `git root folder name` to **disable** `find definition and references` functions for specific projects.

  For example: `^(Project\d+)$` to disable for D:\\**Project1** and C:\git\\**Project2**.

### Disable Finding Definition or References for All

- `msr.enable.definition`: Set to `false` or un-check it to **disable** `find definitions` function for all types of files.
- `msr.enable.reference`: Set to `false` or un-check it to **disable** `find references` function for all types of files.

## More Settings like Quiet Mode

<img align='center' src='https://raw.githubusercontent.com/qualiu/vscode-msr/master/images/browse-all-setting-names.png'>

This doc listed a few configuration names. Finding more by pressing `F1` to [Open User settings](https://code.visualstudio.com/docs/getstarted/settings#_creating-user-and-workspace-settings) to change.

- `msr.quiet`

  Don't activate (show) channels: `MSR-Def-Ref` (in `OUTPUT` tab) + `MSR-RUN-CMD` (in `TERMINAL` tab).

  - `MSR-Def-Ref` shows sorted results after ranking, and specific search commands with time costs.
  - `MSR-RUN-CMD` shows `re-running search when got multiple results` or `finding commands from menu`.

## Extension Settings If You Want to Change

You **don't need to change settings** from [configuration file](https://github.com/qualiu/vscode-msr/blob/master/package.json) unless you want to tune or improve `Regex` patterns, or add **extra search paths** , etc.

Note: Check [**your personal settings**](https://code.visualstudio.com/docs/getstarted/settings#_settings-file-locations) (`msr.xxx` in file) with the latest tuned github settings, especially for `Regex` patterns.

### General/Default Settings Examples

- `msr.default.maxSearchDepth`: Set `max search depth` when finding definitions or references.
- `msr.default.codeFiles`: Set `default` Regex pattern for `source code files`.
- `msr.descendingSortForVSCode`: Descending sort search results for `vscode`.
- `msr.descendingSortForConsoleOutput`: Descending sort search results for output channel in `vscode` bottom.
- `msr.default.skipFolders`: Set `default`/`common` skip folders Regex pattern.
- `msr.default.removeLowScoreResultsFactor`: Default threshold = `0.8` (of max score) to remove low score results.
- `msr.default.keepHighScoreResultCount`: Default count = -1 (keep all) to keep top high score results.

### Auto Set Command Shortcuts for New Terminals

`msr.initProjectCmdAliasForNewTerminals` (default = `true`) to auto set/initialize command alias/doskeys for newly created terminals:

- To merge project specific `excluded folders` from `.vscode/settings.json` in each project root folder.
  - Extract folders from `files.exclude` and `search.exclude` by Regex: `^[\w-]+$` after trimming `*` at head and tail.
  - You can **disable** `msr.autoMergeSkipFolders` to not auto merge excluded folders.
  - You can **disable** `msr.overwriteProjectCmdAliasForNewTerminals` to use the existing temp command shortcuts of each project.
- To auto switch to `CMD` console other than `Powershell` on Windows to use command shortcuts.
  - Due to `Powershell` cannot use `doskey` command shortcuts. (You can [cook command **script files**](#make-command-shortcuts-to-search-or-replace-in-or-out-of-vscode) then add the script folder to `%PATH%` or `$PATH`)
- Supported terminals:

  - [Official integrated terminals](https://code.visualstudio.com/docs/editor/integrated-terminal#_configuration) like:

  ```cpp
  // Command Prompt
  "terminal.integrated.shell.windows": "C:\\Windows\\System32\\cmd.exe"

  // Git Bash (MinGW)
  "terminal.integrated.shell.windows": "C:\\Program Files\\Git\\bin\\bash.exe"

  // Ubuntu Bash on Windows: Not tested. Please use msr.gcc48 + copy alias from a Linux VSCODE or by Cygwin below.
  "terminal.integrated.shell.windows": "C:\\Windows\\System32\\bash.exe"
  ```

  - `Cygwin` integration (on Windows), you can set in [your personal settings file](https://code.visualstudio.com/docs/getstarted/settings#_settings-file-locations) like:

  ```cpp
  // Cygwin Bash. One command to install Cygwin (into a folder no pollution): https://github.com/qualiu/msrTools/blob/master/system/install-cygwin.bat
  "terminal.integrated.shell.windows": "D:\\cygwin64\\bin\\bash.exe"
  ```

### Additional Settings in [Your Personal Settings file](https://code.visualstudio.com/docs/getstarted/settings#_settings-file-locations)

- Set `skipFolders` for Specific Project

  You can set `skipFolders` pattern for each project to **overwrite** `default.skipFolders` in [your personal settings file](https://code.visualstudio.com/docs/getstarted/settings#_settings-file-locations).

  Like adding `msr.{root-folder-name}.skipFolders` + value in `%APPDATA%\Code\User\settings.json` on Windows:

  ```json
  "msr.My-Project-Root-Folder-Name.skipFolders": "^(unit|tests)$|other-partial-folder-name"
  ```

- Promote Scores for Specific Project Folders or Paths

  Set below items if you need in [your personal settings file](https://code.visualstudio.com/docs/getstarted/settings#_settings-file-locations) like `%APPDATA%\Code\User\settings.json` on Windows.

  Regex pattern to promote scores for sorting definition (`Go To Definition`) or references (`Find All References`):

  - `msr.{root-folder-name}.promoteFolderPattern`: Regex pattern to promote folder scores for result file folders.
  - `msr.{root-folder-name}.promotePathPattern`: Regex pattern to promote path scores for result file paths.
  - `msr.{root-folder-name}.promoteFolderScore`: Recommended value is 100 to 1000. Default = 200 if not set.
  - `msr.{root-folder-name}.promotePathScore`: Recommended value is 100 to 1000. Default = 200 if not set.

### Extra Paths Settings

- `msr.default.extraSearchPaths`: **Extra search paths** of external repositories, dependency sources, or libraries, etc.
- `msr.default.extraSearchPathListFiles`: **Read extra search path list files** of external repositories, dependency sources, or libraries, etc.

These global **extra search paths** settings enable searching related files **without loading** them into `Visual Studio Code`.

More details see [Extra Path Settings](https://github.com/qualiu/vscode-msr/blob/master/Extra-Path-Settings.md).

### Specific Coding Language Settings Examples

- `msr.cs.codeFiles`: Regex pattern of `C#` source code file names (extensions).
- `msr.cpp.codeAndConfigDocs`: Regex pattern of `C++` / `C` code + configuration + document files.
- `msr.py.extraSearchPaths`: **Extra search paths** for `Python` code's external repositories, dependency sources, or libraries, etc.
- `msr.ui.codeFiles`: Regex pattern of `UI` (front-end) code files: `*.vue`, `*.js`, `*.ts`, `*.jsx`, `*.tsx`.

## Normal and Extensive Search

Normal Search (`default context menu`) + Extensive Search (`context menu` + `command palette`)

- Normal search:
  - Find definition (`Go to Definition` menu): Precise search **project root** + **extra paths** if set.
  - Find references (`Find All References` menu): **Only** search **project root**, **skip** extra paths even if set.
- Extensive search:
  - **Plain-text** and **Regex** searching groups in **command palette** and partially in **editor context menu** (`Find plain text in xxx` or `Regex find xxx`)
  - Provide specific searching in **project root** + **extra paths** if set. For example, `Regex find pure references in code files` will skip comments and long text in code.

## Reuse the Command to Search Further or Replace Files

You can **reuse** [msr.EXE](https://github.com/qualiu/msr/tree/master/tools) `original search command line` in `Visual Studio Code` output channel `MSR-Def-Ref` or terminal `MSR-RUN-CMD` to **search** + **replace** files.

- **Search files**: Filter results or further search on results based on `original search command line`:

  Change the value of **-t** / **--np** / **--nd** if already used in command line.

  - Filter result text:
    - **-x** `"need plain text"` , **--nx** `"exclude plain-text"` , **--nt** `"exclude Regex"` , **-t** `"search/include Regex"`.
  - Filter result file name, folder, full-path:
    - **-d** `"match folders Regex"`, **--nd** `"exclude folder Regex"`
    - **--pp** `"full path Regex"` , **--np** `"exclude full path Regex"` , **--xp** `"sub-paths,sub-text"`
  - You can also add more `msr` commands to the command line like:
    - `msr original command` **|** `msr -i -t "^\s*public" -P -A -C`
  - Get matched file `list` (**-l**) -> Generate new command (**-o** `msr xxx`) -> Execute command (**-X**):
    - `msr original command` **-l** -PAC **|** `msr -t "(.+)" -o "msr -p \1 -t \"class To-Search\" --nx internal"` **-X**

- **Replace files**: Reuse the `find-reference` command line or write a new one:
  - See replaced text lines (add **-o** `replace-to-text`):
    - `msr original command ... -t "xxx" ...` **-o** `"replace-to"`
  - **Just** preview changed files (**-j**):
    - `msr original command ... -t "xxx" ...` **-o** `"replace-to"` **-j**
  - Replace files (**-R**):
    - `msr original command ... -t "xxx" ...` **-o** `"replace-to"` **-R**
    - Add **-K** if you want to backup changed files.
    - Add **--force** to replace files with `BOM` header not `UTF-8 0xEFBBBF`.

## Brief Usage Summary for Search or Configuration

Besides the [overview doc](https://github.com/qualiu/msr/blob/master/README.md) and [readme.txt](https://raw.githubusercontent.com/qualiu/msr/master/tools/readme.txt) here's brief summary:

- Easy to add, update or tune `Regex` patterns to improve existing or support new coding languages:
  - Use above debugging method with the output info.
  - Directly use the tiny and colorful [msr.EXE](https://github.com/qualiu/msr/tree/master/tools) of your [system type](#more-freely-to-use-and-help-you-more) to test or tune your `Regex` patterns:
    - Input a string from input-arg (`-z`) or pipe (like `echo`):
      - msr **-z** `"class CPP_EXPORT MatchThisCppClass"` -t `"^\s*class (\w+\s+)?\bMatchThisCppClass"`
      - **echo** `class CPP_EXPORT MatchThisCppClass` `|` msr -t `"^\s*class (\w+\s+)?\bMatchThisCppClass"`
    - Input a file like:
      - msr **-p** `my-class.hpp` -t `"^\s*class (\w+\s+)?\bMatchThisCppClass"`
    - Input paths and recursively search like:
      - msr **-r -p** `my-class.hpp,src,folder2` -t `"^\s*class (\w+\s+)?\bMatchThisCppClass"`
- Use the rich searching options of [msr-EXE](https://github.com/qualiu/msr/blob/master/README.md) like below, **combine** these **optional** options (**You Can Use All**):
  - Filter text by `line-matching` (default) or `whole-file-text-matching` (add **-S** / **--single-line** Regex mode):
    - Ignore case:
      - Add **-i** (`--ignore-case`)
    - Regex patterns:
      - **-t** `should-match-Regex-pattern`
      - **--nt** `should-not-match-Regex-pattern`
    - Plain text:
      - **-x** `should-contain-plain-text`
      - **--nx** `should-not-contain-plain-text`
  - Set searching paths: (Can use both)
    - Recursively(`-r`) search one or more files or directories, like: **-r** **-p** `file1,folder2,file2,folder3,folderN`
    - Read paths (path list) from files, like: **-w** `path-list-1.txt,path-list-2.txt`
  - Set max search depth (begin from input folder), like: **-k** `16` (default max search depth = `33`).
  - Filter `file name`: **-f** `should-match-Regex` , **--nf** `should-not-match`
  - Filter `directory name`: **-d** `at-least-one-match` , **--nd** `none-should-match`
  - Filter `full path pattern`: **--pp** `should-match` , **--np** `should-not-match`
  - Skip/Exclude link files: **--xf**
  - Skip/Exclude link folders: **--xd**
  - Skip full or sub paths: **--xp** d:\win\dir,my\sub
  - Try to read once for link files: **-G** (link files' folders must be or under input root paths of `-p` or/and `-w`)
  - Filter `file size`: **--s1** <= size <= **s2** , like set one or two: **--s1** `1B` **--s2** `1.5MB`
  - Filter `file time`: like **--w1** `2019-07`, **--w2** `"2019-07-16 13:20"` or `2019-07-16T13:20:01` (quote it if has spaces).
  - Filter rows by begin + end row numbers: like **-L** 10 **-N** 200 (for each file).
  - Filter rows by begin + end Regex: like **-b** `"^\s*public.*?class"` **-q** `"^\s*\}\s*$"`
  - Filter rows by 1 or more blocks: **-b** `"^\s*public.*?class"` **-Q** `"^\s*\}\s*$"`
  - Filter rows by 1 or more blocks + **stop** like: **-b** `"^\s*public.*?class"` **-Q** `"^\s*\}\s*$"` **-q** `"stop-matching-regex"`
  - **Quickly** pick up `head{N}` results + **Jump out**(`-J`), like: **-H** `30` **-J** or **-J** **-H** `300` or **-JH** `300` etc.
  - Don't color matched text: **-C** (`Faster` to output, and **must be set** for `Linux/Cygwin` to further process).
  - Output summary `info` to **stderr** + **hide** `warnings in stderr` (like BOM encoding): **-I** : You can see **-I -C** or **-IC** or **-J -I -C** or **-JIC** etc. in [package.json](https://github.com/qualiu/vscode-msr/blob/master/package.json)

## Welcome to Contribute

Github repository: <https://github.com/qualiu/vscode-msr>

You may just need to add or update the [configuration file](https://github.com/qualiu/vscode-msr/blob/master/package.json): Add or update `Regex` patterns of `find-references` or `find-definitions` for various coding languages.

### Add New Support or Improve

Please help to set the `Regex` patterns for them if you want. You can:

- Reference the `.definition` and `.reference` Regex patterns of **default** or a specific language type in [configuration file](https://github.com/qualiu/vscode-msr/blob/master/package.json).
- Debug this extension:
  - Use `Visual Studio Code` to open [this project](https://github.com/qualiu/vscode-msr) start (press `F5`) to debug, if you've cloned it.
  - Set/Check `msr.debug` to enable output debugging info, if you just installed this extension.
- See the docs [here](#brief-usage-summary-for-search-or-configuration) or on [msr](https://github.com/qualiu/msr/blob/master/README.md).

### Check and Update this doc

Easy to check consistency of [configurations](https://github.com/qualiu/vscode-msr/blob/master/package.json) with `this document` by command lines below (you can also run command `npm run test` if you're a developer):

**[nin](https://github.com/qualiu/msr/tree/master/tools)** `README.md` [package.json](https://github.com/qualiu/vscode-msr/blob/master/package.json) **"(msr\\.[\w\\.]+)"** --nt `"msr\.(exe|gcc\w+|cygwin)|project\d+|\.(My|xxx|extra\w+Group)"` --nx msr.py.extra -i -c Should no result

**[nin](https://github.com/qualiu/msr/tree/master/tools)** `README.md` [package.json](https://github.com/qualiu/vscode-msr/blob/master/package.json) **"(msr\\.[\w\\.]+)"** --nt `"msr\.(exe|gcc\w+|cygwin)|project\d+|\.(My|xxx|extra\w+Group)"` --nx msr.py.extra -i **-m** -c Should have results

**[nin](https://github.com/qualiu/msr/tree/master/tools)** [package.json](https://github.com/qualiu/vscode-msr/blob/master/package.json) nul -p -d -k 2 -x description -c Should no unreasonable duplicate descriptions.

## Known Issues

- Performance depends on system hardware conditions.

  For example, it may slower than usual if the disk (where code files stored) is busy, or slower than expected if the hardware is too old, or CPU is too busy.

- Long existing [VsCode Bug](https://github.com/microsoft/vscode/issues/96754): Unable to jump to definitions sometimes + Duplicate definition + reference results.

  It's better to be solved by `vscode` itself to remove final duplicate results, or provide an interface for extensions to do it.

- One redundant finding definition was triggered if used `Ctrl` + `Mouse left click`.

  Due to both "**Peek Definition**" and "**Go to Definition**" were triggered:

  - **Peek Definition** was triggered by `Ctrl` + `Mouse hover`.
  - **Go to Definition** was triggered by `Ctrl` + `Mouse left click`.

  You can use `Ctrl + Mouse hover` to `peek definition`, use `F12` to `go to definition` as a workaround.

- Current support of finding `definition` + `references`:

  - Near-precise support: Will show **multiple results** for **same name** `classes/methods/etc`, due to this is a light tool without syntax parsing and cache.
  - Near-precise support `class`, `methods`, `enum`, `field`, `property` for **C#**, **Python**, **Java**, **Scala**, **C++** / **C**.
  - Rough support `class` and `method` for all type of languages (you can copy/write configurations follow existing languages).

  Welcome + Please help to improve searching definitions and references for `classes` and `methods`, and add supports for `enum` , `property`, `field` etc.

  See [Add New Support or Improve](#Add-New-Support-or-Improve).

## Release Notes

See [CHANGELOG](https://github.com/qualiu/vscode-msr/blob/master/CHANGELOG.md) or `vscode-msr` extension [commit history](https://github.com/qualiu/vscode-msr/commits/master).

---

**Enjoy!**
