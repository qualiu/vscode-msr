# msr and nin Shared Reference

Shared reference for **msr** and **nin** — both tools come from the [same repository](https://github.com/qualiu/msr) and share the same regex engine, environment variables, encoding support, color system, and cross-platform exit code behavior.

> **See also:** [msr User Guide](msr-user-guide.md) | [nin User Guide](nin-user-guide.md) | [msr AI Agent Reference](msr-ai-agent-reference.md) | [nin AI Agent Reference](nin-ai-agent-reference.md) | [AI Agent Usage Guide](ai-agent-usage-guide.md)

---

## Parameter Usage Rules

**All** msr/nin parameters (both short flags and long options) can only be specified **once** per command line. Duplicating any parameter causes an error: `cannot be specified more than once`.

This rule applies not only to direct `msr`/`nin` commands, but also to their wrappers — `gfind-*` / `find-*` aliases and script files — which already have built-in parameters.

**Key rules:**
- `-t` (regex match), `-x` (plain text match), `--nt` (regex exclude), and `--nx` (text exclude) — these 4 can be used **together** in the same command (AND combination filtering), but each can only appear **once**.
- `gfind-*` / `find-*` aliases have built-in parameters (e.g., `-I`, `-f`, `--nd`). Do **not** repeat these when appending extra arguments.
- Common mistakes: using `-PIC` with aliases (already has `-I`) → use `-PC` instead; adding `-f` to `find-py` (already has `-f` built-in) → not allowed.

## Regex Syntax

Both msr and nin use the **same regex engine** — Boost regex (PCRE-compatible with extensions). All regex features behave identically between the two tools.

**Supported features (22/23)**: lookahead/lookbehind, backreferences, named groups `(?<name>...)`, atomic groups, conditional patterns, recursive patterns `(?R)`, Unicode properties `\p{L}`, possessive quantifiers, and more. See [Regex Feature Comparison](tool-comparisons.md#regex-feature-comparison) for detailed comparison with grep/ripgrep.

### Key Considerations

- **Capture group references** in `-o` replacement: prefer `\1`/`\2` (works safely in all shells) over `$1`/`$2` (may conflict with shell variable expansion in PowerShell, bash, and Doskey macros).
- **Named group syntax**: use `(?<name>...)` (PCRE/.NET style), NOT `(?P<name>...)` (Python style). The latter causes an error (exit=-1) in both msr and nin.
- **Single-line mode** (`-S`): treats input as single string; `^`/`$` match start/end of entire content instead of individual lines.

---

## Path Separator Compatibility on Windows

Both `msr` and `nin` accept **both** path separators on Windows input paths:

- Relative paths: `docs/file.md` and `docs\file.md`
- Absolute paths: `C:/repo/docs/file.md` and `C:\repo\docs\file.md`

For `msr`, comma-separated multi-path input in `-p` also supports mixed separators in one command:

```bash
msr -p "C:/repo/docs/a.md,C:\repo\docs\b.md" -t "\bTargetSymbol\b" -l
```

Why this is useful:

- Easier cross-platform script reuse (Windows/Linux/macOS examples look consistent)
- Fewer escaping issues in JSON/regex-heavy command templates
- Less path normalization logic needed in automation and AI-generated commands

---

## PowerShell Pipe Character in Arguments

When calling `.cmd` scripts (including `gfind-*`, `find-*` aliases) from **PowerShell** on Windows, any command-line argument containing `|` can be misinterpreted as a pipe operator by CMD. This affects any `.cmd` file invocation, not just msr/nin.

**Two workarounds:**

```bash
# Method 1: Use --% stop-parsing token (recommended, simpler)
gfind-ts --% -t "\bClassA\b|\bClassB\b" -H 10
gfind-ts --% -t "\bClassA\b" --nt "\bget(X|Y)\b" -H 10
find-cs --% -t "\bTODO\b|\bFIXME\b" -o "RESOLVED" -j

# Method 2: Wrap entire command with cmd /c and escape inner quotes with ""
cmd /c "gfind-ts -t ""ClassA|ClassB"" -H 10"
```

> **Rule**: On Windows PowerShell, if a `gfind-*` / `find-*` command line contains `|` anywhere, prefer adding `--%` immediately after the alias name.
>
> **Note**: This only affects PowerShell calling `.cmd` files. CMD terminals (doskeys), Linux/macOS shells, and bash terminals are not affected in the same default way.

## Return Value Cross-Platform Behavior

Both msr and nin share similar exit code behavior. This section covers **normal return values** (no errors) and **error return values**, with platform differences highlighted.

> **Note**: The return values described below are **default behavior**. They can be modified by `--exit` parameter or `MSR_EXIT` environment variable (see [Exit Code Control](#exit-code-control---exit--msr_exit)).

### Normal Return Values (No Errors)

When no errors occur, both msr and nin return a **count** based on the options used:

| Options | Return Value | Notes |
|---------|--------------|-------|
| `-t` (regex) | Matched line count | Primary search mode |
| `-x` (plain text) | Matched line count | Substring match |
| `-e` (highlight only) | Total line count | `-e` only affects highlighting, not filtering |
| `-l` (list files only) | **File count** | |
| `-l` + `-t`/`-x` | **Matched line count** | Despite showing files, return = line count |
| `-z` + `-t`/`-e` | 0 or 1 | Binary pass/fail in string mode |

> **Note**: `-H N` alone affects display only, not return value. `-H N -J` (jump-out) causes early exit for both msr and nin — return value = N (lines actually output), not total count. For nin, sort flags (`-p`/`-d`/`-a`) force a full read, nullifying `-J`'s early exit (return value = total count). Trailing newline is counted as an empty line.

**Platform Difference — Exit Code Bit Width:**

| Platform | Bit Width | Value Range | Count > 255 |
|----------|-----------|-------------|-------------|
| **Windows** | 32-bit | -2³¹ to 2³¹-1 | Exact value preserved |
| **macOS/Linux** | 8-bit | 0–255 | `count & 0xFF` (wraps) |
| **MinGW bash** | 7-bit | 0–127 | `count & 0x7F` |

⚠️ **macOS/Linux truncation causes false negatives** when `count % 256 == 0` (e.g., 256→0, 512→0).

### Error Return Values

msr and nin have **different** error handling behavior:

| Tool | Error Handling | Notes |
|------|----------------|-------|
| **msr** | "Matches win over errors" | If matches found + errors exist → returns **Count** |
| **nin** | "Errors abort" | Any error → returns **-1** immediately |

**Platform Comparison — Error Return Values:**

| Scenario | msr Windows | msr macOS/Linux | nin Windows | nin macOS/Linux |
|----------|-------------|-----------------|-------------|-----------------|
| Single file error | -1 | 255 | -1 | 255 |
| Multiple errors (N files) | **-N** | 255 | -1 | 255 |
| Partial errors + matches | **Count** ✅ | **Count** ✅ | **-1** | 255 |
| Invalid regex | -1 | 255 | -1 | 255 |

> Windows preserves full negative values (e.g., -2, -3); macOS/Linux truncates all to 255.

**Error Priority Rules:**

| Priority | Condition | msr | nin |
|----------|-----------|-----|-----|
| 1 (highest) | Invalid regex | -1 | -1 |
| 2 | Count > 0 + errors | **Count** (matches win) | **-1** (abort) |
| 3 | Count = 0 + all files error | **-ErrorCount** (Win) / -1 (mac) | -1 |
| 4 | Count = 0 + partial errors | **-1** | -1 |
| 5 | No errors, no matches | 0 | 0 |

### Platform Differences Summary

| Aspect | Windows | macOS/Linux |
|--------|---------|-------------|
| Exit code width | 32-bit (full) | 8-bit (0–255) |
| Count > 255 | Exact value | `count & 0xFF` |
| Error value -1 | **-1** | **255** |
| msr multi-error | **-N** (e.g., -2, -3) | **255** (always) |
| nin error | **-1** | **255** |

### Safe Patterns for All Platforms

| Use Case | Command Pattern | Why Safe |
|----------|----------------|----------|
| Existence check | `-H 1 -J` | Returns 0 or 1 only |
| Threshold check (< 256) | Standard commands | Count < 256 = no truncation |
| Threshold check (any count) | `--exit gt255-to-255` | Caps to 255, safe for `$? -gt 0` checks |
| Exact large count | Parse stderr summary | Summary always shows exact count |
| Cross-platform error check | Check for 255 (macOS) or -1 (Windows) | Handle both platforms |

### Cross-Platform Compatibility

**For threshold checks**: use `--exit gt255-to-255` (or `gt127-to-127` for MinGW) to cap values instead of wrap-around. Capped values are safe for threshold comparisons.

**For exact large counts**: parse the summary line instead of relying on return value. **Do not use `-M`** (which suppresses summary). The summary goes to **stderr** by default — capture from stderr, or use `-I` (nin) to redirect summary to stdout.

**Important**: Return value > 0 means matches/results found, NOT an error.

### Exit Code Control (`--exit` / `MSR_EXIT`)

Use the `--exit` parameter or `MSR_EXIT` environment variable for cross-platform compatibility:

| Pattern | Description | Use Case |
|---------|-------------|----------|
| `gt255-to-255` | Cap return > 255 to 255 | Cygwin/Linux/macOS shell |
| `gt127-to-127` | Cap return > 127 to 127 | MinGW on Windows |
| `gt0-to-0,le0-to-1` | Invert to traditional style | If used to 0=found pattern |

> **Priority**: Command-line `--exit` parameter overrides `MSR_EXIT` environment variable. This allows setting a global default while overriding for specific commands.

**Recommendation by platform:**
- **macOS/Linux users**: Consider setting `MSR_EXIT=gt255-to-255` in shell profile (`.bashrc`/`.zshrc`) to avoid false negatives from count wrap-around
- **Windows users**: Usually not needed — return values are already full 32-bit
- **Cross-platform scripts**: Set `MSR_EXIT` at the start of the script for consistent behavior

---

## Encoding Support

Both msr and nin support reading and searching all common encodings (8 types with BOM auto-detection):

| Encoding | BOM Bytes | Search | Replace | Notes |
|----------|-----------|--------|---------|-------|
| ASCII | None | ✅ | ✅ | Direct support |
| UTF-8 no BOM | None | ✅ | ✅ | Direct support (most common) |
| UTF-8 with BOM | `EF BB BF` | ✅ | ✅ | BOM preserved after replace |
| UTF-16 LE | `FF FE` | ✅ | ⚠️ `--force` | Converts to UTF-8 no BOM |
| UTF-16 BE | `FE FF` | ✅ | ⚠️ `--force` | Converts to UTF-8 no BOM |
| UTF-32 LE | `FF FE 00 00` | ✅ | ⚠️ `--force` | Converts to UTF-8 no BOM |
| UTF-32 BE | `00 00 FE FF` | ✅ | ⚠️ `--force` | Converts to UTF-8 no BOM |
| UTF-7 | `2B 2F 76` | ✅ | ✅ | Deprecated but supported |

### BOM Auto-Detection

Both msr and nin automatically detect BOM encoding and report it:

```bash
# msr: Search UTF-16 file (shows BOM warning with type)
msr -p file.txt -x "text"
# Output: WARN BOM Encoding = UTF-16(LE) 0xFFFE , File = ...

# nin: Also shows BOM warnings
nin bom-file.txt nul "(\w+)" -pd
# Output: WARN BOM Encoding = UTF-16(LE) 0xFFFE for file: bom-file.txt

# Suppress BOM warnings (works for both msr and nin)
msr -rp . -f "\.txt$" -t "\bTargetSymbol\b" --not-warn-bom
nin file.txt nul "(\w+)" --not-warn-bom
```

**BOM Detection Output Examples**:
- `UTF-16(LE) 0xFFFE` - Little Endian UTF-16
- `UTF-16(BE) 0xFEFF` - Big Endian UTF-16
- `UTF-32(BE) 0x0000FEFF` - Big Endian UTF-32
- UTF-8 with BOM - No warning (silently handled)

### BOM File Replacement (msr only)

nin only reads files (no replacement capability), so BOM replacement is msr-specific:

```bash
# Replace in UTF-16 files requires --force
# WARNING: This converts file encoding to UTF-8 no BOM!
msr -rp . -f "\.cs$" -t "\bOldSymbol\b" -o "NewSymbol" -R --force

# Recommended: Backup original files when using --force
msr -rp . -f "\.cs$" -t "\bOldSymbol\b" -o "NewSymbol" -RK --force
```

**Important Behavior**:
- **Search** (msr and nin): Works on all BOM types, shows warning (suppressible with `--not-warn-bom`)
- **Replace without `--force`** (msr only): Skips non-UTF8 BOM files with warning "Skip replacing BOM file"
- **Replace with `--force`** (msr only): Replaces content but **converts encoding to UTF-8 no BOM**
- **UTF-8 with BOM**: Only encoding that preserves BOM header after replacement
- Use `-K` to backup original files if encoding preservation matters

### Non-ASCII / Chinese / Unicode in Command-Line Arguments

Non-ASCII text (Chinese, Japanese, Korean, Emoji, etc.) in command-line arguments works the same way for both msr and nin:

| Platform | Non-ASCII in arguments | Notes |
|----------|------------------------|-------|
| **macOS** (UTF-8 terminal) | ✅ Full support | Native UTF-8 — no encoding conversion issues |
| **Linux** (UTF-8 locale) | ✅ Full support | Same as macOS |
| **Windows** (matching locale) | ✅ Works | e.g., Chinese locale + Chinese characters |
| **Windows** (non-matching locale) | ⚠️ Converted to `?` (0x3F) | ANSI code page limitation; use English patterns as workaround |

**macOS/Linux verified capabilities** (45 automated tests on msr, all passed; nin shares same behavior):
- Chinese plain text search (`-x "服务器"`) and regex search (`-t "用户名=\S+"`) ✅
- Chinese text replacement with capture groups (`-t "(用户名=)(\S+)" -o "\1【\2】"`) ✅ (msr)
- Chinese distribution analysis (`nin nul "^(\S+)" -pd` on Chinese text) ✅ (nin)
- Emoji search and replace (`-x "⚠️" -o "🔔"`) ✅
- Japanese, Korean, Arabic text search ✅
- Chinese file name filtering (`-f "测试"`) ✅ (msr)
- Block matching with Chinese begin/end patterns (`-b "^<服务器>" -Q "^</服务器>"`) ✅ (msr)
- `-z` string input with Chinese capture group operations ✅ (msr)

> **UTF-16 output limitation** (both msr and nin): When reading UTF-16 LE/BE files, msr/nin strip `\x00` null bytes internally instead of performing full UTF-16→UTF-8 transcoding. ASCII characters display correctly (stripping `\x00` from `H\x00` yields `H`), but non-ASCII characters (e.g., Chinese 你 = UTF-16 LE `60 4F`) are output as raw UTF-16 bytes (`60 4F`) instead of valid UTF-8 (`E4 BD A0`), causing garbled display. **Match counts are always accurate** — this is output encoding only. This behavior is consistent across all platforms (macOS, Linux, Windows).

---

## Environment Variables

Both msr and nin use the same `MSR_*` environment variables to preset default parameter values. Set them **temporarily** (per script/session), not globally — global presets can cause unexpected behavior on other machines.

### Shared Variables (msr and nin)

| Variable | Maps To | Description |
|----------|---------|-------------|
| `MSR_NO_COLOR` | `-C, --no-color` | Disable color output |
| `MSR_COLORS` | `--colors` | Set color groups (e.g., `"Green,t=Red+Blue_Yellow"`) |
| `MSR_NOT_WARN_BOM` | `--not-warn-bom` | Suppress BOM encoding warnings |
| `MSR_SKIP_LAST_EMPTY` | `-Z, --skip-last-empty` | Skip last empty line |
| `MSR_KEEP_COLOR` | `--keep-color` | Keep color in pipe/file output (Windows) |
| `MSR_UNIX_SLASH` | `--unix-slash` | Output forward slash `\` → `/` on Windows |
| `MSR_EXIT` | `--exit` | Exit code control (e.g., `"gt255-to-255"` for Linux/macOS) |

### msr-only Variables

| Variable | Maps To | Description |
|----------|---------|-------------|
| `MSR_OUT_FULL_PATH` | `-W, --out-full-path` | Output absolute paths |
| `MSR_OUT_INDEX` | `--out-index` | Output column/line index |

### Usage Examples

```bash
# Suppress BOM warnings and disable color for all msr/nin commands in a script
export MSR_NOT_WARN_BOM=1
export MSR_NO_COLOR=1

# Force forward slash on Windows
export MSR_UNIX_SLASH=1

# Cap exit codes for Linux/macOS shell safety
export MSR_EXIT="gt255-to-255"
```

> **Note**: Setting global MSR_XXX environment variables is not recommended as it may cause issues on other machines. Set them temporarily in scripts or command lines.

---

## Parameter Semantic Differences

While msr and nin share the same regex engine and many parameters, a few single-character flags have **different meanings** between the two tools:

| Flag | msr Meaning | nin Meaning | Impact |
|------|-------------|-------------|--------|
| `-P` | `--no-path-line` — hide file path and line number prefix | `--no-percent` — hide percentage numbers | Different output fields hidden |
| `-I` | `--no-extra` — suppress extra info/warnings (keeps summary on stderr) | `--info-normal-out` — redirect summary from stderr to **stdout** | **Opposite direction**: msr suppresses, nin redirects |
| `-A` | `--no-any-info` — suppress ALL info including summary | `--no-any-info` — suppress ALL info including summary | Same meaning ✅ |
| `-M` | `--no-summary` — suppress summary only | `--no-summary` — suppress summary only | Same meaning ✅ |
| `-C` | `--no-color` — disable color output | `--no-color` — disable color output | Same meaning ✅ |
| `-a` | `--out-all` — output all lines including non-matches | `--ascending` — ascending sort | Completely different ⚠️ |
| `-w` | `--read-paths` — read file list from a text file | `--out-whole-line` — output whole line instead of key | Completely different ⚠️ |
| `-n` | `--sort-as-number` — numeric sort | `--out-not-captured` — also output non-matching lines | Completely different ⚠️ |
| `-m` | `--show-count` — prefix match count to each line | `--intersection` — intersection set mode | Completely different ⚠️ |

> ⚠️ **Critical for piping msr → nin**: When piping msr output to nin, use `-PIC` on msr (not `-PAC`) to keep summary on stderr for diagnostics. For aliases (which already include `-I`), use `-PC` instead.
>
> ⚠️ **`-PAC` means different things**: msr `-PAC` = no path, no info, no color; nin `-PAC` = no percent, no info, no color. Both produce "clean output" but strip different fields.

---

## Color Customization

Both msr and nin support color customization using `--colors` or environment variable `MSR_COLORS`:

**Color syntax:**

```
--colors "TARGET=FORE+BACK_FORE2, TARGET2=COLOR"
```

| Target | Description | msr | nin |
|--------|-------------|-----|-----|
| (none) | No target prefix — sets default color for **all** text groups (`t`/`x`/`e`) at once | ✅ | ✅ |
| `t` | `-t` regex match | ✅ | ✅ |
| `x` | `-x` plain text match | ✅ | ✅ |
| `e` | `-e` extra highlight | ✅ | ✅ |
| `d` | Directory component of file paths | ✅ | ❌ |
| `f` | Filename component of file paths | ✅ | ❌ |
| `p` | Full path — shorthand that sets **both** `d` and `f` together | ✅ | ❌ |
| `m` | Summary color when results **found** (matched) | ✅ | ✅ |
| `u` | Summary color when **no results** (unmatched) | ✅ | ✅ |

**Available colors** (case-insensitive):
- `Black`, `Red`, `Green`, `Yellow`, `Blue`, `Magenta`, `Cyan`, `White`, `None`
- `None` removes color for a specific group (output without any color)

**Color format (all verified by test):**
- Single color: `Red` — foreground only
- Foreground + Background: `Red_Blue` — red text on blue background (verified: `91;44m`)
- Alternating: `Red+Green+Yellow` — colors assigned per **capture group** (requires capture groups)

**Alternating colors require capture groups:**

| Pattern Type | Example | Color Behavior |
|--------------|---------|----------------|
| No capture groups | `-t "\w+"` | Only first color used, no alternation |
| Parallel groups | `-t "(\w)(\w)(\w)"` | Group 1→Color 1, Group 2→Color 2, etc. |
| Nested groups | `-t "((\w)(\w))"` | Inner groups override outer at overlapping positions |
| With fg+bg | `Red_Yellow+Green_Blue` | Each color in alternation can include foreground+background |

**Platform-specific default colors (differ between Windows and Linux):**

| Group | Windows Default | Linux Default |
|-------|----------------|---------------|
| `-x` (plain text) | `Yellow` | `Yellow` |
| `-t` (regex groups) | `Red_Black + White_Red + Red_Yellow + White_Magenta` | `Red_Black + Yellow_Red + White_Magenta + Cyan_Red` |
| `-e` (extra) | `Green_Black + White_Blue + Black_Cyan + Magenta_Black + Black_White + Yellow_Black` | `Green_Black + White_Blue + Yellow_Blue + Magenta_Black + Black_White + Yellow_Black` |

> Regex `-t` and `-e` use **color arrays** — each captured group gets a different color in the alternation list.

```bash
# No target prefix: set all text groups (t/x/e) to Green
msr -rp . -f "\.cs$" -t "\berror\b" -e "\d+" -x "warn" --colors "Green"

# Basic: color -t matches in red (verified: 91m)
msr -rp . -f "\.cs$" -t "\berror\b" --colors "t=Red"

# Foreground + background: red text on yellow background (verified: 91;43m)
msr -p file.txt -t "\berror\b" -e "\d+" --colors "t=Red_Yellow,e=Green"

# Parallel capture groups — each group gets one color (verified)
msr -z "abcd" -t "(\w)(\w)(\w)(\w)" --colors "t=Red+Green+Yellow+Blue"
# Result: a=Green(92), b=Yellow(93), c=Blue(94), d=Red(91)

# Nested capture groups — inner groups take precedence (verified)
msr -z "abcd" -t "((\w)(\w))" --colors "t=Red+Green+Yellow+Blue"
# Result: a=Yellow(93), b=Blue(94), c=Yellow(93), d=Blue(94)

# Alternating with foreground+background (verified)
msr -z "ab cd" -t "(\w)(\w)" --colors "t=Red_Yellow+Green_Blue"
# Group 1: Green(92) on Blue(44); Group 2: Red(91) on Yellow(43)

# Color paths: d=directory, f=filename (verified)
msr -rp . -f "\.log$" -t "\bERROR\b" --colors "d=Cyan,f=Yellow,m=Green"
# Directory=Cyan(96), Filename=Bold Yellow(1;93), Summary=Green

# p= sets both d and f together
msr -rp . -f "\.log$" -l --colors "p=Green_Blue"
# Entire path colored with Green foreground on Blue background

# Remove color for specific groups with None
msr -rp . -f "\.log$" -t "\bERROR\b" --colors "t=None"
# -t matches output without color; other groups keep defaults

# Remove summary color
msr -rp . -f "\.log$" -t "\bERROR\b" --colors "m=None,u=None"

# Environment variable (persistent)
export MSR_COLORS="t=Red,e=Green,d=Cyan"
msr -rp . -f "\.log$" -t "\berror\b" -e "\d+"
```

> **Note**: Targets marked ❌ for nin are msr-only — nin does not search files, so path-related color targets (`d`/`f`/`p`) don't apply.

### Platform-Dependent Color Behavior

**Platform-dependent color behavior (critical for scripts):**

Both msr and nin handle ANSI color codes **differently** on Windows vs Unix-like systems:

| Platform | Terminal Display | Pipe/Redirect to File |
|----------|------------------|----------------------|
| **Windows (CMD/PowerShell/MinGW)** | Colors visible ✅ | Colors **stripped** (no ANSI codes in output) |
| **Linux/macOS/Cygwin** | Colors visible ✅ | Colors **preserved** (ANSI codes in output) |

**Windows-specific behavior (verified by test):**

```powershell
# On Windows: terminal shows colors, but file has NO ANSI codes
msr -z "test" -t "\btest\b" > output.txt
# File content: plain text, no escape sequences

# With --keep-color: file CONTAINS ANSI codes (0x1B sequences)
msr -z "test" -t "\btest\b" --keep-color > output.txt
# File content: includes \x1B[95;40m...\x1B[0m color codes
```

**Why this matters for scripts:**
- **On Windows**: Safe to pipe without `-C` — colors automatically stripped
- **On Linux/macOS/Cygwin**: Must add `-C` (or `-PIC` if path not needed) to prevent ANSI codes from corrupting downstream parsing

**Cross-platform solutions:**

```bash
# Option 1: Always use -PIC (safe on all platforms, keeps summary)
msr -rp . -f "\.log$" -t "\berror\b" -PIC | other-tool

# Option 2: Force colors everywhere with --keep-color or environment variable
export MSR_KEEP_COLOR=1
msr -rp . -t "\berror\b" > colored-output.txt  # Has ANSI codes on ALL platforms
```

**Option and environment variable priority (all verified by test):**

| Scenario | Result | Notes |
|----------|--------|-------|
| Default (no flags, no env vars) | Platform-dependent | Windows strips colors; Linux/Cygwin preserves |
| `--keep-color` | Colors preserved ✅ | ANSI codes in output |
| `MSR_KEEP_COLOR=1` | Colors preserved ✅ | Same as `--keep-color` |
| `-C` | Colors disabled ❌ | No ANSI codes |
| `MSR_NO_COLOR=1` | Colors disabled ❌ | Same as `-C` |
| `MSR_KEEP_COLOR=1` + `-C` | **Colors disabled** ❌ | `-C` overrides env var |
| `MSR_NO_COLOR=1` + `--keep-color` | **Colors disabled** ❌ | `MSR_NO_COLOR` wins |

> **Priority rule:** `-C` and `MSR_NO_COLOR=1` **always win** over `--keep-color` and `MSR_KEEP_COLOR=1`.

**Color-related options summary:**
- `-C` / `--no-color` — disable all colors (highest priority, always safe)
- `--keep-color` — force ANSI codes in pipe/redirect (needed on Windows to preserve colors)
- `MSR_KEEP_COLOR=1` — environment variable for persistent `--keep-color`
- `MSR_NO_COLOR=1` — environment variable for persistent `-C` (highest priority)

---

## Further Resources

**Related documentation in this project:**

- [msr User Guide](msr-user-guide.md) — core msr usage guide
- [nin User Guide](nin-user-guide.md) — core nin usage guide
- [msr AI Agent Reference](msr-ai-agent-reference.md) — msr parameter reference for AI agents
- [nin AI Agent Reference](nin-ai-agent-reference.md) — nin parameter reference for AI agents
- [Use Cases and Comparisons](use-cases-and-comparisons.md) — practical use cases and tool comparisons