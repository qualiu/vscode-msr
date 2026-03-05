# nin AI Agent Reference

Technical reference for **AI agents** to accurately invoke nin commands.

## Tool Metadata

| Property | Value |
|----------|-------|
| Name | nin |
| Full Name | Not-IN (set difference/intersection tool) |
| Type | CLI set operation tool for lines/keys |
| Platforms | Windows, Linux, macOS, FreeBSD, Cygwin, MinGW, WSL |
| Encoding | 8 types with BOM auto-detection (see [Encoding Support](msr-nin-shared-reference.md#encoding-support)) |
| Repository | https://github.com/qualiu/msr |
| Download | [Download Links by Platform](download-links.md) |
| Related | Standalone tool; from same repository as msr; complementary use recommended |

## Return Value Semantics

| Condition | Return Value |
|-----------|--------------|
| Normal execution (default) | Count of lines/keys in file1 NOT in file2 |
| With `-m` (intersection) | Count of lines/keys in BOTH files |
| No matches | 0 |
| Error occurred | -1 (see note below) |

**Error return value**: nin returns -1 on error, which shells truncate to 255 (8-bit) or 127 (7-bit MinGW).

**Cross-platform count truncation**: On non-Windows, exit codes are truncated (max 255 or 127) — a count of 256 wraps to 0. Safe patterns: `-H 1 -J` (existence check, always safe); `--exit gt255-to-255` for threshold checks. For exact large counts, parse the summary line (do not use `-M`; use `-I` to redirect summary to stdout). See [Return Value Cross-Platform Behavior](msr-nin-shared-reference.md#return-value-cross-platform-behavior) for full details.

**Important**: Return value > 0 means matches found, NOT an error.

---

## Command Syntax

```
nin <File1-or-nul> <File2-or-nul> [Regex-pattern-1] [Regex-pattern-2] [Options]
```

### Positional Arguments

| Position | Type | Required | Description |
|----------|------|----------|-------------|
| 1 | string | Yes | First file path, or `nul`/`/dev/null` for pipe input |
| 2 | string | Yes | Second file path, or `nul`/`/dev/null` when no comparison file is needed |
| 3 | regex | No | Capture pattern for file1 (must have group[1]) |
| 4 | regex | No | Capture pattern for file2 (defaults to pattern 3 if omitted) |

### Regex Pattern Requirements

- If positional regex pattern is **omitted**, nin uses the **whole line** as the comparison key.
- If positional regex pattern is **provided**, it must contain **capture group[1]**: `(...)`.
- Group[1] is used as the comparison key when regex is provided.
- Examples: `^(\w+)`, `(\d+\.\d+\.\d+\.\d+)`, `"([^"]+)"`

---

## Parameter Schema

### Set Operation Mode

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| (none) | - | - | Difference set: lines/keys in file1 NOT in file2 |
| `-m, --intersection` | flag | false | Intersection set: lines/keys in BOTH files |
| `-u, --unique` | flag | false | Remove duplicates from result |
| `-S, --switch-first` | flag | false | Swap file1 and file2 positions |

### Text Matching

| Parameter | Type | Description |
|-----------|------|-------------|
| `-i, --ignore-case` | flag | Case-insensitive comparison |
| `-t, --text-match` | regex | Additional filter: output line must match this regex |
| `-x, --has-text` | string | Additional filter: output line must contain this plain text |
| `--nt` | regex | Exclude lines matching this pattern |
| `--nx` | string | Exclude lines containing this text |

**`-t` / `-x` / `-e` interaction rules:**

| Scenario | Filtering behavior | Color behavior |
|----------|--------------------|----------------|
| `-t` only | Lines not matching `-t` are dropped | `-t` pattern colored |
| `-x` only | Lines not containing `-x` text are dropped | `-x` text colored |
| `-t` + `-x` | AND logic: both must match | Both colored |
| `-e` only | **No filtering** — all lines pass through | `-e` pattern colored |
| `-t` + `-e` | `-t` still filters; `-e` does NOT filter | Combined regex `(-t)\|-e` used for coloring |

**Key rule**: `-e` (`--enhance`) **never filters lines** — it only adds color highlighting. Filtering is controlled exclusively by `-t` and `-x`.

**Note**: nin's `-e` works correctly in PowerShell (no ambiguity). `--enhance` is the long-form alias.

**Critical: What text does `-t`/`-x`/`--nt`/`--nx` filter against? (Validated)**

The filter target depends on the **output mode**, not the original line:

| Output mode | Filter target for `-t`/`-x`/`--nt`/`--nx` |
|-------------|---------------------------------------------|
| Default (no `-w`) | **Captured key only** (group[1] text) |
| With `-w` | **Full original line** |
| With `-n` (not-captured lines) | **Not filtered at all** — not-captured lines always pass through regardless of `-t`/`-x`/`--nt`/`--nx` |

This has important practical implications:

```bash
# Filter by STATUS COLUMN (column 4) — must use -w (whole line) for multi-column matching
nin hosts.txt nul "^(\S+)" -w  --nt "maintenance|decommission" -PAC
# Works: --nt matches against the whole line including status column

# Filter by MACHINE NAME PATTERN — captured key is the name, so -w not needed
nin hosts.txt nul "^(\S+)" --nt "^web-|^db-old$" -PAC
# Works: --nt matches against the captured machine name

# -wn + --nt: not-captured lines (comments) are NOT filtered, pass through unconditionally
nin hosts.txt nul "^(\S+)" -wn --nt "web-0[23]|db-old" -PAC
# Result: web-02/web-03/db-old machine lines removed, BUT all comment/blank lines kept as-is
# Note: empty lines between sections are also not-captured, so they pass through too
# Use -w --nt (without -n) if you want ONLY matched lines with column filtering (no comments)
```

### Output Control

| Parameter | Type | Description |
|-----------|------|-------------|
| `-w, --out-whole-line` | flag | Output full original line instead of just the captured key (group[1]) |
| `-n, --out-not-captured` | flag | Also output lines from file1 that did NOT match the regex pattern |
| `-p, --percentage` | flag | Show count and percentage for each key |
| `-P, --no-percent` | flag | Hide percentage numbers (overrides -p) |
| `--sum` | flag | Show cumulative totals |
| `-e, --enhance` | regex | Color highlight pattern only — **never filters lines** |
| `-I, --info-normal-out` | flag | Route summary/info to **stdout** instead of stderr |

#### `-w` and `-n` Behavior (Validated)

**`-w` (whole line output):**
- Without `-w`: output is the **captured key** (group[1] text only)
- With `-w`: output is the **full original line** containing the match

**`-n` (not-captured output):**
- Without `-n`: only lines that matched the regex are output
- With `-n`: additionally outputs lines that did NOT match the regex
- Not-captured lines are output **as-is** (full original line, regardless of `-w`)
- **Empty lines are silently skipped** even with `-n`

**`-w -n` combination (structure-preserving filter):**
- Matched lines → full original line
- Not-matched non-empty lines → full original line as-is
- Net effect: reconstructs the full file structure, minus filtered-out entries
- Primary use case: filter config files while preserving all comments and formatting

**`-S` (switch first — swap roles):**
- Swaps file1 and file2 roles AND their respective regex patterns
- Without `-S`: outputs keys in file1 NOT in file2
- With `-S`: outputs keys in file2 NOT in file1 (reverses diff direction)
- The two regex patterns are also swapped accordingly

**`-I` (info to stdout):**
- By default the summary/info line goes to **stderr**
- With `-I`, summary goes to **stdout** — captured by `>` redirects and shell variables
- Use `2>nul` / `2>/dev/null` to suppress only warnings (not the summary, unless `-I` not used)

#### Behavior Matrix (Validated by Testing)

| Command | Matched lines output | Not-matched lines output |
|---------|---------------------|--------------------------|
| (no flags) | captured key only | not output |
| `-w` | full original line | not output |
| `-n` | captured key only | full line as-is (non-empty only) |
| `-wn` | full original line | full line as-is (non-empty only) |

### Sorting

| Parameter | Type | Description |
|-----------|------|-------------|
| `-a, --ascending` | flag | Sort ascending (by line/key/percentage) |
| `-d, --descending` | flag | Sort descending (by line/key/percentage) |

### Result Limiting

| Parameter | Type | Description |
|-----------|------|-------------|
| `-H, --head` | int | Output first N lines (negative: skip first N). **Special: `-H 0` outputs nothing but exit code = total count** |
| `-T, --tail` | int | Output last N lines (negative: skip last N) |
| `-J, --jump-out` | flag | Early-exit after outputting `-H` lines. **Exit code = lines actually output** (not total). Only effective when no sorting is needed — if `-pd`/`-pa` sorting is used, nin must read all data first so exit code = total key count |
| `-k, --stop-at-count` | int | Stop when item count drops below N (`-pd` descending) or exceeds N (`-pa` ascending) |
| `-K, --stop-percentage` | float | Stop when **current item's own** percentage < P% (NOT cumulative). E.g., `-K 5.0` stops at first item whose own % drops below 5%, enabling data-driven auto top-N |
| `--sum` | flag | Add cumulative count+% to each line. Format: `[count]-[cumCount]([pct]%-[cumPct]%): [key]` |

**`-J` exit code semantics — depends on whether any sorting flag is used (Validated):**

| Flags used | Requires full read? | `-H N -J` exit code | `-H N` (no `-J`) exit code |
|------------|---------------------|---------------------|---------------------------|
| `-p` (percentage sort) | Yes | Total unique key count (12) | Total unique key count (12) |
| `-a` or `-d` (sort, no `-u`) | Yes | Total matched **row** count (40) | Total matched row count (40) |
| `-u -a` or `-u -d` (sort + unique) | Yes | Total unique key count (12) | Total unique key count (12) |
| `-u` only (unique, **no sort**) | No — early exit | Lines actually output (N=5) | Total unique key count (12) |
| Plain diff/intersection (no sort) | No — early exit | Lines actually output (N=3) | Total matched line count (40) |

- **Key rule**: **Any sorting flag (`-p`, `-a`, `-d`) forces full read** — nin must collect all data before sorting, so `-J` has no early-exit effect and exit code = total count.
- **Without any sort flag** (`-u` alone, plain diff/intersection): `-J` enables true early-exit, exit code = lines actually output.
- **`-H 0`** always outputs nothing silently; exit code = total count regardless of sort mode.

**`--sum` + `-K` + `-H` combinations (Validated):**

| Command pattern | Behavior |
|----------------|----------|
| `-pd --sum` | Cumulative count+% on every line |
| `-pd --sum -H N` | Exactly N lines with cumulative — shows % coverage of top N |
| `-pd --sum -K P` | Auto top-K (own % ≥ P) with cumulative — Pareto pattern |
| `-pd --sum -K P -H N` | `-H N` acts as hard cap; whichever stops first wins |
| `-pd --sum -k N` | Stop when item count drops below N; cumulative shows coverage at threshold |
| `-pa --sum` | Ascending + cumulative — long-tail analysis (rarest first) |

### Output Format

| Parameter | Type | Description |
|-----------|------|-------------|
| `-A, --no-any-info` | flag | Suppress all info and summary |
| `-M, --no-summary` | flag | Hide summary at end |
| `-O, --out-not-0-sum` | flag | Output summary only if results > 0 |
| `-I, --info-normal-out` | flag | Output summary to **stdout** instead of stderr. This makes the summary line capturable in shell variables: `result=$(nin ... -I)` |
| `-C, --no-color` | flag | Disable color output |
| `-c, --show-command` | flag | Show command line |

### Input Control

| Parameter | Type | Description |
|-----------|------|-------------|
| `-Y, --not-from-pipe` | flag | Force reading from files, not pipe |
| `-Z, --skip-last-empty` | flag | Skip last empty line in files |
| `--timeout` | float | Maximum execution time in seconds |

---

## Common Command Patterns

### Pattern 1: Difference Set (Not In)
```bash
nin <file1> <file2> ["<regex1>"] ["<regex2>"] [-u] [-i] [-PAC]
```
- Returns: count of lines/keys in file1 NOT in file2
- Use `-u` to deduplicate result

### Pattern 2: Intersection Set
```bash
nin <file1> <file2> ["<regex>"] -m [-u] [-i] [-PAC]
```
- Returns: count of lines/keys in BOTH files
- Use `-u` to deduplicate result

### Pattern 3: Unique Lines/Keys
```bash
nin <file> nul ["<regex>"] -u [-i] [-w] [-PAC]
```
- Returns: count of unique lines/keys
- Use `-w` to output whole lines (not just keys)

### Pattern 4: Distribution Analysis
```bash
nin <file> nul "<regex>" -pd [-H <N>] [-PAC]
```
- Returns: count of distinct keys
- `-pd` sorts by frequency descending
- `-H N` limits to top N results

### Pattern 5: Pipe Input
```bash
<command> | nin nul ["<regex>"] [-u] [-pd] [-PAC]
```
- Pipe mode (validated): use `nul`/`/dev/null` as the first positional placeholder, e.g. `<command> | nin nul "<regex>" ...`
- In pipe mode, the next positional argument is parsed as regex/options, not as a second file path.
- Returns: count of matched lines/keys

### Pattern 6: Filter with Exclusion (Structure-Preserving)
```bash
nin <file1> <exclude_file> "<regex1>" "<regex2>" -wn [-i] [-PAC] [> output_file]
```
- Returns: count of lines/keys in file1 NOT in exclude_file
- `-wn` outputs whole matched lines + all non-matched lines (comments, blank lines)
- Net effect: **removes only the excluded entries**, everything else preserved verbatim
- To update file in-place: redirect to `.tmp` then rename/move

### Pattern 7: Allowlist Filter (Structure-Preserving)
```bash
nin <file1> <allowlist_file> "<regex1>" "<regex2>" -mwn [-i] [-PAC] [> output_file]
```
- Returns: count of lines/keys in BOTH files
- `-mwn` outputs whole matched lines for intersection keys + all non-matched lines
- Net effect: **keeps only allowlisted entries**, all comments/structure preserved

---

## Parameter Combinations

> **Note**: Single-character flags can be concatenated: `-PAC` = `-P -A -C`, `-pd` = `-p -d`. Both forms are equivalent.

### For Pure Output (Scripting)
```
-PAC    # No percent, no info, no color
-PC     # No percent, no color (keeps summary)
```

### For Distribution Analysis
```
-pd     # Percentage + descending sort
-pa     # Percentage + ascending sort
-pdP    # Descending sort without showing percentages
```

### For Unique Operations
```
-u      # Unique keys only
-ui     # Unique, ignore case
-uw     # Unique, output whole lines
-uwi    # Unique, whole lines, ignore case
```

### For Set Operations
```
-um     # Unique intersection
-umw    # Unique intersection, whole lines
-uS     # Unique difference (swapped positions)
```

---

## Combined Use with msr

nin is designed to work together with msr. Common patterns:

### Structure-Preserving File Editing

nin can **edit structured text files** (hosts, inventory, config) while preserving all comments and formatting — even though nin cannot write files directly, output redirection achieves the same result.

**Key insight**: `-wn` = matched lines output as whole lines + non-matched lines output as-is → file structure fully preserved, only targeted entries removed.

#### Remove specific entries from a hosts/inventory file
```bash
# hosts-full.txt has: comments, machine lines with IP/role/status columns
# remove-list.txt has: machine names to remove (one per line)

nin hosts-full.txt remove-list.txt "^(\S+)" "^(\S+)" -wn -PAC > hosts-updated.txt
# Result: only the listed machines deleted; all comments, blank lines, other machines kept exactly

# In-place update pattern
nin hosts-full.txt remove-list.txt "^(\S+)" "^(\S+)" -wn -PAC > hosts-full.tmp
Move-Item hosts-full.tmp hosts-full.txt -Force   # PowerShell
# mv hosts-full.tmp hosts-full.txt               # Linux/macOS
```

#### Allowlist filter (keep only approved machines)
```bash
# Keep only machines in allowlist, preserve all comments
nin hosts-full.txt allowlist.txt "^(\S+)" "^(\S+)" -mwn -PAC > hosts-allowed.txt
```

#### Case-insensitive entry removal
```bash
# Remove entries regardless of name case
nin hosts-full.txt remove-list.txt "^(\S+)" "^(\S+)" -wni -PAC > hosts-updated.txt
```

#### Multi-step pipeline: remove + column filter
```bash
# Step 1: Remove decommissioned machines (nin -wn)
# Step 2: Keep only active-status lines + comments (msr)
nin hosts-full.txt decommission-list.txt "^(\S+)" "^(\S+)" -wn -PAC |
  msr -t "^\s*#|active$" -PAC > hosts-active.txt
```

#### Config file management
```bash
# Remove deprecated config keys, preserve all section headers and comments
nin app-config.ini deprecated-keys.txt "^(\w[\w.]+)\s*=" "^(\S+)" -wn -PAC > app-config.tmp
Move-Item app-config.tmp app-config.ini -Force

# Merge two configs: keep entries from base not overridden by custom
nin base-config.ini custom-config.ini "^(\w[\w.]+)\s*=" -wn -PAC > merged-config.ini
```

#### Check what would be removed (dry run with -S)
```bash
# Before actually removing, see which entries in remove-list exist in the file
nin hosts-full.txt remove-list.txt "^(\S+)" "^(\S+)" -mw -PAC
# Shows the actual lines that WOULD be deleted

# Find entries in remove-list that don't exist in the file (invalid removals)
nin hosts-full.txt remove-list.txt "^(\S+)" "^(\S+)" -S -PAC
# Returns entries in remove-list NOT found in hosts file
```

### Log Analysis Pipeline
```bash
# Sort logs by time first, then analyze error distribution
msr -rp logs/ -f "\.log$" -F "\d{4}-\d{2}-\d{2}\D\d+:\d+:\d+[\.,]?\d*" | nin nul "\.(\w+Exception)\b" -pd -O -w
```

> 📖 **More pipeline examples**: See [AI Agent Usage Guide](ai-agent-usage-guide.md) and [Use Cases and Comparisons](use-cases-and-comparisons.md) for additional msr+nin pipeline patterns.

### File Validation
```bash
# Validate downloaded files against md5.txt
md5sum msr* | msr -t "\s+\**" -o " " -PAC | nin md5.txt -m
```

### Data Extraction
```bash
# Extract and deduplicate data from search results
msr -rp . -f "\.log$" -t "user:\s*(\w+)" -PAC | nin nul "user:\s*(\w+)" -ui
```

### Root Cause Analysis
```bash
# Get exception distribution by category
msr -rp logs/pods -it "Exception|Error" | nin nul "(\w+Exception)\b" -pd -H 30

# Find unknown errors (not in known list)
nin sorted-errors.log known-exceptions.txt "(\w+Exception)" -i
```

> 📖 **More root cause analysis patterns**: See [Use Cases and Comparisons](use-cases-and-comparisons.md) for additional examples across industries.

### File Comparison Return Values
```bash
# Compare files by key - returns count of differences
nin file1.txt file2.txt "^(\S+)" -H 0
# Returns: 0 = identical, >0 = has differences

# Can be used for test validation
nin expected.txt actual.txt -H 0
if [ $? -eq 0 ]; then echo "Test passed"; fi
```

### File Type Distribution
```bash
# Get file extension distribution (combined with msr)
msr -rp <path> -l -PAC --xd -k 18 | nin nul "\.(\w+)$" -p -d

# Get folder distribution
msr -rp <path> -l -PAC --xd -k 18 | nin nul "^([^\\/]+)[\\/]" -p -d
```

### Cumulative Analysis (Pareto)
```bash
# Show cumulative totals for 80/20 analysis — fixed top N
nin <file> nul "<regex>" -pd --sum -H 20
# Useful for identifying what percentage of issues come from top N causes

# Auto top-N by significance threshold (data-driven, no need to guess N)
nin <file> nul "<regex>" -pd --sum -K 5.0
# Shows only items with >= 5% individual frequency + cumulative coverage

# Silent count for scripting (no output, use exit code)
nin <file> nul "<regex>" -p -H 0 2>nul
# Exit code = total unique key count — use in conditional logic
# e.g. PowerShell: if ($LASTEXITCODE -gt 10) { "Too many error types!" }

# Long-tail analysis (rarest first)
nin <file> nul "<regex>" -pa --sum
# Ascending order — shows how much the tail contributes cumulatively
```

> 📖 **Numeric statistics (msr feature)**: For percentile statistics (P05-P99, Median, Average, etc.) on numeric values, use msr's `-s "" -n` combination. See [msr AI Agent Reference — Sorting and Statistics](msr-ai-agent-reference.md#sorting-and-statistics).

---

## Comparison with msr

| Feature | nin | msr |
|---------|-----|-----|
| Set difference | ✓ Native | ✗ |
| Set intersection | ✓ Native | ✗ |
| Unique/dedup | ✓ Native | ✗ |
| Distribution | ✓ Native | ✗ |
| File search | ✗ | ✓ Native |
| Text replacement | ✗ | ✓ Native |
| Block matching | ✗ | ✓ Native |

**Best Practice**: Use msr for file search/replace, nin for set operations and deduplication.

> For comprehensive feature comparison tables, see [Tool Comparisons](tool-comparisons.md).

## Constraints and Limitations

1. **Unicode/BOM Encoding**: See [Tool Metadata](#tool-metadata) encoding link above. Non-ASCII file content is correctly read. nin warns for non-UTF8 BOM files; use `--not-warn-bom` (or `MSR_NOT_WARN_BOM` env var) to suppress
2. **Non-ASCII Command-line Arguments** (Chinese, Japanese, Korean, etc.):
   - **macOS/Linux** (UTF-8 terminal): Non-ASCII characters in regex arguments work correctly — Chinese text distribution, set operations with Chinese keys, and Emoji processing all fully supported (verified by automated tests on macOS). Use them directly: `nin nul "^(\S+)" -pd` on Chinese text
   - **Windows** (non-matching locale): Non-ASCII characters passed as regex arguments are converted to `?` (0x3F). This is a Windows ANSI code page limitation for native executables, not a nin bug
   - **AI Agent workaround (Windows only)**: Use English keywords/regex patterns to process files containing non-ASCII text (e.g., English regex extracts data from Chinese log files); terminal may show garbled display but file output preserves correct UTF-8
3. **Regex**:
   - If regex is omitted, nin uses whole line as key
   - If regex is provided, it must include capture group[1] `(...)`; otherwise nin returns error (-1)
4. **Order**: Preserves original order unless sorting options used (-p/-d/-a)
5. **nul vs /dev/null**: Both work on all platforms (nin normalizes them)
6. **Pipe detection**: Use `-Y` when nin incorrectly reads from pipe

## Error Handling

| Scenario | Behavior |
|----------|----------|
| File not found | Error to stderr, returns -1 |
| Invalid regex | Error to stderr, returns -1 |
| Regex provided without capture group | Error to stderr, returns -1 |
| Empty file | Returns 0 (no matches) |
| BOM file (non-UTF8) | Warning unless `--not-warn-bom` used |

## Environment Variables

nin shares 7 `MSR_*` environment variables with msr. For the complete variable mapping table, see [msr and nin Shared Reference — Environment Variables](msr-nin-shared-reference.md#environment-variables).

Shared variables: `MSR_NO_COLOR` (`-C`), `MSR_COLORS` (`--colors`), `MSR_NOT_WARN_BOM` (`--not-warn-bom`), `MSR_SKIP_LAST_EMPTY` (`-Z`), `MSR_KEEP_COLOR` (`--keep-color`), `MSR_UNIX_SLASH` (`--unix-slash`), `MSR_EXIT` (`--exit`).

> **Note**: `MSR_OUT_FULL_PATH` and `MSR_OUT_INDEX` are msr-only variables and do not apply to nin.

---

## VSCode Integration

The [vscode-msr](https://marketplace.visualstudio.com/items?itemName=qualiu.vscode-msr) extension provides pre-configured aliases wrapping msr and nin for common workflows. See:
- [vscode-msr AI Agent Reference](vscode-msr-ai-agent-reference.md) — alias parameter conventions, naming patterns, decision tree
- [Common-Alias.md](https://github.com/qualiu/vscode-msr/blob/master/Common-Alias.md) — full alias reference

## Further Resources

**Related documentation in this project:**

- [nin User Guide](nin-user-guide.md) — comprehensive human guide for nin
- [msr AI Agent Reference](msr-ai-agent-reference.md) — msr parameter reference for AI agents
- [msr and nin Shared Reference](msr-nin-shared-reference.md) — shared cross-platform behavior, encoding, and environment variable reference
- [Use Cases and Comparisons](use-cases-and-comparisons.md) — practical use cases, industry applications, and tool comparisons
- [AI Agent Usage Guide](ai-agent-usage-guide.md) — AI agent integration guide for msr, nin, and vscode-msr aliases
- [Download Links](download-links.md) — download tables for all platforms

**External links:**

- GitHub: https://github.com/qualiu/msr
- VSCode extension: https://github.com/qualiu/vscode-msr