# Change Log

All notable changes to the "vscode-msr" extension will be documented in this file.

Detail see `vscode-msr` extension [commit history](https://github.com/qualiu/vscode-msr/commits/master).

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

- Changed shortcut key of `msr.tmpToggleEnableForFindDefinitionAndReference` from `F2` to `Alt+F2`.

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
