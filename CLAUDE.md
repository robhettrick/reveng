# Reveng

A lightweight harness around Claude Code for reverse-engineering legacy applications.

## Context

Organisations often maintain large estates of legacy applications built across decades using a variety of technologies. Reveng helps engineers understand, document, and modernise these systems regardless of language, framework, or database stack.

## Verification

There is no test suite. Before committing, both shell scripts must pass shellcheck with the default rule set:

```bash
shellcheck reveng install.sh
```

This must exit 0. Optional rules (`-o all`) surface pre-existing style findings and are not part of the check.

## Conventions for working on this source repo

- Use British English in all documentation
- Keep agents and skills stack-agnostic — they must discover the target codebase's language, framework, and database at runtime, not assume them
- Treat all legacy code as potentially undocumented — never assume documentation exists (inform prompt design)
- When creating a new skill, add an entry to the Skills table in README.md
- When creating a new agent, add an entry to the Agents table in README.md

Workspace-facing conventions (used by agents at runtime) live in [`templates/workspace-CLAUDE.md`](templates/workspace-CLAUDE.md), which is the CLAUDE.md `reveng init` ships into a workspace.
