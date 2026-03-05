# Performance Tuning & Benchmark Summary

Practical optimization strategies for msr-based search tools (`gfind-xxx`, `find-xxx`) derived from cross-platform benchmarks on the [Roslyn](https://github.com/dotnet/roslyn) repository (~20K files, ~14K C# files).

> **Looking for tool comparisons?** See [Tool Comparisons](tool-comparisons.md) for feature comparison tables and [Use Cases and Comparisons](use-cases-and-comparisons.md) for practical examples.
>
> **Looking for parameter reference?** See [msr User Guide](msr-user-guide.md), [msr AI Agent Reference](msr-ai-agent-reference.md), and [msr and nin Shared Reference](msr-nin-shared-reference.md).

## When to Read This Guide

This is an **advanced** document. Recommended reading order:

1. Start with [Quick Start](quick-start.md)
2. Then read [msr User Guide](msr-user-guide.md) and [vscode-msr User Guide](vscode-msr-user-guide.md)
3. Return here when you need measurable speed optimization in large repositories

Use this guide first only if your immediate problem is search performance on medium/large codebases.

## Benchmark Snapshot (Read First)

### Test Environments

| Item       | macOS (Apple Silicon)                    | Windows (x64 Server)                      |
| ---------- | ---------------------------------------- | ----------------------------------------- |
| **OS**     | macOS Tahoe 26.3                         | Windows 11 Enterprise (Build 26100)       |
| **CPU**    | Apple M1 (8 cores: 4P + 4E)             | Intel Xeon Platinum 8370C (8C/16T)        |
| **Memory** | 16 GB                                    | 64 GB                                     |
| **Storage**| Internal SSD (Apple Fabric)              | SSD (NVMe)                                |
| **msr**    | 2023-11-30 (arm64 darwin)                | 2023-11-30 (x64)                          |
| **rg**     | 13.0.0                                   | 13.0.0                                    |
| **Method** | 3 runs per test, median, warm cache      | 3 runs per test, median, warm cache       |
| **Repo**   | Roslyn (20,575 files, 13,947 .cs)        | Roslyn (~20K files, ~13,461 .cs)          |
| **Keyword**| `TypeArgumentListSyntax` (108 matches)   | `TypeArgumentListSyntax` (108 matches)    |

### Key Optimization Conclusions

- Inclusion filters are the biggest win: `-d` / `--sp` typically deliver **8-22x** speedup over full-scan workflows.
- Exclusion-only filtering (`--xp`) helps, but usually less than include filters.
- For existence/first-N checks, `-H N -J` is the fastest practical pattern.
- `rg` remains best for raw full-scan when no path knowledge exists.
- In real repos, path knowledge is common, so tuned `gfind/find` workflows are usually the practical default.

---


## Table of Contents

- [Performance Tuning \& Benchmark Summary](#performance-tuning--benchmark-summary)
  - [Table of Contents](#table-of-contents)
  - [When to Read This Guide](#when-to-read-this-guide)
  - [Benchmark Snapshot (Read First)](#benchmark-snapshot-read-first)
    - [Test Environments](#test-environments)
    - [Key Optimization Conclusions](#key-optimization-conclusions)
  - [Optimization Decision Tree](#optimization-decision-tree)
  - [Parameter Speedup Reference](#parameter-speedup-reference)
  - [Filter Speed Hierarchy](#filter-speed-hierarchy)
  - [Path Filter Tips](#path-filter-tips)
    - [`--sp` Order Independence](#--sp-order-independence)
    - [`--sp` vs `-d` vs `--pp`](#--sp-vs--d-vs---pp)
    - [Path Filter Acceleration Effects](#path-filter-acceleration-effects)
  - [Common Parameter Traps](#common-parameter-traps)
    - [`-xp` vs `--xp` — Parsing Trap](#-xp-vs---xp--parsing-trap)
    - [`--nd`/`--np` Conflict with Aliases](#--nd--np-conflict-with-aliases)
    - [Diagnosing Alias Parameters](#diagnosing-alias-parameters)
    - [Safe (Non-Conflicting) Parameters](#safe-non-conflicting-parameters)
  - [Benchmark Summary (Detailed Tables)](#benchmark-summary-detailed-tables)
    - [Test Environments](#test-environments-1)
    - [When to Use Each Tool](#when-to-use-each-tool)
    - [Performance Summary by Category](#performance-summary-by-category)
    - [Full Scan Speed Ranking](#full-scan-speed-ranking)
    - [Fast Exit: msr's Key Strength](#fast-exit-msrs-key-strength)
    - [Definition Search: msr's Unique Advantage](#definition-search-msrs-unique-advantage)
    - [gfind-xxx vs find-xxx: Cached vs Traversal](#gfind-xxx-vs-find-xxx-cached-vs-traversal)
    - [Case-Insensitive Search](#case-insensitive-search)
  - [Match Count Differences Explained](#match-count-differences-explained)
  - [Return Value (ExitCode) Semantics](#return-value-exitcode-semantics)
  - [Further Resources](#further-resources)

---

## Optimization Decision Tree

Use this to choose the optimal search strategy:

```
Do you know the target directory/path pattern?
├── YES → Use --sp or -d (8-22x speedup)
│   ├── Know the module? → --sp compile,csharp,syntax (19.5x on macOS, 8.8x on Windows)
│   ├── Know the directory? → -d syntax (15.6x on macOS, 7.4x on Windows)
│   └── Know what to exclude? → --xp test,Generated (2x)
└── NO → No path knowledge (rare)
    ├── Need only first N results? → Add -H N -J (sub-second)
    └── Need all results? → rg for raw scan speed, msr for features
```

## Parameter Speedup Reference

| Parameter   | Type        | What it does                                     | Speedup    | When to use                          |
| ----------- | ----------- | ------------------------------------------------ | ---------: | ------------------------------------ |
| `--sp TEXT` | File filter | Path must contain **ALL** comma-separated texts  | **8-20x**  | Know target module/directory name    |
| `-d REGEX`  | File filter | Skip files not under a directory matching REGEX  | **7-16x**  | Know target directory name (regex)   |
| `--xp TEXT` | File filter | Exclude if path contains **ANY** comma-separated text | **2x** | Exclude test/vendor/generated dirs   |
| `-k N`      | File filter | Limit search to depth N                          | **~1x**    | Only useful when target is in shallow directory |
| `-x TEXT`   | Line filter | Skip lines not containing TEXT                   | **~1x**    | Know a distinctive word in target lines |
| `-H N -J`   | Fast exit   | Stop after N total matches globally              | **100x+**  | Need just a few examples, existence check |

> **Key insight**: Path/directory filters (`--sp`/`-d`) provide massive speedup because they **skip opening files entirely**. Line filters (`-x`) provide NO speedup alone — every file must still be opened and read. Combine `-d` + `--sp` for maximum effect.

---

## Filter Speed Hierarchy

msr filters are evaluated in this order (fastest → slowest):

```
Fastest ─────────────────────────────────── Slowest
-k (depth)  >  -d/--nd (dir name)  >  -f/--nf (file name)  >  --sp/--xp (plain text path)  >  --pp/--np (regex path)
   numeric       dir name pruning        filename filter          path filter (text)              path filter (regex)
   comparison    (regex)                  (regex)                 (plain text, AND)               (regex)
```

> **In practice**: On the Roslyn repo, `-d`/`--nd` and `--sp`/`--xp` show similar performance (~6s include / ~10-12s exclude) because the bottleneck is I/O, not filter computation. The hierarchy matters more on slower storage or larger repos.

---

## Path Filter Tips

### `--sp` Order Independence

`--sp` is a plain text AND match — keyword order does **not** affect results or performance:

| Order     | `--sp` value                  | Matches | Opened Files | Time  |
| --------- | ----------------------------- | ------: | -----------: | ----: |
| Original  | `compile,csharp,syntax`       | 75      | 333          | 0.64s |
| Reversed  | `syntax,csharp,compile`       | 75      | 333          | 0.64s |
| Shuffled  | `csharp,syntax,compile`       | 75      | 333          | 0.62s |

You don't need to remember the order of directory hierarchy. Just remember the keywords. Compare with `--pp` (regex), which requires path-order matching (e.g., `--pp "compile.*csharp.*syntax"`).

### `--sp` vs `-d` vs `--pp`

| Parameter | Match Type | Match Scope     | Multi-keyword Logic | Keyword Order | Conflict Risk |
| --------- | ---------- | --------------- | ------------------- | ------------- | ------------- |
| `--sp`    | Plain text | Full file path  | **AND** (all must match) | Independent   | ✅ Never       |
| `--xp`    | Plain text | Full file path  | **OR** (any excludes)    | Independent   | ✅ Never       |
| `-d`      | Regex      | Directory names | N/A (single pattern)    | N/A           | ✅ Never       |
| `--pp`    | Regex      | Full file path  | N/A (single pattern)    | Regex order   | ✅ Never       |

> **Cross-platform note**: `--sp` and `--xp` texts can contain path separators. Use `/` on Linux/macOS and `\` on Windows. For convenience, Windows also accepts `/` (e.g., `--xp "test/,mock/"`).

### Path Filter Acceleration Effects

Multi-keyword path filters dramatically reduce search scope. Measured on VS Code repo (9,805 files):

| Filter Method                          | Full Scan → Filtered | Speedup  | Use Case                        |
| -------------------------------------- | -------------------- | -------: | ------------------------------- |
| `--sp contrib,terminal` (multi-keyword)| 4.6s → 0.14s         | **32x**  | Know multiple path keywords      |
| `-d terminal` (directory name)         | 4.6s → 0.47s         | **10x**  | Know target directory name       |
| `-d terminal --xp test` (combined)     | 4.6s → 0.30s         | **15x**  | Exclude test code                |
| `--xp test` (exclude only)             | 4.6s → 3.35s         | **1.4x** | Limited effect — still full scan |

> **Lesson**: Inclusion filters (`--sp`/`-d`) are far more effective than exclusion filters (`--xp`) alone.

---

## Common Parameter Traps

### `-xp` vs `--xp` — Parsing Trap

**Critical**: msr parses single-dash `-xp` as short option `-x` with value `p` (i.e., `--has-text p`), **not** as long option `--xp` (exclude path).

```bash
❌ gfind-cs-ref TypeArgumentListSyntax -xp test -x class
   → msr parses as: -x p (--has-text "p") + -x class (--has-text "class")
   → Error: "--has-text cannot be specified more than once"

✅ gfind-cs-ref TypeArgumentListSyntax --xp test -x class
   → msr parses as: --xp test (exclude path containing "test") + -x class (--has-text "class")
   → Correct: 2 matches
```

**Rules**:
- **Short options** (single dash + single letter): `-x`, `-d`, `-f`, `-k` — the next character/word is the parameter value
- **Long options** (double dash + full name): `--xp`, `--sp`, `--nd`, `--np` — these are independent parameter names
- `-xp` ≠ `--xp`: the former is `-x p` (line filter = has text "p"), the latter is `--xp` (exclude files by path)

### `--nd`/`--np` Conflict with Aliases

`gfind-xxx` and `find-xxx` aliases internally use `--nd` or `--np` for junk path filtering. Passing the **same parameter** again overrides the built-in value.

- In clean git repos (like Roslyn), this usually doesn't cause incorrect results
- In repos with `node_modules`, `.git`, etc., overriding may cause scanning of junk directories and significant performance degradation
- The binding is **not fixed** — any alias may use either `--nd` or `--np`, and this varies per repository

### Diagnosing Alias Parameters

Run this command to see the full `Command` line of any alias:

```bash
<alias> dummy -l -k 1 --timeout 0.1 -c
```

In the output summary `Command = msr ...`, check whether the alias uses `--nd` or `--np`.

### Safe (Non-Conflicting) Parameters

These parameters **never conflict** with alias internals (ordered by practical recommendation):

| Parameter | Purpose           | Match Type | Typical Effect | Notes |
| --------- | ----------------- | ---------- | -------------- | ----- |
| `-d`      | Directory include | Regex      | ⭐ High         | Best first choice when you know target module/dir; alias internals usually set junk exclusion via `--nd`/`--np`, and your `-d` works as an additional include filter (no override conflict) |
| `--sp`    | Path include      | Plain text | ⭐ High         | Path must contain **ALL** keywords (AND); best second step for narrowing |
| `--xp`    | Path exclude      | Plain text | Medium         | Path excluded if it contains **ANY** keyword (OR); useful after include filters |
| `--nf`    | Filename exclude  | Regex      | Medium         | Safe filename-level cleanup; does not conflict with alias `-f` |
| `-k`      | Depth limit       | Numeric    | Situational    | Fast but coarse; only use when target depth is known |

> **Recommendation order**: Prefer `-d` → `--sp` → `--xp` for user-side narrowing. Use `--nf` for filename cleanup, and `-k` only as an optional coarse bound. Avoid overriding alias-built `--nd`/`--np` unless you intentionally want to change alias defaults.

---

## Benchmark Summary (Detailed Tables)

### Test Environments

| Item       | macOS (Apple Silicon)                    | Windows (x64 Server)                      |
| ---------- | ---------------------------------------- | ----------------------------------------- |
| **OS**     | macOS Tahoe 26.3                         | Windows 11 Enterprise (Build 26100)       |
| **CPU**    | Apple M1 (8 cores: 4P + 4E)             | Intel Xeon Platinum 8370C (8C/16T)        |
| **Memory** | 16 GB                                    | 64 GB                                     |
| **Storage**| Internal SSD (Apple Fabric)              | SSD (NVMe)                                |
| **msr**    | 2023-11-30 (arm64 darwin)                | 2023-11-30 (x64)                          |
| **rg**     | 13.0.0                                   | 13.0.0                                    |
| **Method** | 3 runs per test, median, warm cache      | 3 runs per test, median, warm cache       |
| **Repo**   | Roslyn (20,575 files, 13,947 .cs)        | Roslyn (~20K files, ~13,461 .cs)          |
| **Keyword**| `TypeArgumentListSyntax` (108 matches)   | `TypeArgumentListSyntax` (108 matches)    |

> **Note**: Direct time comparisons between platforms are not meaningful due to different hardware. Focus on **relative tool rankings** within each platform.

### When to Use Each Tool

| Scenario                         | Best Tool                          | Why                                                    |
| -------------------------------- | ---------------------------------- | ------------------------------------------------------ |
| **Path-scoped search** ⭐        | `gfind-xxx --sp`/`-d`/`--xp`      | **8-22x faster** than rg; add `--nf`/`-k` to narrow further |
| **First N matches** ⭐            | `gfind/find -H N -J`              | True global fast exit; **13x faster** than rg on Windows |
| **Definition search**            | `gfind-xxx-ref keyword -x "class"` | More reliable than `-def` aliases; add `--sp`/`-d`/`--xp` to narrow scope |
| **In-place replacement**         | `msr -R`/`-RK`                     | rg cannot write files                                  |
| **Block/multi-line matching**    | `msr -b -Q`                        | rg and grep cannot do this                             |
| **Batch operations**             | `msr -X`                           | Execute search results as commands                     |
| **Cross-platform scripts**       | `msr`                              | Identical behavior on Windows/macOS/Linux              |
| **Bare full-text scan (no path knowledge)** | `rg`                    | Multi-threaded; fastest only when no path filters apply |
| **Zero-install fallback**                   | `grep`                  | Pre-installed on macOS/Linux; slower than rg in all categories (see below) |

> **Key takeaway**: In real-world usage, you almost always know something about the target path (module, directory, or component name). Adding `--sp` or `-d` makes `gfind-xxx` **8-22x faster** than `rg`. The `rg` advantage only applies to bare full-scan without any path knowledge — a rare edge case.
>
> **About grep**: grep is **never the fastest** tool in any benchmark category — rg beats it on full scan (2-3x), msr beats it on fast exit (10-60x), and grep does not support path filters (`--sp`/`-d`), in-place replacement, or `.gitignore` auto-skip. Its only advantage is being **pre-installed** on macOS/Linux: useful for one-off searches on machines without rg or msr. On repos with `node_modules`/`.git`, grep can be **10-15s slower** than rg because it scans everything. If rg or msr is available, always prefer them over grep.

### Performance Summary by Category

| Category                  | macOS Winner      | macOS Time | Windows Winner    | Windows Time |
| ------------------------- | ----------------- | ---------: | ----------------- | -----------: |
| Full scan                 | rg                | 1.72s      | rg                | 12.66s       |
| Fast exit (1 match)       | gfind -H 1 -J    | 67ms       | find -H 1 -J     | 976ms        |
| Path-scoped (`--sp`)      | gfind             | 378ms      | gfind             | 1.83s        |
| Dir-scoped (`-d syntax`)  | gfind             | 472ms      | gfind             | 2.17s        |
| Combined (max)            | gfind             | 327ms      | gfind             | 1.73s        |
| Definition search         | gfind-cs-def      | 20.46s     | N/A               | —            |
| Def + path filter         | gfind-cs-def      | 938ms      | N/A               | —            |
| Case-insensitive `-i`     | rg                | 1.85s      | rg ≈ gfind        | ~14s         |

### Full Scan Speed Ranking

*Both platforms, same keyword (`TypeArgumentListSyntax`):*

macOS:
```
rg (1.72s) >> grep (4.70s) >> gfind (7.36s) >> find (8.24s)
    1x          2.7x             4.3x              4.8x
```

Windows:
```
rg (12.66s) > find (14.22s) > gfind (16.15s) >> grep (22.69s)
     1x          1.1x            1.3x              1.8x
```

**Why is rg's advantage smaller on Windows?** On macOS, rg's multi-threaded parallelism fully utilizes M1's 8 cores, while msr's single-threaded search leaves 7 cores idle. On Windows, I/O overhead (NTFS, file handle management, antivirus scanning) is proportionally larger, reducing the benefit of parallelism.

### Fast Exit: msr's Key Strength

| Platform | msr `-H 1 -J`  | rg (fast exit)     | grep (fast exit)    |
| -------- | --------------: | -----------------: | ------------------: |
| macOS    | 67ms            | 86ms (SIGPIPE)     | 4,521ms†            |
| Windows  | 976ms–1.25s     | 12,710ms (`-m` only) | 22,960ms (`-m` only) |

> † BSD grep on macOS handles SIGPIPE very poorly — it continues processing even after the pipe is closed.
>
> On macOS, msr is actually **faster** than rg for fast exit (67ms vs 86ms). On Windows, **only msr provides true global fast exit** — rg's `-m` is per-file and still scans all files, returning 24 matches (1 per file × 24 files) instead of truly stopping after 1 global match.

### Definition Search: msr's Unique Advantage

| Platform          | msr (gfind-cs-def) | rg (pipe to grep -v) | msr Advantage                        |
| ----------------- | -----------------: | -------------------: | ------------------------------------ |
| macOS             | 20.46s             | 27.30s               | **25% faster**                       |
| macOS (optimized) | 938ms              | N/A                  | **21.8x faster** than msr baseline   |

**Why is msr faster for definition search?**
- msr handles `-t` (match regex) and `--nt` (exclusion regex) in a **single process, single pass**
- rg requires `rg <pattern> | grep -vE <exclusion>` — two processes, pipe buffer overhead
- Single-pass processing eliminates inter-process I/O overhead

### gfind-xxx vs find-xxx: Cached vs Traversal

| Platform | Scenario             | gfind (cached) | find (traversal) | Faster               |
| -------- | -------------------- | -------------: | ----------------: | -------------------- |
| macOS    | Full scan ref        | 7.36s          | 8.24s             | gfind 12% faster     |
| macOS    | Full scan def        | 20.46s         | 24.65s            | gfind 17% faster     |
| macOS    | Fast exit `-H 1 -J`  | 67ms           | 274ms             | gfind **4x faster**  |
| macOS    | `--sp` path filter   | 378ms          | 1.45s             | gfind **3.8x faster**|
| Windows  | Full scan ref        | 16.15s         | 14.22s            | find 12% faster      |
| Windows  | Fast exit `-H 1 -J`  | 1.25s          | 976ms             | find 22% faster      |

> **Pattern**: On macOS, gfind (cached file list) is consistently faster — especially dramatic for fast exit (67ms vs 274ms) and path filter (378ms vs 1.45s). On Windows, find (directory traversal) is slightly faster for full scan and fast exit, likely due to lower overhead of direct I/O vs parsing the cached file list.

### Case-Insensitive Search

Two matching modes tested for fairness — all tools use the same semantics within each group:

**Regex word-boundary (`\b...\b`)** — exact whole-word matches only:

| Platform | gfind-cs-ref `-i`  | rg `-wi`     | Result   |
| -------- | -----------------: | -----------: | -------- |
| macOS    | 6.80s              | **1.85s**    | 123 matches |
| Windows  | 14.98s             | **13.96s**   | 123 matches |

**Plain text (fixed string)** — matches substrings too:

| Platform | gfind-cs `-x ... -i` | rg `-Fi`     | Result   |
| -------- | -------------------: | -----------: | -------- |
| Windows  | 13.87s               | **13.78s**   | 126 matches |

> On Windows, gfind and rg are **nearly identical** for case-insensitive search (~14s). On macOS, rg is 3.7x faster. Plain text gives 126 lines (3 more than regex `\b`) because `TTypeArgumentListSyntax` is a valid substring match.

---

## Match Count Differences Explained

| Keyword | Matching Mode | Count | Difference | Reason |
| ------- | ------------- | ----: | ---------: | ------ |
| `TypeArgumentListSyntax` | case-sensitive | 108 | 0 | All tools agree |
| `TypeArgumentListSyntax` `-i` | regex `\b...\b` | 123 | 0 | Word-boundary: only whole-word matches |
| `TypeArgumentListSyntax` `-i` | plain text | 126 | 0 | Includes substring `TTypeArgumentListSyntax` (3 extra lines) |

Match counts are identical across tools **within the same matching mode**. The 123 vs 126 difference between regex word-boundary and plain text is expected.

**Counting methodology**: msr counts **matched lines** — each line counts as 1 regardless of how many times the keyword appears on that line (summary shows "Matched N lines"). rg has two counting modes:
- `rg -c` counts matched **lines** (same as msr)
- `rg --count-matches` counts individual match **occurrences** (a line with 2 occurrences = 2)

All benchmark numbers use **line-based counting** for consistency.

---

## Return Value (ExitCode) Semantics

| Tool               | ExitCode Meaning                                                |
| ------------------ | --------------------------------------------------------------- |
| **msr** (gfind/find) | **Matched line count** (e.g., 108 = found 108 matching lines) |
| **rg**             | 0 = match found, 1 = no match                                  |
| **grep**           | 0 = match found, 1 = no match                                  |

msr's ExitCode enables quantitative scripting:

```bash
msr -p app.log -x "ERROR" -H 0
if ($LASTEXITCODE -gt 100) { Send-Alert "Too many errors: $LASTEXITCODE" }
```

> ⚠️ **Cross-platform caveat**: On non-Windows platforms, exit codes are truncated (max 255 or 127), which can cause counts to wrap to 0. See [Return Value Cross-Platform Behavior](msr-nin-shared-reference.md#return-value-cross-platform-behavior) for safe patterns and `--exit` capping.

---

## Further Resources

**Related documentation in this project:**

- [msr User Guide](msr-user-guide.md) — comprehensive msr documentation
- [nin User Guide](nin-user-guide.md) — comprehensive nin documentation
- [msr and nin Shared Reference](msr-nin-shared-reference.md) — shared cross-platform behavior, exit code, encoding, and environment variable reference
- [Tool Comparisons](tool-comparisons.md) — feature comparison tables and benchmark summaries
- [Use Cases and Comparisons](use-cases-and-comparisons.md) — practical use cases and industry applications