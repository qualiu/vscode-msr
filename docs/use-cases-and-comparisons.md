# Practical Use Cases and Tool Comparisons

A focused guide for **humans** covering real-world applications and comparison entry points for msr, nin, and vscode-msr aliases.

> **Looking for tool references?** See [msr User Guide](msr-user-guide.md), [nin User Guide](nin-user-guide.md), [vscode-msr User Guide](vscode-msr-user-guide.md), and [Download Links](download-links.md).
>
> **Looking for AI agent integration?** See [AI Agent Usage Guide](ai-agent-usage-guide.md).
>
> **Detailed feature-vs-feature comparison tables** are kept in [Tool Comparisons](tool-comparisons.md).

---

## Table of Contents

- [Practical Use Cases and Tool Comparisons](#practical-use-cases-and-tool-comparisons)
  - [Table of Contents](#table-of-contents)
  - [Why msr / nin / vscode-msr?](#why-msr--nin--vscode-msr)
    - [Tool Positioning](#tool-positioning)
    - [Core Value Proposition](#core-value-proposition)
    - [Irreplaceable Advantages](#irreplaceable-advantages)
  - [High-Value Scenario Map (Start Here)](#high-value-scenario-map-start-here)
  - [Alias High-Value Entry Principles](#alias-high-value-entry-principles)
  - [Five Core Scenarios](#five-core-scenarios)
    - [1) Code Understanding, Navigation, and Safe Refactoring](#1-code-understanding-navigation-and-safe-refactoring)
    - [2) Incremental CI and Change-Quality Gates](#2-incremental-ci-and-change-quality-gates)
    - [3) Observability and Incident Triage](#3-observability-and-incident-triage)
    - [4) Structured Text and Config Surgery](#4-structured-text-and-config-surgery)
    - [5) Data Quality and Consistency Validation](#5-data-quality-and-consistency-validation)
  - [Tool Comparisons](#tool-comparisons)
  - [Quick Reference Tables](#quick-reference-tables)
    - [Common msr Patterns](#common-msr-patterns)
    - [Common nin Patterns](#common-nin-patterns)
    - [Common vscode-msr Alias Patterns](#common-vscode-msr-alias-patterns)
  - [Further Resources](#further-resources)

---

## Why msr / nin / vscode-msr?

### Tool Positioning

| Tool           | Purpose                                         | Analogy                                                    |
| -------------- | ----------------------------------------------- | ---------------------------------------------------------- |
| **msr**        | Regex text search/replace + numeric statistics  | `grep` + `sed` + `awk` combined, cross-platform consistent |
| **nin**        | Line/key set operations + distribution analysis | `comm` + `uniq -c` + SQL GROUP BY, no pre-sorting required |
| **vscode-msr** | Zero-config language-aware aliases in VS Code   | `gfind-py-def`, `gfind-cs-ref` — ready to use              |

### Core Value Proposition

| Value           | Description                                                | Example                                        |
| --------------- | ---------------------------------------------------------- | ---------------------------------------------- |
| **Efficiency**  | One command replaces multi-tool pipelines                  | `msr -rp . -t "TODO" -l` vs `find + grep + wc` |
| **Precision**   | Context-aware scoring, namespace filtering, block matching | Go to Definition ranks results by relevance    |
| **Safety**      | Preview-by-default, auto-backup, skip-write if unchanged   | No accidental overwrites, clean `git status`   |
| **Integration** | VS Code aliases, AI-agent friendly                         | `gfind-py -t "pattern"` works out of the box   |
| **Analysis**    | Built-in P05-P99.999 stats, Pareto analysis                | `msr -s "" -n -H 0 -C` for latency percentiles |

### Irreplaceable Advantages

| Feature                           | Description                                  | Value                                                |
| --------------------------------- | -------------------------------------------- | ---------------------------------------------------- |
| **Return value = match count**    | grep returns 0/1, msr returns actual count   | Script threshold checks: `if count > 100 then alert` |
| **Global fast exit** `-H N -J`    | Truly stops after N matches across ALL files | Sub-second response in TB-scale log directories      |
| **Block matching** `-b -Q`        | Parser-agnostic multi-line extraction        | Works on Helm templates, JSONC, multi-doc YAML       |
| **Pareto analysis** `--sum -K`    | Automated 80/20 analysis                     | Data-driven thresholds for TOP issues                |
| **Skip-write unchanged**          | No write if content identical                | Avoids git diff noise, unnecessary CI builds         |
| **Zero-dependency single binary** | No runtime, no package manager               | CI/CD: download and run immediately                  |

---

## High-Value Scenario Map (Start Here)

Use this quick map to choose the right entry:

1. **Code understanding / navigation / refactor safety** → [1) Code Understanding, Navigation, and Safe Refactoring](#1-code-understanding-navigation-and-safe-refactoring)
2. **PR-only incremental checks and gates** → [2) Incremental CI and Change-Quality Gates](#2-incremental-ci-and-change-quality-gates)
3. **Log troubleshooting and alerting** → [3) Observability and Incident Triage](#3-observability-and-incident-triage)
4. **Config block extraction and scoped edits** → [4) Structured Text and Config Surgery](#4-structured-text-and-config-surgery)
5. **Dataset consistency and quality checks** → [5) Data Quality and Consistency Validation](#5-data-quality-and-consistency-validation)

---

## Alias High-Value Entry Principles

1. **Prefer `gfind-*` in git repositories** — default to git-tracked scope; use `find-*` only when untracked files must be included.
2. **Use `find-alias` as runtime source of truth** — verify alias existence before invocation.
3. **Treat `-def` as optional** — if `-def` is slow or unstable, use `-ref + -x` or base alias with explicit regex and path narrowing (`-d` / `--sp` / `--xp`).

For AI-agent-specific delta rules, see [vscode-msr AI Agent Reference](vscode-msr-ai-agent-reference.md).

---

## Five Core Scenarios

### 1) Code Understanding, Navigation, and Safe Refactoring

This scenario combines code navigation, clickable terminal jumping, safe rename/refactor workflow, and git history tracing.

#### Terminal-clickable navigation output

- Default location format: `{path}:{row}: {line-text}`
- With index: `{path}:{row}:{column}: {line-text}`

```bash
gfind-cs -t "OrderService" -C
gfind-cs-ref OrderService -H 30
```

#### IDE terminal clickable navigation guides

- [IntelliJ IDE terminal clickable navigation guide](https://marketplace.visualstudio.com/items?itemName=qualiu.vscode-msr#the-cookeddumped-aliasdoskey-can-be-used-in-many-ides-not-just-vscode)
- [Visual Studio terminal clickable navigation via ConEmu guide](https://github.com/qualiu/msrTools/blob/master/code/vs-conemu/README.md#2-use-conemu-terminal-in-visual-studio)

#### Representative workflow

```bash
# 1) Scope risky markers
gfind-code -t "TODO|FIXME|HACK|XXX" -i

# 2) Preview rename (changed lines only)
gfind-cs -t "OldClassName" -o "NewClassName" -j

# 3) Apply rename safely with backup
gfind-cs -t "OldClassName" -o "NewClassName" -RK

# 4) Verify references
gfind-cs-ref NewClassName -H 50

# 5) Trace symbol history
git-find-content "OldClassName|NewClassName"
```

---

### 2) Incremental CI and Change-Quality Gates

This scenario focuses on PR-scoped checks, fail-fast validation, and threshold decisions by return values.

```bash
# Build changed-file scope
git diff --name-only HEAD~1 | msr -t "\.(cs|java|ts|py)$" -PIC > /tmp/scope.txt

# Whitespace check on changed files only
msr -w /tmp/scope.txt -t "\S\s+$" --no-check -l

# Existence check (fast global stop)
msr -w /tmp/scope.txt -t "deprecated_api" --no-check -H 1 -J

# Exact count for threshold decision
msr -w /tmp/scope.txt -t "TODO|FIXME" --no-check -H 0
```

Typical gate logic (msr):
- `-H 1 -J`: yes/no existence gate (fast global stop)
- `-H 0`: hide matched output; keep summary (count info) visible by default

---

### 3) Observability and Incident Triage

Canonical flow: **merge/sort logs → classify/distribute → time-window drill-down → hotspot focus**.

```bash
# 1) Merge logs by timestamp and classify exception types
msr -rp logs/ -f "\.log$" -F "\d{4}-\d{2}-\d{2}\D\d+:\d+:\d+[\.,]?\d*" | nin nul "(\w+Exception)\b" -pd --sum -H 20

# 2) Time-window troubleshooting
msr -rp logs/ -f "\.log$" -F "(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})" -B "2024-01-15 10:00:00" -E "2024-01-15 10:30:00"

# 3) Fast first-hit check on huge datasets
msr -rp /var/log -f "\.log$" -t "CRITICAL|FATAL" -H 1 -J

# 4) Service/pod hotspot distribution
msr -rp logs/pods -x "Exception" | nin nul "pods[\\/](\S+?)-\w+-\w+\.log" -pd
```

---

### 4) Structured Text and Config Surgery

Canonical flow: **block extraction → scoped replace → safety verification**.

```bash
# INI: scoped replace in production section only
msr -p config.ini -b "^\[production\]" -Q "^\[" -y -t "host\s*=\s*old-host" -o "host = new-host" -RK

# Kubernetes: extract matched manifest blocks
msr -rp k8s/ -f "\.yaml$" -b "^apiVersion:" -Q "" -y -t "app:\s+my-service" -a

# Nginx: locate HTTPS server blocks
msr -rp /etc/nginx/ -f "\.conf$" -b "^\s*server\s*\{" -Q "^\s*\}" -t "listen\s+443" -a
```

Key value:
- Parser-agnostic block operations on real-world mixed formats
- Safe writes with preview + backup path

---

### 5) Data Quality and Consistency Validation

Canonical flow: **schema sanity → dedup/distribution → dataset delta/intersection**.

```bash
# CSV: detect rows with missing fields
msr -p users.csv -t "^([^,]*,){0,3}[^,]*$" --nt "^id,"

# Duplicate key detection
nin users.csv nul "^(\d+)," -pd | msr -t "^\s*[2-9]\d*-"

# Dataset delta
nin new-export.csv old-export.csv "^([^,]+)" -u

# Allowlist/expected-key completeness check
nin expected-keys.txt actual-output.csv "^(\S+)" "^([^,]+)"

# Dependency conflict hints
msr -rp . -f "requirements.*\.txt$" -t "^([a-zA-Z][\w.-]+)==" -PIC | nin nul "^([^=]+)" -pd
```

---

## Tool Comparisons

For detailed comparison tables, benchmarks, and irreplaceable-feature analysis:

**→ [Tool Comparisons](tool-comparisons.md)**

---

## Quick Reference Tables

### Common msr Patterns

| Task                          | Command                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| Search files recursively      | `msr -rp . -f "\.ext$" -t "pattern"`                                                          |
| Preview all matches           | `msr -rp . -f "\.ext$" -t "old" -o "new"`                                                     |
| Preview changes only          | `msr -rp . -f "\.ext$" -t "old" -o "new" -j`                                                  |
| Full output with replacements | `msr -rp . -f "\.ext$" -t "old" -o "new" -a`                                                  |
| Replace with backup           | `msr -rp . -f "\.ext$" -t "old" -o "new" -RK`                                                 |
| List files only               | `msr -rp . -f "\.ext$" -t "pattern" -l`                                                       |
| Context lines                 | `msr -rp . -f "\.ext$" -t "pattern" -U 3 -D 3`                                                |
| Block extraction              | `msr -p file -b "begin" -Q "end" -t "filter" -a`                                              |
| Time-sorted merge             | `msr -rp logs/ -f "\.log$" -F "time-regex"`                                                   |
| Numeric statistics            | `msr -p file -t "(\d+)" -s "" -n -H 0 -C`                                                     |
| Batch execute                 | `msr -p list.txt -t "(.+)" -o "cmd \"\1\"" -XMO`                                              |
| Existence check               | `msr -p file -t "pattern" -H 1 -J`                                                            |
| Exact count (scripting)       | `msr -p file -t "pattern" -H 0`                                                               |

### Common nin Patterns

| Task                        | Command                                       |
| --------------------------- | --------------------------------------------- |
| Difference set              | `nin file1 file2 "regex"`                     |
| Intersection                | `nin file1 file2 "regex" -m`                  |
| Unique lines                | `nin file nul -u`                             |
| Unique with regex key       | `nin file nul "regex" -u`                     |
| Frequency distribution      | `nin file nul "regex" -pd`                    |
| Top N distribution          | `nin file nul "regex" -pd -H N`               |
| Pareto analysis             | `nin file nul "regex" -pd --sum -K 5.0`       |
| Structure-preserving filter | `nin file exclude "regex1" "regex2" -wn -PAC` |
| Pipe distribution           | `command \| nin nul "regex" -pd`              |
| Silent count (scripting)    | `nin file nul "regex" -pd -H 0 2>nul`         |

### Common vscode-msr Alias Patterns

| Task                    | Alias Example                         |
| ----------------------- | ------------------------------------- |
| Search code by language | `gfind-py -t "pattern"`               |
| Find definitions        | `gfind-cpp-def MyClass`               |
| Find references         | `gfind-java-ref myMethod`             |
| Search all code         | `gfind-code -t "pattern"`             |
| Search any file type    | `gfind-file -f "\.ext$" -t "pattern"` |
| File type distribution  | `gfind-top-type`                      |
| Folder distribution     | `gfind-top-folder`                    |
| Discover aliases        | `find-alias keyword`                  |
| Git diff vs main        | `gdm-l`                               |

---

## Further Resources

**Related documentation in this project:**

- [msr User Guide](msr-user-guide.md) — comprehensive msr documentation
- [msr AI Agent Reference](msr-ai-agent-reference.md) — technical parameter reference
- [nin User Guide](nin-user-guide.md) — comprehensive nin documentation
- [nin AI Agent Reference](nin-ai-agent-reference.md) — technical parameter reference
- [vscode-msr User Guide](vscode-msr-user-guide.md) — alias usage for humans
- [vscode-msr AI Agent Reference](vscode-msr-ai-agent-reference.md) — alias reference for AI agents
- [AI Agent Usage Guide](ai-agent-usage-guide.md) — AI agent integration patterns
- [Performance Tuning & Benchmark Summary](performance-tuning.md) — optimization strategies and cross-platform benchmarks
- [Download Links](download-links.md) — platform-specific download tables

**External links:**

- GitHub: https://github.com/qualiu/msr
- More tools: https://github.com/qualiu/msrTools
- VSCode extension: https://github.com/qualiu/vscode-msr