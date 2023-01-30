# Change Log

All notable changes to this "vscode-msr" extension will be documented in this file.

## [2.1.48]
- Added `msr.cookCmdAlias.showLongTip` to hide/show long tip for command alias in terminals.
- Fixed issues in MacOS: Corrected `malias` + Fixed random command line break in `MSR-RUN-CMD` terminal.

## [2.1.47] 
- Trivial update for MacOS `MSR-RUN-CMD` terminal.

## [2.1.46]
- Trivial update for MinGW terminal on Windows.

## [2.1.45]
- Improved terminal initialization of MSR-RUN-CMD for MinGW + MacBook.

## [2.1.44]
- Added `msr.disableReRunSearch` as default to suppress re-running commands in `MSR-RUN-CMD` terminal.
- Removed improper shortcuts.

## [2.1.43]
- Added alternative sources to fix downloading failures from GitHub.
- Reused `MSR-RUN-CMD` terminal when reload window or load previous sessions.
- Auto correlated command aliases other shells like `zsh` on `Linux`/`MacOS`.
- Added warning to re-cook new doskeys/alias.
- Added new configuration items to auto generate command shortcuts:
  - `msr.fileExtensionMap.ts` to auto generate `find-ts` + `find-ts-def` + `find-ts-ref`.
  - `msr.fileExtensionMap.js` to auto generate `find-js` + `find-js-def` + `find-js-ref`.
  - `msr.fileExtensionMap.vue` to auto generate `find-vue` + `find-vue-def` + `find-vue-ref`.

## [2.1.42]
- Solved random messy initialization command lines in `MSR-RUN-CMD` terminal on `MacOS`.
- Updated doc to use `curl` instead of `wget`.

## [2.1.41]
- Added `msr.fileExtensionMap.gradle` to support searching gradle project files by `find-gradle` / `gfind-gradle`.
- Used `curl` instead of `wget` to auto download msr/nin.

## [2.1.40]
- Moved temp script files to tmp folder to set git-ignore skip path environment variable `Skip_Git_Paths`.
- Imported bash profile by adding command: "`source ~/.bashrc`" before importing `msr-cmd-alias.bashrc`
- Improved multiple workspaces support.
- Improved finding definitions (`"Go To Definition"`) for `Java` member + `PowerShell` script-variable.
- Added new default priority: `msr.xxx` is prior to `msr.default.xxx` (like `msr.java.definition` is prior to `msr.default.definition`).

## [2.1.39]
- Improved dumping other command `alias` on Linux + MacOS.
  - Add `#!/bin/bash` when dumping other `alias` scripts on Linux/MacOS (for MacOS).
- Supported changing PowerShell to Bash on Linux + MacOS.
  - Renamed `msr.changePowerShellTerminalToCmdOnWindows` to `msr.changePowerShellTerminalToCmdOrBash`.
- Moved tmp alias files to `%TMP%` folder for `MinGW`/`Cygwin`/`WSL` terminals on Windows.

## [2.1.38]
- Robust cooking-alias message tip on Windows PowerShell + CMD.

## [2.1.37]
- Supported MacOS of `Darwin`-`Arm64`.
- Supported writing + keeping alias into **default file** (like `~/msr-cmd-alias.bashrc`) on Linux/MacOS as on Windows.
- No longer force change `PowerShell` to `CMD` on Windows.
  - Added `msr.changePowerShellTerminalToCmdOnWindows` = `auto` (Treat as `false` if got git-exemptions).
- Added `gfind-xxx` by duplicating each `find-xxx` + `sort-xxx` + `find-top-xxx` (use`"git ls-files"` as precise source files).
- Changed default menu of `Cook-alias/doskey` to easy use (cook alias + dump scripts).

## [2.1.36]
- Added config `msr.msr.default.codeFileExtensionMappingTypes` to co-work with `msr.fileExtensionMap.xxx`:
  - Auto add new code type (file extension) in `msr.fileExtensionMap.xxx` (like adding `groovy` in `msr.fileExtensionMap.java`).
  - Also add to command shortcuts like: `find-all` , `find-code` and `find-def` etc.
- Added `groovy` to `msr.fileExtensionMap.java`.
- Added `sql` to `msr.default.allFiles`.
- Added a **completely free** license file to fix warnings of new version `vsce package` command.
- Updated `activationEvents` to to fix warnings of new version `vsce package` command.

