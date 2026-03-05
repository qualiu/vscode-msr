# AI Agent Usage Guide

Practical playbook for **AI agents** using msr, nin, and vscode-msr aliases.

This document focuses on **execution strategy** (what to run, in what order, and why), not full parameter dictionaries.

> Parameter schemas:
> - [msr AI Agent Reference](msr-ai-agent-reference.md)
> - [nin AI Agent Reference](nin-ai-agent-reference.md)
> - [vscode-msr AI Agent Reference](vscode-msr-ai-agent-reference.md)
>
> Human scenario catalog:
> - [Practical Use Cases and Tool Comparisons](use-cases-and-comparisons.md)

---

## Table of Contents

- [AI Agent Usage Guide](#ai-agent-usage-guide)
  - [Table of Contents](#table-of-contents)
  - [Scope and Output](#scope-and-output)
  - [Hard Guardrails (Read First)](#hard-guardrails-read-first)
  - [Minimal Decision Tree](#minimal-decision-tree)
  - [Safe File Modification Workflow](#safe-file-modification-workflow)
  - [Token Budget Patterns](#token-budget-patterns)
  - [Reusable Agent Recipes](#reusable-agent-recipes)
  - [Return Value and Cross-Platform Safety](#return-value-and-cross-platform-safety)
  - [Reference Map (Single Source of Truth)](#reference-map-single-source-of-truth)

---

## Scope and Output

This guide is optimized for agent tasks:

- reduce token consumption
- avoid risky edits
- keep outputs script-friendly
- compose msr + nin + aliases into repeatable workflows

It intentionally avoids duplicating long option tables already maintained in reference docs.

---

## Hard Guardrails (Read First)

These rules prevent the most common agent mistakes:

1. **`-P` strips location info**
   In msr, `-P` (`--no-path-line`) removes location prefix (`file:row:` or `file:row:col:`).
   Use `-P` only when location info is not needed (pipe extraction / text-only output).
   Prefer:
   - `-C` when location is needed
   - `-PC` when pure text is needed

2. **Location is not always `file:row:col:`**
   msr / `find-*` / `gfind-*` may output:
   - `file:row:` (no column), or
   - `file:row:col:` (with column)
   Column appears only when `--out-index` is enabled (or `MSR_OUT_INDEX=1`).

3. **`-I` has opposite meanings in msr vs nin**
   - msr `-I` = suppress extra info (`--no-extra`)  
   - nin `-I` = route summary to stdout (`--info-normal-out`)  
   Never assume cross-tool semantic equivalence for short flags. See [Parameter Semantic Differences](msr-nin-shared-reference.md#parameter-semantic-differences).

4. **Keep summary by default; avoid unnecessary `-M` / `-A`**
   Summary is stderr by default and does not pollute stdout pipes.
   It is useful for diagnostics and count parsing.
   Prefer keeping summary unless strict silent mode is required.

5. **Cross-platform count safety: use `--exit` when thresholds matter**
   On non-Windows shells, large counts can be truncated.
   Use `--exit gt255-to-255` (or `gt127-to-127` for MinGW) for stable threshold gates.

6. **BOM replacement is risky without explicit intent**
   `--force` on non-UTF8 BOM files converts output to UTF-8 no BOM.
   Use `-RK --force` only when encoding conversion is acceptable.

7. **Always bound output when exploring unknown scope**
   Start with `-H N` (and `-J` for early global stop when applicable).

---

## Minimal Decision Tree

1. **Scope selection**
   - git repo and tracked files preferred: `gfind-*`
   - include untracked files / no git: `find-*`
   - sibling repos: `rgfind-*`

2. **Intent selection**
   - content search: `*-{ext} -t ...` / `-x ...`
   - definition/reference: prefer `-ref` + disambiguation (`-x class`, `-x function`) when `-def` is unstable

3. **Output mode**
   - with location for navigation (`file:row:` or `file:row:col:`): `-C`
   - pure text for pipes: `-PC`

4. **Risk mode**
   - read-only exploration first
   - replace only after preview and scope verification

Alias runtime discovery: [vscode-msr AI Agent Reference](vscode-msr-ai-agent-reference.md).

---

## Safe File Modification Workflow

Use the same 3-step pipeline for all replacements.

### Step 1: Scope verification

```bash
gfind-code -t "OldName" -l -PC
gfind-code -t "OldName" -H 30 -C
```

### Step 2: Preview changes

```bash
gfind-code -t "OldName" -o "NewName" -j -C
```

### Step 3: Apply with safety

```bash
gfind-code -t "OldName" -o "NewName" -RK
```

Then verify residual hits:

```bash
gfind-code -t "OldName" -H 1 -J
```

For block-scoped replacement (INI/XML/YAML fragments), use `-b/-Q` patterns from [msr User Guide](msr-user-guide.md#block-matching-multi-line).

---

## Token Budget Patterns

### 1) Existence gate vs count mode

```bash
# existence
msr -p file.py -t "pattern" -H 1 -J

# count mode (no matched line output)
msr -p file.py -t "pattern" -H 0
```

### 2) Locate first, read second

```bash
gfind-py -t "class OrderProcessor" -l -PC
msr -p src/orders/processor.py -t "class OrderProcessor" -U 2 -D 25 -C
```

### 3) Noise control

```bash
gfind-code -t "pattern" --nt "^.{300,}$" -H 40 -C
```

### 4) Keep outputs parse-friendly

- navigation output: `-C`
- pure extraction output: `-PC`
- avoid unnecessary decorative verbosity

---

## Reusable Agent Recipes

### A) Search → distribution

```bash
msr -rp logs/ -f "\.log$" -t "(\w+Exception)" -PC | nin nul "(\w+Exception)" -pd --sum -H 20
```

### B) PR incremental checks

```bash
git diff --name-only HEAD~1 | msr -t "\.(cs|java|ts|py)$" -PC > /tmp/scope.txt
msr -w /tmp/scope.txt -t "\S\s+$" --no-check -l
msr -w /tmp/scope.txt -t "deprecated_api" --no-check -H 1 -J
```

### C) Time-window log drill-down

```bash
msr -rp services/ -f "\.log$" -F "(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})" -B "2024-01-15 10:00:00" -E "2024-01-15 10:30:00"
```

### D) Structured config surgery

```bash
msr -p config.ini -b "^\[production\]" -Q "^\[" -y -t "host\s*=\s*old-host" -o "host = new-host" -RK
```

---

## Return Value and Cross-Platform Safety

Recommended agent usage:

- yes/no gate: `-H 1 -J` (safe cross-platform)
- count mode: `-H 0` (returns count; no matched-line stdout)

Important platform caveat:

- non-Windows shells truncate exit code width
- for large counts, use capped exit strategy or parse summary
- full behavior: [Return Value Cross-Platform Behavior](msr-nin-shared-reference.md#return-value-cross-platform-behavior)

---

## Reference Map (Single Source of Truth)

Use this guide as orchestration layer, and defer details to source docs:

- msr parameters: [msr AI Agent Reference](msr-ai-agent-reference.md)
- nin parameters: [nin AI Agent Reference](nin-ai-agent-reference.md)
- shared semantics (encoding, exit, color, short-flag differences): [msr and nin Shared Reference](msr-nin-shared-reference.md)
- alias runtime rules: [vscode-msr AI Agent Reference](vscode-msr-ai-agent-reference.md)
- human scenario examples: [Practical Use Cases and Tool Comparisons](use-cases-and-comparisons.md)
- quick onboarding: [Quick Start](quick-start.md)