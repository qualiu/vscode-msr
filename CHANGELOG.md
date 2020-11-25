# Change Log

All notable changes to this "vscode-msr" extension will be documented in this file.

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
- Supported reading newly added command shorts for CMD terminal on Windows, when cooking shortcuts(doskeys).
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
  - `use-wp` : Use workspace paths: `msr -rp path1,path2`
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
