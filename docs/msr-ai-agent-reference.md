# msr AI Agent Reference

Technical reference for **AI agents** to accurately invoke msr commands.

## Tool Metadata

| Property    | Value                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name        | msr                                                                                                                                                                                                                                                                                                                                                                                                      |
| Full Name   | Match/Search/Replace                                                                                                                                                                                                                                                                                                                                                                                     |
| Type        | CLI text processing tool                                                                                                                                                                                                                                                                                                                                                                                 |
| Platforms   | Windows, Linux, macOS, FreeBSD, Cygwin, MinGW, WSL                                                                                                                                                                                                                                                                                                                                                       |
| Encoding    | 8 types with BOM auto-detection (see [Encoding Support](msr-nin-shared-reference.md#encoding-support))                                                                                                                                                                                                                                                                                                   |
| Repository  | https://github.com/qualiu/msr                                                                                                                                                                                                                                                                                                                                                                            |
| Download    | [Download Links by Platform](download-links.md)                                                                                                                                                                                                                                                                                                                                                          |
| Performance | `2X~15X+` faster than findstr ([Windows](https://github.com/qualiu/msr/blob/gh-pages/perf/summary-full-Windows-comparison-2019-08-11.md)), `3X~10X+` faster than grep ([macOS](https://github.com/qualiu/msr/blob/master/perf/summary-full-Darwin-Arm64-comparison-2021-11-20.md)), `1.5~3X+` vs grep ([Linux](https://github.com/qualiu/msr/blob/gh-pages/perf/summary-part-CentOS-comparison-2019-08-11.md)) |

## Return Value Semantics

| Condition        | Return Value                                 |
| ---------------- | -------------------------------------------- |
| Normal execution | Count of matched/replaced lines/blocks/files |
| No matches       | 0                                            |
| Error occurred   | -1 (see note below)                          |
| With `-X` flag   | See below                                    |

**`-X` (execute) return values:**
- With `-V`: Returns matched-stop-count (count of commands that matched the stop condition)
- Without `-V`: Returns non-zero-return-count (count of commands that returned non-zero)
- Single command: Returns that command's return value directly

**Error return value**: msr returns -1 on error, which shells truncate to 255 (8-bit) or 127 (7-bit MinGW). Use `--exit` for reliable cross-platform handling.

**Cross-platform count truncation**: In POSIX shells (Linux/macOS/Cygwin) and MinGW environments, exit codes are truncated (max 255 or 127), so a count of 256 wraps to 0. Safe patterns: `-H 1 -J` (existence check, always safe); `--exit gt255-to-255` for threshold checks. For exact large counts, parse the summary line (do not use `-M`). `-M` is optional in all `-H N -J` scenarios — summary is stderr-only (never affects stdout, pipes, or return values). See [Return Value Cross-Platform Behavior](msr-nin-shared-reference.md#return-value-cross-platform-behavior) for full details.

**Important**: In normal search/replace mode (without `-X`), return value > 0 means matches found, NOT an error.

---

## Parameter Schema

### Path and File Selection

| Parameter          | Type   | Default | Description                                                                                          |
| ------------------ | ------ | ------- | ---------------------------------------------------------------------------------------------------- |
| `-p, --path`       | string | -       | Source paths (comma/semicolon separated)                                                             |
| `-r, --recursive`  | flag   | false   | Recursively search subdirectories                                                                    |
| `-k, --max-depth`  | int    | 33      | Maximum directory depth                                                                              |
| `-w, --read-paths` | string | -       | File containing list of paths to search                                                              |
| `-f, --file-match` | regex  | -       | Filename must match this pattern                                                                     |
| `--nf`             | regex  | -       | Exclude files matching this pattern                                                                  |
| `--pp`             | regex  | -       | Full path must match this pattern                                                                    |
| `--np`             | regex  | -       | Exclude paths matching this pattern                                                                  |
| `-d, --dir-has`    | regex  | -       | Directory must contain matching subfolder                                                            |
| `--nd`             | regex  | -       | Exclude directories matching this pattern                                                            |
| `--xp`             | string | -       | Exclude paths containing **any** of these texts (comma separated, OR logic; supports `/` on Windows) |
| `--sp`             | string | -       | Path must contain **all** of these texts (comma separated, AND logic; supports `/` on Windows)       |
| `--xf`             | flag   | -       | Skip/exclude link files                                                                              |
| `--xd`             | flag   | -       | Skip/exclude link directories                                                                        |
| `-G`               | flag   | -       | Try to read link files once (links must be under input paths)                                        |

**Path filter semantics and invocation safety (important for agents):**
- Prefer narrowing order: `-d` → `--sp` → `--xp` (include-first strategy is usually fastest and most stable).
- `--sp` is **AND** logic (`A,B,C` means path contains all three texts).
- `--xp` is **OR** logic (`A,B,C` means path excluded if it contains any one of them).
- `-xp` is **not** `--xp`: single dash is parsed as `-x p` and can cause duplicate `-x` errors. Always use `--xp`.
- For vscode-msr aliases (`gfind-xxx`/`find-xxx`), avoid overriding alias-built `--nd`/`--np` unless intentional; use `-d`/`--sp`/`--xp` for user-side narrowing.

### File Size and Time Filters

| Parameter | Type   | Format                                       | Description                                                            |
| --------- | ------ | -------------------------------------------- | ---------------------------------------------------------------------- |
| `--sz`    | flag   | -                                            | Sort and display file size                                             |
| `--s1`    | string | `300`, `300B`, `1KB`, `1k`, `2.5MB`, `0.5kb` | Minimum file size; plain int=bytes; unit case-insensitive; decimals OK |
| `--s2`    | string | `10MB`, `2.5M`, `500`                        | Maximum file size; same format as `--s1`                               |
| `--wt`    | flag   | -                                            | Sort by last write time                                                |
| `--w1`    | string | `2024-01-01`, `3h`, `30m`, `30d`, `file1`    | File time start; see format table below                                |
| `--w2`    | string | `2024-01-01`, `+1d`, `now-1d`, `file2`       | File time end; see format table below                                  |

**`--w1`/`--w2` accepted formats (validated by test):**

| Format              | Example                                          | Notes                           |
| ------------------- | ------------------------------------------------ | ------------------------------- |
| Partial date        | `2026-02`                                        | `YYYY-MM` → first of that month |
| Date                | `2024-01-01`                                     | `YYYY-MM-DD`                    |
| Date + hour         | `"2024-01-01 10"` or `2024-01-01T10`             | Space or T separator            |
| Date + time         | `"2024-01-01 10:30:00"` or `2024-01-01T10:30:00` | Full datetime                   |
| Time only           | `"10:30:00"`                                     | Today's date assumed            |
| Relative (past)     | `1d`, `-1d`, `2h`, `30m`, `10s`                  | d/h/m/s; `-` prefix equivalent  |
| File path           | `reference.txt`                                  | Uses file's mtime as reference  |
| `--w2` offset       | `+1d`, `+2h`                                     | Forward from `--w1` value       |
| `--w2` now-relative | `now-1d`                                         | N units before now              |

> ⚠️ **Invalid:** Plain integers without unit suffix (`0`, `1`, `30`) → exit=-1 error. Always use unit suffix: `30m`, `1h`, `1d`.

### Text Matching

| Parameter           | Type   | Description                                                                                                                                                  |
| ------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `-t, --text-match`  | regex  | Line must match this regex (line filter + can be replace source for `-o`)                                                                                    |
| `-x, --has-text`    | string | Line must contain this plain text (line filter + can be replace source for `-o`)                                                                             |
| `--nt`              | regex  | Exclude lines matching this regex                                                                                                                            |
| `--nx`              | string | Exclude lines containing this text                                                                                                                           |
| `-i, --ignore-case` | flag   | Case-insensitive matching                                                                                                                                    |
| `-e, --enhance`     | regex  | Extra color highlight only — **never filters lines, never affects `-o` replacement**. Works correctly in PowerShell (no ambiguity with PowerShell operators) |

**`-t` / `-x` / `-e` / `-o` interaction (validated by test, applies equally to `-p`/`-w`/`-z` inputs):**
- `-t` and `-x` are **AND line filters**: a line must satisfy both to be output.
- `-e` is **color-only**: does not filter lines; colors text not already matched by `-t`/`-x`/`-o`.
- When `-o` is used with both `-t` and `-x`: the one **closer to `-o`** on the command line is the replace source; the other acts as a pure filter. Equal distance → the **left (earlier written) one** wins.
- `-e` has **no effect** on `-o` replacement output.

### Text Replacement

| Parameter             | Type   | Description                                                                                                                                                                                                                                                 |
| --------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-o, --replace-to`    | string | Replacement text; prefer `\1`/`\2` for capture groups (`$1`/`${1}` also work but may conflict with shell variable expansion in PowerShell, bash, and Doskey macros)                                                                                         |
| `-R, --replace-file`  | flag   | Actually write changes to files                                                                                                                                                                                                                             |
| `-K, --backup`        | flag   | Backup files before replacement. **Backup filename timestamp = file's original mtime** (not current time). If same-second backup already exists, appends `--2`, `--3`, ... counter suffix to avoid overwriting (e.g., `file--bak-2026-02-26__11_06_03--2`). |
| `-g, --replace-times` | int    | Max replacement rounds per line (default=1: one pass replacing all non-overlapping matches, same as `sed s///g`; use `-g -1` for unlimited rounds on anchored/overlapping patterns)                                                                         |
| `-S, --single-line`   | flag   | Treat file/block as single line for regex (`^` and `$` match whole content)                                                                                                                                                                                 |
| `-j, --out-replaced`  | flag   | Output only changed lines                                                                                                                                                                                                                                   |
| `--force`             | flag   | Force replace BOM files with non-UTF8 header (non-EFBBBF). **Warning: converts encoding to UTF-8 no BOM**                                                                                                                                                   |

### Row and Block Range

| Parameter               | Type   | Description                                                                                                                                                               |
| ----------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-L, --row-begin`       | int    | Start row number for each file                                                                                                                                            |
| `-N, --row-end`         | int    | End row number (0 = same as begin, `+N` = relative offset from `-L`)                                                                                                      |
| `-b, --start-block`     | regex  | Block begin pattern; matching line is included in the block                                                                                                               |
| `-Q, --stop-block`      | regex  | Block end pattern; matching line is included in the block and consumed (not reused) unless `-y`                                                                           |
| `-q, --stop-at-once`    | regex  | Stop reading entire file immediately when matched (not block-level — stops all further reading)                                                                           |
| `-y, --reuse-block-end` | flag   | Reuse the block-end matching line as the begin of the next block. **Required** when `-Q ""` (same pattern as `-b`)                                                        |
| `--block`               | string | Output only specific block numbers from matched set (e.g., `2`, `1,2,3`, `1~3`)                                                                                           |
| `--sep-block`           | int    | Insert N blank lines between output blocks as separator                                                                                                                   |
| `-U, --up`              | int    | Output N lines above match                                                                                                                                                |
| `-D, --down`            | int    | Output N lines below match                                                                                                                                                |
| `-H, --head`            | int    | Output first N lines (negative: skip first N). **Special: `-H 0` outputs nothing (stdout); return value = total match count. Summary on stderr only — `-M` is optional.** |
| `-T, --tail`            | int    | Output last N lines (negative: skip last N)                                                                                                                               |
| `-J, --jump-out`        | flag   | Exit after outputting H lines. **With `-H 1 -J`: stops at first match across all files (existence check). With `-H N -J`: global fast exit after N matches.**             |

**Block matching behavior (validated by test):**
- `-b` only (no `-Q`): each matching line starts a new block; block ends when next `-b` match or EOF.
- `-Q ""` (empty string): shorthand meaning same pattern as `-b`; **must add `-y`** to correctly split into 4 blocks — without `-y` only 2 blocks result (end line consumed, not reused as next begin).
- `-a` with block mode: outputs **entire block** (all lines), not just matched lines. When `--nt`/`--nx` used in block mode, the **entire block** is excluded if any line matches (different from normal line-filter behavior).
- `-S` in block mode: single-line regex treats the **entire block content** as one string; `^`/`$` match block start/end.
- `-b` + `-q`: reading starts from first `-b` match and stops when `-q` matches (inclusive), even mid-block.

### Output Control

| Parameter             | Type | Description                                             |
| --------------------- | ---- | ------------------------------------------------------- |
| `-P, --no-path-line`  | flag | Hide file path and line number prefix                   |
| `-A, --no-any-info`   | flag | Suppress all info and summary                           |
| `-I, --no-extra`      | flag | Hide extra info and warnings                            |
| `-M, --no-summary`    | flag | Hide summary at end                                     |
| `-O, --out-if-did`    | flag | Output summary only if matches found                    |
| `-C, --no-color`      | flag | Disable color output                                    |
| `-W, --out-full-path` | flag | Output absolute paths                                   |
| `-a, --out-all`       | flag | Output all lines including non-matches                  |
| `-l, --list-count`    | flag | List files only (with match count)                      |
| `-m, --show-count`    | flag | Prefix each output line with cumulative match count (`1 | line`, `2 | line`, ...) |
| `-u, --show-elapse`   | flag | Prefix each output line with elapsed seconds (`0.0s     | line`)    |


### Execution Mode (`-X`)

**Core capability:** Transform text input (file/pipe/string) into executable commands.

| Parameter                 | Type   | Description                                           |
| ------------------------- | ------ | ----------------------------------------------------- |
| `-X, --execute-out-lines` | flag   | Execute each output line as command                   |
| `-V, --stop-execute`      | string | Stop on return value match (see syntax below)         |
| `-O, --out-if-did`        | flag   | Show Return-Value **only when ≠ 0** (error detection) |
| `-Y, --not-from-pipe`     | flag   | Force reading from files, not pipe                    |
| `--timeout`               | float  | Maximum execution time in seconds                     |

**Key features:**
- **Input transformation**: Read from file/pipe → optionally transform with `-t ... -o ...` → execute as commands
- **Per-command timing**: Each execution shows time cost
- **Color-coded output**: Success (green) vs failure (red) return values
- **Batch statistics**: Total count, non-zero count, execution time

**`-V` stop condition syntax:**
- Math operators: `gt`/`>`, `lt`/`<`, `eq`/`=`, `ge`/`>=`, `le`/`<=`, `ne`/`!=` + number (e.g., `ne0`, `gt0`, `>=1`, `lt0`)
- Regex pattern for return value: matches against return value as string (e.g., `-V "[3-7]"` stops if return value is 3-7)

**Output control in `-X` mode (validated by test):**

The `-X` flag **always executes every output line as a command**. The parameters below control **what metadata is displayed**, not whether commands run:

- **Show Cmd**: Display `Run-Command[N] = <cmd>` line **before** execution
- **stdout**: The actual command output (always shown)
- **Show Return**: Display `Return-Value[N] = <code> : Used X s` line **after** execution
- **Summary**: Display `Executed N commands; Return value = X ; Time = Y s` at end

| Param Combo  | Show Cmd | stdout | Show Return   | Summary | Use Case                                            |
| ------------ | -------- | ------ | ------------- | ------- | --------------------------------------------------- |
| `-X`         | ✅        | ✅      | ✅             | ✅       | Debug: full trace of all executions                 |
| `-XM -V ne0` | ✅        | ✅      | ✅             | ❌       | **Fail-fast**: stop on first failure with full info |
| **`-XMO`**   | ✅        | ✅      | Only non-zero | ❌       | ✅ **Best balance**: concise + **shows errors only** |
| `-XMI`       | ✅        | ✅      | ❌             | ❌       | Concise but **loses error info**                    |
| `-XA`        | ❌        | ✅      | ❌             | ❌       | Pure output collection (loses all metadata)         |

**Practical use cases for `-X`:**

1. **Batch file operations** (transform file list → commands):
   ```bash
   msr -rp . -f "\.bak$" -l -PIC | msr -t "(.+)" -o "rm \"\1\"" -XMO
   ```

2. **Build/test with fail-fast** (stop on first failure):
   ```bash
   msr -rp . -f "\.c$" -l -PIC | msr -t "(.+)" -o "gcc \"\1\"" -XM -V ne0
   ```

3. **Batch rename** (pattern transform → move commands):
   ```bash
   msr -rp . -f "\.TXT$" -l -PIC | msr -t "(.+)\.TXT$" -o "mv \"\0\" \"\1.txt\"" -XMO
   ```

4. **Health check with statistics**:
   ```bash
   @("server1", "server2", "server3") | msr -t "(.+)" -o "ping -n 1 \1" -XMO
   ```

**Recommendation:** Use **`-XMO`** for batch processing, **`-XM -V ne0`** for fail-fast scenarios.

### Advanced Output Control

| Parameter      | Type | Description                                                                                                                                      |
| -------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--to-stderr`  | flag | Output results to stderr instead of stdout                                                                                                       |
| `--keep-color` | flag | Preserve ANSI colors when piping (Windows)                                                                                                       |
| `--out-index`  | flag | Output column/line index: each output line becomes `file:row:col:line` where `col` is the **1-based** byte offset of the match start in the line |
| `--no-check`   | flag | Skip validation of input paths (for `-w` file lists)                                                                                             |
| `--unix-slash` | int  | Use `/` instead of `\` on Windows (1=enable)                                                                                                     |

### Time Range Filtering (`-F`/`-B`/`-E`)

| Parameter           | Type   | Description                                                                                                   |
| ------------------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| `-F, --time-format` | regex  | Regex to match time/key text for `-B`/`-E` filtering and sorting. Auto-fills missing times from previous line |
| `-B, --time-begin`  | string | Begin time/key text (≥). **Requires `-F`**                                                                    |
| `-E, --time-end`    | string | End time/key text (≤). **Requires `-F`**                                                                      |
| `--dsc`             | flag   | Descending order for time/key sorting                                                                         |

**Universal `-F` pattern (recommended):**

```
(\d{4}[-/]\d+[-/]\d+\D\d+:\d+:\d+([\.,]\d+)?)
```

| Component     | Matches                | Example               |
| ------------- | ---------------------- | --------------------- |
| `\d{4}`       | Year                   | `2024`                |
| `[-/]`        | Date separator         | `-` or `/`            |
| `\d+`         | Month/Day (1-2 digits) | `01` or `1`           |
| `\D`          | DateTime separator     | space, `T`, `_`, etc. |
| `\d+:\d+:\d+` | Time HH:MM:SS          | `10:30:45`            |
| `([\.,]\d+)?` | Optional milliseconds  | `.123` or `,456`      |

**Covers these common log formats:**
- `2024-01-15 10:30:45` — Standard
- `2024-01-15T10:30:45.123Z` — ISO 8601
- `2024/01/15 10:30:45,456` — Slash date, Euro milliseconds
- `[2024-01-15 10:30:45.789]` — Bracketed
- `2024-01-15_10:30:45` — Underscore separator

**Key behavior (validated by test):**

1. **Text comparison, NOT time parsing**: `-B`/`-E` use string (lexicographic) comparison, not date parsing. This means:
   - Works with any sortable text pattern (dates, versions, IDs)
   - Format must be lexicographically sortable (e.g., `YYYY-MM-DD` works, `DD/MM/YYYY` does not)

2. **Auto-sort by `-F` key**: Using `-F` automatically sorts output by matched key (ascending by default, `--dsc` for descending)

3. **Auto-fill for continuation lines**: Lines without `-F` match inherit the previous line's key value. Critical for:
   - Multi-line stack traces
   - Continuation log entries
   - Wrapped output lines

4. **Flexible capture**: Use capture group `()` in `-F` to extract specific portion; without group, entire match is used as key

**Practical examples:**

```bash
# Filter logs by time range (YYYY-MM-DD HH:MM:SS format)
msr -p app.log -F "(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})" -B "2024-01-15 10:00:00" -E "2024-01-15 10:30:00"

# Filter by date only (all logs from a specific day)
msr -p app.log -F "(\d{4}-\d{2}-\d{2})" -B "2024-01-15" -E "2024-01-15"

# Open-ended: all logs from time onwards
msr -p app.log -F "(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})" -B "2024-01-15 10:00:00"

# Open-ended: all logs up to time
msr -p app.log -F "(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})" -E "2024-01-15 10:30:00"

# Sort logs descending (newest first)
msr -p app.log -F "(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})" --dsc

# Merge multiple log files sorted by time
msr -rp logs/ -f "\.log$" -F "(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})"

# Non-date key: filter by version range
msr -p versions.txt -F "(v\d+\.\d+\.\d+)" -B "v1.5.0" -E "v2.0.0"
```

**Stack trace extraction example:**
```bash
# Extract complete stack trace at specific time (includes continuation lines)
@"
2024-01-15 10:00:00 ERROR Exception occurred
  at Method1()
  at Method2()
  at Main()
2024-01-15 10:00:05 INFO Recovery started
"@ | msr -F "(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})" -B "2024-01-15 10:00:00" -E "2024-01-15 10:00:00"
# Output: ERROR line + all 3 continuation lines (at Method1/2/Main)
```

### Sorting and Statistics

| Parameter              | Type   | Description                                                                                  |
| ---------------------- | ------ | -------------------------------------------------------------------------------------------- |
| `-s, --sort-by`        | regex  | Sort by captured group (use `""` to inherit from `-t` or `-F`)                               |
| `-n, --sort-as-number` | flag   | Sort numerically + **output comprehensive statistics**                                       |
| `-v, --show-time`      | string | Show time at line head: `dt`(date+time), `dtm`(+millisecond), `dto`(+microsecond), `z`(zone) |

> **Note**: `-F` and `--dsc` are documented in [Time Range Filtering](#time-range-filtering--f-b-e) section above.

**Numeric Statistics**: When `-s` and `-n` are used together, msr outputs comprehensive statistics in summary:
- Count, Sum, Median, Average, MinValue, MaxValue, Mode, ModeCount
- Variance, StandardDeviation, SampleStandardDeviation
- MaxSubMin, MaxDivMin, MaxSubMedian, MaxDivMedian, MaxSubAverage, MaxDivAverage
- MedianSubAverage, MedianDivAverage, MedianSubMin, MedianDivMin
- AverageSubMin, AverageDivMin
- P05, P10, P15, P20, P25, P30, P35, P40, P45, P50, P55, P60, P65, P70, P75, P80, P85, P90, P95, P99, P99.9, P99.99, P99.999

### Input

| Parameter      | Type   | Description                        |
| -------------- | ------ | ---------------------------------- |
| `-z, --string` | string | Input string instead of files/pipe |

---

## Common Command Patterns

### Pattern 1: Search Files
```bash
msr -rp <paths> -f "<file_pattern>" -t "<regex>" [-x "<text>"] [-i] [-IC]
```
- Returns: matched line count
- Use `-l` for file list only

### Pattern 2a: Preview All Matches (default)
```bash
msr -rp <paths> -f "<file_pattern>" -t "<search_regex>" -o "<replace>"
```
- Shows ALL matched lines with replacement result applied (including lines where replacement result equals original)
- Returns: matched line count

### Pattern 2b: Preview Changes Only (`-j`)
```bash
msr -rp <paths> -f "<file_pattern>" -t "<search_regex>" -o "<replace>" -j
```
- Shows ONLY lines where replacement result differs from original
- Returns: changed line count

### Pattern 2c: Full Output with Replacements (`-a`)
```bash
msr -rp <paths> -f "<file_pattern>" -t "<search_regex>" -o "<replace>" -a
```
- Shows ALL lines: matched lines with replacement applied, non-matched lines output as-is (like `sed 's/old/new/'` default behavior)
- Useful for stream processing: pipe or redirect to produce transformed complete content
- Can combine with `-R` (`-a -R`) to both output all lines AND write changes to files
- Returns: matched line count

### Pattern 3: Replace Files
```bash
msr -rp <paths> -f "<file_pattern>" -t "<search_regex>" -o "<replace>" -R [-K]
```
- Returns: replaced line count
- `-K` creates backup with timestamp
- **Skip-write if unchanged**: If replacement result equals original content, msr does **not** write the file and does **not** update its `mtime`. This prevents false dirty states in `git status`, unnecessary rebuilds in make/cmake, and spurious rsync transfers.
- **Line ending behavior**: msr writes using the **system's native line ending style** (CRLF on Windows, LF on Linux/macOS). It does NOT detect or preserve the original file's line endings. A Unix LF file replaced on Windows will become CRLF; a Windows CRLF file replaced on Linux will become LF. This matches sed's behavior.

### Pattern 4: List Files with Filters
```bash
msr -rp <paths> -f "<file_pattern>" -l [--sz] [--wt] [--s1 <min>] [--s2 <max>] [--w1 <start>] [--w2 <end>]
```
- Returns: file count
- `--sz` sorts by size, `--wt` by time

### Pattern 5: Execute Commands
```bash
msr -rp <paths> -f "<pattern>" -l -PIC | msr -t "(.+)" -o "<cmd> \"\1\"" -X [-V ne0]
```
- Returns: non-zero return count (or stopped value with -V)

### Pattern 6: Text Transformation
```bash
msr -z "<input_string>" -t "<regex>" -o "<replacement>" -aPIC
```
- Use `-g -1` for unlimited replacements per line
- Use `-S` for single-line mode (entire input as one line)

### Pattern 7: Block Matching and Extraction

**Basic block extraction:**
```bash
# Extract blocks, output only lines matching -t within each block
msr -p <file> -b "<begin_regex>" -Q "<end_regex>" -t "<filter>"

# Extract entire blocks containing any line matching -t
msr -p <file> -b "<begin_regex>" -Q "<end_regex>" -t "<filter>" -a

# When blocks are separated only by begin pattern (no distinct end), use -Q "" -y
msr -p <file> -b "<begin_regex>" -Q "" -y -t "<filter>" [-a]
```

**`-Q ""` rule (critical):**
- `-Q ""` = same pattern as `-b` (shorthand). Always add `-y` when using `-Q ""`.
- Without `-y`: end line is consumed → only 2 blocks from 4-section file.
- With `-y`: end line reused as next begin → correct 4 blocks.

**Selecting specific blocks:**
```bash
# Output only the 2nd matched block
msr -p <file> -b "<begin>" -Q "<end>" --block 2

# Output blocks 1 through 3
msr -p <file> -b "<begin>" -Q "<end>" --block 1~3

# Add 2 blank lines between output blocks
msr -p <file> -b "<begin>" -Q "<end>" -a --sep-block 2
```

**Excluding blocks by content (`--nt`/`--nx` in block mode):**
```bash
# Exclude entire block if ANY line matches --nt (block-level, not line-level)
msr -p <file> -b "<begin>" -Q "<end>" -a --nt "<exclude_regex>"
```

**Single-line regex across block lines (`-S`):**
```bash
# Treat entire block as one string; regex can span multiple lines
msr -p <file> -b "<begin>" -Q "<end>" -S -t "<multi_line_regex>"
```

**Stop reading at first match (`-q`):**
```bash
# Stop reading entire file when -q matches (not block-scoped)
msr -p <file> -b "<begin>" -q "<stop_regex>"

# Stop reading entire file at first -q match (no block start condition)
msr -p <file> -q "<stop_regex>"
```

**Row range (absolute and relative):**
```bash
# Rows 6 to 11 (absolute)
msr -p <file> -L 6 -N 11

# Rows 6 to 6+4=10 (relative offset)
msr -p <file> -L 6 -N +4
```

**Replace inside specific block only:**
```bash
# Scoped replacement: -t selects lines, -o replaces, within matched block
msr -p <file> -b "<begin>" -Q "<end>" -t "<search>" -o "<replace>"
```

---

## Parameter Combinations

> **Note**: Single-character flags can be concatenated: `-PAC` = `-P -A -C`, `-it` = `-i -t`. Both forms are equivalent.

### For Pure Output (Scripting)
```
-PIC    # No path, no extra, no color — keeps summary on stderr (recommended)
-PAC    # No path, no info, no color — also suppresses summary
-POC    # No path, output only if matched, no color
```

> **Recommendation**: Prefer `-PIC` over `-PAC` — summary is just one line on stderr (doesn't affect stdout/pipes) and provides useful diagnostics (match count, file count, time). For **aliases** (which already include `-I`), use `-PC` instead of `-PIC`, and `-C` instead of `-IC`. Note: `-PAC`/`-PIC` already include `-C` — see [Constraint 12](#constraints-and-limitations).

**Stderr summary behavior in pipes (verified by testing):**

| Scenario                        | Summary Visibility           | Pipe Data (stdout)          |
| ------------------------------- | ---------------------------- | --------------------------- |
| `msr ... -PIC` (no pipe)        | ✅ Shown on terminal (stderr) | N/A                         |
| `msr ... -PIC \| nin ...`       | ✅ Shown on terminal (stderr) | ❌ Not in pipe — stdout only |
| `msr ... -PIC 2>nul \| nin ...` | ❌ Suppressed by redirect     | ❌ Not in pipe               |
| `msr ... -PAC`                  | ❌ Suppressed by `-A`         | N/A                         |

**Key points:**
- Summary goes **only to stderr** — never enters stdout pipe, so downstream commands receive clean data
- **`-PIC`**: stderr diagnostics (match count, file count, time) — recommended for AI agents and CI/CD
- **`-PAC`**: completely silent (no summary). Equivalent to `-PIC 2>nul`

### For Debugging
```
-c      # Show command line
--verbose  # Show parsed arguments and detailed info
```

### For File Operations
```
-RK     # Replace files with backup
-R -M -T 0  # Replace silently (hide file list and summary)
```

### Pattern 8: Code Style Fixing
```bash
# Recursive TAB to spaces (run until no changes, -g -1 for unlimited rounds)
msr -rp <paths> -f "<file_pattern>" -it "^(\s*)\t" -o "\1    " -g -1 -R

# Remove trailing whitespace
msr -rp <paths> -f "<file_pattern>" -t "(\S+)\s+$" -o "\1" -R

# Ensure single newline at end
msr -rp <paths> -f "<file_pattern>" -S -t "(\S+)\s*$" -o "\1\n" -R
```

### Pattern 9: Script Argument Validation

**POSIX shell (bash/zsh/sh):**
```bash
# Check empty/help argument (returns 1 if arg empty or is help flag)
msr -z "LostArg$1" -t "^LostArg(|-h|--help|/\?)$" > /dev/null
# Use $? to check return value

# Parse arguments with verbose mode
msr -z "justTestArgs $*" --verbose 2>&1
```

**Windows batch (cmd.exe):**
```bat
:: Check empty/help argument (returns 1 if arg empty or is help flag)
msr -z "LostArg%~1" -t "^LostArg(|-h|--help|/\?)$" > nul
:: Use %ERRORLEVEL% to check return value

:: Parse arguments with verbose mode
msr -z "justTestArgs %*" --verbose 2>&1
```

### Pattern 10: Pipeline with nin for Analysis
```bash
# Sort logs by time then analyze distribution
msr -rp <paths> -f "\.log$" -F "<time_regex>" | nin nul "<capture_regex>" -pd -H <N>
```

### Pattern 11: File Type Distribution
```bash
# Get file extension distribution
msr -rp <path> -l -PIC --xd -k 18 | nin nul "\.(\w+)$" -p -d

# Get folder distribution
msr -rp <path> -l -PIC --xd -k 18 | nin nul "^([^\\/]+)[\\/]" -p -d
```

### Pattern 12: Cache/Time-based Operations
```bash
# Check if file modified within N minutes (cache validation)
msr -l --w1 <time-with-unit> -p <file> 2>nul
# Returns: 1 if file exists and modified within time, 0 otherwise

# Git file list with cache check (cross-platform temp file path)
git ls-files > <temp_list_file> && msr -w <temp_list_file> --no-check -t "<pattern>"
```

### Pattern 13: IDE/Terminal Integration
```bash
# Execute and display command (-XM shows command being run)
msr -z "<command>" -XM

# Output to stderr while keeping colors (useful for separating results from messages)
msr -rp <path> -t "<pattern>" --to-stderr --keep-color
```

---

## Encoding Support Matrix

msr supports 8 encoding types with BOM auto-detection. For the complete encoding matrix, BOM detection details, and non-ASCII/Unicode handling, see [msr and nin Shared Reference — Encoding Support](msr-nin-shared-reference.md#encoding-support).

**Key msr replacement behavior**: Non-UTF8 BOM files (UTF-16, UTF-32) require `--force` for replacement, which **converts encoding to UTF-8 no BOM**. Only UTF-8 with BOM preserves its BOM header after replacement. Use `--not-warn-bom` to suppress BOM warnings.

## Constraints and Limitations

1. **Unicode Encoding**: See [Encoding Support Matrix](#encoding-support-matrix) above. Non-ASCII file content is correctly read/written
2. **Non-ASCII Command-line Arguments** (Chinese, Japanese, Korean, etc.):
   - **macOS/Linux** (UTF-8 terminal): Non-ASCII characters in `-t`/`-x`/`-o` arguments work correctly — Chinese regex, Emoji, Japanese/Korean/Arabic all fully supported (verified by 45 automated tests on macOS). Use them directly: `-x "服务器"`, `-t "用户名=\S+"`, `-x "⚠️" -o "🔔"`
   - **Windows** (non-matching locale): Non-ASCII characters passed as `-t`/`-x` arguments are converted to `?` (0x3F). This is a Windows ANSI code page limitation for native executables, not an msr bug
   - **AI Agent workaround (Windows only)**: Use English keywords/regex patterns to search files containing non-ASCII text (e.g., `-x "error"` works perfectly in Chinese log files); terminal may show garbled display but file output preserves correct UTF-8
   - **UTF-16 output limitation**: msr strips `\x00` null bytes from UTF-16 internally (not full UTF-16→UTF-8 transcoding). ASCII output is correct, but non-ASCII characters appear as raw UTF-16 bytes (garbled). **Match counts are always accurate.** This is an msr internal behavior, consistent across all platforms
3. **BOM Files**: See [Encoding Support Matrix](#encoding-support-matrix) above for `--force` replacement behavior and BOM handling
4. **File names**: Case-insensitive matching regardless of OS
5. **Paths**: Use `/` or `\` on Windows (both supported for `--pp`, `--np`, `--xp`, `--sp`)
6. **Regex syntax**: Boost regex (similar to PCRE)
7. **Replacement**: `\1` recommended (`$1`/`${1}` also work but may conflict with shell variable expansion in PowerShell, bash, and Doskey)
8. **Pipe vs Files**: Use `-Y` when ambiguous (running inside another command)
9. **No write if unchanged**: When `-R` is used, files whose replacement result is identical to the original content are **not written** and their `mtime` is **not updated**. This is automatic and requires no extra flag.
10. **Line ending behavior**: msr writes using the **system's native line ending style** (CRLF on Windows, LF on Linux/macOS). It does NOT preserve the original file's line endings. A Unix LF file replaced on Windows becomes CRLF; a Windows CRLF file replaced on Linux becomes LF.
11. **stdin pipe (`-w -`) not supported on Windows**: Piping a file list via stdin (`-w -`) does not work on Windows. Use a temp file instead: write paths to a file, then pass it with `-w <file>`.
12. **`-PAC`/`-PIC` include `-C`**: These are atomic shorthands. Adding `-C` separately after them causes `"option '--no-color' cannot be specified more than once"` error. Prefer `-PIC` over `-PAC` to keep summary; for aliases, use `-PC`/`-C` instead (aliases already include `-I`).

## Error Handling

| Scenario                | Behavior                                                         |
| ----------------------- | ---------------------------------------------------------------- |
| File not found          | Warning to stderr, continues                                     |
| Invalid regex           | Error to stderr, returns -1                                      |
| Permission denied       | Warning to stderr, continues                                     |
| No matches              | Returns 0 (not an error)                                         |
| BOM file (non-UTF8)     | Warning unless `--force` used. Search works but skip replacement |
| BOM file with `--force` | Replaces and **converts encoding to UTF-8 no BOM**               |

## Environment Variables

msr uses 9 `MSR_*` environment variables (7 shared with nin, 2 msr-only). For the complete variable mapping table, see [msr and nin Shared Reference — Environment Variables](msr-nin-shared-reference.md#environment-variables).

**msr-only variables:**

| Variable            | Maps To               | Description              |
| ------------------- | --------------------- | ------------------------ |
| `MSR_OUT_FULL_PATH` | `-W, --out-full-path` | Output absolute paths    |
| `MSR_OUT_INDEX`     | `--out-index`         | Output column/line index |

> The 7 shared variables (`MSR_NO_COLOR`, `MSR_COLORS`, `MSR_NOT_WARN_BOM`, `MSR_SKIP_LAST_EMPTY`, `MSR_KEEP_COLOR`, `MSR_UNIX_SLASH`, `MSR_EXIT`) apply identically to both msr and nin.

## Exit Code Control

Use `--exit` parameter or `MSR_EXIT` environment variable for cross-platform compatibility:

| Pattern             | Description                 | Use Case                   |
| ------------------- | --------------------------- | -------------------------- |
| `gt255-to-255`      | Cap return > 255 to 255     | Cygwin/Linux/macOS shell   |
| `gt127-to-127`      | Cap return > 127 to 127     | MinGW on Windows           |
| `gt0-to-0,le0-to-1` | Invert to traditional style | If used to 0=found pattern |

**Note**: Setting global MSR_XXX environment variables is not recommended as it may cause issues on other machines. Set them temporarily in scripts or command lines.

## Color Configuration

msr and nin share the same color system. For complete color customization reference (syntax, available colors, platform defaults, alternating groups), see [msr and nin Shared Reference — Color Customization](msr-nin-shared-reference.md#color-customization).

**msr-specific color targets**: `d` (directory), `f` (filename), `p` (full path — sets both `d` and `f`). These apply only to msr file search output.

```
--colors "Green,t=Red+Blue_Yellow,x=Yellow,e=Cyan,d=Blue,f=Green,m=Green,u=Yellow"
```

---

## VSCode Integration

The [vscode-msr](https://marketplace.visualstudio.com/items?itemName=qualiu.vscode-msr) extension provides pre-configured aliases wrapping msr and nin for common workflows. See:
- [vscode-msr AI Agent Reference](vscode-msr-ai-agent-reference.md) — alias parameter conventions, naming patterns, decision tree
- [Common-Alias.md](https://github.com/qualiu/vscode-msr/blob/master/Common-Alias.md) — full alias reference

## Further Resources

**Related documentation in this project:**

- [msr User Guide](msr-user-guide.md) — comprehensive human guide for msr
- [nin AI Agent Reference](nin-ai-agent-reference.md) — nin parameter reference for AI agents
- [Use Cases and Comparisons](use-cases-and-comparisons.md) — practical use cases, industry applications, and tool comparisons
- [AI Agent Usage Guide](ai-agent-usage-guide.md) — AI agent integration guide for msr, nin, and vscode-msr aliases
- [Download Links](download-links.md) — download tables for all platforms

**External links:**

- GitHub: https://github.com/qualiu/msr
- VSCode extension: https://github.com/qualiu/vscode-msr