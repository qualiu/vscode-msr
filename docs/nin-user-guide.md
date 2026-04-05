# nin User Guide

A comprehensive guide for **humans** to learn and use nin - the set operation tool for lines and keys.

## Introduction

**nin** (Not-IN) is a command-line tool that helps you:
- Find lines/keys in one file that are **not in** another file (difference set)
- Find lines/keys that are **in both** files (intersection set)
- Get **unique** lines/keys and remove duplicates
- Analyze **distribution** and percentages of keys
- Compare files or pipe input with flexible regex patterns

### Supported Platforms

Runs on **Windows**, **Linux**, **macOS**, and **FreeBSD** (multiple architectures including x86_64, Arm64). For the complete platform/architecture/version matrix, see [Download Links](download-links.md).

### Encoding and BOM Support

For encoding matrix, BOM detection behavior, and cross-platform Unicode notes, see [msr and nin Shared Reference — Encoding Support](msr-nin-shared-reference.md#encoding-support).

### Installation

nin is distributed together with msr. The easiest way is to install the [vscode-msr](https://marketplace.visualstudio.com/items?itemName=qualiu.vscode-msr) extension which auto-downloads both tools automatically.

For manual download on any platform (Windows, Linux, macOS, FreeBSD, Cygwin), see:
**→ [Download Links by Platform](download-links.md)**

Verify download integrity with md5:
```bash
md5sum nin* | msr -t "\s+\**" -o " " -PAC | nin md5.txt -m
```

## Quick Start

### Basic Difference Set

```bash
# Find lines in file1.txt that are NOT in file2.txt
nin file1.txt file2.txt

# Find keys (first word) in file1 that are NOT in file2
nin file1.txt file2.txt "^(\w+)"

# Using pipe input (single-stream analysis)
cat file1.txt | nin nul
```

### Basic Intersection Set

```bash
# Find common lines in both files
nin file1.txt file2.txt -m

# Find common keys with case-insensitive matching
nin file1.txt file2.txt "^(\w+)" -im
```

### Get Unique Lines

```bash
# Remove duplicate lines (keep original order)
nin myfile.txt nul -u

# Remove duplicates, ignore case
nin myfile.txt nul -ui

# From pipe
cat myfile.txt | nin nul -ui
```

## Key Concepts

### The nul/null File

When you only have one file, use `nul` (Windows) or `/dev/null` (Linux) as the second file:
```bash
# These are equivalent - get unique lines
nin myfile.txt nul -u
nin myfile.txt /dev/null -u   # Linux/Mac
```

> **Note**: For Windows path separator compatibility in file arguments, see [msr and nin Shared Reference — Path Separator Compatibility on Windows](msr-nin-shared-reference.md#path-separator-compatibility-on-windows).

### Regex Capture Groups

nin uses **capture group[1]** as the key for comparison:
```bash
# Extract first word as key
nin file.txt nul "^(\w+)"

# Extract email addresses
nin file.txt nul "(\w+@\w+\.\w+)"

# Extract key from key=value pairs
nin config.txt nul "^(\w+)\s*="
```

### Different Patterns for Two Files

You can use different regex patterns for each file:
```bash
# File1: "name = John", File2: "John,Smith,30"
nin file1.txt file2.txt "name = (\w+)" "^(\w+),"
```

## Common Use Cases

### 1. Finding Differences Between Files

```bash
# New items in today's list vs yesterday's
nin today.txt yesterday.txt -u

# Using regex to extract keys
nin new-data.csv old-data.csv "^([^,]+)" -ui

# Switch positions to find what's in old but not in new
nin new-data.csv old-data.csv "^([^,]+)" -uiS
```

### 2. Getting Unique Values

```bash
# Unique lines from a file
nin access.log nul -u

# Unique IPs from log file
nin access.log nul "(\d+\.\d+\.\d+\.\d+)" -u

# Unique with whole line output (not just the key)
nin access.log nul "(\d+\.\d+\.\d+\.\d+)" -uw
```

### 3. Analyzing Distribution and Top-N

#### Basic frequency distribution

```bash
# Get top 20 most frequent errors
nin error.log nul "(\w*Exception)" -pd -H 20

# Get frequency of HTTP status codes
nin access.log nul "HTTP/\d\.\d\"\s+(\d+)" -pd
```

#### `--sum`: Pareto / cumulative analysis

`--sum` adds **cumulative count and cumulative percentage** to each output line.

Output format: `[count]-[cumCount]([pct]%-[cumPct]%): [key]`

```bash
nin error.log nul "^(\w+)" -pd --sum -C
# Output:
# 10-10(25.00%-25.00%): ExceptionTypeA
#  8-18(20.00%-45.00%): ExceptionTypeB
#  6-24(15.00%-60.00%): IllegalArgumentException
#  4-28(10.00%-70.00%): OutOfMemoryError
#  3-31( 7.50%-77.50%): SocketException
#  2-33( 5.00%-82.50%): NumberFormatException
#  2-35( 5.00%-87.50%): ExceptionTypeC
# Reading: "ExceptionTypeA: 10 times (25%), cumulative 10 (25% of all)"
#          "After top 7 items: cumulative 35, covering 87.5% of all errors"
```

#### Fixed Top-N with `-H` and cumulative coverage

```bash
# Exactly top 5 errors with cumulative coverage shown
nin error.log nul "^(\w+)" -pd --sum -H 5
# Shows: top 5 items + cumulative% at each step
# e.g. top 5 = 77.5% of all errors → helps answer "what % do my top 5 cover?"

# Get count without output (-H 0) for scripting
# PowerShell/CMD:
nin error.log nul "^(\w+)" -pd -H 0 2>nul
# Bash/zsh:
nin error.log nul "^(\w+)" -pd -H 0 2>/dev/null
# Exit code = total unique key count (12), no output → use in conditionals
# e.g. PowerShell: if ($LASTEXITCODE -gt 10) { "Too many error types!" }
```

> **`-J` and sorting — critical interaction:**
> - **Any sorting flag (`-p`, `-a`, `-d`) forces full read**: nin must collect all data before sorting, so `-J` cannot early-exit. Exit code = total count (key count with `-p`/`-u`; row count with `-a`/`-d` alone).
> - **No sorting flags (`-u` alone, plain diff/intersection)**: `-J` enables true early-exit after N lines. Exit code = N (lines actually output).
> - **`-H 0`**: always outputs nothing; exit code = total count (works in all modes, useful for scripting).

#### Auto Top-N: Stop at percentage threshold with `-K`

`-K P` stops when the **current item's own percentage** drops below `P%`.
This automatically filters out the long tail without needing to guess N:

```bash
# Auto top-N: show only items with >= 5% individual frequency
nin error.log nul "^(\w+)" -pd --sum -K 5.0
# Result: 7 items shown covering 87.5% — items < 5% (long tail) suppressed

# More aggressive threshold: only top-tier items >= 7.5%
nin error.log nul "^(\w+)" -pd --sum -K 7.5
# Result: top 5 items (77.5% coverage) — clear major contributors

# Rule of thumb:
# -K 10.0 → major contributors only (>= 10% each)
# -K 5.0  → significant contributors (>= 5% each)
# -K 1.0  → meaningful contributors (>= 1% each)
```

> **`-K` vs `-H`**: `-H N` gives exactly N items; `-K P` gives a **data-driven N** based on item significance. Use `-K` when you don't know N in advance. Use `-H` when you need a fixed count (dashboards, reports).

> **`-K` + `-H` together**: `-H` acts as a hard cap. `nin ... -pd --sum -K 5.0 -H 3` shows at most 3 items (even if 7 meet the -K threshold).

#### Stop at absolute count threshold with `-k`

```bash
# Only show items appearing 3+ times (ignore rare one-off errors)
nin error.log nul "^(\w+)" -pd --sum -k 3
# Stops when item count drops below 3 → only items with count >= 3 shown
# (In this example: top 5 items, covering 77.5%)
```

#### Long-tail analysis with `-pa --sum` (ascending)

```bash
# Show rare items first — understand what the long tail looks like
nin error.log nul "^(\w+)" -pa --sum
# Ascending order: rarest first, cumulative shows how much the tail represents
# e.g. 5 items each at 2.5% = 12.5% → "long tail contributes only 12.5%, safe to ignore"
```

#### Real-world pipeline: top errors from log files

```bash
# Top exception types across all log files, auto-stop at 5%, with cumulative
msr -rp logs/ -f "\.log$" -t "(\w+Exception|\w+Error)\b" -PAC |
  nin nul "^(\w+(?:Exception|Error))" -pd --sum -K 5.0 -H 20

# Top HTTP error codes with coverage
msr -rp logs/ -f "access\.log" -PAC |
  nin nul "HTTP/\d\.\d\"\s+([45]\d\d)" -pd --sum -H 10

# Get just the count for CI/CD alerting (no output, use exit code)
nin error.log nul "^(\w+Exception)" -pd -H 0 2>nul
# Returns unique exception type count as exit code
```

> 📖 **More Pareto analysis examples**: See [Cumulative Pareto Analysis](use-cases-and-comparisons.md#cumulative-pareto-analysis) for real-world applications in log triage, capacity planning, and cost optimization.

### 4. Filtering Structured Files (Structure-Preserving)

The `-wn` flag combination filters structured files while preserving all comments and formatting. For the full explanation of `-w`, `-n`, and their interaction, see [Output Control: `-w` and `-n`](#output-control--w-and--n).

```bash
# Remove machines in remove-list from hosts file, keep all comments and structure
nin hosts-full.txt remove-list.txt "^(\S+)" "^(\S+)" -wn -PAC > hosts-updated.txt

# Keep only allowlisted machines (intersection + structure preservation)
nin hosts-full.txt allowlist.txt "^(\S+)" "^(\S+)" -mwn -PAC > hosts-allowed.txt

# Case-insensitive removal (WEB-03 matches web-03)
nin hosts-full.txt remove-list.txt "^(\S+)" "^(\S+)" -wni -PAC > hosts-updated.txt

# Multi-step pipeline: nin removes entries, msr filters by column
nin hosts.txt decommission-list.txt "^(\S+)" "^(\S+)" -wn -PAC |
msr -t "^\s*#|active$" -PAC > hosts-active-only.txt
```

### 5. File Distribution Analysis (with msr)

```bash
# Get file extension distribution (most common file types)
msr -rp . -l -PAC --xd -k 18 | nin nul "\.(\w+)$" -p -d

# Get top-level folder distribution
msr -rp . -l -PAC --xd -k 18 | nin nul "^([^\\/]+)[\\/]" -p -d

# Combined with msr for targeted analysis
msr -rp src/ -f "\.cs$" -l -PAC | nin nul "[\\/](\w+)\.cs$" -pd -H 20
```

## Key Options Explained

### Set Operations

| Option | Meaning | Example |
|--------|---------|---------|
| (default) | Difference set (not in latter) | `nin a.txt b.txt` |
| `-m` | Intersection (in both) | `nin a.txt b.txt -m` |
| `-u` | Unique (remove duplicates) | `nin a.txt nul -u` |
| `-S` | Switch file positions (swap roles) | `nin a.txt b.txt -S` |

### Output Control: `-w` and `-n`

These two flags control **what is output** for each line and are the most important output options:

#### `-w` (whole line output)

Without `-w`, nin outputs only the **captured key** (capture group[1]).
With `-w`, nin outputs the **full original line** containing the key.

```bash
# Given file with: "name = Alpha", "name = Beta", "name = Gamma"
nin file.txt nul "name = (\w+)" -PAC      # outputs: Alpha  Beta  Gamma
nin file.txt nul "name = (\w+)" -w -PAC   # outputs: name = Alpha  name = Beta  name = Gamma
```

#### `-n` (output not-captured lines)

Without `-n`, nin only outputs lines that **matched** the regex.
With `-n`, nin also outputs lines that did **not match** the regex (not-captured lines, e.g. comments, headers).

**Rules for `-n`:**
- Lines that matched → output the captured key (or whole line if `-w` used)
- Lines that did NOT match → output the whole not-captured line as-is
- Empty lines in file body → silently skipped (not output even with `-n`); however, a trailing newline at end-of-file creates an empty-line entry that participates in unique counting and sorting (use `-Z` to skip it)

```bash
# Given file:
#   # header comment
#   name = Alpha
#   name = Beta
#   ; another comment
#   name = Gamma

nin file.txt nul "name = (\w+)" -n -PAC
# outputs:
#   # header comment       ← not-captured line, output as-is
#   Alpha                  ← captured key only
#   Beta
#   ; another comment      ← not-captured line, output as-is
#   Gamma
```

#### `-w -n` combination: structure-preserving output

This combination outputs whole lines for matched entries AND passes through all non-matched lines.

- **Two-file mode + `-wn`**: structure-preserving **filter** — excludes items from file2 while preserving all comments, headers, and blank lines from file1. This is the primary use case for editing config/hosts files.
- **Single-file mode + `-wn`**: structure-preserving **pass-through** — outputs everything (no second file to diff against).

> ⚠️ **`-wn --nt` (single-file) is a no-op**: `--nt` excluded lines are demoted to not-captured, then `-n` re-outputs them as-is. Use **two-file mode** `-wn` (with exclude list file) or **`-w --nt`** (without `-n`, loses blank lines) instead.

```bash
nin file.txt nul "name = (\w+)" -wn -PAC
# outputs the complete file (all 5 non-empty lines):
#   # header comment
#   name = Alpha
#   name = Beta
#   ; another comment
#   name = Gamma

# Real use case: filter config while preserving comments and structure
nin my-config.ini exclude.txt "name = (\w+)" "(\w+)" -wn > filtered-config.ini
# Result: only excluded entries are removed, all comments and formatting preserved
```

#### `-S` (switch first — swap file roles)

`-S` swaps the roles of file1 and file2 (and their respective regex patterns).

Without `-S`: outputs keys in **file1 NOT in file2**.
With `-S`: outputs keys in **file2 NOT in file1** (effective reversal).

```bash
# config.ini has: Alpha, Beta, Gamma (+ comments)
# exclude.txt has: Alpha, BadEntry

nin config.ini exclude.txt "name = (\w+)" "(\w+)" -PAC
# outputs: Beta, Gamma   (keys in config NOT in exclude)

nin config.ini exclude.txt "name = (\w+)" "(\w+)" -S -PAC
# outputs: BadEntry      (keys in exclude NOT in config — the "bad" entries)
```

#### `-I` (info to stdout)

By default, nin's summary line goes to **stderr** (so it doesn't pollute redirected output).
With `-I`, the summary goes to **stdout** — useful when you want the summary captured in a file or variable.

```bash
# Summary goes to stderr (default) — stdout redirect captures only data
nin error.log nul "(\w+Exception)" -pd -H 30 > report.txt
# report.txt has only data; summary appears on terminal

# Summary goes to stdout (-I) — both data and summary captured
nin error.log nul "(\w+Exception)" -pd -H 30 -I > report.txt
# report.txt has data + summary line

# Suppress stderr warnings while keeping stdout output
nin file.txt nul "(\w+)" -pd 2>nul
# Only warnings go to stderr; summary goes to stderr too (unless -I used)
```

### Other Output Options

| Option | Meaning | Example |
|--------|---------|---------|
| `-p` | Show percentages | `-pd` |
| `-P` | Hide percentages | `-pdP` |
| `-a` | Ascending sort | `-pa` |
| `-d` | Descending sort | `-pd` |

### Filtering

| Option | Meaning | Example |
|--------|---------|---------|
| `-i` | Ignore case | `-ui` |
| `-t <regex>` | Keep only matched output lines matching regex (AND with `-x`) | `-t "Error"` |
| `-x <text>` | Keep only matched output lines containing plain text (AND with `-t`) | `-x "Failed"` |
| `--nt <regex>` | Exclude matched output lines matching regex | `--nt "debug\|trace"` |
| `--nx <text>` | Exclude matched output lines containing plain text | `--nx "maintenance"` |
| `--enhance <regex>` | Color highlight only — **never filters lines** | `--enhance "\d+"` |
| `-H N` | Output first N lines | `-H 20` |
| `-T N` | Output last N lines | `-T 10` |
| `-k N` | Stop when item count drops below N (descending `-pd`) or exceeds N (ascending `-pa`) | `-pd -k 5` |
| `-K P` | Stop when **current item's** percentage < P% (per-item, NOT cumulative) | `-pd -K 10.0` |

> **`-t` vs `--enhance`**: `-t` and `-x` filter which lines appear in output. `--enhance` (short: `-e`) only adds color and never removes lines.
> When both `-t` and `-e` are used, nin colors using the merged regex `(-t)|-e` — so both patterns are highlighted.

> **What do `-t`/`-x`/`--nt`/`--nx` filter against?**
> - **Normal mode (no `-n`)**: filters against the **full original line**
> - **Without `-w`**: output still shows captured key only
> - **With `-w`**: output shows whole line
> - **With `-n`**: also output not-captured lines (comments, headers)
> - **With `-w -n`**: output matched whole lines plus not-captured lines
> - **Key distinction**: `-w` changes **output form** (key vs whole line), not the normal-mode filter target

```bash
# Filter by machine name prefix (--nt matches against FULL original line, not captured key)
nin hosts.txt nul "^(\S+)" --nt "^web-" -PAC
# Removes lines starting with web- (^web- matches full line start)
# NOTE: --nt "^db-old$" would NOT work because $ doesn't match mid-line;
# use --nt "^db-old\b" or --nt "^db-old\s" instead

# Filter by STATUS COLUMN (status text is in the full line, not captured key)
nin hosts.txt nul "^(\S+)" -w --nt "maintenance|decommission" -PAC
# Removes lines containing 'maintenance' or 'decommission' anywhere in the line
# Comments survive (captured as '#'), blank lines lost (no -n)
```

### For Clean Output

| Option | Meaning |
|--------|---------|
| `-PAC` | Pure output: no percent, no info, no color |
| `-PC` | No percent, no color (keeps summary) |
| `-M` | No summary |
| `-A` | No any info |
| `-I` | Route summary to stdout (default: stderr) |
| `--colors` | Set fore/back colors for `-t`/`-e`/`-x` and summary (see [Color Customization](msr-nin-shared-reference.md#color-customization)) |
| `--keep-color` | Preserve ANSI colors when piping (Windows/MinGW) |
| `--unix-slash 1` | Output forward slash `/` on Windows/MinGW/Cygwin |
| `--not-warn-bom` | Suppress BOM encoding warnings for non-UTF8 BOM files |
| `--to-stderr` | Output result to stderr instead of stdout |
| `--verbose` | Show parsed arguments, return value, time zone, BOM info, etc. |

## Tips and Best Practices

### Preserve Original Order
nin keeps original line order by default (unless you use sorting options):
```bash
# Unique lines in original order
nin file.txt nul -u

# Unique lines sorted by frequency
nin file.txt nul -u -pd
```

### Combine with msr
nin works great with msr for complex data processing:
```bash
# Extract unique paths from PATH variable
msr -z "%PATH%;" -t "\\*?\s*;\s*" -o "\n" -aPAC | nin nul "(\S+.+)" -ui

# Find duplicate paths with top 5 frequency
msr -z "%PATH%;" -t "\\*?\s*;\s*" -o "\n" -aPAC | nin nul "(\S+.+)" -iupd -H 5
```

### Sort Logs by Time then Analyze with nin

See the complete example in [Common Use Cases — File Distribution Analysis (with msr)](#5-file-distribution-analysis-with-msr).

### Root Cause Analysis Pattern

See the complete example in [Common Use Cases — Analyzing Distribution and Top-N](#3-analyzing-distribution-and-top-n).

### File Comparison and Validation

See [Return Values](#return-values) for shell-safe conditional examples.

### Distribution with Cumulative Totals

See [Common Use Cases — `--sum`: Pareto / cumulative analysis](#--sum-pareto--cumulative-analysis).

### Code Analysis Patterns

```bash
# Check useless imports in PowerShell scripts
msr -rp . -f "\.psm?1$" -t "^\s*Import-Module\s+(.+\.psm1)" -C -I -W | nin nul "Import-Module\s+(\S+)" -pd

# Check TypeScript imports for circular dependencies
msr -p file.ts -t "^\s*import\s+.*?from\s+'(\./.+?)';\s*$" -o "\1" -PAC

# Extract unique function/method calls
msr -rp . -f "\.cs$" -t "\.(\w+)\s*\(" -PAC | nin nul "(\w+)" -pd -H 50
```

### Using Different Regex for Different Files
```bash
# File1 has "name = John", File2 has "John,Smith,30"
nin users.txt data.csv "name = (\w+)" "^(\w+),"

# Compare log errors vs known error list
nin error.log known-errors.txt "Error:\s*(\S+)" "^(\S+)$"
```

### Export Reports
```bash
# Save distribution report with summary
# -I sends summary line to stdout (not stderr), so it's captured in the redirect
nin error.log nul "(\w*Exception)" -pd -H 30 -I > error-report.txt

# Save just the data without extra info
nin error.log nul "(\w*Exception)" -pd -H 30 -PAC > errors-only.txt
```

## Return Values

nin returns useful values for scripts:

| Scenario | Return Value |
|----------|--------------|
| Default mode | Count of lines/keys in file1 NOT in file2 |
| With `-m` | Count of lines/keys in BOTH files |
| No matches | 0 |
| Error occurred | -1 (usually 255 on Linux/macOS, 127 on MinGW — not guaranteed) |

> **Note**: The -1 error code is truncated by shells to 8 bits (255) or 7 bits (127 on some MinGW). The exact value depends on your shell environment.

> **Cross-platform exit code truncation**: On non-Windows platforms, exit codes are truncated (8-bit max 255 on Linux/macOS; 7-bit max 127 on some MinGW), which can cause counts to wrap to 0. Use `--exit gt255-to-255` to cap values, or parse the summary line for exact large counts. See [Return Value Cross-Platform Behavior](msr-nin-shared-reference.md#return-value-cross-platform-behavior) for full details.

```bash
# Bash/zsh: check if files differ
nin file1.txt file2.txt "^(\S+)" -H 0
if [ $? -eq 0 ]; then echo "Files have same keys"; fi

# PowerShell:
# nin expected.txt actual.txt -H 0
# if ($LASTEXITCODE -eq 0) { "Test passed" } else { "Found $LASTEXITCODE differences" }

# CMD:
# nin expected.txt actual.txt -H 0
# if %ERRORLEVEL% EQU 0 (echo Test passed) else (echo Found %ERRORLEVEL% differences)
```

## Troubleshooting

### No Output?
- Check if files exist and have content
- Verify your regex pattern captures what you expect
- Test pattern with simpler file first
- Add `-c` to see the command line

### Unexpected Results?
- Use `-c` to see the command being executed
- Test regex capture with: `msr -z "test line" -t "\byourPattern\b"`
- Remember: capture group[1] is used as the key, not group[0]
- If no capture group, whole line is used as key

### Working with Pipes?
- Use `-Y` if nin incorrectly reads from pipe
- Recommended pipe form for single-stream analysis: `... | nin nul "(\w+)" -pd`
- If you need to compare pipe input against a second file: `... | nin file2.txt "(\w+)"`

### Encoding Support

nin supports 8 encoding types with BOM auto-detection (same as msr). For the complete encoding matrix, BOM detection details, non-ASCII/Unicode handling, and platform-specific behavior, see [msr and nin Shared Reference — Encoding Support](msr-nin-shared-reference.md#encoding-support).

**Quick tips**:
- BOM files are automatically detected; use `--not-warn-bom` to suppress warnings
- **macOS/Linux**: Non-ASCII characters (Chinese, Japanese, Korean, Emoji, etc.) in regex arguments work correctly — the terminal uses UTF-8 natively
- **Windows**: Non-ASCII characters in command-line arguments may be affected by terminal encoding (ANSI code page). On non-matching locale, use English patterns as workaround

## Environment Variables

nin shares 7 `MSR_*` environment variables with msr (`MSR_NO_COLOR`, `MSR_COLORS`, `MSR_NOT_WARN_BOM`, `MSR_SKIP_LAST_EMPTY`, `MSR_KEEP_COLOR`, `MSR_UNIX_SLASH`, `MSR_EXIT`). For the complete variable-to-parameter mapping table and usage examples, see [msr and nin Shared Reference — Environment Variables](msr-nin-shared-reference.md#environment-variables).

```bash
# Example: suppress BOM warnings and disable color for all nin/msr commands in a script
export MSR_NOT_WARN_BOM=1
export MSR_NO_COLOR=1
```

> **Tip**: Set these **temporarily** (per script or session), not globally — global presets can cause unexpected behavior on other machines.

## Comparison with msr

| Operation | Use nin | Use msr |
|-----------|---------|---------|
| Set difference | ✓ | |
| Set intersection | ✓ | |
| Unique/dedup | ✓ | |
| Distribution stats | ✓ | |
| File search | | ✓ |
| Text replacement | | ✓ |
| Block matching | | ✓ |
| Execute commands | | ✓ |

**Best Practice**: Use msr for searching and replacing in files, use nin for set operations and distribution analysis.

> 📖 **Detailed tool comparisons**: See [Tool Comparisons](tool-comparisons.md) for comprehensive feature tables (msr vs grep/ripgrep/sed, nin vs comm/uniq/sort, and more).

## VSCode Integration

The [vscode-msr](https://marketplace.visualstudio.com/items?itemName=qualiu.vscode-msr) extension provides ready-to-use aliases that combine msr and nin for common tasks. See:
- [vscode-msr User Guide](vscode-msr-user-guide.md) — alias usage guide for humans
- [vscode-msr AI Agent Reference](vscode-msr-ai-agent-reference.md) — alias reference for AI agents

## Further Resources

**Related documentation in this project:**

- [nin AI Agent Reference](nin-ai-agent-reference.md) — technical parameter reference for AI agents
- [msr User Guide](msr-user-guide.md) — text search and replace with msr
- [msr AI Agent Reference](msr-ai-agent-reference.md) — msr parameter reference for AI agents
- [vscode-msr User Guide](vscode-msr-user-guide.md) — alias usage guide for humans
- [vscode-msr AI Agent Reference](vscode-msr-ai-agent-reference.md) — alias reference for AI agents
- [Use Cases and Comparisons](use-cases-and-comparisons.md) — practical use cases, industry applications, and tool comparisons
- [AI Agent Usage Guide](ai-agent-usage-guide.md) — AI agent integration guide for msr, nin, and vscode-msr aliases
- [Download Links](download-links.md) — download tables for all platforms

**External links:**

- GitHub: https://github.com/qualiu/msr
- More tools: https://github.com/qualiu/msrTools
- VSCode extension: https://github.com/qualiu/vscode-msr
- Usage screenshots: https://qualiu.github.io/msr/usage-by-running/nin-Windows.html