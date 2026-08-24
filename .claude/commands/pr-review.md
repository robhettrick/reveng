---
description: Adversarial PR review of the current branch, findings-only, same brief as CI
allowed-tools: Read, Grep, Glob, Edit(.claude-review/findings.json), Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(git merge-base:*), Bash(npm test:*), Bash(npm run lint:*), Bash(shellcheck:*), Bash(bash -n:*), Bash(python3 .github/claude/filter_findings.py:*)
---

Review the current branch against `$ARGUMENTS` (default `main`) using the brief in `.github/claude/pr-review-prompt.md`. Substitute `{{RUN_CONTEXT}}` with the repo, base ref, HEAD sha and the test/lint commands for each directory that has a `package.json` (`npm --prefix <dir> test`, `npm --prefix <dir> run lint`); do not install anything. Commands for nested trees (`npm --prefix <dir> ...`) are deliberately not pre-authorised; ask at the permission prompt.

Write `.claude-review/findings.json` per the brief. Then run:

    python3 .github/claude/filter_findings.py .claude-review/findings.json --dry-run

and show me only what the filter kept, one line each, followed by the count of what it dropped. Do not summarise the PR, do not list what was done well. Do not fetch anything from the web; if a library behaviour matters, read it in `node_modules`.
