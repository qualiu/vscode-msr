# Tool Comparisons

Detailed feature comparisons between msr/nin and common CLI tools, plus irreplaceable features unique to msr/nin.

> **This content was split from [Practical Use Cases and Tool Comparisons](use-cases-and-comparisons.md)** for focused reading.
>
> **Looking for use cases and examples?** See [Practical Use Cases and Tool Comparisons](use-cases-and-comparisons.md).
>
> **Looking for tool references?** See [msr User Guide](msr-user-guide.md), [nin User Guide](nin-user-guide.md), [vscode-msr User Guide](vscode-msr-user-guide.md).

---

## Table of Contents

- [Tool Comparisons](#tool-comparisons)
  - [Table of Contents](#table-of-contents)
  - [Regex Feature Comparison](#regex-feature-comparison)
  - [msr vs grep / ripgrep / ag](#msr-vs-grep--ripgrep--ag)
  - [msr vs sed / perl](#msr-vs-sed--perl)
  - [msr vs awk](#msr-vs-awk)
  - [msr vs find + xargs](#msr-vs-find--xargs)
  - [msr vs PowerShell Select-String](#msr-vs-powershell-select-string)
  - [nin vs comm / uniq / sort](#nin-vs-comm--uniq--sort)
  - [nin vs awk / miller](#nin-vs-awk--miller)
  - [find-xxx vs gfind-xxx (git-cached mode)](#find-xxx-vs-gfind-xxx-git-cached-mode)
  - [Irreplaceable Features](#irreplaceable-features)
    - [1. Block Matching (`-b`/`-Q`)](#1-block-matching--b-q)
    - [2. Return Value = Match Count](#2-return-value--match-count)
    - [3. Skip-Write if Unchanged](#3-skip-write-if-unchanged)
    - [4. Global Fast Exit (`-H N -J`)](#4-global-fast-exit--h-n--j)
    - [5. Built-in Percentile Statistics](#5-built-in-percentile-statistics)
    - [6. nin Cumulative Pareto Analysis (`--sum`)](#6-nin-cumulative-pareto-analysis---sum)
  - [Further Resources](#further-resources)

---

## Regex Feature Comparison

> **Looking for regex syntax basics?** See [msr and nin Shared Reference — Regex Syntax](msr-nin-shared-reference.md#regex-syntax) for supported syntax, escape rules, and cross-platform behavior.

Detailed regex feature comparison between msr/nin and common CLI tools (grep, ripgrep).

> **Quick summary**: msr/nin use **Boost regex** (PCRE-compatible with extensions) — support 22 of 23 features below. ripgrep (rg) default mode supports 12/23 (rg 13) or 13/23 (rg ≥14); `--pcre2` enables 22/23. GNU grep `-P` supports ~16/23 (varies by version).

| Feature | Syntax | msr/nin | rg | rg --pcre2 | grep -P | Notes |
|---------|--------|---------|-----|------------|---------|-------|
| Basic capture groups | `(\w+)` | ✅ | ✅ | ✅ | ✅ | Standard capture groups |
| Character classes | `[a-z]` | ✅ | ✅ | ✅ | ✅ | Standard character classes |
| Alternation | `a\|b` | ✅ | ✅ | ✅ | ✅ | Either-or matching |
| Non-greedy quantifiers | `a.*?b` | ✅ | ✅ | ✅ | ✅ | Minimal matching |
| Positive lookahead | `foo(?=bar)` | ✅ | ❌ | ✅ | ✅ | Match `foo` only if followed by `bar` |
| Negative lookahead | `foo(?!bar)` | ✅ | ❌ | ✅ | ✅ | Match `foo` only if NOT followed by `bar` |
| Positive lookbehind | `(?<=foo)bar` | ✅ | ❌ | ✅ | ✅ | Match `bar` only if preceded by `foo` |
| Negative lookbehind | `(?<!foo)bar` | ✅ | ❌ | ✅ | ✅ | Match `bar` only if NOT preceded by `foo` |
| Named groups (PCRE) | `(?<name>\w+)` | ✅ | ⚠️ | ✅ | ⚠️ | PCRE/.NET-style; rg ≥14 supports, rg 13 does not; grep -P may vary |
| Named groups (Python) | `(?P<name>\w+)` | ❌ | ✅ | ✅ | ⚠️ | Python-style; msr/nin reject with exit=-1 |
| Named backreferences | `\k<name>` | ✅ | ❌ | ✅ | ❌ | Reference named capture group |
| Backreferences | `(\w+)\s+\1` | ✅ | ❌ | ✅ | ⚠️ | grep -P support varies by version |
| Word boundaries | `\bword\b` | ✅ | ✅ | ✅ | ✅ | Word boundary assertions |
| Possessive quantifiers | `\w++` | ✅ | ✅ | ✅ | ✅ | No backtracking |
| Atomic groups | `(?>atomic)` | ✅ | ❌ | ✅ | ✅ | No backtracking |
| Conditional patterns | `(?(1)yes\|no)` | ✅ | ❌ | ✅ | ✅ | Conditional backreference |
| Unicode properties | `\p{L}` | ✅ | ✅ | ✅ | ⚠️ | grep -P may not support; rg supports by default |
| Nested quantifiers | `(a+)+` | ✅ | ✅ | ✅ | ✅ | Nested repetition |
| Anchors | `^line$` | ✅ | ✅ | ✅ | ✅ | Start/end of line |
| Inline modifiers | `(?i)`, `(?m)`, `(?s)` | ✅ | ✅ | ✅ | ✅ | In-pattern case/multiline/dotall |
| Comments | `(?#comment)` | ✅ | ❌ | ✅ | ✅ | Embedded regex comments |
| Recursive patterns | `(?R)` | ✅ | ❌ | ✅ | ❌ | Recursive matching (e.g., nested parens) |
| Branch reset | `(?|...)` | ✅ | ❌ | ✅ | ❌ | Reset group numbering in alternation |

**Legend**: ✅ = Supported | ❌ = Not supported | ⚠️ = Varies by version/platform

**Supported Features Summary**:
| Tool | Default Mode | Extended Mode | Total Features |
|------|-------------|---------------|----------------|
| **msr/nin** | 22/23 | — | **22** (no Python-style named groups) |
| **rg** | 12-13/23 | 22/23 (--pcre2) | **12** (rg 13) or **13** (rg ≥14) default, **22** with PCRE2 |
| **grep** | — | 15-17/23 (-P) | **~16** (varies by version) |

> **Note**: rg (ripgrep) default mode uses Rust regex which lacks lookaround/backreferences/recursive patterns. rg ≥14 adds `(?<name>...)` named group support in default mode (rg 13 only supports `(?P<name>...)`). Add `--pcre2` for full PCRE2 support. grep `-P` uses PCRE but support varies by platform/version (tested: GNU grep 3.0 on Windows — no named backreferences, no recursive patterns, no branch reset).

---

## msr vs grep / ripgrep / ag

| Feature                      | grep                | ripgrep (rg)                | ag          | msr                                                     |
| ---------------------------- | ------------------- | --------------------------- | ----------- | ------------------------------------------------------- |
| Regex search                 | ✅                   | ✅                           | ✅           | ✅                                                       |
| Recursive search             | ✅ `-r`              | ✅ (default)                 | ✅ (default) | ✅ `-rp`                                                 |
| Case-insensitive             | ✅ `-i`              | ✅ `-i`                      | ✅ `-i`      | ✅ `-i`                                                  |
| File type filter             | ❌ (use `--include`) | ✅ `--type`                  | ✅ `--type`  | ✅ `-f` regex                                            |
| Text replacement             | ❌                   | ✅ `--replace` (stdout only) | ❌           | ✅ `-t -o -R` (in-place)                                 |
| Preview before replace       | ❌                   | ❌ (no in-place)             | ❌           | ✅ (default — no `-R`)                                   |
| In-place replace with backup | ❌                   | ❌                           | ❌           | ✅ `-RK`                                                 |
| Block matching               | ❌                   | ❌                           | ❌           | ✅ `-b -Q`                                               |
| Return value = match count   | ❌ (0/1)             | ❌ (0/1)                     | ❌ (0/1)     | ✅ actual count                                          |
| Global fast exit             | ❌                   | ❌                           | ❌           | ✅ `-H N -J`                                             |
| Execute output as commands   | ❌                   | ❌                           | ❌           | ✅ `-X`                                                  |
| File time/size filter        | ❌                   | ⚠️ `--max-filesize` only      | ❌           | ✅ `--w1/--w2/--s1/--s2`                 |
| Multi-file time sort         | ❌                   | ❌                           | ❌           | ✅ `-F`                                                  |
| Numeric statistics           | ❌                   | ❌                           | ❌           | ✅ `-s "" -n`                                            |
| Cross-platform consistent    | ❌                   | ✅                           | ✅           | ✅                                                       |
| Skip-write if unchanged      | N/A                 | N/A                         | N/A         | ✅                                                       |
| Line ending behavior         | N/A                 | N/A                         | N/A         | Uses system native (CRLF on Windows, LF on Linux/macOS) |

**Key difference: Return value semantics**

```bash
# grep/ripgrep: 0 = found, 1 = not found, 2 = error
grep -r "pattern" . && echo "found"    # 0 means "found something"

# msr: return value = actual MATCH COUNT
msr -rp . -t "pattern" -H 0
# Returns: 0 = nothing found, 42 = found 42 matches, -1 = error
# This enables: if ($LASTEXITCODE -gt 10) { "Too many matches!" }
```

**Key difference: Global fast exit (`-H N -J`)**

```bash
# ripgrep: can limit output lines, but still scans remaining files
rg "pattern" --max-count 3        # Limits per file, still opens all files

# msr: truly stops after N total matches across all files
msr -rp . -f "\.log$" -t "CRITICAL" -H 3 -J
# Scans first 3 matches then exits immediately — critical for 100GB+ log dirs
```

**Benchmarks: msr vs ripgrep vs grep**

> 📊 **Detailed benchmark data** and optimization strategies are available in **[Performance Tuning & Benchmark Summary](performance-tuning.md)**.

*Performance summary (Roslyn repo, ~20K files, ~14K C# files, keyword `TypeArgumentListSyntax`):*

| Category | Winner | Runner-up | Notes |
| -------- | ------ | --------- | ----- |
| Full scan (macOS) | rg (1.72s) | grep (4.70s) | rg is multi-threaded; msr ~7.4s |
| Full scan (Windows) | rg (12.66s) | find (14.22s) | Comparable; gfind 16.15s, grep 22.69s |
| Definition search (macOS) | msr (20.5s) | rg pipe (27.3s) | msr **25% faster** — single-pass `--nt` |
| Path-scoped (macOS) | msr --sp (0.38s) | rg -g (0.6-1.3s) | msr has richer path filters (`--sp`/`-d`/`-k` combos) |
| Fast exit (macOS) | msr (67ms) | rg (86ms) | msr `-H 1 -J` beats rg SIGPIPE |
| Fast exit (Windows) | msr (976ms) | rg (12,710ms) | **msr 13x faster** — only tool with true global exit |

*Key insights:*

> - **Path filter (`--sp`/`-d`) is the biggest optimization**: up to **19.5x speedup** on macOS; combined with `-d` + `-k` up to **22.5x**
> - **Fast exit (`-H N -J`)**: On Windows, msr is **13x faster** than rg (rg's `-m` is per-file only). On macOS, msr is also fastest (67ms vs 86ms)
> - **Definition search**: msr handles `-t` match + `--nt` exclusion in a single pass; rg needs `rg | grep -v` pipe — msr **25% faster**
> - **msr vs rg tradeoff**: rg is faster for raw full-text scan (multi-threaded); msr excels at path-scoped, definition, fast-exit, and replacement tasks

> **Optimization parameters reference**: `-d` (directory name regex match), `--nd` (directory name regex exclusion), `--sp` (path must contain ALL texts, AND logic), `--xp` (exclude if path contains ANY text, OR logic), `-f` (filename pattern), `-x` (plain text AND filter), `-H N -J` (global fast exit after N matches). See [Performance Tuning](performance-tuning.md#optimization-decision-tree) for the optimization decision tree and parameter speedup reference.

**Windows path separator note (practical):** see [msr and nin Shared Reference — Path Separator Compatibility on Windows](msr-nin-shared-reference.md#path-separator-compatibility-on-windows). `findstr` may still parse `/` as an option prefix, so forward-slash file paths are not consistently reliable there.

**Why ripgrep can't replace msr:**

1. **No in-place replacement** — rg outputs to stdout only; msr writes files with `-R`
2. **No block matching** — rg can't extract multi-line config sections
3. **No command execution** — rg can't batch-execute transformed output
4. **Limited file filtering** — rg has `--max-filesize` (max size only) but no time range filtering (`--w1/--w2`), no min size filtering (`--s1`), and no `--sort` by time with range filter
5. **Return value is boolean** — rg can't report exact match count
6. **No global fast exit** — rg's `-m` is per-file only; msr's `-H -J` stops globally

## msr vs sed / perl

| Feature                   | sed                       | perl                      | msr                       |
| ------------------------- | ------------------------- | ------------------------- | ------------------------- |
| Regex replace             | ✅                         | ✅                         | ✅                         |
| In-place replace          | ✅ `-i`                    | ✅ `-pi -e`                | ✅ `-R`                    |
| Preview mode (default)    | ❌                         | ❌                         | ✅ (no `-R` = preview)     |
| Backup before replace     | ✅ `-i.bak`                | ✅ `-i.bak`                | ✅ `-K` (timestamp-named)  |
| Skip-write if unchanged   | ❌                         | ❌                         | ✅ automatic               |
| Line ending behavior      | Converts to system native | Converts to system native | Converts to system native |
| Cross-platform consistent | ⚠️ GNU vs BSD              | ✅                         | ✅                         |
| Multi-file recursive      | ❌ (needs `find`)          | ❌ (needs `find`)          | ✅ `-rp`                   |

**Two engineering safety features unique to msr:**

1. **Skip-write if unchanged**: When `-R` produces the same content as the original, msr does NOT write the file and does NOT update `mtime`. This prevents false `git status` changes, unnecessary rebuilds, and spurious rsync transfers.

2. **Line ending behavior**: Both msr and sed write using the **system's native line ending style** — msr uses CRLF on Windows and LF on Linux/macOS. This means:

```bash
# sed on Linux converts CRLF to LF:
sed -i 's/old/new/' windows-file.txt
# Result: all \r\n → \n (converted to system native LF)

# msr on Windows converts LF to CRLF:
msr -p unix-file.txt -t "old" -o "new" -R
# Result: all \n → \r\n (converted to system native CRLF)

# Both tools write using the system's native line ending style, NOT preserving the original.
# Be cautious when cross-platform files have mixed or non-native line endings.
```

**Cross-platform issues with sed:**

```bash
# BSD sed (macOS) requires backup extension with -i:
sed -i '.bak' 's/old/new/' file.txt     # macOS
sed -i 's/old/new/' file.txt             # Linux (GNU)
# These are incompatible! Scripts break when moving between platforms.

# msr: identical command on all platforms
msr -p file.txt -t "old" -o "new" -RK   # Works everywhere
```

## msr vs awk

| Feature                | awk            | msr (+ nin)            |
| ---------------------- | -------------- | ---------------------- |
| Pattern matching       | ✅              | ✅                      |
| Column processing      | ✅ native       | ⚠️ via regex            |
| Text replacement       | ✅ `gsub()`     | ✅ `-t -o`              |
| Numeric statistics     | ⚠️ manual code  | ✅ built-in P05-P99.999 |
| Cross-platform         | ⚠️ gawk vs mawk | ✅ same binary          |
| Frequency distribution | ⚠️ manual       | ✅ `nin -pd`            |

**Statistics comparison:**

```bash
# awk: manual P90 calculation (requires sorting, indexing)
awk '{a[NR]=$1} END{asort(a); print a[int(NR*0.9)]}' data.txt

# msr: built-in comprehensive statistics in one command
msr -p data.txt -t "(\d+\.?\d*)" -s "" -n -H 0 -C
# Output: Count, Sum, Median, Average, P05, P10, ..., P90, P95, P99, P99.9, P99.99, P99.999
# Plus: Variance, StandardDeviation, Mode, MinValue, MaxValue
```

## msr vs find + xargs

| Feature                | find + xargs   | msr           |
| ---------------------- | -------------- | ------------- |
| Recursive file listing | ✅              | ✅ `-rp . -l`  |
| File name filter       | ✅ `-name`      | ✅ `-f` regex  |
| File time filter       | ✅ `-mtime`     | ✅ `--w1/--w2` |
| File size filter       | ✅ `-size`      | ✅ `--s1/--s2` |
| Content search         | ❌ (needs grep) | ✅ built-in    |
| Batch execution        | ✅ `xargs`      | ✅ `-X`        |
| Fail-fast execution    | ❌              | ✅ `-X -V ne0` |
| Cross-platform         | ⚠️ GNU vs BSD   | ✅             |

```bash
# find + xargs: multi-command pipeline
find . -name "*.cs" -mtime -7 | xargs grep -l "pattern"

# msr: single command
msr -rp . -f "\.cs$" --w1 7d -t "pattern" -l
```

## msr vs PowerShell Select-String

| Feature          | Select-String | msr             |
| ---------------- | ------------- | --------------- |
| Regex search     | ✅             | ✅               |
| Recursive        | ✅ `-Recurse`  | ✅ `-rp`         |
| Case-insensitive | ✅ (default)   | ✅ `-i`          |
| Replace          | ❌             | ✅ `-t -o -R`    |
| Performance      | ⚠️ Slower      | ✅ 2X-15X faster |
| Context lines    | ✅ `-Context`  | ✅ `-U -D`       |
| Block matching   | ❌             | ✅ `-b -Q`       |
| Cross-platform   | ⚠️ PS only     | ✅ All platforms |

## nin vs comm / uniq / sort

| Feature                     | comm        | uniq        | sort   | nin               |
| --------------------------- | ----------- | ----------- | ------ | ----------------- |
| Set difference              | ✅           | ❌           | ❌      | ✅                 |
| Set intersection            | ✅           | ❌           | ❌      | ✅ `-m`            |
| Unique/dedup                | ❌           | ✅           | ✅ `-u` | ✅ `-u`            |
| Frequency count             | ❌           | ✅ `-c`      | ❌      | ✅ `-pd`           |
| Pre-sorting required        | ✅ mandatory | ✅ mandatory | N/A    | ❌ not needed      |
| Preserve original order     | ❌           | ❌           | ❌      | ✅ (default)       |
| Regex key extraction        | ❌           | ❌           | ❌      | ✅ capture groups  |
| Different patterns per file | ❌           | N/A         | N/A    | ✅ two regex args  |
| Percentage output           | ❌           | ❌           | ❌      | ✅ `-p`            |
| Cumulative analysis         | ❌           | ❌           | ❌      | ✅ `--sum`         |
| Threshold filtering         | ❌           | ❌           | ❌      | ✅ `-K P` / `-k N` |
| Structure-preserving filter | ❌           | ❌           | ❌      | ✅ `-wn`           |

**Key differences:**

```bash
# comm: requires both files pre-sorted, no regex
sort file1.txt > /tmp/s1 && sort file2.txt > /tmp/s2 && comm -23 /tmp/s1 /tmp/s2

# nin: no pre-sorting, supports regex keys, preserves order
nin file1.txt file2.txt "^(\w+)" -u
```

## nin vs awk / miller

| Feature             | awk      | miller (mlr)   | nin               |
| ------------------- | -------- | -------------- | ----------------- |
| Set difference      | ⚠️ manual | ❌              | ✅ native          |
| Frequency count     | ⚠️ manual | ✅              | ✅ `-pd`           |
| Cumulative totals   | ❌        | ❌              | ✅ `--sum`         |
| Pareto analysis     | ❌        | ❌              | ✅ `-pd --sum -K`  |
| Threshold filtering | ❌        | ❌              | ✅ `-K P` / `-k N` |
| Format-agnostic     | ✅        | ❌ (structured) | ✅                 |
| Learning curve      | Steep    | Moderate       | Low               |

**Concept analogy table (nin/msr ↔ SQL/Kusto):**

| SQL / Kusto                           | nin / msr Equivalent                                      |
| ------------------------------------- | --------------------------------------------------------- |
| `SELECT DISTINCT col FROM table`      | `nin file nul "^(\S+)" -u`                                |
| `GROUP BY col ORDER BY COUNT(*) DESC` | `nin file nul "^(\S+)" -pd`                               |
| `WHERE col NOT IN (SELECT ...)`       | `nin file1 file2 "regex"`                                 |
| `INNER JOIN ON key`                   | `nin file1 file2 "regex" -m`                              |
| `HAVING COUNT(*) >= N`                | `nin file nul "regex" -pd -k N`                           |
| `TOP N`                               | `nin file nul "regex" -pd -H N`                           |
| `PERCENTILE_CONT(0.99)`               | `msr -p file -t "(\d+)" -s "" -n -H 0 -C` (P99 in output) |

## find-xxx vs gfind-xxx (git-cached mode)

vscode-msr provides two sets of search aliases:
- **`find-xxx`**: Uses `-rp .` (recursive directory traversal)
- **`gfind-xxx`**: Uses `-w git-paths-file` (pre-cached git file list)

| Scenario                    | find-xxx           | gfind-xxx                   | Recommendation         |
| --------------------------- | ------------------ | --------------------------- | ---------------------- |
| Small repos (<1K files)     | Baseline           | **~1.5-2x faster**          | Use `gfind-xxx`        |
| Large repos (20K+ files)    | **~Same speed**    | Baseline                    | Either works           |
| Medium repos (5K-10K files) | Equivalent         | Equivalent                  | Either works           |
| Reference search (`-ref`)   | ✅ Correct          | ✅ Correct                   | Either works           |
| Definition search (`-def`)  | ⚠️ Slow (11-22s)    | ⚠️ **May timeout** (68-117s) | **Use `-ref -x` instead** |

**Performance Test Results**:

| Repository | Files  | Search            | find-xxx time | gfind-xxx time | Speedup   |
| ---------- | ------ | ----------------- | ------------- | -------------- | --------- |
| vscode-msr | 75     | `-t "searchText"` | ~2,100ms      | ~880ms         | **~2.4x** |
| roslyn     | 20,575 | `-t "SyntaxNode"` | ~14,000ms     | ~14,400ms      | ~1.0x     |
| django     | 7,021  | `-t "Model"`      | ~3,400ms      | ~3,400ms       | ~1.0x     |
| express    | 213    | `-t "Router"`     | ~880ms        | ~880ms         | ~1.0x     |

> **Note**: Speedup = find-time / gfind-time (values >1 mean gfind is faster). For medium-to-large repos, the difference is within measurement noise (~±5%). See [gfind vs find benchmark data](performance-tuning.md#gfind-xxx-vs-find-xxx-cached-vs-traversal) for more data.

**When to use each:**

```bash
# Small repos: gfind-xxx is faster
gfind-ts -t "pattern"      # Uses cached git file list

# Large repos: find-xxx is more reliable
find-cs -t "pattern"       # Directory traversal scales better

# Definition search: use -ref with -x (more reliable than -def)
gfind-py-ref MyClass -x class           # Reliable: find "class MyClass"
gfind-cs-ref OrderService -x class -d Services   # With directory filter
gfind-py -t "class\s+MyClass\b"         # Or use base alias with custom regex
# gfind-py-def MyClass                  # May be slow or return 0 matches
```

> **Technical note**: The `gfind-xxx` aliases read file lists from `git ls-files` cached output. For small repos, this avoids repeated file system traversal. For large repos, the overhead of parsing the cached list may exceed direct traversal time.
>
> **⚠️ `-def` alias reliability**: The `-def` aliases use complex `--nt` exclusion regex that can be slow or fail on repos with long lines (2000+ characters). **Recommended**: Use `-ref` with `-x "class"` or `-x "function"`, or use base alias with custom `-t` regex. Add `-d`/`--sp`/`--xp` to narrow scope.

## Irreplaceable Features

These capabilities have **no equivalent** in commonly available CLI tools:

### 1. Block Matching (`-b`/`-Q`)

Parser-agnostic multi-line extraction that works on any text format — Helm templates, JSONC, multi-document YAML, incomplete fragments, even GB-scale files:

```bash
# No other single tool can do this:
msr -rp . -f "\.yaml$" -b "^apiVersion:" -Q "" -y -t "image:" -a
# Extracts complete K8s manifest blocks containing specific images
```

### 2. Return Value = Match Count

Enables quantitative scripting impossible with 0/1 boolean returns:

```bash
# "Alert if more than 100 errors in this file"
msr -p app.log -x "ERROR" -H 0
if ($LASTEXITCODE -gt 100) { Send-Alert "Too many errors: $LASTEXITCODE" }
```

> ⚠️ **Cross-platform caveat**: On Linux/macOS, exit codes are 8-bit (max 255); on some MinGW, 7-bit (max 127). A count of 256 wraps to 0. For threshold checks that may exceed these limits, use `--exit gt255-to-255` (Linux/macOS) or `--exit gt127-to-127` (MinGW) to cap values. Existence checks (`-H 1 -J`, return 0 or 1) are always safe. On Windows, no truncation occurs.

### 3. Skip-Write if Unchanged

msr does not write the file if replacement produces identical content — preserving `mtime` and avoiding false dirty states in `git status` and unnecessary rebuilds. No extra flag required.

### 4. Global Fast Exit (`-H N -J`)

Truly stops scanning after N matches across ALL files — critical for searching 100GB+ log directories:

```bash
msr -rp /var/log -f "\.log$" -t "CRITICAL" -H 1 -J
# Finds first CRITICAL and exits — doesn't scan remaining 50,000 log files
```

### 5. Built-in Percentile Statistics

P50 through P99.999 in a single command with no scripting:

```bash
msr -p perf.log -t "latency_ms=(\d+\.?\d*)" -s "" -n -H 0 -C
```

### 6. nin Cumulative Pareto Analysis (`--sum`)

Automated 80/20 analysis with data-driven threshold:

```bash
nin errors.log nul "(\w+Exception)" -pd --sum -K 5.0
# Automatically shows only significant error types (≥5% each) with cumulative coverage
```

---

## Further Resources

**Related documentation in this project:**

- [Practical Use Cases and Tool Comparisons](use-cases-and-comparisons.md) — real-world examples and industry applications
- [msr User Guide](msr-user-guide.md) — comprehensive msr documentation
- [nin User Guide](nin-user-guide.md) — comprehensive nin documentation
- [vscode-msr User Guide](vscode-msr-user-guide.md) — alias usage for humans
- [Performance Tuning & Benchmark Summary](performance-tuning.md) — optimization strategies and cross-platform benchmarks
- [AI Agent Usage Guide](ai-agent-usage-guide.md) — AI agent integration patterns