## [2.1.35]
- Avoided initializing doskeys for `"PowerShell Integrated Console"` on Windows.
- Disabled finding definition for `Vue` by updating `msr.disable.extensionPattern`.
- Updated default skip folder pattern by updating `msr.default.skipFolders`.

## [2.1.34]
- Fixed cooking command alias/doskeys of `sort-xxx` + `find-top-xxx` when cooking in non-repo files.

## [2.1.33]
- Fixed sort-xxx command alias/doskey.

## [2.1.32]
- Fixed/Enabled cooking command alias/doskeys for system.

## [2.1.31]
- Removed constraints(like `--w1`/`--s1`) when running finding commands in current file via menu or command palette.

## [2.1.30]
- Changed `msr.default.extraOptions` rule: `msr.{project}.extraOptions` will overwrite `msr.default.extraOptions`.

## [2.1.29]

- Supported cooking script files for each command alias/shortcuts(`doskey`) if contains `for loop` on Windows.
  - Added `msr.cookCmdAlias.addEchoOff` to hide script content (default: added).
  - Added `msr.cookCmdAlias.setVariablesToLocalScope` to set local variable (default: empty/not).

## [2.1.28]

- Reduced show-tip commands for Windows PowerShell terminal.

## [2.1.27]

- Fixed one special case when finding selected text by menus.

## [2.1.26]

- Improved class searching of C# code: filtering results by namespaces.
- Added `msr.default.preferSearchingSpeedOverPrecision` to support precision for small projects.

## [2.1.25]

- Robust escaping selected text when running search commands by menus.

## [2.1.24]

- Improved searching precision + speed.
- Hided BOM warnings by using `-I` (changed `cookCmdAlias.hideWarningsAndExtraInfo` to `true`).

## [2.1.23]

- Tolerated searching C# generic method + class;
- Added `*.conf` + `*.resx` to `find-all` / `find-config` etc.

## [2.1.22]

- Supported latest vscode `terminal.integrated.defaultProfile` config.

## [2.1.21]

- Supported multiple-workspace terminal initializing of `Git-bash` + `WSL-bash` for vscode >= 1.56.0.
- Added `*.conf` to `find-config` + `msr.default.configFiles` + `msr.default.configAndDocs`.

## [2.1.20]

- Supported vscode 1.56.0 directly creating terminals of `Git-Bash` + `WSL-Bash`.
- Skipped initializing alias/doskeys for `Linux Powershell Terminal` + `JavaScript Debug Terminal`.

## [2.1.19]

- Improved finding C# method definition for case of nullable type in definition.

## [2.1.18]

- Workaround for command shortcuts of `find-def` + `find-xxx-def`.

## [2.1.17]

- Robust terminal initialization on Windows.

## [2.1.16]

- Trimmed more characters for file name to search.

## [2.1.15]

- Improved searching member/enumerate + optimized searching + improved speed.

## [2.1.14]

- Improved searching speed + result precision.
- Corrected path of `find-xxx-in-current-file` for `multiple workspaces` scenario.
- Added shortcuts for Linux or Cygwin/MinGW/WSL on Window, like: `update-alias` + `update-{project-name}-alias` + `open-alias` etc.
- Improved terminal initialization with dynamic changes: `git-ignore` settings + `terminal.integrated.shell.windows`.

## [2.1.13]

- Empowered people to coding in multiple workspaces with 2 methods and improvements:
  - Improved native multiple workspaces support:
    - Auto detect and initialize terminal with the active workspace for `MSR-RUN-CMD` terminal.
    - Auto detect the corresponding workspaces of newly opened terminals:
      - Initialize terminal with right `gitignore` file.
      - Initialize terminal with right command shortcuts.
  - Simplified `extraSearchPaths` logic and supported fine-grained granularity:
    - People can set `msr.{project}.extraSearchPaths` without opening multiple workspaces.
- Improved searching precision + speed from several perspectives.
- Reduced re-running in `MSR-RUN-CMD` terminal.
- Corrected `bashrc-path` style for Linux terminals on Windows.

## [2.1.12]

- Improved finding definition speed + precision.
- Supported finding class from code comments of Python.
- Improved extra search paths overriding granularity.
- Skipped searching notebook(*.ipynb) when searching docs.
- Added a new menu: `msr.regexFindInSameTypeFiles`.
- Added `msr.fileExtensionMap.rs` to support cooking `Rust` doskey/alias like `find-rs`.
- Fixed latest vscode(1.54.1) issue: Enabled auto-initializing doskey if set cmd.exe as default terminal on Windows.

