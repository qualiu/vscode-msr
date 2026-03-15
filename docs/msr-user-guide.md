# msr User Guide

A comprehensive guide for **humans** to learn and use msr - the powerful cross-platform text search and replace tool.

## Introduction

**msr** (Match/Search/Replace) is a command-line tool that helps you:
- Search text in files using regex or plain text
- Replace text with preview before making changes
- Filter files by name, path, size, and modification time
- Execute transformed output lines as commands
- Process pipe input for text transformation

### Performance

msr is highly optimized for speed:
- **2X~15X+** faster than `findstr` on Windows ([benchmark](https://github.com/qualiu/msr/blob/gh-pages/perf/summary-full-Windows-comparison-2019-08-11.md))
- **3X~10X+** faster than `grep` on macOS ([benchmark](https://github.com/qualiu/msr/blob/master/perf/summary-full-Darwin-Arm64-comparison-2021-11-20.md))
- **1.5~3X+** vs `grep` on Linux ([benchmark](https://github.com/qualiu/msr/blob/gh-pages/perf/summary-part-CentOS-comparison-2019-08-11.md))

### Supported Platforms

Runs on **Windows**, **Linux**, **macOS**, and **FreeBSD** (multiple architectures including x86_64, Arm64). For the complete platform/architecture/version matrix, see [Download Links](download-links.md).

### Installation

The easiest way is to install the [vscode-msr](https://marketplace.visualstudio.com/items?itemName=qualiu.vscode-msr) extension which auto-downloads both msr and nin automatically.

For manual download on any platform (Windows, Linux, macOS, FreeBSD, Cygwin), see:
**→ [Download Links by Platform](download-links.md)**

## Quick Start

### Basic Search

```bash
# Search for "TODO" in all code files recursively
msr -rp . -f "\.(cs|py|js)$" -x "TODO" -c

# Search with regex pattern, ignore case
msr -rp . -f "\.log$" -it "error|warning|exception"

# Get pure output without path prefix (like grep); keeps summary on stderr
msr -rp . -f "\.txt$" -x "keyword" -PIC
```

### Basic Replace

```bash
# Preview all matches (without -R): shows ALL matched lines with replacement result
msr -rp . -f "\.cs$" -t "oldName" -o "newName"

# Preview changes only (-j): shows ONLY lines that would actually change
msr -rp . -f "\.cs$" -t "oldName" -o "newName" -j

# Full output with replacements (-a): ALL lines output (matched lines transformed, others as-is)
# Like sed 's/old/new/' — useful for piping or redirecting to produce complete transformed content
msr -rp . -f "\.cs$" -t "oldName" -o "newName" -a

# Actually replace files (with -R) and backup (with -K)
msr -rp . -f "\.cs$" -t "oldName" -o "newName" -RK
```

## Key Options Explained

### Output Control

| Option | Meaning | When to Use |
|--------|---------|-------------|
| `-P` | No path/line prefix | Get clean output |
| `-A` | No any info | Suppress all messages |
| `-C` | No color | For piping to other tools |
| `-I` | No extra info, warnings to stderr | Hide BOM warnings |
| `-M` | No summary | Hide final summary |
| `-PIC` | No path, no extra, no color | **Recommended for scripts** (keeps summary on stderr) |
| `-c` | Show command | Debug your command line |
| `-W` | Output full paths | Get absolute paths |
| `--keep-color` | Keep color in pipes | Colored pipe output on Windows |
| `--unix-slash 1` | Output `/` on Windows | Cross-platform paths |

### File Filtering

| Option | Meaning | Example |
|--------|---------|---------|
| `-f` | Match filename | `-f "\.cs$"` |
| `--nf` | Exclude filename | `--nf "test"` |
| `-d` | Must have dir | `-d "src"` |
| `--nd` | Exclude dir | `--nd "bin\|obj"` |
| `--pp` | Match full path | `--pp "src.*test"` |
| `--np` | Exclude full path | `--np "backup"` |
| `--xp` | Exclude if path has **any** text (OR) | `--xp "test/,mock/"` |
| `--sp` | Path must have **all** texts (AND) | `--sp "src/,lib/"` |
| `--xf` | Skip link files | `--xf` |
| `--xd` | Skip link dirs | `--xd` |
| `-G` | Read link files | `-G` (links under input paths) |

> **Note**:
> - `--sp`/`--xp` texts can include path separators (`/` or `\`).
> - For Windows path separator compatibility (`-p` and `-w`), see [msr and nin Shared Reference — Path Separator Compatibility on Windows](msr-nin-shared-reference.md#path-separator-compatibility-on-windows).

### Output Options (Advanced)

| Option | Meaning | Example |
|--------|---------|---------|
| `--to-stderr` | Output results to stderr | Pipeline result separation |
| `--keep-color` | Keep ANSI colors in pipe | Colored output to file |
| `--timeout` | Set execution timeout | `--timeout 30` (seconds) |
| `--out-index` | Output line index | For precise location |
| `--no-check` | Skip input path validation | `-w file-list --no-check` |

### Text Matching

| Option | Meaning | Example |
|--------|---------|---------|
| `-t` | Regex match (line filter + replace source) | `-t "^\s*public"` |
| `-x` | Plain text match (line filter + replace source) | `-x "TODO"` |
| `-i` | Ignore case | `-it "error"` |
| `--nt` | Exclude by regex | `--nt "^//"` |
| `--nx` | Exclude by text | `--nx "DEBUG"` |
| `-e` | Extra color highlight only — never filters lines | `-e "\d+"` |
| `-o` | Replace matched text | `-t "(old)" -o "new-\1"` |

**`-t` / `-x` / `-e` / `-o` relationship (validated by test, same for `-p`/`-w`/`-z` inputs):**

- `-t` and `-x` are both **AND line filters** — a line must satisfy both to be output.
- `-e` is **color-only**: all lines pass through regardless of `-e`; it colors text not already colored by `-t`/`-x`/`-o`.
- When `-o` is used with both `-t` and `-x`, the one **closer to `-o`** on the command line is the **replace source**; the other remains a pure line filter. Equal distance → left (earlier) one wins.
- `-e` has **zero influence** on `-o` replacement output.

```bash
# -x closer to -o → -x is replace source; -t becomes filter condition
msr -p file.txt -t "(foo)" -x "world" -o "[R:\1]" -PIC
# Only lines with both "foo" AND "world"; "world" replaced (\1 empty — -x has no capture groups)

# -t closer to -o → -t is replace source; -x becomes filter condition
msr -p file.txt -x "foo" -t "(world)" -o "[R:\1]" -PIC
# Only lines with both "foo" AND "world"; "world" → [R:world] (\1 = "world" from -t capture group)

# Equal distance (-t -o -x) → left one (-t) wins
msr -p file.txt -t "(world)" -o "[R:\1]" -x "foo" -PIC

# -e never affects replacement
msr -p file.txt -t "(world)" -o "[R:\1]" -e "\d+" -PIC
# Numbers highlighted by -e in color; "world" still replaced by -o
```

> ⚠️ **Prefer `\1`/`\2`** (backslash) for capture groups in `-o` — `\1` works safely in **all** shells (CMD, PowerShell, bash, Doskey), while `$1`/`$2` may be expanded as shell variables in PowerShell, bash, and Doskey macros.

### Capture Group Reference

msr supports three syntaxes for capture group references in `-o` replacement:

| Syntax         | Example         | Notes                                         |
| -------------- | --------------- | --------------------------------------------- |
| `\1`, `\2`     | `-o "new-\1"`   | ✅ **Recommended** — works in all environments |
| `$1`, `$2`     | `-o "new-$1"`   | ⚠️ May conflict with shell variable expansion  |
| `${1}`, `${2}` | `-o "new-${1}"` | ⚠️ May conflict with shell variable expansion  |

**Cross-environment behavior:**

| Environment         | `$1` behavior                        | `\1` behavior |
| ------------------- | ------------------------------------ | ------------- |
| CMD (Windows)       | ✅ Works (not a variable)             | ✅ Works       |
| Doskey macro        | ❌ `$1` = first argument              | ✅ Works       |
| PowerShell          | ❌ `$1` = variable (expands to empty) | ✅ Works       |
| Bash                | ❌ `$1` = first argument              | ✅ Works       |
| Python `subprocess` | ✅ Works (no expansion)               | ✅ Works       |

**Critical: `-o` extraction with capture groups**

When using `-o '\1'` to extract captured content, you must match the **entire line** in your `-t` pattern to avoid trailing content being appended:

```bash
# ❌ WRONG: trailing content after capture group is preserved
msr -p file.txt -t "name:\s*(\w+)" -o "\1" -PIC
# Input:  "name: Alice age: 30"
# Output: "Alice age: 30"  ← trailing "age: 30" still there!

# ✅ CORRECT: match entire line with .*$
msr -p file.txt -t "name:\s*(\w+).*$" -o "\1" -PIC
# Input:  "name: Alice age: 30"
# Output: "Alice"  ← clean extraction
```

**Rule**: If you want `-o "\1"` to output ONLY the captured group, your `-t` regex must consume the entire line (typically ending with `.*$`).

## Common Use Cases

### 1. Finding Text in Files

```bash
# Find in specific directories
msr -rp src,lib,tests -f "\.py$" -t "def\s+test_\w+"

# Find with context (3 lines above and below)
msr -rp . -f "\.java$" -x "Exception" -U 3 -D 3

# Find and list file paths (with match count)
msr -rp . -f "\.config$" -x "password" -l
```

### 2. Filtering Files

```bash
# By file size (3MB to 10MB)
msr -rp . -f "\.log$" -l --sz --s1 3MB --s2 10MB

# By modification time (last 2 hours)
msr -rp . -f "\.log$" -l --wt --w1 2h

# By modification time (last 30 days)
msr -rp . -f "\.log$" -l --w1 30d

# Use file as time reference
msr -rp . -f "\.cs$" -l --w1 reference.txt

# Check if file modified within N minutes (cache expiration check)
# Note: --w1 requires a unit suffix (e.g. 30m = 30 minutes ago). Plain integers like 30 or 0 are NOT valid.
msr -l --w1 30m -p cache.json 2>nul

# Exclude directories
msr -rp . -f "\.cs$" -x "test" --nd "^(bin|obj|node_modules)$"

# Exclude link files and directories
msr -rp . -f "\.cs$" --xf --xd

# Skip specific paths (supports / on Windows)
msr -rp . -f "\.cs$" --xp "test/,mock/,/obj/"

# Include specific paths only
msr -rp . -f "\.cs$" --sp "src/,lib/"
```

**`--s1`/`--s2` file size format** (all validated by test):

| Format | Example | Notes |
|--------|---------|-------|
| Plain integer | `300` | Bytes (no unit = B) |
| With unit (no space) | `300B`, `1KB`, `1kb`, `1k`, `2.5MB`, `0.5kb` | Case-insensitive; B/KB/MB/GB/TB/PB/EB; decimals supported |

**`--w1`/`--w2` file time format** (all validated by test):

| Format | Example | Notes |
|--------|---------|-------|
| Partial date | `2026-02` | `YYYY-MM` → first of that month 00:00:00 |
| Date | `2026-02-26` | `YYYY-MM-DD` → 00:00:00 of that day |
| Date + hour | `"2026-02-26 11"` or `2026-02-26T11` | Space or T separator |
| Date + time | `"2026-02-26 11:30:00"` or `2026-02-26T11:30:00` | Full datetime |
| Time only | `"11:30:00"` | Today's date assumed |
| Relative (past) | `1d`, `-1d`, `2h`, `30m`, `10s` | `d`=days, `h`=hours, `m`=minutes, `s`=seconds; `-` prefix is equivalent |
| File path | `reference.txt` | Uses that file's mtime as reference point |
| `--w2` offset | `+1d`, `+2h` | Forward offset from `--w1` value |
| `--w2` now-relative | `now-1d` | N units before current time |

> ⚠️ **Invalid:** Plain integers without unit suffix (`--w1 0`, `--w1 30`, `--w1 1`) → exit=-1 error. Always use unit suffix: `30m`, `1h`, `1d`.

### 3. Text Transformation

```bash
# Split PATH into separate lines
msr -z "%PATH%;" -t "\\*?\s*;\s*" -o "\n" -aPIC

# Extract IP addresses from text
msr -p config.txt -t "(\d+\.\d+\.\d+\.\d+)" -o "\1" -PIC
```

### 4. Batch Operations

```bash
# Delete old log files (preview first!)
msr -rp /var/log -f "\.log$" --w2 30d -l -PIC | msr -t "(.+)" -o "rm \"\1\"" -PIC

# Execute the deletion
msr -rp /var/log -f "\.log$" --w2 30d -l -PIC | msr -t "(.+)" -o "rm \"\1\"" -X

# Execute and stop on first error
msr -rp . -f "\.sh$" -l -PIC | msr -t "(.+)" -o "bash \"\1\"" -X -V ne0

# Execute and only show failed commands
msr -rp . -f "\.sh$" -l -PIC | msr -t "(.+)" -o "bash \"\1\"" -X -O
```

### 5. Log Analysis with Sorting

```bash
# Sort log by time text (auto-fill missing time from previous lines)
msr -rp logs/ -f "\.log$" -F "\d{4}-\d{2}-\d{2}\D\d+:\d+:\d+[\.,]?\d*"

# Sort and get top error distribution with nin
msr -rp logs/ -F "\d{4}-\d{2}-\d{2}\D\d+:\d+:\d+" | nin nul "\.(\w+Exception)\b" -pd -H 20
```

### 6. File Type and Folder Distribution

```bash
# Get file extension distribution (top types)
msr -rp . -l -PIC --xd -k 18 | nin nul "\.(\w+)$" -p -d

# Get top-level folder distribution
msr -rp . -l -PIC --xd -k 18 | nin nul "^([^\\/]+)[\\/]" -p -d

# Useful aliases for quick analysis (from vscode-msr extension)
# find-top-type: file extension distribution
# find-top-folder: folder distribution
```

## Tips and Best Practices

### Flexible Parameter Order and Long/Short Names

msr and nin accept parameters in **any order** — there is no positional constraint. Compare with tools where argument position matters:

```bash
# git diff: --name-only must precede the branch ref, or the ref may be treated as a path
git diff --name-only master          # ✅ correct
git diff master --name-only          # ⚠️ may misinterpret "master" as a path

# tar: archive filename must immediately follow -f
tar -czf output.tar.gz dir/          # ✅ only this order works

# msr: parameters freely reorderable — all three forms are identical
msr -rp . -f "\.cs$" -t "todo" -IC
msr -t "todo" -f "\.cs$" -rp . -IC
msr -IC -t "todo" -rp . -f "\.cs$"
```

Parameters also support both **short names and long names** interchangeably. Use short names for interactive commands and long names for self-documenting scripts:

```bash
# Short names (concise, fast to type):
msr -rp . -it "error" -IC

# Long names (readable in scripts and documentation):
msr --recursive --path . --ignore-case --text-match "error" --no-extra --no-color

# Mixing short and long names freely:
msr -rp . --ignore-case -t "error" -IC

# Same for nin:
nin file.txt nul -u                  # short
nin file.txt nul --unique            # long (same effect)
```

This makes commands easier to read in shared scripts (`--ignore-case` is instantly clear), while interactive sessions stay concise (`-i`).

### Preview Before Replace
Always preview changes before using `-R`:
```bash
# Step 1a: Preview all matches (shows every matched line with replacement result)
msr -rp . -f "\.cs$" -t "old" -o "new"

# Step 1b: Preview changes only (shows ONLY lines that actually change)
msr -rp . -f "\.cs$" -t "old" -o "new" -j

# Step 1c: Full output with replacements (ALL lines: matched transformed + unmatched as-is)
# Like sed 's/old/new/' — useful for stream processing, piping, or redirecting
msr -rp . -f "\.cs$" -t "old" -o "new" -a

# Step 2: Replace with backup
msr -rp . -f "\.cs$" -t "old" -o "new" -RK
```

### Three Safety Guarantees for File Replacement

msr provides three important engineering safety features when writing files:

**1. Skip write if content unchanged**

If the replacement result is identical to the original content, msr **does not write the file** and does not update its `mtime`. This prevents unnecessary rebuilds in build systems and avoids creating false dirty states in version control.

```bash
# Only files with actual changes are written
msr -rp src/ -f "\.java$" -t "oldApi" -o "newApi" -R
# Files where replacement changed nothing: NOT written, mtime unchanged

# Practical impact:
# - make/cmake: only truly changed files trigger recompilation
# - CI/CD: file change detection stays accurate
# - git: no false "modified" entries in `git status`
# - rsync: unchanged files are not re-synced
```

**2. Line ending behavior: system native**

msr writes files using the **system's native line ending style** — CRLF (`\r\n`) on Windows and LF (`\n`) on Linux/macOS. It does NOT detect or preserve the original file's line ending convention.

```bash
# On Windows: LF files are converted to CRLF after replacement
msr -p unix-lf-file.txt -t "old" -o "new" -R
# Original LF (\n) → Output CRLF (\r\n)

# On Linux: CRLF files are converted to LF after replacement (same behavior as sed)
msr -p windows-crlf-file.txt -t "old" -o "new" -R
# Original CRLF (\r\n) → Output LF (\n)

# This is the same behavior as sed — both use system native line endings.
# Be cautious when editing cross-platform files with non-native line endings.
```

**3. Backup collision avoidance with `-K`**

When `-K` (backup before replace) is used and a backup file with the same timestamp already
exists (e.g., two replacements within the same second), msr automatically appends `--2`,
`--3`, etc. counter suffixes — **no data loss ever occurs**.

```bash
# Three rapid replacements within 1 second produce three distinct backups:
# file.txt--bak-2026-02-26__11_06_03       ← original (round 1)
# file.txt--bak-2026-02-26__11_06_03--2    ← after round 1 (round 2)
# file.txt--bak-2026-02-26__11_06_03--3    ← after round 2 (round 3)
```

> These three behaviors are automatic and require no extra flags. They make msr safe for cross-platform codebases and automated pipelines.

### Combine with Other Tools
```bash
# Find files, process with other tools
msr -rp . -f "\.json$" -l -PIC | xargs -I {} jq '.' {}

# Chain multiple msr commands
msr -p log.txt -t "ERROR.*" -PIC | msr -t "(\d{4}-\d{2}-\d{2})" -o "Date: \1"
```

## Advanced Features

### Block Matching (Multi-line)

Block matching uses `-b` (begin) and `-Q` (end) patterns to define multi-line blocks, then applies filters and replacements **within** those blocks.

**Core parameters (all validated by test):**

| Parameter | Description |
|-----------|-------------|
| `-b <regex>` | Block begin: start matching from this line (skip lines before it) |
| `-Q <regex>` | Block end: end block at this line (requires `-b`); use `""` as shorthand when same as `-b` |
| `-Q ""` | Shorthand for `-Q` same as `-b` — must add `-y` to correctly split consecutive blocks |
| `-y` | Reuse `-Q` matched line as the next block's `-b` begin — required when blocks are separated only by their begin pattern |
| `-q <regex>` | Stop reading entire file/pipe immediately when matched (not block-level) |
| `-a` | Output all lines in matched block (including lines not matched by `-t`/`-x`) |
| `-S` | Single-line mode per block: treat each block as one string for cross-line regex |
| `--block N` | Output only specific block(s): single `2`, list `1,2,3`, or range `1~3` |
| `--sep-block N` | Insert N empty lines between output blocks |
| `-L N` | Begin row number; `-N N` = end row; `-N +N` = begin + N rows |

**`-Q ""` vs `-Q same-as-b` vs `-Q same-as-b -y` (validated):**

```bash
# -Q "" without -y: only 2 blocks matched (section line is consumed as end, not reused)
msr -p config.ini -b "^\[section" -Q "" -a -C

# -Q "" with -y: 4 blocks (3 complete + 1 incomplete at EOF) — correct splitting
msr -p config.ini -b "^\[section" -Q "" -y -a -C

# Identical result to above — -Q "" is shorthand for -Q same-as-b
msr -p config.ini -b "^\[section" -Q "^\[section" -y -a -C
```

> **Rule**: When blocks are separated only by their begin pattern (no explicit end delimiter),
> use `-Q "" -y` (or `-Q <same-as-b> -y`) to correctly split every consecutive block.
> Without `-y`, the `-Q` match is consumed as block-end and not reused as the next block-begin.

**Special behavior of `--nt`/`--nx` in block mode:**
When used with `-b`+`-Q`, `--nt`/`--nx` **exclude the entire block** if any line in the block matches — unlike normal mode where they exclude individual lines only.

**Full validated examples:**

```bash
# B1: All blocks — each INI section is one block
msr -p config.ini -b "^\[section" -Q "^$" -C
# → Matched 4 blocks with 21 lines

# B2: Filter within blocks — only output lines matching -t
msr -p config.ini -b "^\[section" -Q "^$" -t "admin" -C
# → 2 lines ("role = admin") across 2 blocks; other lines hidden

# B3: -a outputs entire block when ANY line matches -t
msr -p config.ini -b "^\[section" -Q "^$" -t "admin" -a -C
# → Full section-alpha and section-gamma blocks output

# B4: --nt excludes entire block containing match
msr -p config.ini -b "^\[section" -Q "^$" -a --nt "error" -C
# → 3 blocks output; section-beta (has "error = true") excluded entirely

# B5: --block N outputs only Nth block
msr -p config.ini -b "^\[section" -Q "^$" -a --block 2 -C
# → Only section-beta block output

# B6: --block range
msr -p config.ini -b "^\[section" -Q "^$" -a --block 1~3 -C
# → section-alpha, beta, gamma output

# B7: --sep-block inserts blank lines between output blocks
msr -p config.ini -b "^\[section" -Q "^$" -t "admin" -a --sep-block 2 -C
# → 2 blank lines inserted between the 2 matched blocks

# B8: -S single-line mode — match across lines within each block
msr -p config.xml -b "^<\w" -Q "^</" -S -t "localhost" -C
# → Treats each XML block as one string; only block with "localhost" matches

# B9: -q stops reading file immediately at match
msr -p config.ini -q "error" -C
# → Stops at "error = true" line; reads only 10 lines instead of 21

# B10: -b + -Q + -t + -o: replace within specific block only
msr -p config.ini -b "^\[section-beta\]" -Q "^$" -t "role = user" -o "role = moderator" -C
# → Replacement preview scoped to section-beta only; other blocks untouched

# Real-world: Extract XML blocks containing keyword, output whole block
msr -rp . -f "\.xml$" -b "^\s*<Connection>" -Q "^\s*</Connection>" -it "localhost" -a

# Real-world: Replace IP inside specific XML blocks only
msr -rp . -f "\.xml$" -b "^\s*<SQL>" -Q "^\s*</SQL>" -t "192\.168\.1\.100" -o "10.0.0.1" -RK
```

> 📖 **More block matching examples**: See [Block Matching Across Industries](use-cases-and-comparisons.md#block-matching-across-industries) for real-world applications in Kubernetes, XML config, log analysis, and more.

### File List Input with `-w` (Precise Scope + Performance)

The `-w` parameter reads a list of file or directory paths from a text file, independently of `-r`/`-p`. This enables several high-value patterns:

**1. Git-tracked files only (skip build artifacts and ignored files)**

```bash
# Generate the list once, skip node_modules/bin/obj/etc automatically
git ls-files > /tmp/tracked.txt
msr -w /tmp/tracked.txt -t "pattern" --no-check

# Equivalent vscode-msr alias (pre-configured):
gfind-xxx  # uses git ls-files internally
```

Without `-w`, `msr -rp .` may still include non-source content (for example build outputs) depending on your include/exclude filters. `--nd` helps prune directories, while `git ls-files` gives an exact tracked-file scope and is usually more stable for CI-style targeted checks.

**2. Incremental CI checks — only files changed in this PR/commit**

```bash
# Only search files modified in the last commit
git diff --name-only HEAD~1 > changed.txt
msr -w changed.txt -t "TODO|FIXME|System\.exit" --no-check

# Only search files changed vs master branch
git diff --name-only master > changed.txt
msr -w changed.txt -f "\.java$" -t "DeprecatedApi" --no-check

# Practical: check code style only on changed files (avoid full-repo scan in CI)
git diff --name-only HEAD~1 | msr -t "\.(cs|java|ts)$" -PIC > scope.txt
msr -w scope.txt -S -t "(\r?\n){3,}" -H 0 --no-check && echo "Blank line check passed"
```

**3. File list caching — avoid repeated directory traversal on a huge codebase**

```bash
# Step 1: Generate file list (slow, traverses 50K+ files, do once)
msr -rp /enterprise/src -f "\.(cs|java)$" -l -PIC > src-files.txt

# Step 2: Run multiple searches using the cached list (fast)
msr -w src-files.txt -t "OldApiV1" --no-check
msr -w src-files.txt -t "DeprecatedClass" --no-check
msr -w src-files.txt -t "TODO.*security" -i --no-check

# Step 3: Auto-refresh cache if older than 30 minutes
msr -l --w1 30m -p src-files.txt 2>nul || \
    msr -rp /enterprise/src -f "\.(cs|java)$" -l -PIC > src-files.txt
```

**4. Arbitrary cross-directory file subsets**

`-p` only accepts directories; `-w` accepts a mix of files from completely unrelated directories:

```bash
# Process a hand-curated list of critical config files across the system
cat > configs.txt << EOF
/etc/app/production.conf
/var/app/database.yml
/opt/service/settings.json
EOF
msr -w configs.txt -t "old-server\.example\.com" -o "new-server.example.com" -R --no-check
```

**5. Integration with external tools that produce file lists**

```bash
# CMake/MSBuild: use compile_commands.json to get source files
jq -r '.[].file' compile_commands.json | sort -u > build-sources.txt
msr -w build-sources.txt -t "deprecated_include" --no-check

# Find large files, then search their content
msr -rp . -f "\.log$" --s1 10MB -l -PIC > large-logs.txt
msr -w large-logs.txt -t "CRITICAL" -H 5 --no-check
```

### Pipeline with nin for Log Analysis

msr and nin work together for powerful log analysis:

```bash
# Sort logs by time, then get error distribution (top 20)
msr -rp logs/ -f "\.log$" -F "\d{4}-\d{2}-\d{2}\D\d+:\d+:\d+" | nin nul "(\w+Exception)\b" -pd -H 20

# Extract unique values from msr search results
msr -rp . -f "\.log$" -t "user:\s*(\w+)" -PIC | nin nul "user:\s*(\w+)" -ui

# Get exception distribution by pod name in logs
msr -rp logs/ -d pods -x "DocumentClientException" | nin nul "^\S+?\\pods\\(\S+?)-\w+-\w+\.log:\d+:" -pd
```

### Git Operations Automation

```bash
# Get commits between two hashes and cherry-pick
git log branch | msr -b "^commit $NewestHash" -q "^commit $OldestHash" -t "^commit (\w+)" -o "\1" -PIC | msr -n -s "^:(\d+):" --dsc -t "^:\d+:\s+(\w+)" -o "git cherry-pick \1" -X

# List changed files vs master
git diff --name-only master | msr -t "(.+)" -o "msr -p \"\1\" -t pattern" -X -V ne0
```

### Code Style Fixing

```bash
# Remove trailing whitespace (preview)
msr -rp . -f "\.(cs|java|py)$" -t "(\S+)\s+$" -o "\1" -j

# Remove trailing whitespace (apply to files)
msr -rp . -f "\.(cs|java|py)$" -t "(\S+)\s+$" -o "\1" -R

# Convert TAB to 4 spaces at line beginning — use -g -1 for unlimited rounds
msr -rp . -f "\.(cs|java|py)$" -it "^(\s*)\t" -o "\1    " -g -1 -R

# Ensure single newline at file end
msr -rp . -f "\.(cs|java|py)$" -S -t "(\S+)\s*$" -o "\1\n" -R

# Remove blank-only lines
msr -rp . -f "\.(cs|java|py)$" -t "^\s+$" -o "" -R
```

### Multi-Round Replacement (`-g`)

The `-g` parameter controls **replacement rounds per line**. Understanding its behavior is crucial because msr differs from regex `/g` flag in other languages:

**Tool category clarification:**

| Tool | Category | `-g`/`/g` Comparison |
|------|----------|----------------------|
| grep, rg (ripgrep) | **Search only** | ❌ Not comparable — no replacement capability |
| sed | **Search + Replace** | ✅ Comparable — `s///g` = msr default |
| JavaScript `.replace()` | **Search + Replace** | ✅ Comparable — `/g` = msr default |
| Perl `s///g` | **Search + Replace** | ✅ Comparable — `/g` = msr default |
| **msr** | **Search + Replace** | Has unique `-g -1` multi-round mode |

> **Note:** grep/rg are pure search tools (like `msr -t pattern` without `-o`). They cannot replace text, so no `-g` comparison applies. For replacement, compare msr with sed, awk, or programming language string operations.

**msr vs Replacement Tools' `/g` Flag:**

| Tool/Language | Behavior | msr Equivalent |
|---------------|----------|----------------|
| sed `s/old/new/` | First match per line | N/A (msr always replaces all) |
| sed `s/old/new/g` | All matches, one pass | **msr default** (`-g 1`) |
| JavaScript `.replace(/re/)` | First match only | N/A |
| JavaScript `.replace(/re/g)` | All matches, one pass | **msr default** (`-g 1`) |
| **msr `-g -1`** | **Multi-round** until stable | No equivalent in most tools |

> **Key insight:** msr's `-g 1` (default) already behaves like other tools' `/g` flag — it replaces **all** non-overlapping matches in a single pass. The `-g -1` option enables **iterative replacement** where the output of each pass becomes the input for the next pass.

**When to use which:**

| `-g` Value | Behavior | Use Case |
|------------|----------|----------|
| `-g 1` (default) | One pass, all matches | Most replacements (same as `/g` in other tools) |
| `-g 2` | Two passes max | Limited iteration scenarios |
| `-g -1` | Unlimited passes until stable | Anchored patterns, compression, nested structures |

**Why `-g -1` is needed — the iteration principle:**

#### 1. Leading TAB → Spaces (Code Style Normalization)

When pattern uses anchor `^`, each round only processes one TAB:

```bash
# Pattern: ^(\s*)\t → replace first leading TAB with 4 spaces
# Line "\t\t\tcode" requires 3 rounds:
#   Round 1: \t\t\tcode → "    \t\tcode"
#   Round 2: "    \t\tcode" → "        \tcode"
#   Round 3: "        \tcode" → "            code"

msr -rp . -f "\.(cs|java|py)$" -t "^(\s*)\t" -o "\1    " -g -1 -R
```

#### 2. Multiple Spaces Compression (Text Cleanup)

```bash
# Compress irregular spacing: "text    with     multiple" → "text with multiple"
msr -p file.txt -t "  " -o " " -g -1 -PIC

# -g 1 leaves residual spaces; -g -1 guarantees single-space result
```

#### 3. URL Path Cleanup (Preserve Protocol)

```bash
# Remove duplicate slashes but protect "://" protocol prefix
# Without -g -1: "///api///" → "//api//" (still has doubles)
# With -g -1:    "///api///" → "/api/"   (complete cleanup)
msr -z "https://example.com///api////v1//users" -t "(?<!:)//" -o "/" -g -1 -PIC
# Result: https://example.com/api/v1/users
```

#### 4. Nested Brackets/Parentheses Removal

```bash
# Strip all nesting levels: ((((inner)))) → inner
# Each round removes one pair: ((((inner)))) → (((inner))) → ((inner)) → (inner) → inner
msr -z "value = ((((inner))))" -t "\(([^()]*)\)" -o "\1" -g -1 -PIC
# Result: value = inner
```

#### 5. CSV/Delimiter Compression (Data Cleaning)

```bash
# Normalize inconsistent field separators
# Without -g -1: "name1,,,,,name2" → "name1,,,name2" (residual commas)
# With -g -1:    "name1,,,,,name2" → "name1,name2"   (clean)
msr -z "name1,,,,,name2,,name3,,,,,,,name4" -t ",," -o "," -g -1 -PIC
# Result: name1,name2,name3,name4

# Same pattern works for semicolons, pipes, etc.
msr -p data.csv -t ";;" -o ";" -g -1 -R
```

**Decision rules for `-g -1`:**

| Condition | `-g -1` Needed? | Reason |
|-----------|-----------------|--------|
| Anchored pattern (`^`, `$`) | ✅ Yes | Anchor resets after each replacement |
| Compression (`"  "`→`" "`, `",,"`→`,`) | ✅ Yes | Replacement creates new matches |
| Nested structures (unknown depth) | ✅ Yes | Iterative stripping required |
| Independent positions (`\.`→`_`) | ❌ No | All matches found in single pass |
| Non-overlapping patterns (`<[^>]+>`→`""`) | ❌ No | No new matches created |

> **Simple test:** Run without `-g -1` first. If some matches remain that "should" have been replaced, add `-g -1`.

**Comparison with other tools:**

```bash
# JavaScript: "a..b...c".replace(/\.\./g, ".") → "a.b..c" (one pass, residual remains)
# sed: echo "a..b...c" | sed 's/\.\././g'      → "a.b..c" (one pass, residual remains)
# msr default: msr -z "a..b...c" -t "\.\." -o "." -PIC → "a.b..c" (same as above)
# msr -g -1:   msr -z "a..b...c" -t "\.\." -o "." -g -1 -PIC → "a.b.c" (iterates to completion)

# For "a.b.c" → "a_b_c": no iteration needed (independent matches)
# msr: msr -z "a.b.c" -t "\." -o "_" -PIC → "a_b_c" ✅ (default -g 1 is sufficient)
# JavaScript: "a.b.c".replace(/\./g, "_") → "a_b_c" ✅ (same result)
```

### Argument Validation in Scripts

```bash
# Check if argument is empty or help flag (batch/shell)
msr -z "LostArg$1" -t "^LostArg(|-h|--help|/\?)$" > /dev/null
if [ $? -ne 0 ]; then
    echo "Usage: $0 <argument>"
    exit 1
fi

# Parse and validate arguments with verbose mode
msr -z "justTestArgs $*" --verbose 2>&1 | msr -t "..." -o "..." -PIC
```

### Process Output Filtering

```bash
# Filter process list with colors (Windows PowerShell example)
pwsh -Command "Get-Process" | msr -t "pattern" --colors "t=Yellow,e=Green"

# Monitor and highlight specific processes
ps aux | msr -x "$ProcessName" --colors "Cyan" -P -T 3 -M
```

### IDE Integration Patterns

```bash
# Execute with output and show command (-XM)
msr -z "command" -XM

# Verify exit code after execution
msr -p file.txt -t "error" -X -V ne0  # Stop on non-zero return
msr -p file.txt -t "error" -X -V lt0  # Stop on negative return

# Output to stderr while preserving colors
msr -rp . -f "\.log$" -t "error" --to-stderr --keep-color
```

### Verbose Debugging Mode (`--verbose`)

The `--verbose` flag provides comprehensive debugging output for troubleshooting complex commands:

```bash
# Debug a replacement command
msr -p test.txt -t "  " -o " " -g -1 --verbose -PIC
```

**Example `--verbose` output (verified):**

```
Begin args verbose ----------------------------------------------
  backup = false
  ...
--path = test.txt
--replace-times = 65535       ← Shows -g -1 is internally 65535
--replace-to =                ← Shows empty replacement string = ""
--text-match =                ← Shows regex pattern
--verbose = true
End args verbose --------------------------------------------------
Input args count = N

FunctionComplexity: fun_match_regex = 4.400000

Extra verbose info:  HasMatch NoPathRow NoAnyInfo NoColor
IS_CYGWIN = 0 , IS_MINGW = 0 , IS_WINDOWS = 1 , IS_LINUX = 0 , IS_MACOS = 0

2026-02-27 15:01:28.133 +0800 CST Will search path[1]: ...
Radically replaced 4 times, increasing = 0. File = ...
```

**Key information in `--verbose` output:**
- All parsed parameter values (useful for detecting shell escaping issues)
- `--replace-times = 65535` — reveals that `-g -1` internally uses max value
- `Radically replaced N times` — shows actual replacement rounds performed
- `FunctionComplexity` — internal regex complexity score
- Platform detection flags (IS_WINDOWS, IS_LINUX, etc.)
- Timestamps for performance analysis

> **Use `--verbose` when:** a command produces unexpected results, shell escaping is suspected, or you need to confirm parameter interpretation.

### Color and Encoding

For detailed documentation on color customization (`--colors`, `MSR_COLORS`), platform-dependent color behavior (Windows vs Linux pipe/redirect differences), and encoding support (UTF-8, UTF-16, BOM detection, non-ASCII/Chinese/Unicode), see:

**→ [msr and nin Shared Reference](msr-nin-shared-reference.md)**

Quick reference:

```bash
# Customize colors
msr -rp . -f "\.cs$" -t "error" --colors "t=Red,e=Green,d=Cyan"

# Disable colors for piping (safe on all platforms, keeps summary on stderr)
msr -rp . -f "\.log$" -t "error" -PIC | other-tool

# Search UTF-16 files (shows BOM warning)
msr -p file.txt -x "text"

# Replace in UTF-16 files (requires --force, converts to UTF-8)
msr -rp . -f "\.cs$" -t "old" -o "new" -RK --force
```

## Return Values and Exit Codes

### Return Values

msr returns useful values for scripts:

| Scenario | Return Value |
|----------|--------------|
| Found matches | Count of matched/replaced lines/blocks/files |
| No matches | 0 |
| Error occurred | -1 (usually 255 on Linux/macOS, 127 on MinGW — not guaranteed) |
| With `-X` | Non-zero return count or stopped command's value |

> **Note**: The -1 error code is truncated by shells to 8 bits (255) or 7 bits (127 on some MinGW). The exact value depends on your shell environment.

```bash
# Check if pattern found (shell)
msr -p file.txt -t "error" -l > /dev/null && echo "Found errors"

# Check return value (batch)
msr -p file.txt -t "error" -l > nul
if %ERRORLEVEL% GTR 0 (echo Found %ERRORLEVEL% matches)

# Use -H 0 to get count without any output (return value = match count)
msr -p file.txt -t "error" -H 0 && echo "Match count: %ERRORLEVEL%"

# Use -H 1 -J for pure existence check (stops at first match, fastest)
msr -p file.txt -t "error" -H 1 -J && echo "Pattern found"
```

### Cross-Platform Exit Code Behavior

On non-Windows platforms (Linux/macOS/Cygwin/MinGW), shell exit codes are truncated to 8-bit (max 255) or 7-bit (max 127), which can cause match counts to wrap to 0. Use `-H 1 -J` (existence check, always safe) or `--exit gt255-to-255` to cap values for threshold checks.

> 📖 **Full details**: See [Return Value Cross-Platform Behavior](msr-nin-shared-reference.md#return-value-cross-platform-behavior) for the complete truncation table, safe patterns, `--exit` control syntax, and exact count strategies.

## Troubleshooting

### No Output?
- Check if files exist: `msr -rp . -l`
- Remove filters one by one
- Add `-c` to see the command being executed

### Unexpected Matches?
- Use `-c` to verify regex
- Test regex with `-z`: `msr -z "test string" -t "your-regex"`

### Files Not Updated?
- Ensure you added `-R` flag
- Check file permissions
- Verify encoding (msr supports UTF-8, ANSI, and UTF-16 with BOM detection; non-ASCII characters in command-line arguments may be affected by terminal encoding on Windows)

### Slow on Windows?
- Add msr.exe to Windows Defender exclusion
- Use `trust-exe msr,nin` command (from vscode-msr alias)

## VSCode Integration

The [vscode-msr](https://marketplace.visualstudio.com/items?itemName=qualiu.vscode-msr) extension provides:
- Pre-cooked command aliases (`find-xxx`, `gfind-xxx`, `rgfind-xxx`)
- Git operation shortcuts (`gpc`, `gph`, `gfc`, etc.)
- Cross-repository search capability
- Auto-generated script files for use outside VS Code

See [vscode-msr User Guide](vscode-msr-user-guide.md) for alias usage.
See [Common-Alias.md](https://github.com/qualiu/vscode-msr/blob/master/Common-Alias.md) for all available aliases.

## Further Resources

**Related documentation in this project:**

- [msr AI Agent Reference](msr-ai-agent-reference.md) — technical parameter reference for AI agents
- [nin User Guide](nin-user-guide.md) — set operations with nin (difference, intersection, distribution)
- [nin AI Agent Reference](nin-ai-agent-reference.md) — nin parameter reference for AI agents
- [vscode-msr User Guide](vscode-msr-user-guide.md) — alias usage guide for humans
- [vscode-msr AI Agent Reference](vscode-msr-ai-agent-reference.md) — alias reference for AI agents
- [Use Cases and Comparisons](use-cases-and-comparisons.md) — practical use cases, industry applications, and tool comparisons
- [AI Agent Usage Guide](ai-agent-usage-guide.md) — AI agent integration guide for msr, nin, and vscode-msr aliases
- [Download Links](download-links.md) — download tables for all platforms

**External links:**

- GitHub: https://github.com/qualiu/msr
- More tools: https://github.com/qualiu/msrTools
- VSCode extension: https://github.com/qualiu/vscode-msr
- Usage screenshots: https://qualiu.github.io/msr/usage-by-running/msr-Windows.html