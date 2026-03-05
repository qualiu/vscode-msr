# vscode-msr Alias Reference for AI Agents

This document is the **Agent Delta** for vscode-msr aliases.

It only keeps content that AI agents need for reliable automation and avoids repeating human-oriented walkthroughs.

> Full alias catalogs, examples, and human onboarding are maintained in [vscode-msr Alias User Guide](vscode-msr-user-guide.md).
>
> Tool-level parameter schemas are in [msr AI Agent Reference](msr-ai-agent-reference.md) and [nin AI Agent Reference](nin-ai-agent-reference.md).

## Table of Contents

- [vscode-msr Alias Reference for AI Agents](#vscode-msr-alias-reference-for-ai-agents)
  - [Table of Contents](#table-of-contents)
  - [Scope and Boundaries](#scope-and-boundaries)
  - [Runtime Discovery First](#runtime-discovery-first)
  - [Agent Decision Tree (Minimal)](#agent-decision-tree-minimal)
  - [Execution Conventions (Delta Only)](#execution-conventions-delta-only)
  - [Reliability Fallbacks](#reliability-fallbacks)
  - [High-Value Alias Families](#high-value-alias-families)
  - [Anti-Patterns for Agents](#anti-patterns-for-agents)
  - [Cross-References](#cross-references)

## Scope and Boundaries

This file is intentionally limited to:

- Runtime alias selection rules for agents
- Invocation conventions that are easy to misuse
- Reliability fallbacks when default alias behavior is not ideal

This file intentionally does **not** duplicate:

- Full alias inventories
- Human learning workflows
- Extended examples already documented elsewhere

For those, use [vscode-msr Alias User Guide](vscode-msr-user-guide.md).

## Runtime Discovery First

Always verify alias availability before invocation:

```bash
find-alias <name-or-prefix>
find-alias "<regex-pattern>"
find-alias <keyword> -Output Name
find-alias -Description "<keyword>"
```

Minimal rule:

1. Discover (`find-alias`)
2. Select
3. Execute

## Agent Decision Tree (Minimal)

1. Choose scope:
   - Git repo and tracked files preferred: `gfind-*`
   - Need untracked files or no git repo: `find-*`
   - Multiple sibling repos: `rgfind-*`
2. Choose target:
   - Known language: `*-{ext}`
   - Unknown/custom extension: `*-file -f "\.ext$"`
   - Broad but safer scan: `*-small`
3. Choose intent:
   - Content search: no suffix, pass `-t` / `-x`
   - Definition/ref intent: prefer `-ref` plus disambiguation
4. Validate alias exists with `find-alias`
5. Execute with output limits (`-H`, optionally `-J`)

## Execution Conventions (Delta Only)

### 1) Base aliases vs `-def` / `-ref`

- Base aliases (`find-{ext}`, `gfind-{ext}`, `find-file`, `find-small`) pass all args via `$*`.
- `-def` / `-ref` aliases treat the first positional argument as the search term (`$1`), then append extra args.

### 2) Required match flags for base aliases

Do not invoke base aliases without a match filter.

```bash
# Correct
gfind-py -t "pattern"
gfind-cs -x "TODO"

# Risky (can flood output)
# gfind-py
```

### 3) Built-ins that should not be duplicated

For search aliases, `--out-index` is already built-in. Do not append it again.

## Reliability Fallbacks

When `-def` aliases are slow or return low-quality results:

```bash
# Prefer -ref with literal keyword narrowing
gfind-py-ref MyClass -x class
gfind-ts-ref myFunc -x function

# Or use base alias with explicit regex
gfind-py -t "class\s+MyClass\b"

# Narrow scope when possible
gfind-cs-ref MyService -x class -d Services
```

## High-Value Alias Families

Keep these as the default operational set for agents:

- Discovery: `find-alias`
- Scoped code search: `gfind-{ext}`, `gfind-code`, `gfind-file`, `gfind-small`
- Git diff context: `gdm-l`, `gdm-ml`, `gdm-al`, `gdm-dl`, `gdm-nt`
- History search: `git-find-content`, `git-find-log`, `git-find-commit`

For complete alias families and examples, see [vscode-msr Alias User Guide](vscode-msr-user-guide.md).

## Anti-Patterns for Agents

- Skipping `find-alias` verification in unknown environments
- Running base aliases without `-t` / `-x` / `--nt` / `--nx`
- Re-adding built-in flags such as `--out-index`
- Treating `-def` as always more reliable than `-ref + -x`
- Doing unbounded scans without `-H` (and `-J` when only existence/examples are needed)

## Cross-References

- Human guide: [vscode-msr Alias User Guide](vscode-msr-user-guide.md)
- Tool schemas: [msr AI Agent Reference](msr-ai-agent-reference.md), [nin AI Agent Reference](nin-ai-agent-reference.md)
- Practical scenarios: [Use Cases and Comparisons](use-cases-and-comparisons.md)
- Agent workflow patterns: [AI Agent Usage Guide](ai-agent-usage-guide.md)