## [2.1.11]

- Auto set command doskeys/alias for new terminals on vscode 1.53.0 which no terminal name.

## [2.1.10]

- Reduced 1 searching command line.
- Tried to avoid occasionally prompting 'cmd.exe exit' on Windows machine.

## [2.1.9]

- Improved searching precision + Added more specific settings for languages.
- Stopped current searchers if found + stop previous running searchers before new searching.
- Used `git-ignore` as default path filter by setting `msr.useGitIgnoreFile` = true.

## [2.1.8]

- Updated `git-ignore` patterns: Added trailing slash `/` to some word patterns.
- Added a menu: `msr.compareFileListsWithGitIgnore` to compare file lists if enabled `msr.useGitIgnoreFile`.
- Added `msr.autoCompareFileListsIfUsedGitIgnore` to help auto compare file lists (need change to `true`).
- Auto transformed args (`$1` to `%1`) for other doskeys (not from vscode-msr) on Windows when cooking multiple script files.

## [2.1.7]

- Unregistered `finding-reference` by adding `.*` in `msr.disable.findRef.extensionPattern`.

## [2.1.6]

- Improved `git-ignore`: Added heading slash `/` to skip-patterns if it starts with a word.
- Accelerated downloading + not silent downloading commands.
- Improved support for Java case of `@interface`.

## [2.1.5]

- Robust `git-ignore` for some cases (if enabled `msr.useGitIgnoreFile`).

## [2.1.4]

- Supported `git-ignore` by **.gitignore** file in **top folder**: (To enable it: set `msr.useGitIgnoreFile` = `true`)
  - Added `msr.useGitIgnoreFile` = **false** which disable this non-precise function.
  - Added `msr.omitGitIgnoreExemptions` = **true** to skip exemptions like `!not-exclude.txt`.
  - Added `msr.skipDotFoldersIfUseGitIgnoreFile` = **true** to skip paths like `.git`.
  - Auto detect and use forwarding slash support for CMD terminal on Windows.
- Corrected 3 config items with right type.
- Set `msr.searchRelativePathForNativeTerminals` = `true` as default.
- Set `msr.cookCmdAlias.outputFullPath` = `false` as default.
- Hide menu: set `msr.regexFindDefinitionInCurrentFile.menu.visible` = `false` as default.

## [2.1.3]

- Improved finding definition for precision + speed.
- Used a simple and tricky way to support long arguments(count > 9) for Windows command alias (`doskeys`).
- Added string type to configuration items to avoid showing "null" when changing user settings of `msr.xxx`.
- Exported `MINGW_ROOT` for MINGW terminal on Windows to shorten output paths of MINGW system files.
- Added `*.rst` + `*.rs` as source file extensions to search.
- Fixed command alias `find-ndp` for Linux/Cygwin/MinGW terminals.

## [2.1.2]

- Check and support `--timeout` option when searching.
- Accelerated searching + improved result precision.
- Improved finding class from script/doc/config files.
- Added `msr.default.isFindClassByWordCheck` + `msr.useDefaultFindingClass.extensions`.
- Reduced duplicate search caused by `Peek` + `Go-To` definition from mouse-click.
- Support timeout for searching or running commands:
  - Added `msr.searchDefinition.timeoutSeconds` + `msr.autoRunSearchDefinition.timeoutSeconds`.

## [2.1.1]

- Accelerated searching code quite a lot.
- Corrected searching definition when `msr.searchRelativePathForNativeTerminals` = `true`.
- Supported finding definition in extra paths.

## [2.1.0]

- Improved Cygwin/MinGW terminals on Windows:
  - Searching paths using Windows style + Running commands using Linux style.
  - Output relative paths for command alias: Added `msr.cookCmdAlias.outputRelativePathForLinuxTerminalsOnWindows` = `true`.
  - Supported checking 2 versions of tools used (Windows EXE for searching + Linux EXE for running commands).
