# Quick Start Guide (5 Minutes)

Get started with msr, nin, and vscode-msr aliases in under 5 minutes.

> **Want comprehensive documentation?** See [msr User Guide](msr-user-guide.md), [nin User Guide](nin-user-guide.md), [vscode-msr User Guide](vscode-msr-user-guide.md).
>
> **Looking for download links?** See [Download Links](download-links.md).

---

## Table of Contents

- [Quick Start Guide (5 Minutes)](#quick-start-guide-5-minutes)
  - [Table of Contents](#table-of-contents)
  - [Installation](#installation)
  - [Choose Your First Tool (30 Seconds)](#choose-your-first-tool-30-seconds)
  - [msr in 2 Minutes — Search and Replace](#msr-in-2-minutes--search-and-replace)
    - [Search Files](#search-files)
    - [Replace Text (Preview First)](#replace-text-preview-first)
    - [Common Output Flags](#common-output-flags)
  - [nin in 1 Minute — Set Operations and Distribution](#nin-in-1-minute--set-operations-and-distribution)
  - [vscode-msr Aliases in 1 Minute](#vscode-msr-aliases-in-1-minute)
  - [msr + nin Together](#msr--nin-together)
  - [What's Next?](#whats-next)

---

## Installation

**Option A: VS Code Extension (Recommended)**

Install [vscode-msr](https://marketplace.visualstudio.com/items?itemName=qualiu.vscode-msr) — it auto-downloads both `msr` and `nin` and sets up all aliases.

**Option B: Manual Download**

Download the single binary for your platform — see [Download Links](download-links.md). No dependencies, no installer — just download and run.

| Platform | Architecture | Tool |
|----------|-------------|------|
| Windows  | x86_64, x86_32, Arm64 | `msr.exe`, `nin.exe` (MinGW); Cygwin uses `msr.cygwin`, `nin.cygwin` |
| Linux    | x86_64, x86_32, Arm64 | `msr`, `nin` |
| macOS    | Arm64 | `msr`, `nin` |
| FreeBSD  | x86_64 | `msr`, `nin` |

---

## Choose Your First Tool (30 Seconds)

Use this decision table to start from the most practical entry point:

| If your immediate goal is... | Start with | Why |
|---|---|---|
| Search/replace text in files | `msr` | Most direct workflow with preview-by-default |
| Dedup / diff / top distribution | `nin` | Native set operations and Pareto analysis |
| Code search in VS Code with minimal setup | `gfind-xxx` aliases | Git-scoped, low-noise shortcuts |

```bash
# Search/replace first
msr -rp . -f "\.cs$" -t "old" -o "new"

# Set analysis first
nin error.log nul "(\w+Exception)" -pd --sum -H 10

# VS Code alias first
gfind-code -t "TODO|FIXME"
```

---

## msr in 2 Minutes — Search and Replace

### Search Files

```bash
# Search for "TODO" in all code files recursively
msr -rp . -f "\.(cs|py|js)$" -x "TODO" -c

# Search with regex pattern, ignore case
msr -rp . -f "\.log$" -it "error|warning|exception"

# List only matching file paths
msr -rp . -f "\.config$" -x "password" -l

# Get clean output (no path prefix, no color; keeps summary on stderr)
msr -rp . -f "\.txt$" -x "keyword" -PIC
```

### Replace Text (Preview First)

```bash
# Step 1: Preview (default — no -R, no file changes)
msr -rp . -f "\.cs$" -t "oldName" -o "newName"

# Step 1b: Preview changes only (show ONLY lines that actually change)
msr -rp . -f "\.cs$" -t "oldName" -o "newName" -j

# Step 2: Apply with backup (-R = replace, -K = backup)
msr -rp . -f "\.cs$" -t "oldName" -o "newName" -RK
```

**Key safety features:**
- **Preview by default** — without `-R`, nothing is written
- **Skip-write if unchanged** — files with identical content are NOT written
- **Backup with `-K`** — timestamp-named backup, collision-proof

### Common Output Flags

| Flags  | Meaning (msr) | Use Case |
|--------|---------|----------|
| `-PIC` | No path, no extra info, no color (keeps summary) | Scripts and piping |
| `-C`   | No color (keeps path + summary)   | Alias output for agents |
| `-c`   | Show command | Debug your command |
| `-l`   | List files (with match count) | Get matching file paths |
| `-j`   | Changes only | See what would change |
| `-H N -J` | Stop after N matches | Fast existence check |

> ⚠️ **Note**: `-P` and `-I` have **different meanings** in msr vs nin. See [Parameter Semantic Differences](msr-nin-shared-reference.md#parameter-semantic-differences) for the full comparison.

---

## nin in 1 Minute — Set Operations and Distribution

```bash
# Unique lines (dedup)
nin file.txt nul -u

# Frequency distribution (like SQL GROUP BY + ORDER BY COUNT DESC)
nin file.txt nul "(\w+)" -pd

# Top 10 with cumulative percentage (Pareto analysis)
nin file.txt nul "(\w+)" -pd --sum -H 10

# Set difference: lines in file1 not in file2
nin file1.txt file2.txt "^(\S+)"

# Set intersection: lines in both files
nin file1.txt file2.txt "^(\S+)" -m
```

**Key features:**
- **No pre-sorting required** (unlike `comm` or `uniq`)
- **Regex key extraction** via capture groups
- **Cumulative Pareto analysis** with `--sum`

---

## vscode-msr Aliases in 1 Minute

After installing the vscode-msr extension, open a terminal in VS Code:

```bash
# Search Python files
gfind-py -t "pattern"

# Search all code files
gfind-code -t "TODO|FIXME"

# Find class definitions
gfind-cs-def MyClass

# Find references
gfind-java-ref myMethod

# Discover available aliases
find-alias keyword
```

**Three scope levels:**
- `find-xxx` — recursive directory traversal (`-rp .`)
- `gfind-xxx` — git-tracked files only (faster for small repos)
- `rgfind-xxx` — cross-repository search

---

## msr + nin Together

```bash
# Search → Analyze: find errors, then get distribution
msr -rp logs/ -f "\.log$" -t "(\w+Exception)" -PIC | nin nul "(\w+Exception)" -pd --sum -H 20

# Extract → Dedup: extract values, then deduplicate
msr -rp . -f "\.yaml$" -t "image:\s+(\S+)" -o "\1" -PIC | nin nul "(\S+)" -ui

# Sort logs from multiple files by timestamp
msr -rp logs/ -f "\.log$" -F "\d{4}-\d{2}-\d{2}\D\d+:\d+:\d+[\.,]?\d*"
```

---

## What's Next?

| Goal | Document |
|------|----------|
| Learn msr in depth | [msr User Guide](msr-user-guide.md) |
| Learn nin in depth | [nin User Guide](nin-user-guide.md) |
| Learn vscode-msr aliases | [vscode-msr User Guide](vscode-msr-user-guide.md) |
| See real-world examples | [Use Cases and Comparisons](use-cases-and-comparisons.md) |
| Compare with other tools | [Tool Comparisons](tool-comparisons.md) |
| Optimize performance | [Performance Tuning](performance-tuning.md) |
| Use with AI agents | [AI Agent Usage Guide](ai-agent-usage-guide.md) |
| Environment, encoding & colors | [msr and nin Shared Reference](msr-nin-shared-reference.md) |
| Download for your platform | [Download Links](download-links.md) |