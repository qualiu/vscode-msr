# [vscode-msr](https://github.com/qualiu/vscode-msr/blob/master/README.md#vscode-msr) for [IDEs on Windows/Linux/MacOS](#the-cookeddumped-aliasdoskey-can-be-used-in-many-ides-not-just-vscode)

Have you suffered issues below in your daily work?

- **Find definition**: Unable to `jump-to-definition`?
  - Lack of dependency packages / build , or failed to build?
  - IDE/extension often caught some problems?
  - Cannot cross `multiple languages`? `C#` , `C++` , `Java`/`Scala`, `Python`, `Vue`, etc.
  - Cannot cross `multiple repositories`?
- **Search code**:
  - Clumsy and slow in IDE? Too **narrow** `vscode` panel to preview? 
  - Wasting time to click and expand **each** item?
  - Lack of a powerful tool to [**learn/ramp-up code by yourself**](#code-mining-without-or-with-little-knowledge) ? (filter + stats + compare/analogy).
  - `What if` a **colorful** + **fast** glance for **all search results** + [**rich and powerful filters**](#search-files-with-rich-filters)?
- **Replace files**:
  - **Missed changes to some files**(like `doc`/`config`) or **other languages** not loaded in IDE?
  - Your replacing tool **added** or **removed** the `tail empty line` ? And cause wrong `git diff` ?
  - Your replacing tool changed your file time even nothing changed?
  - `What if` a fast way to replace? [**Just reuse**](#reuse-the-command-to-search-further-or-replace-files) the **`powerful search used above`**?
- Just **read code** but **inefficient** ? or **insufficient** resource on laptop?
  - Too slow + hard to prepare environment for IDE to load code? Especially from other teams?
  - Must install **X GB language plugins**?
  - Must download **Y GB packages** to the disk?
  - Must build **Z GB outputs** to the disk (like C#) before you can read code?
  - Offer **N GB running memory** to the `official/professional` language extensions?

Then it's the **light** and **right** tool for you(just **2~3 MB** storage + **1~5+ MB** running memory) to search definition(near precise) + replace files.

**Note**: ([**Temp-toggle**](#get-the-best-combined-power) or [**change settings**](#disable-finding-definition-and-references-for-specific-file-types) for languages disabled by default settings.)

### Supported Platforms
- **Windows** `x86_64`: 64-bit + 32-bit Windows (including **WSL** + **Cygwin** + **MinGW**).
- **Linux** `x86_64`: 64-bit + 32-bit **Ubuntu** + **CentOS** + **Fedora** (`kernel` >= `2.6.32` , `gcc/g++` >= `4.8`).
- **MacOS** `arm64`: **Darwin Arm64**.

### **You Can Start Using this without Doing Anything**

 You can start [**search**](#search-files-with-rich-filters) + [**replace**](#replace-files-with-preview-and-backup) + [**code mining**](#code-mining-without-or-with-little-knowledge) via [**mouse**/**menus**](#hide-or-show-more-context-menus) + [**keys**](#get-the-best-combined-power) + [**terminals**](#make-command-shortcuts-to-search-or-replace-in-or-out-of-vscode) **without** reading/doing anything **except**:

- [Cook doskey/alias](#make-command-shortcuts-to-search-or-replace-in-or-out-of-vscode) if you want to use `find-xxx` **out of vscode** (in normal `CMD`/`Bash` console).
- [**Set exclusions**](#avoid-security-software-downgrade-search-performance-on-windows) if you cannot get search results **in 1~2 seconds** for just **10000 code files** on Windows.
- See [**here**](#adjust-your-color-theme-if-result-file-path-folder-color-is-not-clear) if **`folder color`** of output result file paths is not clear: add/change one color theme.
- Please [manually **set PATH** for msr/nin](#or-manually-download--set-path-once-and-forever) if automation failed + [Explicitly set terminal type](#supported-4-terminal-types-on-windows) if caught problems.
- [**Workaround**](#workaround-to-long-existing-vscode-bug-impact-to-finding-definition-and-reference) to [long existing VsCode bug](https://github.com/microsoft/vscode/issues/96754) impact to `Go To Definition` and `Find All Reference`.

## Features

- Got search results in **1~3 seconds** for 20000+ code files (on hard-drives, **SSD** maybe faster) after first time (cost 10~30+ seconds).

- Fast find **definitions** + **references** for **all types** of coding languages files, across **multiple related repositories** on local.

- Also can find **definitions** + **references** from **any type of files** + **any type** (like text `in comments` or `just typed`).

- **Self-reliance**: Learn/Ramp-up faster **by yourself** -- [**Code Mining without or with Little Knowledge**](#code-mining-without-or-with-little-knowledge).

- [**Normal** + **Extensive Search**](#normal-and-extensive-search): Search by hot-keys/menus or typing text, in or out of VSCODE.

- **Easy** + **Fast** to [**Search Further** or **Replace Files**](#reuse-the-command-to-search-further-or-replace-files): Just **reuse** the search command line by an upper arrow.

- [**Powerful** + **Convenient** **command shortcuts**](#make-command-shortcuts-to-search-or-replace-in-or-out-of-vscode) (alias/doskey) to **search**/**replace** code/config/doc files **in**/**out** `vscode`.

- **Easy** + **Fast** to [**Get the Best Combined Power**](#get-the-best-combined-power) of `vscode-msr` + your language plugins (like `vscode-python` / `vscode-java` etc.).

- [Every function is **under your control**](#every-function-is-under-your-control-and-easy-to-change) and easy to enable or disable.

- [**Easy to Support New Languages**](#easy-to-support-new-languages) with an example of support `batch` scripts (`*.bat` + `*.cmd` files).

- **Automated** command shortcuts on **Linux** + **WSL** + [**4 types of terminals on Windows**](#supported-4-terminal-types-on-windows).

- Simple + flexible configuration (`just general Regex` of `C++`,`Java`,`C#`,`Python`), overwrite default settings if need.

- All just leverage one [tiny exe: msr-EXE](https://github.com/qualiu/msr/blob/master/README.md) **without** `storage`/`cache`, `server`/`service`, `network`, etc.
  - This extension costs **2~3 MB** download/storage + **1~5+ MB** running memory.
  - Much faster than professional language extensions in some cases (like results in same file or folder).
  - Auto search other language files + [extra repo folders](#extra-paths-settings) if not found definition results.

[Screenshot GIF](https://raw.githubusercontent.com/qualiu/vscode-msr/master/images/find-def-ref.gif): Search **Definitions** + **References** for **C++** / **Python** / **Java** in `vscode`:

<img src='https://raw.githubusercontent.com/qualiu/vscode-msr/master/images/find-def-ref.gif'>

### The [cooked/dumped alias/doskey](#make-command-shortcuts-to-search-or-replace-in-or-out-of-vscode) can be used in **many IDEs**, not just **VSCode**.

[Add msr to **PATH**](#or-manually-download--set-path-once-and-forever) and [Cook + **Dump** script files](#make-command-shortcuts-to-search-or-replace-in-or-out-of-vscode) for other IDEs. 

Since out of `vscode`, no menus/mouse, use `gfind-xxx`/`find-xxx` to [search](#code-mining-without-or-with-little-knowledge) and [replace](#replace-files-with-preview-and-backup) files.

<img src='https://raw.githubusercontent.com/qualiu/vscode-msr/master/images/cooked-cmd-alias-doskeys-can-be-used-in-many-IDEs.png'>

More powerful usages + examples see [overview doc](https://github.com/qualiu/msr/blob/master/README.md) or just run [msr-EXE](https://qualiu.github.io/msr/usage-by-running/msr-Windows.html) you will see [colorful text doc of usage + examples](https://qualiu.github.io/msr/usage-by-running/msr-Windows.html) (on Windows, [Linux at here](https://qualiu.github.io/msr/usage-by-running/msr-CentOS-7.html)) or [doc without color](https://raw.githubusercontent.com/qualiu/msr/master/tools/readme.txt).

## More Freely to Use and Help You More

Strongly recommend: Add [msr.EXE](https://github.com/qualiu/msr#liberate--digitize-daily-works-by-2-exe-file-processing-data-mining-map-reduce) folder to `%PATH%` (Windows) or `$PATH`(Linux) to help your [daily file processing](https://github.com/qualiu/msr/blob/master/README.md#scenario-glance).

### Default: Auto Check and Download + Set PATH

If not found [msr.EXE](https://github.com/qualiu/msr#liberate--digitize-daily-works-by-2-exe-file-processing-data-mining-map-reduce) in `%PATH%` or `$PATH`:

- **Windows**: If not found in `%PATH%` by command `"where msr.exe"`
  - Auto check and download to `%USERPROFILE%\msr.exe` when launching vscode.
  - Add `%USERPROFILE%` to `%PATH%` **temporarily** each time in each [newly opened terminal](#auto-set-command-shortcuts-for-new-terminals).
- **Linux**/**MacOS**: If not found in `$PATH` by command `"which msr"`
  - Auto check and download to `~/msr` when launching vscode.
  - Add `~/` to `$PATH` **temporarily** each time in each [newly opened terminal](#auto-set-command-shortcuts-for-new-terminals).

To copy and use `msr` [command lines](#reuse-the-command-to-search-further-or-replace-files) or `find-xxx` [doskeys/alias](#command-shortcuts) **outside** `vscode` terminals, **add** `msr` folder to `%PATH%` or `$PATH`.

### Or Manually Download + Set PATH Once And Forever

You can also manually **download** the tiny [msr.EXE](https://github.com/qualiu/msr#liberate--digitize-daily-works-by-2-exe-file-processing-data-mining-map-reduce) (of your system type) , then **add** the folder to `%PATH%` or `$PATH`.

- **Use** an existing folder or **create** a new folder like `~/tools` or `D:\tools` instead of **`system folder`**, then add it to `$PATH` or `%PATH%`.

- Or simply **copy 1 command** below to download + copy to **`system folder`** which already in `$PATH` or `%PATH%`:

  - **Windows**：(If it's a 32-bit system, use **[msr-Win32.exe](https://github.com/qualiu/msr/raw/master/tools/msr-Win32.exe)**)

    - **If `wget.exe` exists**: (check by command `"where wget.exe"`, you can get it by [choco](https://chocolatey.org/packages/Wget) or [cygwin](https://github.com/qualiu/msrTools/blob/master/system/install-cygwin.bat))

      **wget** <https://github.com/qualiu/msr/raw/master/tools/msr.exe> -O `msr.exe.tmp` && `move /y msr.exe.tmp msr.exe` && `icacls msr.exe /grant %USERNAME%:RX` && **move** [msr.exe](https://github.com/qualiu/msr/raw/master/tools/msr.exe) `%SystemRoot%\`

    - Otherwise use `PowerShell`:

      **PowerShell** `-Command "$ProgressPreference = 'SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/qualiu/msr/raw/master/tools/msr.exe' -OutFile msr.exe.tmp"` && `move /y msr.exe.tmp msr.exe` && `icacls msr.exe /grant %USERNAME%:RX` && **move** [msr.exe](https://github.com/qualiu/msr/raw/master/tools/msr.exe) `%SystemRoot%\`

  - **Linux**: `Ubuntu`/`CentOS`/`Fedora`: (If it's a 32-bit system, use **[msr-i386.gcc48](https://github.com/qualiu/msr/raw/master/tools/msr-i386.gcc48)**. `gcc`/`g++` >= 4.8)

    **wget** <https://github.com/qualiu/msr/raw/master/tools/msr.gcc48> -O `msr.tmp` && `mv -f msr.tmp msr` && `chmod +x msr` && `mv msr /usr/bin/msr`

  - **Cygwin** [bash terminal on Windows](#supported-4-terminal-types-on-windows):

    **wget** <https://github.com/qualiu/msr/raw/master/tools/msr.cygwin> -O `msr.tmp` && `mv -f msr.tmp msr` && `chmod +x msr` && `mv msr /usr/bin/msr`

  - **MacOS**: `Darwin-Arm64`:
  
    **wget** <https://github.com/qualiu/msr/raw/master/tools/msr-arm64.darwin> -O `msr.tmp` && `mv -f msr.tmp msr` && `chmod +x msr` && `mv msr /usr/local/bin/msr`

After done, you can directly run **msr --help** (or **msr -h** or just **msr**) should display [colorful usages and examples on Windows](https://qualiu.github.io/msr/usage-by-running/msr-Windows.html) or Linux like: [Fedora](https://qualiu.github.io/msr/usage-by-running/msr-Fedora-25.html) and [CentOS](https://qualiu.github.io/msr/usage-by-running/msr-CentOS-7.html).

## Adjust Your Color Theme if Result File Path Folder Color is Not Clear

You might found the `folder color` of output result file paths is not clear to read when using default `dark-blue` color theme.

To adjust the colors, for example, if it's default `dark-blue` color theme:

- Open your [personal settings file](https://code.visualstudio.com/docs/getstarted/settings#_settings-file-locations) with `code` or other tools like:
  - Windows: code `%APPDATA%\Code\User\settings.json`
  - Linux: code `$HOME/.config/Code/User/settings`
- Add or change **terminal.ansiBrightBlue** like below: (Add outer brackets `"{ }"` if the file is empty)

```json
"workbench.colorCustomizations": {
  "terminal.ansiBrightBlue": "#5833ff"
}
```

More details or other color settings follow [official vscode doc](https://code.visualstudio.com/docs/getstarted/themes#_customizing-a-color-theme).

## Avoid Security Software Downgrade Search Performance on Windows

If you cannot get search results **in 1~2 seconds** for just **10000 code files** (auto skip `packages`/`build`/`junk files`):

Follow [official Windows doc](https://support.microsoft.com/en-us/help/4028485/windows-10-add-an-exclusion-to-windows-security):

- Add "**Folder exclusions**" for your `source code paths` (usually the save folders of `git clone` repositories).
- If still slow and no obvious improvement:
  - Add "**Process** type": like `msr.exe` + `msr` to `"Process exclusions"`.
  - Add "**File**": like `D:\tools\msr.exe` to `"File exclusions"`.

(You probably have done for others tools like `golang`, npm `node.exe` , `pip.exe` and `python.exe` etc.)

## Prefer Precision over Speed when Searching Definitions

You can change the value for **small projects** which you can prefer **precision** over **speed** since it's fast:
- Global change: `msr.default.preferSearchingSpeedOverPrecision` = `false`.
- For a project: `msr.{project-folder-Name}.preferSearchingSpeedOverPrecision` = `false`.
- For C# code: `msr.cs.preferSearchingSpeedOverPrecision` = `false`.

More override settings see: [**full priority rule**](https://github.com/qualiu/vscode-msr/blob/master/Add-New-Language-Support-For-Developers.md#full-priority-order-of-config-override-rule).

## Make Command Shortcuts to Search or Replace In or Out of VSCODE

You can generate the command shortcuts (alias/doskey) to directly use for searching or replacing in or out of vscode.

### Try to use gfind-xxx instead of find-xxx alias/doskey

Try **gfind-xxx** alias/doskey/scripts which uses **accurate** source file paths by "`git ls-files`", though a bit slower than **find-xxx**.

This's helpful if got [**git-exemption-warnings**](#use-git-ignore) when initializing new terminals.


<img align='center' src='https://raw.githubusercontent.com/qualiu/vscode-msr/master/images/cook-command-menu.png'>

- One single shortcuts file: (Press `F1` if not shown in right-pop menu, then search `msr Cook xxx` as below)
  - **General command shortcuts**
    - Click/Choose **`"Cook alias/doskey: Only general finding commands to 1 file"`** to make **general command shortcuts**.
    - **This is recommended**.
    - Please **re-cook** this if [**added new languages support**](#easy-to-support-new-languages) including [**fastest adding**](#fastest-and-easiest-way-to-support-new-language).
      - Will not **auto update** if once cooked + nothing changed (like `msr.xxx.definition` settings).
  - **Project specific shortcuts**
    - Choose `"Cook alias/doskey by project: Only finding commands to 1 file"` to make shortcuts based on current project setting.
    - Not recommended unless you only work with 1 project.
  - Notes for both **general + specific** shortcuts in **single** file:
    - **Auto initialized and effect in vscode** when opening new terminals (including `MSR-RUN-CMD`) with path/folder skip patterns:
      - Skip paths Regex: `--np "skip-by-git-ignore"` (if enabled [git-ignore](#use-git-ignore)).
      - Skip folders Regex: `--nd "default-and-project-exclude"`
    - If not cooked general nor specific shortcuts (`doskey/alias`):
      - You can only use them in vscode but **not outside**, since they're auto-initialized only in vscode terminals.
    - If cooked command shortcuts (`doskey/alias`):
      - System console (`CMD/bash`) will auto load these `doskey/alias` when opening new consoles.
- Multiple **script files** choose menus below: More freely to use (**in other script files** or **nested command lines** like pipe)
  - `"Cook script files: Only general finding command alias/doskey."`
  - `"Cook script files by project: Only finding command alias/doskey."`
  - **`"Cook general finding + Dump with other command alias/doskey to script files."`**
    - Tip for [**msr advantage**](https://github.com/qualiu/msr#tip-for-captured-groups-reference-to-replace-files-or-transform-text) on **Windows**(including `MinGW` + `Cygwin`) + **Linux**/**MacOS**:
      - You can use `"\1"` instead of `"$1"` to avoid conflict if your `doskey`/`alias` contains **`Regex-Replacing`** commands:
        -  `Regex replace-to` conflict with `doskey macro` variables like **$1** on Windows.
        -  `Regex replace-to` conflict with `bash` variables like **$1** on Linux/MacOS.
      - Same to use **\2** + **\3** better than **$2** **$3** and etc.
    - To hide command + set local variable scope for Windows `doskey` shortcuts to script files:
      - Change `msr.cookCmdAlias.addEchoOff` (default: added) to **`@REM echo off`** if you want to show command line.
      - Change `msr.cookCmdAlias.setVariablesToLocalScope` to **`SetLocal EnableExtensions EnableDelayedExpansion`** to avoid global scope.
    - This **enables you to use alias/doskeys (like `find-def`) everywhere** like:
      - Nested commands/pipe like `for-loop` in CMD/Bash + `while-loop`, etc.
      - Script files (like `*.cmd` + `*.bat` + `*.sh` + `*.ps1` etc.)
      - Interactive `PowerShell` terminal/console (`PowerShell` cannot use `doskey/alias`).
  - `"Cook finding by project + Dump with other command alias/doskey to script files."`

### Command Shortcuts

- After you cooked command alias/doskeys, you'll see messages below: (You can **write**/**update** doskeys in file)
- Automated command shortcuts on **Linux** + **MacOS** + **WSL** + [**4 types of terminals** on Windows](#supported-4-terminal-types-on-windows) to [search](#search-files-with-rich-filters) or [**mining-code**](#code-mining-without-or-with-little-knowledge) or [replace files](#replace-files-with-preview-and-backup).
- Try **gfind-xxx** instead of **find-xxx** if warned [**exemptions**](#try-to-use-gfind-xxx-instead-of-find-xxx-aliasdoskey) when initializing new terminals.

```bash
Now you can directly use the command shortcuts in/out-of vscode to search + replace like:
find-ndp dir1,dir2,file1,fileN -t MySearchRegex -x AndPlainText
find-nd -t MySearchRegex -x AndPlainText
find-code -it MySearchRegex -x AndPlainText
find-small -it MySearchRegex -U 5 -D 5 : Show up/down lines.
find-doc -it MySearchRegex -x AndPlainText -l -PAC : Show pure path list.
find-py-def ClassOrMethod -x AndPlainText : Search definition in python files.
find-py-ref MySearchRegex -x AndPlainText : Search references in python files.
find-ref "class\s+MyClass" -x AndPlainText --np "unit|test" --xp src\ext,src\common -c show command line.
find-def MyClass -x AndPlainText --np "unit|test" --xp src\ext,src\common -c show command line.
find-ref MyClass --pp "unit|test" -U 3 -D 3 -H 20 -T 10 :  Preview Up/Down lines + Set Head/Tail lines in test.
find-ref OldClassOrMethod -o NewName -j : Just preview changes only.
find-ref OldClassOrMethod -o NewName -R : Replace files.
alias find-pure-ref
malias find -x all -H 9
malias "find[\w-]*ref"
malias ".*?(find-\S+)=.*" -o "\2"  :  To see all find-xxx alias/doskeys.
malias use-rp :  To see matched alias/doskeys like 'use-rp', 'out-rp', 'use-fp' and 'out-fp' etc.
use-rp  - Search relative path(.) as input path: Output relative paths if no -W.
use-fp  - Search workspace root paths: Output absolute/full paths (regardless of -W).
out-rp  - Output relative path. This will not effect if use-fp which input full paths of current workspace.
out-fp  - Output full path.
Add -W to output full path; -I to suppress warnings; -o to replace text, -j to preview changes, -R to replace files.
You can also create your own command shortcuts in the file: {msr.cmdAlias.saveFolder}\msr-cmd-alias.doskeys
Every time after changes, auto effect for new console/terminal. Run `update-alias` to update current terminal immediately.
See + Use command alias(shortcut) in `MSR-RUN-CMD` on `TERMINAL` tab, or start using in a new command window outside.
(if running `find-xxx` in vscode terminals, you can `click` the search results to open in vscode.)
```

You can search **in vscode terminal** then **click** the results to **open and locate** them, or start [**code-mining**](#code-mining-without-or-with-little-knowledge).

Each time it will write 1 or multiple script files to the folder of `msr.cmdAlias.saveFolder`, if not set:

- Single alias/doskey file: Save to `%USERPROFILE%\` on Windows or `~/` on Linux/MacOS.

- Multiple script files: Save to `%USERPROFILE%\cmdAlias\` on Windows or `~/cmdAlias/` on Linux/MacOS.

When you open a new terminal, will [**auto set project specific command shortcuts**](#auto-set-command-shortcuts-for-new-terminals) to use temporary command shortcuts of each project's specific settings plus `.vscode/settings.json` in it's root folder.

### Switch between General and Project Specific Command Shortcuts

- Terminals in vscode:
  - For `MSR-RUN-CMD` + other existing terminals in vscode:
    - Run **update-alias** to temporarily use/switch to `default/general` filters.
    - Run **open-alias** to open the general/default command alias file (like `~/msr-cmd-alias.bashrc` or `%USERPROFILE%\msr-cmd-alias.doskeys`).
    - Run **update-{project-folder-name}-alias** to **recover**/use `git-ignore` filters.
      - Run **`malias "update-\S*alias"`** to get the exact `update-xxx-alias` **names** + **paths**.
  - Only for `MSR-RUN-CMD` terminals in vscode:
    - Open [user settings](https://code.visualstudio.com/docs/getstarted/settings#_settings-editor) (press `F1`) -> search `msr.useGitIgnoreFile` and un-check it to use `default/general` filters.
      - Change `msr.{project-folder-name}.useGitIgnoreFile` if you had set for a project in [user settings.json](https://code.visualstudio.com/docs/getstarted/settings#_settings-file-locations).
- System console (`CMD/Bash`) **out of vscode** (after [cooking doskeys/alias](#make-command-shortcuts-to-search-or-replace-in-or-out-of-vscode)).
  - If you always work with only one project/repository:
    - [Cook project specific doskeys/alias](#make-command-shortcuts-to-search-or-replace-in-or-out-of-vscode) like `find-xxx` with project specific [git-ignore](#use-git-ignore).
  - If you work with many projects/repositories, run 1 command to switch to project specific [git-ignore](#use-git-ignore):
    - Windows CMD console:
      - **doskey** /MACROFILE=`%TMP%\{project-folder-name}.msr-cmd-alias.doskeys`
    - Linux/MacOS console or [Cygwin/MinGW/WSL console on Windows](#supported-4-terminal-types-on-windows):
      - **source** `/tmp/{project-folder-name}.msr-cmd-alias.bashrc`
    - Notes:
      - The above `"temp alias file paths"` are already displayed in `MSR-RUN-CMD` and new terminals.
      - Please get the **name** + **paths** by command: **`malias "update-\S*alias"`** in `MSR-RUN-CMD` and new terminals.
      - Only effective to current console, no impact to other/latter consoles.
- You can verify switching by command like: **`alias find-ref`**, should see different **find-ref** definitions after switched.

## Use git-ignore

Open [user settings](https://code.visualstudio.com/docs/getstarted/settings#_settings-editor), set `msr.useGitIgnoreFile` = `true` (or `msr.{project-folder-name}.useGitIgnoreFile` = `true`)

- This use the `.gitignore` file only in top folder of the project, without other kinds/folders of git-ignore files.
- Omit file/folder exemptions (like `!not-exclude.txt`) as default.
  - Set `msr.omitGitIgnoreExemptions` = `false` to not use git-ignore if found exemptions.

Parsing result of `.gitignore` file: see `MSR-Def-Ref` output channel (with `msr.debug` = `true` or launched in debug mode).

Run command **`"npm run test"`** in vscode-msr folder if you want to see the translation rule of git-ignore on Windows/Linux/MacOS.

### Compare file lists to help checking if a project can use git-ignore

- Method-1: Set `msr.autoCompareFileListsIfUsedGitIgnore` = `true` to auto compare file list at starting (opening projects).
- Method-2: Use menu/command-palette of `msr.compareFileListsWithGitIgnore` to compare file lists if enabled `msr.useGitIgnoreFile`.

### Enable or disable git-ignore for all projects or one project

- For all projects: Set `msr.useGitIgnoreFile` to `true` or `false`.
- For one project: Add `msr.{project-folder-name}.useGitIgnoreFile` = `true` or `false` in [user settings](#extension-settings-if-you-want-to-change).

### A better solution to support `git-ignore` in future
- Use `git ls-files` command output all file list to `/tmp/{project}-git-files.txt`.
  - For terminal usages, there's a new group of [**gfind-xxx**](#try-to-use-gfind-xxx-instead-of-find-xxx-aliasdoskey) alias/doskey shortcuts.
- Use `msr -w /tmp/{project}-git-files.txt` instead of current `msr -rp .` or `msr -rp {project}-full-path`.
- Create a file watcher to auto update `/tmp/{project}-git-files.txt` when captured file `deletion` or `creation` events.

### Current workarounds if non-precise `git-ignore` not works well

- Precise method:
  - As mentioned above, leverage **git ls-files** to output file list to a temp file + **msr -w** to read (instead of `msr -rp`).
- Non-precise method: 
  - See [switch between general/specific shortcuts](#switch-between-general-and-project-specific-command-shortcuts).

## Support Multiple Repositories

- Method-1: Use multiple workspace
  - Add workspace for each repository in vscode, to have specific [**git-ignore**](#use-git-ignore) for each repository.
  - Recommended if you want to see the related/dependency files in vscode.
- Method-2: Use [extra search paths](#extra-paths-settings)
  - Searches extra paths as final resort.
  - Recommended if you don't want to see the related/dependency files in vscode..

## Enable Finding Definition and References for Unknown Languages

If you want to support unknown languages, do **anyone** of below:

- Set `msr.enable.onlyFindDefinitionForKnownLanguages` = **false** in [personal settings file](https://code.visualstudio.com/docs/getstarted/settings#_settings-file-locations) or un-check it in [user settings](#extension-settings-if-you-want-to-change).
- See [Easy to Support New Languages](#easy-to-support-new-languages) to add one or two config values.

## Easy to Support New Languages

[Currently support well](#current-support-to-finding-definition-and-references) for: `C#`, `C++/C`, `Python`, `PowerShell`, `Batch/Bash`, `Java`, etc.

This extension is **disabled** for some languages which has good official/professional extension support, to enable finding `definition`:

- Temporarily enable: See [temporarily toggle](#get-the-best-combined-power)(just press `Alt+F2` or menu or command palette).
- Permanently enable: Change **msr.disable.extensionPattern** value.

Other languages use a rough support: When click `"Go To Definition"` just like click the **right-pop-menu**: `"Regex find as 'class' or 'method' definition roughly"`.

**Two methods** to support a new language. (If you're a **developer**/**contributor** see: [**here**](https://github.com/qualiu/vscode-msr/blob/master/Add-New-Language-Support-For-Developers.md), welcome!)

### File to Add New Language Settings

- Open your [personal settings file](https://code.visualstudio.com/docs/getstarted/settings#_settings-file-locations) with `code` or other tools like:
  - Windows: code `%APPDATA%\Code\User\settings.json`
  - Linux: code `$HOME/.config/Code/User/settings.json`

Take **finding definition** for **batch** files (`*.bat` and `*.cmd`) as an example (for **normal users**):

### Method-1: Only Add One Extension of the New Language You Want to Support

If you only want to support finding definition for `*.bat` files other than all `batch` script (`*.bat` + `*.cmd`):

Add **lower case** `extension name`: "**msr.{extension}.definition**" (here `{extension}` = **bat** ) into the file:

```json
  "msr.batch.definition": "^\\s*:\\s*(%1)\\b|(^|\\s)set\\s+(/a\\s+)?\\\"?(%1)="
```

See [**here**](https://github.com/qualiu/vscode-msr/blob/master/Add-New-Language-Support-For-Developers.md#additional-explanation-for-the-regex-pattern-used-above-when-support-batch-scripts) if you're interested about the explanation of the `definition` Regex used above and below.

### Method-2: Support All Extensions of the New Language by Adding 2 Mandatory Settings

- Add **lower case** `language name` (as you want): "**msr.fileExtensionMap**.`{Name}`" (here `{Name}` = **batch** ) into the file:

```json
  "msr.fileExtensionMap.batch": "bat cmd"
```

- Add Regex match pattern to find definition (lower case name `msr.batch.definition`):

```json
  "msr.batch.definition": "^\\s*:\\s*(%1)\\b|(^|\\s)set\\s+(/a\\s+)?\\\"?(%1)="
```

### Fastest and Easiest Way to Support New Language

For example of `Rust` language, adding `msr.fileExtensionMap.rs` = `"rs"` (like `"bat cmd"` for `msr.fileExtensionMap.batch`):

- You'll get new command shortcuts like: `find-rs` + `find-rs-ref` + `find-rs-def` to help [search/replace](#search-files-with-rich-filters) or [code mining](#code-mining-without-or-with-little-knowledge).
- This will use the default finding Regex patterns unless you added `Rust` patterns (see `msr.batch.definition` / `msr.cs.class.definition`).
- Please **re-cook** [default/general shortcuts](#make-command-shortcuts-to-search-or-replace-in-or-out-of-vscode) to avoid missing `default` shortcuts when [**switching**](#switch-between-general-and-project-specific-command-shortcuts) from `project-specific` shortcuts.

Set `msr.quiet` = `false`, `msr.debug` = `true` will help you tune and debug the config values (Regex patterns).

### Other Optional Settings and Full Priority Order of Config Override Rule

See [optional settings](https://github.com/qualiu/vscode-msr/blob/master/Add-New-Language-Support-For-Developers.md#many-other-settings-if-you-want-to-override-or-add-or-update) and [override rule](https://github.com/qualiu/vscode-msr/blob/master/Add-New-Language-Support-For-Developers.md#full-priority-order-of-config-override-rule).

## Every Function is Under Your Control and Easy to Change

### Hide or Show More Context Menus

Default setting just shows a few of 24 provided context menu items of `Plain-text find` + `Regex find` + `Sort`.

To show or hide more menus, [open user settings](#extension-settings-if-you-want-to-change) check/un-check menus like [screenshot](https://raw.githubusercontent.com/qualiu/vscode-msr/master/images/editor-context-menu.png) below:

<img align='center' src='https://raw.githubusercontent.com/qualiu/vscode-msr/master/images/editor-context-menu.png' width=785 height=313>

Set `msr.menu.visible` = `false` to hide all context menus of `Regex find xxx` + `Find xxx` etc.

## Get the Best Combined Power

For 2 cases when **`"Go To Definition"`** by menu or key(**`F12`**) or **`"Ctrl + Mouse Left Click"`**:

- Got duplicate results (from both `vscode-msr` + official extension like `vscode-python`).
- No results found if you disabled `vscode-msr` via menu or hot-key of `"Toggle enable/disable msr"`.

Then just press `Alt+F2` to **temporarily toggle** `Enable`/`Disable` of **`Finding Definition`**. [Change `Alt+F2`](https://code.visualstudio.com/docs/getstarted/keybindings#_keyboard-shortcuts-editor) if hot-keys conflict.

It's useful when the official/professional plugins got problems:

- Temporarily enable `vscode-msr` when the official language plugins fail.
- Temporarily disable `vscode-msr` when the official language plugins work well.

Note for the `toggle`:

- See [workaround](#workaround-to-long-existing-vscode-bug-impact-to-finding-definition-and-reference) if you encounter cases like [error impact of `vscode-python` + `vscode-powershell` to vscode](https://github.com/microsoft/vscode/issues/96754).
- Only impact `"find definition"`, you can still **search** or **replace** by menus or [command shortcuts](#command-shortcuts).
- This is effective until you reload or restart current vscode window. (Permanent changes see settings below.)

This **temporarily ignores all other settings** like below to enable/disable finding for a language:

- `msr.enable.onlyFindDefinitionForKnownLanguages`
  - Known language **type** means exist "msr.fileExtensionMap.**{name}**" like "msr.fileExtensionMap.**python**".
- `msr.disable.extensionPattern`
- `msr.disable.findDef.extensionPattern`
- `msr.disable.projectRootFolderNamePattern`

There're another 2 ways to toggle besides the hot key (`Alt+F2`):

- **Command Palette**: Press `F1` to open command palette, then type `msr temp` or `msr toggle` etc.
- **Right-Pop-Menu**: Change `msr.tmpToggleEnableFindingDefinition.menu.visible` then use it.

[Set **quiet mode**](#more-settings-like-quiet-mode) if you don't want to activate vscode tabs like `OUTPUT` and `TERMINAL`.

### Disable Finding Definition and References for Specific File Types

- `msr.disable.extensionPattern`

  Regex pattern of **file name extensions** to **disable** `find definition and references`.

  For example:

  - Set `tsx?|jsx?` for `TypeScript` and `JavaScript` files.
  - Set `py|cs|java|scala` for `python`, `C#` and `Java`/`Scala` files .

### Disable Finding Definition for Specific File Types

`msr.disable.findDef.extensionPattern` like `tsx?|jsx?|go|py`

### Disable Finding References for Specific File Types

`msr.disable.findRef.extensionPattern` like `tsx?|jsx?|go|py`

### Disable Finding Definition + References for Specific Projects By Root Folder Name

- `msr.disable.projectRootFolderNamePattern` (**case sensitive**)

  Regex pattern of `git root folder name` to **disable** `find definition and references` functions for specific projects.

  For example: `^(Project\d+)$` to disable for D:\\**Project1** and C:\git\\**Project2**.

### Disable Finding Definition or References for All

- `msr.enable.definition`: Set to `false` or un-check it to **disable** `find definitions` function for all types of files.
- `msr.enable.reference`: Set to `false` or un-check it to **disable** `find references` function for all types of files.

### Output Relative Paths or Full Paths

- For cooking command alias/shortcuts and using it:
  - `msr.cookCmdAlias.outputFullPath`
  - `msr.cookCmdAlias.outputRelativePathForLinuxTerminalsOnWindows`:
- For search output (from `menu` or `auto-triggered re-run when got multiple results`):
  - `msr.searchRelativePathForLinuxTerminalsOnWindows`:
    - Set `true` to help click + open results in `vscode` for [Cygwin/MinGW/WSL terminals](#supported-4-terminal-types-on-windows) on Windows.
  - `msr.searchRelativePathForNativeTerminals`: Enable it to get short paths.
- Just add `-W` to output full paths when you re-use the command line and if it output relative paths.

## More Settings like Quiet Mode

<img align='center' src='https://raw.githubusercontent.com/qualiu/vscode-msr/master/images/browse-all-setting-names.png'>

This doc listed a few configuration names. Finding more by pressing `F1` to [Open User settings](#extension-settings-if-you-want-to-change) to change.

- `msr.quiet`

  Don't activate (show) channels: `MSR-Def-Ref` (in `OUTPUT` tab) + `MSR-RUN-CMD` (in `TERMINAL` tab).

  - `MSR-Def-Ref` shows **sorted results after ranking**, and specific search commands with time costs.
  - `MSR-RUN-CMD` shows `re-running search when got multiple results` or `finding commands from menu`.

## Extension Settings If You Want to Change

- You **don't need to change** [user settings](https://code.visualstudio.com/docs/getstarted/settings#_edit-settings), however, if you need: 
  - Just type/paste **`msr.xxx`** in **vscode UI**(like below) or add/update **`msr.xxx`** in [**user settings file**](https://code.visualstudio.com/docs/getstarted/settings#_settings-file-locations):
    <img align='center' src='https://raw.githubusercontent.com/qualiu/vscode-msr/master/images/change-settings-example.png'>

- You can add `msr.{project-folder-name}.xxx` in [settings file](https://code.visualstudio.com/docs/getstarted/settings#_settings-file-locations) to override all config values, like:
  - `msr.{git-folder-name}.useGitIgnoreFile` or `msr.{git-folder-name}.skipFolders` etc.
- Full priority/order: See [**override rule + order**](https://github.com/qualiu/vscode-msr/blob/master/Add-New-Language-Support-For-Developers.md#full-priority-order-of-config-override-rule).

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

- Default behavior(change [user settings](#extension-settings-if-you-want-to-change) as you wish):

  - `msr.initProjectCmdAliasForNewTerminals` = `true`
    - Auto set/initialize command alias/doskeys for newly created terminals:
  - `msr.skipInitCmdAliasForNewTerminalTitleRegex` = `PowerShell\\s*Integrated\\s*Console|pwsh$|Java|Debug`
    - Not set/initialize command alias/doskeys for terminals of `PowerShell Integrated Console` and `Linux PowerShell` etc.

- Merge project specific `excluded folders` from `.vscode/settings.json` in each project root folder.
  - Extract folders from `files.exclude` and `search.exclude` by Regex: `^[\w-]+$` after trimming `*` at head and tail.
  - You can **disable** `msr.autoMergeSkipFolders` to not auto merge excluded folders.
  - You can **disable** `msr.overwriteProjectCmdAliasForNewTerminals` to use the existing temp command shortcuts of each project.
- Auto switch to `CMD` console other than `Powershell` on Windows to use command shortcuts.

  - Due to `Powershell` cannot use `doskey` command shortcuts. (You can [cook command **script files**](#make-command-shortcuts-to-search-or-replace-in-or-out-of-vscode) then add the script folder to `%PATH%` or `$PATH`)

#### Supported 4 Terminal Types on Windows

Supported various types of terminals: ([settings file](https://code.visualstudio.com/docs/getstarted/settings#_settings-file-locations) like: `%APPDATA%\Code\User\settings.json` on Windows).

**Not recommend** to set terminal type after vscode 1.56, which is **unnecessary** since easier to open different terminals.

Only `explicitly set terminal` on Windows **when you caught problems** like unable to determine `PowerShell` or `CMD` type.

- [VsCode Official supported terminals](https://code.visualstudio.com/docs/editor/integrated-terminal#_configuration) like below:

```cpp
// CMD console:
"terminal.integrated.shell.windows": "C:\\Windows\\System32\\cmd.exe"

// Git Bash(MinGW): Built-in environment variable: MSYSTEM like: MSYSTEM=MINGW64
"terminal.integrated.shell.windows": "C:\\Program Files\\Git\\bin\\bash.exe"

// Ubuntu Bash on Windows (WSL):
"terminal.integrated.shell.windows": "C:\\Windows\\System32\\bash.exe"
```

- Additionally supported by vscode-msr: **Cygwin** [(green install)](https://github.com/qualiu/msrTools/blob/master/system/install-cygwin.bat), you can set in [your personal settings file](https://code.visualstudio.com/docs/getstarted/settings#_settings-file-locations) like:

```cpp
// Cygwin Bash. One command to install Cygwin (into a folder no pollution): https://github.com/qualiu/msrTools/blob/master/system/install-cygwin.bat
"terminal.integrated.shell.windows": "D:\\cygwin64\\bin\\bash.exe"
```

#### Use Short Mount Paths for WSL Bash Terminal on Windows

Set **/etc/wsl.conf** like below to use short mount paths (like **`/c/`** instead of **`/mnt/c/`**), may need restart to effect:

```bash
[automount]
root = /
options = "metadata"
```

### Code Mining without or with Little Knowledge

You may need fuzzy code searching for cases like below:

- Only got piece of words from others, just human language not the exact name of code (`class`/`method`).
- Take over a project, or already ramp-up for several days, not easy to get help.

Then you can try code/knowledge mining by yourself with vscode-msr: (after [**cooking doskey/alias**](#command-shortcuts) if **out of vscode**)

Besides the normal **`"Go To Definition"`** by menu or key(`F12`), you can take flexible code mining in vscode terminals/console.

The 40+ [shortcuts](#command-shortcuts) like `find-xxx` are convenient wrappers of [**msr/nin**](https://github.com/qualiu/msr#almost-no-learning-cost) with **70/30** composable [optional-args](https://github.com/qualiu/msr#brief-summary-of-msr-exe) (brief **Quick-Start** at bottom of running `msr -h` or `nin -h`).

Code mining examples (run in vscode terminals: like `MSR-RUN-CMD` or add/open **new** terminals):

- Fuzzy search a class/method:
  - **find-def** `"\w*Keyword\w*You-Heard-or-Knew\w*"`

- Fuzzy search a class/method, with [**optional args**](https://github.com/qualiu/msr#brief-summary-of-msr-exe) like **ignore case**(**-i**) :
  - **find-def** `"\w*Keyword\w*"` **-i**
  - **find-def** `"\w*Keyword\w*"` **-i** -x `class`
  - **find-ref** `"class\s+\w*Keyword\w*"` **-i**
  - **find-all** -i -t `"class\s+\w*keyword\w*"`
  - **find-def** `"\w*Keyword\w*"` **-i -x** `enum`
  - **find-def** `"\w*Keyword\w*"` **-ix** `public` -H `20` -T `20` --nx `internal` -d `"^(src)$|keyword"` --nd `"test|^(unit|bin$)|demo"`
  - **find-def** `"\w*Keyword\w*"` **-i** --nt `"private|protected"` --pp `"/src/|keyword"` --xp `test,/unit,/bin/,demo` --np `"test|/unit|/bin/"`
  - **find-def** `"\w*Keyword\w*"` **-i** --nx `private` --nt `"protected|internal"` --xp `test,/unit,/bin/,demo` --pp `"/src/|keyword"` -H 20 -J ...

- **Accelerate searching** if you know the language type (like `Python`/`C#`), the **more** filters the **faster**:
  - **find-py-def** `"\w*(get|set|update)\w*Method-Keyword-You-Heard\w*"` -ix `public` --nx ... --nt ... --xp ... --pp ... -d ... --nd ...
  - **find-cs-def** `"\w*(get|set|update)\w*Method-Keyword-You-Heard\w*"` -i
  - **find-cpp-ref** `"(class|enum)\s+\w*Class-Keyword-You-Heard\w*"` -i
  - **find-java-ref** `"(class|enum)\s+\w*Class-Keyword-You-Heard\w*"` -i
  - **find-go-ref** `"\w*Class-Keyword-You-Heard\w*"` -i -x `class`
  - **find-ui** -it `"regex-pattern"` -x `"and-plain-text"`
  - **find-code** -it `"(class|enum)\s+\w*Class-Keyword-You-Heard\w*"`
  - **find-all** -i -t `"(class|enum)\s+\w*Class-Keyword-You-Heard\w*"`

- Others like: (run command `alias find-xxx` to see the command template like `alias find-all`)
  - **find-doc** -it `"regex-pattern"` -x `"and-plain-text"` --nx ... --nt ... --xp ... --pp ... -d ... --nd ...
  - **find-config** -it `"regex-pattern"` -x `"and-plain-text"`
  - **find-small** -it `"regex-pattern"` -x `"and-plain-text"`

- **General finding commands** like:
  - **find-nd** -it `"regex-pattern"` -x `"and-plain-text"` [**optional args**](https://github.com/qualiu/msr#brief-summary-of-msr-exe)
  - **find-nd** -f `"\.(cs|py|java)$"` -it `"regex-pattern"` -x `"and-plain-text"`
  - **find-ndp** `path1,path2,pathN` -f `"\.(cs|py|java)$"` -it `"regex-pattern"` -x `"and-plain-text"`
  - **find-ndp** `path1,path2,pathN` -it `"regex-pattern"` -x `"and-plain-text"` -f ... --nf ... -d ... --nd ... --pp ... --xp ... --nt ... --nx ...

- With other optional args like:
  - **find-all** -it `"regex-pattern"` -x `"and-plain-text"` -l  just list matched file paths.
  - **find-all** -x `"and-plain-text"` -it `"regex-pattern"` -o `"replace-regex-to-this"` -R replace files
  - **find-all** -it `"regex-pattern"` -x `"and-plain-text"` -o `"replace-plain-text-to-this"` -R replace files
  - **find-all** -it `"regex-pattern"` -x `"and-plain-text"` -U 5 -D 3 -H 100 -c Output `100 lines` with `5-rows-up` + `3-rows-down` for each match.
  - **find-all** -it `"regex-pattern"` -x `"and-plain-text"` --nx `"not-contain-text"` --nt `"not-match-regex"` --xp `/bin/,debug/,test` --pp `expected-path-regex` --np `skip-path-regex` -U 3 -D 2 -H 100 -T 100 ...

- Other functions:
  - **find-top-source-type** `-H 9` : Gee `top 9` language types by file count/percentage in current workspace/repository.
  - **find-top-source-type** `-k 100` : Get top languages which file `count >= 100`.
  - **find-top-source-type** `-K 2.5` : Gee top languages which file count `percentage >= 2.5%`.
  - **find-top-type** -H 9 `-w` : Gee top 9 file types and show one example file path (`whole/full` path) of each type.
  - **sort-source-by-time** `-T 9` : Get `newest 9 source files` sorting `source files` by file write/modify time.
  - **sort-by-time** `-T 9` : Get `newest 9 files` sorting `all files` by file write/modify time.
  - **sort-by-size** `-T 9` : Get `newest 9 files` sorting `all files` by file size.
  - **sort-by-size** -T 9 `-W` : Get `newest 9 files` sorting `all files` by file size + Show `full paths` (absolute paths).

Once you found the results:

- You can filter results by [appending filters](#search-files-with-rich-filters). (Add `-c` to see full command line or debug).
- Click + open the search results in vscode and continue your code mining.
- [Search code together](#get-the-best-combined-power) with official vscode extensions (like: `vscode-python` / `vscode-go`) + official IDEs (like: `Visual Studio` / `PyCharm`).

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

These global **extra search paths** settings enable searching related files **without loading** them into `vscode`.

More details see [Extra Path Settings](https://github.com/qualiu/vscode-msr/blob/master/Extra-Path-Settings.md).

### Specific Coding Language Settings Examples

- `msr.fileExtensionMap.batch`: Set file extension of batch script (`*.bat` + `*.cmd`), value = `"bat cmd"`.
- `msr.fileExtensionMap.rs`: [Support new language](#easy-to-support-new-languages) (`Rust`), value = `"rs"`.
- `msr.cpp.codeAndConfigDocs`: Regex pattern of `C++` / `C` code + configuration + document files.
- `msr.py.extraSearchPaths`: **Extra search paths** for `Python` code's external repositories, dependency sources, or libraries, etc.

## Normal and Extensive Search

Normal Search (`default context menu`) + Extensive Search (`context menu` + `command palette`)

- Normal search:
  - Find definition (`Go to Definition` menu): Precise search **project root** + **extra paths** if set.
  - Find references (`Find All References` menu): Disabled by default (Use menus like `"Regex find xxx"` menus or use shortcuts like [code-mining](#code-mining-without-or-with-little-knowledge)).
- Extensive search:
  - **Plain-text** and **Regex** searching groups in **command palette** and partially in **editor context menu** (`Find plain text in xxx` or `Regex find xxx`)
  - Provide specific searching in **project root** + **extra paths** if set. For example, `Regex find pure references in code files` will skip comments and long text in code.

## Reuse the Command to Search Further or Replace Files

You can **reuse** [msr](https://github.com/qualiu/msr#almost-no-learning-cost) `original search command line` in `vscode` output channel `MSR-Def-Ref` or terminal `MSR-RUN-CMD` to **search** + **replace** files. More details see: [**Scenario Glance**](https://github.com/qualiu/msr#scenario-glance).

### Search Files with Rich Filters

You can use any 1 of **3 methods** below to filter results or take further searches:

- Leverage `original search command line` in `MSR-Def-Ref` or `MSR-RUN-CMD`, and change/tune.
- Use [command shortcuts](#command-shortcuts) to write brief searching/replacing commands in/out-of vscode:
  - `MSR-RUN-CMD` + other terminals in vscode after auto-initialized `doskey/alias`.
  - System console (like CMD/Bash) **out of vscode**: See [switch general/specific shortcuts](#switch-between-general-and-project-specific-command-shortcuts).
- Write raw [**msr/nin**](https://github.com/qualiu/msr#almost-no-learning-cost) commands with **70/30** composable [optional-args](https://github.com/qualiu/msr#brief-summary-of-msr-exe) (brief **Quick-Start** at bottom of running `msr -h` or `nin -h`).

Change the value of **-t** / **--np** / **--nd** if already used in command line.

- Filter result text:
  - **-x** `"need plain text"` , **--nx** `"exclude plain-text"`
  - **-t** `"search/include Regex"` , **--nt** `"exclude Regex"`
- Filter result file name, folder, full-path:
  - **-d** `"match folders Regex"`, **--nd** `"exclude folder Regex"`
  - **--pp** `"full path Regex"` , **--np** `"exclude full path Regex"` , **--xp** `"/full-paths,or/sub-paths,sub-path-text"`
- You can also add more `msr` commands to the command line like:
  - `msr original command` **|** `msr -i -t "^\s*public" -P -A -C`
- Get matched file `list` (**-l**) -> Generate new command (**-o** `msr xxx`) -> Execute command (**-X**):
  - `msr original command` **-l** -PAC **|** `msr -t "(.+)" -o "msr -p \1 -t \"class To-Search\" --nx internal"` **-X**

### Replace files with Preview and Backup

Reuse the search command above (or `find-reference` command line in `vscode`), you can also write a new command.

- See replaced text lines (add **-o** `replace-to-text`):
  - `msr original command ... -t "xxx" ...` **-o** `"replace-to"`
- **Just** preview changed files (**-j**):
  - `msr original command ... -t "xxx" ...` **-o** `"replace-to"` **-j**
- Replace files (**-R**):
  - `msr original command ... -t "xxx" ...` **-o** `"replace-to"` **-R**
  - Add **-K** if you want to backup changed files.
  - Add **--force** to replace files with `BOM` header not `UTF-8 0xEFBBBF`.

## Brief Usage Summary for Search or Configuration

Besides the [overview doc](https://github.com/qualiu/msr/blob/master/README.md) and [readme.txt](https://raw.githubusercontent.com/qualiu/msr/master/tools/readme.txt) here's brief summary(try [**msrUI**](https://github.com/qualiu/msrUI) if [**built-in help**](https://github.com/qualiu/msr/blob/master/README.md#msr-overview-windows-or-linux) not good enough):

- Easy to add, update or tune `Regex` patterns to improve existing or support new coding languages:
  - Use above debugging method with the output info.
  - To test or tune your `Regex` patterns: Use the [auto-downloaded](#default-auto-check-and-download--set-path) tool [msr.EXE](https://github.com/qualiu/msr#liberate--digitize-daily-works-by-2-exe-file-processing-data-mining-map-reduce) of your [system type](#more-freely-to-use-and-help-you-more) to test like:
    - Input a string from input-arg (`-z`) or pipe (like `echo`):
      - msr **-z** `"class CPP_EXPORT MatchThisCppClass"` -t `"^\s*class (\w+\s+)?\bMatchThisCppClass"`
      - **echo** `class CPP_EXPORT MatchThisCppClass` `|` msr -t `"^\s*class (\w+\s+)?\bMatchThisCppClass"`
    - Input a file like:
      - msr **-p** `my-class.hpp` -t `"^\s*class (\w+\s+)?\bMatchThisCppClass"`
    - Input paths and recursively search like:
      - msr **-r -p** `my-class.hpp,src,folder2` -t `"^\s*class (\w+\s+)?\bMatchThisCppClass"`
- Use the rich searching options of [msr-EXE](https://github.com/qualiu/msr/blob/master/README.md) like below, **combine** these **optional** options (**You Can Use All**):
  - Set searching paths: (Can use both)
    - Recursively(`-r`) search one or more files or directories, like: **-r** **-p** `file1,folder2,file2,folder3,folderN`
    - Read paths (path list) from files, like: **-w** `path-list-1.txt,path-list-2.txt`
  - Set max search depth (begin from input folder), like: **-k** `16` (default max search depth = `33`).
  - Filter text by `line-matching` (default) or `whole-file-text-matching` (add **-S** / **--single-line** Regex mode):
    - Ignore case:
      - Add **-i** (`--ignore-case`)
    - Regex patterns:
      - **-t** `should-match-Regex-pattern`
      - **--nt** `should-not-match-Regex-pattern`
    - Plain text:
      - **-x** `should-contain-plain-text`
      - **--nx** `should-not-contain-plain-text`
  - Filter `file name`: **-f** `should-match-Regex` , **--nf** `should-not-match`
  - Filter `directory name`: **-d** `at-least-one-match` , **--nd** `none-should-match`
  - Filter `full path pattern`: **--pp** `should-match` , **--np** `should-not-match`
  - Skip/Exclude link files: **--xf**
  - Skip/Exclude link folders: **--xd**
  - Skip full or sub paths: **--xp** `d:\win\dir,my\sub,\bin\`
    - Newer msr supports forwarding slash(`/`) on Windows to ease slash-escaping: 
      - **--xp** `d:/win/dir,my/sub,/bin/` same as `d:\win\dir,my\sub,\bin\` 
        - (You can omit double quotes since no spaces and special characters).
      - **--np** `"d:/win/dir|my/sub|/bin/"` same as `"d:\\win\\dir|my\\sub|\\bin\\\\"` 
        - (Need more slashes if end with a slash + double quote).
      - **--pp** `"/src/|/common"` same as `"\\src\\|\\common"`.
    - Check if your msr support forwarding slash(`/`) by command:
      - `msr -h | msr -x "Support '/'"`
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
  - Use `vscode` to open [this project](https://github.com/qualiu/vscode-msr) start (press `F5`) to debug, if you've cloned it.
  - Set/Check `msr.debug` to enable output debugging info, if you just installed this extension.
- See the docs [here](#brief-usage-summary-for-search-or-configuration) or on [msr](https://github.com/qualiu/msr/blob/master/README.md).

### Check and Update this doc

Easy to check consistency of [configurations](https://github.com/qualiu/vscode-msr/blob/master/package.json) with `this document` by command lines below (you can also run command `npm run test` if you're a developer):

**[nin](https://github.com/qualiu/msr#liberate--digitize-daily-works-by-2-exe-file-processing-data-mining-map-reduce)** `README.md` [package.json](https://github.com/qualiu/vscode-msr/blob/master/package.json) **"(msr\\.[\w\\.]+)"** --nt `"msr\.(exe|gcc\w+|cygwin)|project\d+|\.(My|xxx|extra\w+Group)|msr.py.extra"` --nx "fileExtensionMap*" -i -c Should no result

**[nin](https://github.com/qualiu/msr#liberate--digitize-daily-works-by-2-exe-file-processing-data-mining-map-reduce)** `README.md` [package.json](https://github.com/qualiu/vscode-msr/blob/master/package.json) **"(msr\\.[\w\\.]+)"** --nt `"msr\.(exe|gcc\w+|cygwin)|project\d+|\.(My|xxx|extra\w+Group)|msr.py.extra"` --nx "fileExtensionMap*" -i **-m** -c Should have results

**[nin](https://github.com/qualiu/msr#liberate--digitize-daily-works-by-2-exe-file-processing-data-mining-map-reduce)** [package.json](https://github.com/qualiu/vscode-msr/blob/master/package.json) nul -p -d -k 2 -x description -c Should no unreasonable duplicate descriptions.

## Known Issues

### Performance Depends on System Hardware Conditions

For example, it may slower than usual if the disk (where code files stored) is busy, or slower than expected if the hardware is too old, or CPU is too busy.

### Workaround to Long Existing VsCode Bug Impact to Finding Definition and Reference

Long existing [VsCode Bug](https://github.com/microsoft/vscode/issues/96754): `Unable to jump to definitions sometimes` + `Duplicate definition + reference results`.

It's better to be solved by `vscode` itself to remove final duplicate results, or provide an interface for extensions to do it.

However, there're 1 workaround for duplicate results + 2 workarounds for finding definition as below:

#### Workaround for VsCode Duplicate Results Bug

- [Temporarily toggle](#get-the-best-combined-power) `"enable/disable"` this extension, or disable one extension.

#### Workaround for VsCode Finding Definition Bug

- **Method-1**: Set **msr.quiet** = **false**: Un-check it from [user settings](https://code.visualstudio.com/docs/getstarted/settings#_settings-editor), which is opposite to [Set Quiet Mode](#more-settings-like-quiet-mode).
  - This let you see **`sorted results after ranking`** and able to **click and go to the locations**.
  - But this may **annoy you** to activate and show 2 channels each time `"Go To Definition"`:
    - It'll show search command + results in the `MSR-Def-Ref` channel in `OUTPUT` tab each time.
    - And re-run search in `MSR-RUN-CMD` in `TERMINAL` tab if `got multiple results` or `no results found`.
  - The best scenario of this method is probably when you're **`"just reviewing or reading code"`**.
- **Method-2**: Set **msr.reRunSearchInTerminalIfResultsMoreThan** = **0** (default =1).
  - This is more **quiet**: It won't activate the channels and tabs above.
  - This just re-run the search command in `MSR-RUN-CMD` channel in `TERMINAL` tab to let you **click and go**.
  - You can also re-use the commands, add [**some options**](#brief-usage-summary-for-search-or-configuration) to **filter your search** or **replace files**.
  - But you can **only see them when** when `MSR-RUN-CMD` is the active window(terminal).

### One Redundant Finding Definition was Triggered if Used `Ctrl` + `Mouse left click`

Due to both "**Peek Definition**" and "**Go to Definition**" were triggered:

- **Peek Definition** was triggered by `Ctrl` + `Mouse hover`.
- **Go to Definition** was triggered by `Ctrl` + `Mouse left click`.

You can use `Ctrl + Mouse hover` to `peek definition`, use `F12` to `go to definition` as a workaround.

### Current Support to Finding Definition and References

- **Near-precise** support: Will show **multiple results** for **same name** `classes/methods/etc`, due to this is a light tool without syntax parsing and cache.
- **Near-precise** support `class`, `methods`, `enum`, `field`, `property` for **C#**, **Python**, **Java**, **Scala**, **C++** / **C**.
- **Rough** support `class` and `method` for all type of languages (you can copy/write configurations follow existing languages).

  Welcome + Please help to improve searching definitions and references for `classes` and `methods`, and add supports for `enum` , `property`, `field` etc.

  See [easy to support new languages](#easy-to-support-new-languages) + [add new support or improve](#add-new-support-or-improve).

## Release Notes

See [CHANGELOG](https://github.com/qualiu/vscode-msr/blob/master/CHANGELOG.md) or `vscode-msr` extension [commit history](https://github.com/qualiu/vscode-msr/commits/master).

---

**Enjoy!**