- Changed default save tool folder on Windows: from `%USERPROFILE%\Desktop\` to `%USERPROFILE%\`.
- Supported searching with relative paths to output short paths:
  - Added `msr.searchRelativePathForNativeTerminals` + `msr.searchRelativePathForLinuxTerminalsOnWindows`.
- Removed `-W` from `msr.allSmallFiles.extraOptions` to output short paths.

## [2.0.9]

- Changed column index begin from 0 for definition results to try to avoid duplication when working with other extensions.
- Disabled `finding-references` for all languages as needless noise, use menus + command alias.
- Improved searching for cases of text contains variable style `"$"` on Linux or Linux terminals on Windows.
- Use/Output relative paths for Linux terminals (like: MinGW + Cygwin) on Windows, to help click + open search result locations.
- Menu changes:
  - Show menu: `"Regex find all references in all source files"`.
  - Hided menu: `"Regex find all pure references in all code files"`.
  - Added but hided: `"Regex find all all pure references in all source files"`.
- Cooking command alias: permanently to file or temporarily for a vscode terminal:
  - Removed `-I` to show warnings and other info (especially when listing with `-l`).
  - Added 2 configs: `msr.cookCmdAlias.hideWarningsAndExtraInfo` + `msr.cookCmdAlias.outputFullPath`.
- Toggle enable/disable only for `finding-definition`.
- Enabled finding definition for all languages: Changed `msr.enable.onlyFindDefinitionForKnownLanguages` = `false`.
- Enabled `golang`: Removed `go` from `msr.disable.extensionPattern`.

## [2.0.8]

- Create default download folder if not exists for Windows 10 latest version which no %USERPROFILE%\Desktop folder.

## [2.0.7]

- Robust wget downloading commands.
- Run `npm audit fix` command.

## [2.0.6]

- Improved PowerShell to CMD command shortcuts initialization on Windows.
- Improved command shortcuts arg-passing for all Bash terminals on Windows + WSL + Linux.
- Improved general command shortcuts checking and updating.
- Not activate OUTPUT channel to show info when cooking command shortcuts.
- Used real `$HOME` for MinGW terminal.
- Used `~/` to display home folder for command shortcuts path of Bash terminals.
- Updated command shortcuts tip for PowerShell terminal.

## [2.0.5]

- Updated args-passing for Linux bash command shortcuts (use `"$@"` instead of `$@`).
- Supported reading newly added command shortcuts for CMD terminal on Windows, when cooking shortcuts(doskeys).
- Supported `/mnt/c/` style path on WSL (`/c/` style is already supported).

## [2.0.4]

- Supported `MSR-RUN-CMD` with `bash terminal` of Cygwin + MinGW + WSL.
- Fully supported `WSL` + `MinGW` + `Cygwin` without any manual configurations nor downloading.
- Improved terminal command alias initialization for `MSR-RUN-CMD`.
- Added script files to `msr.default.allFiles` which will benefit `find-all` command alias.
- After consideration: Auto check `nin` existence and download it if not exist, to avoid missing `nin` when using `find-top-xxx`.
- Improved `find-all` `find-def` `find-ref` + `find-script` + `find-config`.
- Removed size limitation for `sort-xxx` commands.
- Use `wget.exe` as the download tool if found on Windows.
- Track and show time costs of loading extension + cooking command shortcuts + other important steps. Enable `msr.debug` to see them.
- Updated doc.

## [2.0.3]

- Added `msr.enable.onlyFindDefinitionForKnownLanguages` = `true` to skip finding definition and reference for unknown languages.
- Put `msr.tmpToggleEnableFindingDefinition` to first priority to temporarily disable/enable finding for a language, ignore other settings.
- Added support for `golang` but disabled as default by `msr.disable.extensionPattern`.
- Updated root folder priority for configs like `msr.{rootFolderName}.skipFolders`.
- Improved `skipFolder` and override rule.
- Simplified `package.config` by removing `"type": "string"` rows.
- Added `Find Top xxx` command palette + will write them into doskeys/alias files when cooking command shortcuts.
- Will write `Sort xxx` commands into doskeys/alias files when cooking command shortcuts.
- Added optional checking for `nin` and will auto download it when running `find top xxx` command palette.

## [2.0.2]

- Solved initial command alias path style on `WSL` (Windows Subsystem for Linux), which read from Windows settings.
- No longer narrow search scope of script files when click menus like `Regex find references in small files`.
- Verified `WSL` terminal on Windows. (Just use `msr.gcc48` and link/copy to an existing path like `/usr/bin/msr`)
- Lowered case of disk letter for `Git Bash(MinGW)` + `Cygwin Bash` on Windows.

## [2.0.1]

- Improved ranking of removing low relevance results.
- Skipped initializing command shortcuts for `PowerShell Integrated Console` terminal.
- Added a config value `msr.SkipInitCmdAliasForNewTerminalTitleRegex`.
- Added a config value `msr.disable.findRef.extensionPattern`.
- Simplified config values and unified loading and overwriting.
- Added a guide and an example to adjust terminal color for output result file paths.

## [2.0.0]

- Supported adding new languages with it's mapped-extension + extension list.
- Search current file at first to fast get results of definition.
- Added highest score for current file to keep 1 result when finding definition.
- Added skip pattern for PowerShell when use `Regex find definition in current file`.
- Added `open-doskeys` command shortcut on Windows.
- Supported finding definition in `batch` files (`*.bat` + `*.cmd`).
- Increased max line character count from 260 to 360 when call `Regex finding pure reference`.
- Enabled `Sorting by time/size` command palette for `project files: code + config + doc` or `all files`.
- Added long existing [VsCode Bug](https://github.com/microsoft/vscode/issues/96754): Unable to jump to definitions sometimes + Duplicate definition + reference results.

## [1.2.5]

- Skip running commands that no -x nor -t when searching files.
- Support `Regex find as 'class' or 'method' roughly` menu for a PowerShell function or class.
- Executed `npm audit fix` command.

## [1.2.4]

- Add finding definition support for PowerShell script files.

## [1.2.3]

- Update comments and typos.
- Set `msr.quiet` = `true` as default value.

## [1.2.2]

- Updated `update-doskeys` on Windows.
- Added `malias` (mainly for Linux) to support same experience like `malias find-def`.
- Added `msr.cookCmdAliasDumpWithOthersToFiles` + `cookCmdAliasDumpWithOthersToFilesByProject`.
- Added `msr.overwriteProjectCmdAliasForNewTerminals` and default = `true` when initialize a new terminal.
- Don't clear terminal: Added `msr.clearTerminalBeforeExecutingCommands` and set default value = `false`.
- Added 4 command alias:
  - `use-fp` : Use workspace paths: `msr -rp path1,path2`
  - `use-rp` : Use relative path: `msr -rp .`
  - `out-rp` : Output relative path (remove `-W` if has in command line/alias)
  - `out-fp` : Output full path (add `-W` if not in command line/alias)

## [1.2.1]

- Renamed config/setting name `msr.default.pureReferenceSkip` to `msr.default.skip.pureReference`.
- Added `find-pure-ref` command shortcuts.
- Added env path for temporary command shortcuts when using `Cygwin` bash.

## [1.2.0]

- Added `msr.autoMergeSkipFolders` to auto merge excluded folders from each project's root folder `.vscode/settings.json` file.
- Added `msr.initProjectCmdAliasForNewTerminals` and set default to `true` to auto set command shortcuts for each project.
- Updated `find-def` and `find-ref` to search files including UI files (`*.vue, *.ts, *.js`, etc.)
- Improved `find-ui-def` to find UI method/function definition.
- Added `find-all-def` command shortcuts to support finding both backend + UI code definitions.
- Merged skip folders in `.vscode/settings.json` in each project's root folder:
  - Cook command shortcuts (alias/doskeys).
  - Search code.
- Integrated with official terminals, including `MSR-RUN-CMD` channel if set `msr.initProjectCmdAliasForNewTerminals`.
- Supported `bash` terminal integration of `Cygwin` + `MinGW` on Windows.

## [1.1.13]

- Added `msr.quiet` into doc README.md and easier search configurations of `msr enable` and `msr disable`.

## [1.1.12]

- Output key info even set `msr.quiet` + trivial code update.

## [1.1.11]

- Changed shortcut key of `msr.tmpToggleEnableFindingDefinition` from `F2` to `Alt+F2`.

## [1.1.10]

- Updated finding reference in current file for non-words selected text.

## [1.1.9]

- Improved ranking for same name method's definition search results.
- Adjust search order for multiple root folders of current workspace.
- Updated config value of `msr.allSmallFiles.extraOptions` to display full paths (added `-W`).
- Supported temporarily toggle enable/disable finding definition and references (Default shortcut key = `F2`).

## [1.1.8]

- Improved finding definition of class constructor for `python` and `c++`.

## [1.1.7]

- Supported no-project scenario like single files.

## [1.1.6]

- Supported multiple root folders of one workspace (solve vscode deprecation warning).

## [1.1.5]

- Disabled `find definition` for TypeScript and JavaScript files as default in config: `msr.disable.extensionPattern`
- Added config: `msr.disable.findDef.extensionPattern`
- Updated command alias/shortcut: `find-script`
- (It's in fact version `1.1.4` which was published but lost and cannot be re-published, so increased to `1.1.5`)

## [1.1.3]

- Improved find-reference when selected text not begin or start with a word, which not match Regex: `^\w`.

## [1.1.2]

- Support **command shortcut** (`doskey` / `alias`) of finding commands for both general + project specific.
- Update default doc patterns (add `*.ipynb`) + Update default skip folders pattern.
- Tuned command line args position to be easy modified.
- Reduced context menus.

## [1.1.1]

- Escape search-text as `Regex` pattern for `finding definition or references`.
- Added `msr.default.demoteFolderScore` + `msr.default.demotePathScore`
- Added `msr.default.keepHighScoreResultCount` to easy set desired result count.
- Wrote default values of `msr.default.promoteFolderScore` + `msr.default.promotePathScore` to configuration file.
- Improved temporary tool path checking.
- Supported more levels of configuration overriding like overriding additional `extraOptions` settings.

## [1.1.0]

- Improved checking tool in PATH on Linux and replace command line for re-running in terminal.

## [1.0.9]

- Changed `msr.{root-folder-name}.skipFolders` role from **additional** to **overwrite** to improve performance.
- Added warning for platforms not supported.

## [1.0.8]

- Added `msr.disable.projectRootFolderNamePattern` to disable finding definition/references functions for specific projects.
- Renamed `msr.disable.extensionPatterns` to `msr.disable.extensionPattern`.
- Updated doc.

## [1.0.7]

- Added configuration of `findDefinition.useExtraPaths`.
- Added 2 context menus: Find definition or references in `current file`.
- Enabled showing or hiding more context menus (20 menus in total).
- Tuned more `Regex` patterns and Improved result sorting.
- Supported promoting specific folder and path matching scores for each project.
- Search current file if not found results after normal search.

## [1.0.6]

- Updated default skip pattern for finding pure references in configuration file.
- Added description doc for difference between **normal** `find definition/reference` to **extensive** `finding commands`.

## [1.0.5]

- Skipped sorting and removing lower score results when finding references.
- Improved auto downloading tool command line.
- Improved re-creating terminal if user closed it. (Seems to be a vscode IDE bug to be solved)

## [1.0.4]

- Show part of `commandPalette` commands in `editor/context` menu.
- Support auto detect and recover terminal if closed.
- Re-run more searches if got multiple results (increased default value in configuration file).
- Support auto download the msr exe if not downloaded, and added version check each Tuesday morning 09:00~11:00 when opening vscode.
- Update `extra search path` descriptions in configuration file.
- Support both with or without `-I` in command line: output summary to stdout or stderr.
- Default menu `Find All References` will not search extra paths (disabled in configuration as default).
- Added `msr.disable.extensionPattern`: Regex pattern of file extensions to disable `find definition and references`.
- Improved sorting results.

## [1.0.3]

- Improved sorting for search results + search types.
- Supported removing low score results, as default behavior in configuration file.
- Supported quiet mode: Don't show(activate) output channel for each search action if set quiet.
- Improved Regex patterns for several languages in configuration file.
- Added Regex patterns for UI code files to get better experience.
- Truncated command line in output channel (which is generated by `-c` and duplicate to the command line self).

## [1.0.2]

- Reduced unimportant configuration keys.
- Improved extra paths settings experience.
- Support finding selected text other than just word.
- Added more finding commands (Press `F12` and then type `msr` to show these commands).
- Use `cmd.exe` on Windows as default shell (`Powershell` requires extra escaping for characters like `'$'`).

## [1.0.1]

- Updated configuration structure to support more precise searching.
- Refactored code to support:
  - Precise searching and flexibility.
  - Added finding commands (Press `F12` and then type `msr` to show these commands).
  - Auto detect configuration change.
  - Added unit tests.

## [0.0.3]

- Improved configurations + updated configurations.

## [0.0.1]

- Initial release: Roughly support searching definition and references for all type of coding languages.
