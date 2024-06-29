# Create Custom Alias Once and for All for Current and Future vscode

Custom common alias([example](#example-of-custom-common-alias-and-transformation) and [difference](#difference-between-custom-alias-and-normal-alias)) to auto sync across **local** and **remote** SSH hosts plus **docker** containers like:

- Local = Windows or Linux/MacOS/FreeBSD:
  - Remote = Linux/MacOS/FreeBSD via SSH connection.
  - Remote = Docker Containers in Linux/MacOS/FreeBSD.

## How to Create Custom Alias

### Step-1 Open User Settings

- First time:
  - Open [user settings](./README.md#extension-settings-if-you-want-to-change) (hotkey = `F1` or `"Ctrl + Shift + P"`).
  - Choose `"Open User Settings"` to open vscode settings.
  - Choose common alias type:
    - `msr`.**commonAliasNameBodyList** for **all platforms** (Windows + MinGW/Cygwin + Linux/MacOS/FreeBSD).
    - `msr`.**cmd**.`commonAliasNameBodyList` for Windows only.
    - `msr`.**bash**.`commonAliasNameBodyList` for MinGW/Cygwin + Linux/MacOS/FreeBSD.
  - Click `"Edit in settings.json"`.
- After first time:
  - Choose `"Open User Settings (JSON)"` to directly open `settings.json` to add `aliasName` + `aliasBody`.

### Step-2 Add or Update Custom Common Alias with Tool to-alias-body

#### Required and Optional Fields

- `aliasName` is required: the name of the alias/doskey, see example below.
  - Recommend using **long** `aliasName` on Linux/MacOS/FreeBSD since it's easy to auto complete by `Tab` key.
- `aliasBody` is required: the command lines of batch or bash script.
  - Should not use single quote(`'`) in `aliasBody` for Linux to avoid breaking `alias function`.
- `description` is optional: you can write any words for the alias.

#### Use to-alias-body to Transform Multi-line Alias Body to One-line JSON

- Write script body (maybe multi-lines) in a temp file, or edit in alias file (e.g. `~/msr-cmd-alias.bashrc`).
- Copy the pure content body to clipboard.
- Run **to-alias-body** to read clipboard and transform to **one-line** `aliasBody` **JSON** for `settings.json`.
  - Linux/MacOS/FreeBSD: install PowerShell if not exists (like `sudo apt install -y powershell`).
- Paste the JSON body to `aliasBody` in `settings.json`.

## Example + Explanations 
#### Example of Custom Common Alias and Transformation

vscode-msr will auto transform(create) normal alias/doskey based on `aliasName` + `aliasBody`.

- Auto convert `aliasBody` for `Tab`/`spaces`(see [below](#related-config-items)) + `return`/`exit`(Linux alias functions + [script files](./README.md#make-command-shortcuts-to-search-or-replace-in-or-out-of-vscode)).
  - When editing/updating `aliasBody`: Free to copy from either alias function body or script file (then use `to-alias-body`).
- Immediately effective for all `MSR-RUN-CMD` + new terminals in all opened vscode (Windows + remote SSH/docker).
- Immediately effective for new system terminals(Bash/CMD/etc.) on Windows + Linux/MacOS/FreeBSD of opened vscode.
- For old/opened terminals(system or vscode), run `use-this-alias` or `update-alias` to effect immediately.

```json
"msr.commonAliasNameBodyList": [
    {
        "aliasName": "gsf",
        "aliasBody": "git --no-pager diff --name-only $1~1 $1",
        "description": "Show file list of a git commit(change). The arg is the commit id. Example: gsf HEAD or gsf {commit-hash-id}."
    }
]
```

vscode-msr will transform it to alias/doskey on Windows + Linux/MacOS/FreeBSD like below:

- Linux/MacOS/FreeBSD: Stored in alias file - default = `~/msr-cmd-alias.bashrc` with below content:

```bash
alias gsf='function _gsf() {
    git --no-pager diff --name-only $1~1 $1
}; _gsf'
```

- Windows: Stored in alias file - default = `%USERPROFILE%\msr-cmd-alias.doskeys` with below content:

```batch
gsf=git --no-pager diff --name-only $1~1 $1
```

#### Related Config Items

- `msr.replaceMultiLineAliasBodyTabTo`:
  - Replace `Tab`(`\t`) to `4 spaces` or `2 spaces` for multi-line alias body in `settings.json`.
  - Default = `4 spaces`.
- `msr.replaceHeadSpacesToTabForToAliasBody`
  - Replace `4 spaces` or `2 spaces` back to `Tab`(`\t`) when calling **to-alias-body**.
    - Not only reduce `aliasBody` size in `settings.json` but also make Tab-conversion **reversible**.
  - Default = `true`.

## Difference between Custom Alias and Normal Alias

- Synchronization:
  - Normal alias are **only** for **current** vscode on Windows or Linux/MacOS/FreeBSD.
  - Custom common alias are **auto synced** across all vscode on Windows + Linux/MacOS/FreeBSD.
    - Creating `aliasName` + `aliasBody` is an **once-for-all** effort for current + **future** vscode/system-console.
- Storage location:
  - Custom common alias stored in `settings.json`.
  - Normal alias stored in [alias files](./README.md#make-command-shortcuts-to-search-or-replace-in-or-out-of-vscode):
    - Windows: `%USERPROFILE%\msr-cmd-alias.doskeys`.
    - Linux/MacOS/FreeBSD: `~/msr-cmd-alias.bashrc` plus `~/.bashrc`.
- Readability:
  - Normal alias are readable and easy to edit.
  - Custom common alias `aliasBody` which is **one-line** JSON need escape some chars (use **to-alias-body** to help transform).
