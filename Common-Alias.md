# Built-in Common Aliases

This document describes the built-in common aliases provided by the vscode-msr extension. 
These aliases are available for both Windows CMD and Linux/Bash terminals.

## Source Files

Built-in aliases are defined in two TypeScript files:

| File                                                 | Description                                                                                                                                         |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`src/commonAlias.ts`](src/commonAlias.ts)           | Common aliases for git operations, file operations, environment management, etc. Contains `CommonAliasMap`, `WindowsAliasMap`, and `LinuxAliasMap`. |
| [`src/cookCommandAlias.ts`](src/cookCommandAlias.ts) | Dynamic search aliases (`find-xxx`, `gfind-xxx`, `sort-xxx`) and alias management commands (`alias`, `malias`, `use-this-alias`, etc.).             |

## Customization

You can override any built-in alias by creating a custom alias with the same name in your `settings.json`. 
- See [Create-Custom-Common-Alias-Once-and-for-All.md](Create-Custom-Common-Alias-Once-and-for-All.md) for detailed instructions.
- For more practical usage examples of common aliases, see:
  - [msrTools README](https://github.com/qualiu/msrTools/blob/master/README.md)
  - [VS Code / ConEmu Integration](https://github.com/qualiu/msrTools/blob/master/code/vs-conemu/README.md)

---

## Alias Management

**Tips:**
- Use `rm-alias` to remove obsolete or conflicting aliases (e.g., [custom aliases](Create-Custom-Common-Alias-Once-and-for-All.md) in [settings.json](https://marketplace.visualstudio.com/items?itemName=qualiu.vscode-msr#custom-alias-to-auto-sync-across-local-and-remote-ssh-hosts-plus-docker-containers) overriding built-in aliases).
  - Example: `rm-alias gdm,gdm-l,gdm-ml,gda,gda-l,gda-ml`
- View alias conflicts in VSCode's **OUTPUT** panel → **"MSR-Def-Ref"** channel when a project is opened.

| Alias               | Usage                                                                    | Examples                                                      |
| ------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `to-alias-body`     | Convert clipboard content to JSON alias body for settings.json           | `to-alias-body` \| `to-alias-body 1`                          |
| `find-alias`        | Find alias by name or prefix                                             | `find-alias gdm` \| `find-alias gdm 1` \| `find-alias gdm-ml` |
| `rm-alias`          | Remove alias(es) from doskeys/bashrc + script file + settings.json       | `rm-alias my-alias` \| `rm-alias a1,a2,a3`                    |
| `update-alias`      | Reload all aliases with project-specific including related env variables | `update-alias`                                                |
| `use-this-alias`    | Load project-specific alias from current folder                          | `use-this-alias`                                              |
| `del-this-tmp-list` | Delete temp file list used by gfind-xxx                                  | `del-this-tmp-list`                                           |
| `list-alias`        | List all project alias files                                             | `list-alias`                                                  |
| `open-alias`        | Open alias file in editor                                                | `open-alias`                                                  |
| `open-this-alias`   | Open project-specific alias file                                         | `open-this-alias`                                             |
| `use-alias`         | Load specified alias file                                                | `use-alias /tmp/myproject.alias`                              |
| `alias`             | Show doskey macros (Windows CMD only) (Use `find-alias` instead)         | `alias` \| `alias find-`                                      |
| `malias`            | Show alias with regex filtering (Use `find-alias` instead)               | `malias find-` \| `malias "gfind.*ref"`                       |

## Git Branch Operations

| Alias  | Usage                                                                 | Examples                                      |
| ------ | --------------------------------------------------------------------- | --------------------------------------------- |
| `gpc`  | Pull current branch from origin                                       | `gpc` \| `gpc --rebase` \| `gpc --no-edit`    |
| `gpm`  | Pull main/master branch from origin (auto-detect)                     | `gpm` \| `gpm --rebase` \| `gpm --no-edit`    |
| `gph`  | Push current branch to origin                                         | `gph` \| `gph -f` \| `gph --delete`           |
| `gfc`  | Fetch current branch from origin                                      | `gfc`                                         |
| `gsh`  | Hard reset current branch to origin                                   | `gsh`                                         |
| `gst`  | Show git status                                                       | `gst` \| `gst -s`                             |
| `gca`  | Amend last commit without editing message                             | `gca` \| `gca -m "New message"`               |
| `gdc`  | Diff tool for current branch vs origin                                | `gdc` \| `gdc -- path/to/file`                |
| `gdc-l` | List changed files between current branch and origin                 | `gdc-l` \| `gdc-l -- path/`                   |
| `gdf`  | Diff tool for specific commit or branch                               | `gdf HEAD~1` \| `gdf {branch-name-or-commit}` |
| `glc`  | Show brief logs + changed files compared with origin/{current} branch | `glc` \| `glc -n 3`                           |
| `glcc` | Show brief logs + changed files in commits of local {current} branch  | `glcc` \| `glcc -n 3`                         |

## Git Diff with Main/Master Branch

Compare your current branch with the `origin/main` or `origin/master` branch using difftool or list changed files.

| Alias    | Usage                                                       | Examples                                          |
| -------- | ----------------------------------------------------------- | ------------------------------------------------- |
| `gdm`    | Open difftool to compare with origin `main/master`      | `gdm` \| `gdm src/` \| `gdm -- src/`              |
| `gdm-m`  | Open difftool for modified files only                   | `gdm-m` \| `gdm-m src/` \| `gdm-m -- src/`        |
| `gdm-l`  | List all changed file names                             | `gdm-l` \| `gdm-l *.ts` \| `gdm-l -- *.ts`        |
| `gdm-al` | List added files only                                   | `gdm-al` \| `gdm-al src/` \| `gdm-al -- src/`     |
| `gdm-ml` | List modified files only                                | `gdm-ml` \| `gdm-ml *.md` \| `gdm-ml -- *.md`     |
| `gdm-dl` | List deleted files only                                 | `gdm-dl` \| `gdm-dl tests/` \| `gdm-dl -- tests/` |
| `gdm-nt` | Show diff content excluding test files                  | `gdm-nt` \| `gdm-nt src/` \| `gdm-nt -- src/`     |

## Git Submodule Operations

| Alias                  | Usage                                             | Examples                                                     |
| ---------------------- | ------------------------------------------------- | ------------------------------------------------------------ |
| `gpc-sm`               | Pull current branch then sync + update submodules | `gpc-sm`                                                     |
| `gpc-sm-reset`         | Pull and force reset submodules                   | `gpc-sm-reset`                                               |
| `gsh-sm`               | Hard reset branch and force update submodules     | `gsh-sm`                                                     |
| `git-sm-init`          | Sync and initialize submodules                    | `git-sm-init` \| `git-sm-init --recursive`                   |
| `git-sm-reset`         | Sync, init and force update submodules            | `git-sm-reset`                                               |
| `git-sm-restore`       | Restore submodules recursively                    | `git-sm-restore`                                             |
| `git-sm-reinit`        | Deinit and reinitialize submodules                | `git-sm-reinit`                                              |
| `git-sm-update-remote` | Update submodules from remote                     | `git-sm-update-remote` \| `git-sm-update-remote --recursive` |
| `git-sm-prune`         | Prune git and submodules                          | `git-sm-prune`                                               |
| `git-sm-check`         | Check submodule status and changes                | `git-sm-check`                                               |
| `git-sm-delete`        | Clean untracked files in submodules               | `git-sm-delete`                                              |

## Git Repository Utilities

| Alias                                    | Usage                                               | Examples                                                        |
| ---------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------- |
| `git-gc`                                 | Aggressive garbage collection                       | `git-gc`                                                        |
| `git-rb-list`                            | List all remote branches                            | `git-rb-list`                                                   |
| `git-shallow-clone`                      | Clone repository with depth 1                       | `git-shallow-clone https://github.com/user/repo.git`            |
| `git-clean`                              | Clean all untracked files recursively               | `git-clean`                                                     |
| `git-add-safe-dir`                       | Add current repo to git safe directories            | `git-add-safe-dir`                                              |
| `git-cherry-pick-branch-new-old-commits` | Cherry-pick commits from branch between two commits | `git-cherry-pick-branch-new-old-commits {branch} abc123 def456` |

## Git Log Search

| Alias               | Usage                                      | Examples                                                                 |
| ------------------- | ------------------------------------------ | ------------------------------------------------------------------------ |
| `git-find-commit`   | Find commits by message (last 36 months)   | `git-find-commit "fix bug"` \| `git-find-commit "JIRA-123"`              |
| `git-find-content`  | Find commits that changed specific content | `git-find-content "function_name"` \| `git-find-content "TODO"`          |
| `git-find-log`      | Search in git log output                   | `git-find-log "refactor.*?module"`                                       |
| `git-find-creation` | Find when a file was created               | `git-find-creation path/to/file.ts` \| `git-find-creation "*.md"`        |
| `git-find-deletion` | Find when a file was deleted               | `git-find-deletion path/to/file.ts` \| `git-find-deletion old-module.js` |
| `git-find-update`   | Find when a file was modified              | `git-find-update path/to/file.ts` \| `git-find-update README.md`         |

## File Operations

| Alias | Usage                                                   | Examples                                |
| ----- | ------------------------------------------------------- | --------------------------------------- |
| `sfs` | Sort files by size (list with size and time)            | `sfs .` \| `sfs src/ -r`                |
| `sft` | Sort files by time (list with time and size)            | `sft .` \| `sft logs/ -r`               |
| `sfw` | Print full path with Windows backslashes (Windows-Only) | `sfw C:/tools` \| `sfw . -f "\.exe$"` -r |
| `sfu` | Print paths with Unix forward slashes (Windows-Only)    | `sfu C:\tools -W -f exe --sp .exe` -r -k 3 |

## Output Path Format

| Alias    | Usage                                 | Examples |
| -------- | ------------------------------------- | -------- |
| `out-fp` | Output full file paths                | `out-fp` |
| `out-rp` | Output relative file paths            | `out-rp` |
| `out-wp` | Output Windows-style backslash paths  | `out-wp` |
| `out-up` | Output Unix-style forward slash paths | `out-up` |

## MSR Environment

| Alias           | Usage                                 | Examples        |
| --------------- | ------------------------------------- | --------------- |
| `clear-msr-env` | Clear all MSR_* environment variables | `clear-msr-env` |

---

## Windows-Only Aliases

### Environment Variable Management

| Alias             | Usage                                              | Examples                                                                     |
| ----------------- | -------------------------------------------------- | ---------------------------------------------------------------------------- |
| `reload-env`      | Reload all environment variables from system       | `reload-env`                                                                 |
| `reset-env`       | Reset environment to system defaults               | `reset-env`                                                                  |
| `reload-path`     | Reload PATH environment variable                   | `reload-path`                                                                |
| `add-user-path`   | Add path to user PATH (auto-removes duplicates)    | `add-user-path C:\tools` \| `add-user-path C:\tools yes`                     |
| `add-sys-path`    | Add path to system PATH (auto-removes duplicates)  | `add-sys-path C:\tools` \| `add-sys-path C:\tools yes`                       |
| `add-tmp-path`    | Add path to session PATH (auto-removes duplicates) | `add-tmp-path C:\tools` \| `add-tmp-path "C:\Program Files" 1`               |
| `del-user-path`   | Remove path from user PATH variable                | `del-user-path C:\old-tools`                                                 |
| `del-sys-path`    | Remove path from system PATH variable              | `del-sys-path C:\old-tools`                                                  |
| `del-tmp-path`    | Remove path from current session PATH              | `del-tmp-path C:\temp-tools`                                                 |
| `check-user-env`  | Filter user env vars by name/value regex           | `check-user-env` \| `check-user-env "^path"` \| `check-user-env . java`      |
| `check-sys-env`   | Filter system env vars by name/value regex         | `check-sys-env` \| `check-sys-env "^win"` \| `check-sys-env . sdk`           |
| `check-tmp-env`   | Filter session env vars by name/value regex        | `check-tmp-env` \| `check-tmp-env "^dot"` \| `check-tmp-env . python`        |
| `check-user-path` | Show/check user PATH (duplicates in Yellow/Orange) | `check-user-path` \| `check-user-path yes` \| `check-user-path C:\tools`     |
| `check-sys-path`  | Show/check system PATH (non-exist in Red)          | `check-sys-path` \| `check-sys-path 1` \| `check-sys-path C:\Windows`        |
| `check-tmp-path`  | Show/check session PATH (no-permission in Magenta) | `check-tmp-path` \| `check-tmp-path yes` \| `check-tmp-path C:\Python`       |

### Docker Operations

| Alias              | Usage                                        | Examples                                                               |
| ------------------ | -------------------------------------------- | ---------------------------------------------------------------------- |
| `docker-ls`        | List containers with status highlighting     | `docker-ls` \| `docker-ls -a`                                          |
| `docker-ls-image`  | List images with digests                     | `docker-ls-image`                                                      |
| `docker-login`     | Start and login to container by name pattern | `docker-login ubuntu` \| `docker-login node`                           |
| `docker-login-cid` | Login to container by ID                     | `docker-login-cid abc123`                                              |
| `docker-start`     | Start container by name pattern              | `docker-start ubuntu` \| `docker-start mysql`                          |
| `docker-stop`      | Stop container by name pattern               | `docker-stop ubuntu` \| `docker-stop redis`                            |
| `docker-stop-all`  | Stop all running containers                  | `docker-stop-all`                                                      |
| `docker-rm-cid`    | Remove container by ID                       | `docker-rm-cid abc123` \| `docker-rm-cid abc123 -f`                    |
| `docker-rm-image`  | Remove image by ID                           | `docker-rm-image abc123` \| `docker-rm-image abc123 -f`                |
| `docker-send`      | Copy file to container                       | `docker-send ubuntu file.txt /tmp/`                                    |

### Windows Utilities

| Alias         | Usage                                         | Examples                                    |
| ------------- | --------------------------------------------- | ------------------------------------------- |
| `grant-perm`  | Grant full permission to current user         | `grant-perm C:\folder`                      |
| `open-vsc`    | Open VSCode settings.json                     | `open-vsc`                                  |
| `decode64`    | Decode base64 string                          | `decode64 SGVsbG8gV29ybGQ=`                 |
| `is-admin`    | Check if running as administrator             | `is-admin`                                  |
| `trust-exe`   | Add executables to Windows Defender exclusion | `trust-exe msr,nin` \| `trust-exe git,node` |
| `restart-net` | Restart network adapters                      | `restart-net`                               |
| `pwsh`        | Run PowerShell (when pwsh.exe not installed)  | `pwsh Get-Process` \| `pwsh -Command "dir"` |

### Clipboard Operations

| Alias    | Usage                                | Examples                                         |
| -------- | ------------------------------------ | ------------------------------------------------ |
| `wcopy`  | Copy files to clipboard              | `wcopy file1.txt` \| `wcopy file1.txt,file2.txt` |
| `wpaste` | Paste files from clipboard to folder | `wpaste C:\destination`                          |

### Path Conversion

| Alias          | Usage                                  | Examples                                                        |
| -------------- | -------------------------------------- | --------------------------------|
| `to-full-path` | Convert to full absolute path          | `to-full-path src/`             |
| `to-unix-path` | Convert backslashes to forward slashes | `to-unix-path C:\path\to\file`  |
| `to-2s-path`   | Convert single backslash to double     | `to-2s-path C:\path\to\file`    |

### Time Conversion

| Alias           | Usage                              | Examples                                                                          |
| --------------- | ---------------------------------- | --------------------------------------------------------------------------------- |
| `to-local-time` | Convert UTC/ISO time to local time | `to-local-time 2024-01-15T10:30:00Z` \| `to-local-time 2024-06-20T15:45:00+00:00` |
| `to-utc-time`   | Convert local time to UTC          | `to-utc-time "2024-01-15 18:30:00 +0800"`  |
| `ts-to-minutes` | Convert time span to minutes       | `ts-to-minutes 01:30:00` |

### JSON Utilities

| Alias                           | Usage                                       | Examples                                                                           |
| ------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------- |
| `to-one-json-line`              | Convert clipboard JSON to single line       | `to-one-json-line`                                                                 |
| `to-one-json-line-from-file`    | Convert file JSON to single line            | `to-one-json-line-from-file config.json`                                           |
| `to-vscode-arg-lines`           | Convert clipboard to VSCode argument format | `to-vscode-arg-lines`                                                              |
| `to-vscode-arg-lines-2-slashes` | Same with double backslashes                | `to-vscode-arg-lines-2-slashes`                                                    |

### Azure Utilities

| Alias           | Usage                                          | Examples        |
| --------------- | ---------------------------------------------- | --------------- |
| `az-token-clip` | Copy Azure access token to clipboard           | `az-token-clip` |
| `az-token-env`  | Set Azure access token to environment variable | `az-token-env`  |

---

## Linux-Only Aliases

| Alias        | Usage                            | Examples                                                   |
| ------------ | -------------------------------- | ---------------------------------------------------------- |
| `vim-to-row` | Open file at specific row in vim | `vim-to-row "file.ts:42"` \| `vim-to-row "src/app.js:100"` |