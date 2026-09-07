---
name: pdf-to-markdown
description: Converts a legacy specification PDF (use case specs, functional specs, requirements documents, reports) into structured markdown, using a deterministic Node extractor for the text and the model only to repair extraction defects. Use this when a PDF's content must be readable by downstream analysis agents without spending image tokens.
allowed-tools: Read, Write, Bash(mkdir*), Bash(node*), Bash(ls*), Bash(cd*)
---

You are converting a legacy specification PDF into structured markdown.

## Input

The PDF file path is: `$ARGUMENTS`

## Why a script does the extraction

The text is pulled out by `scripts/pdf-text.mjs`, not by you reading the PDF as
images. A specification corpus is typically hundreds of documents of a dozen or
more pages each; rendering them as images would cost more than the rest of the
pipeline combined. Most specification PDFs — anything produced from a word
processor rather than a scanner — carry extractable text, so start there.

The scripts need no dependencies (Node built-ins only), so they run wherever
Node does, including containers with no Python and no PDF tooling installed.

## Steps

1. **Extract the text.** The scripts sit beside this skill file. Your working
   directory may reset between Bash calls, so resolve an **absolute** path once
   and reuse it — do not rely on a relative `scripts/` path:

   ```
   SKILL_DIR=$(ls -d ~/.claude/skills/pdf-to-markdown .claude/skills/pdf-to-markdown 2>/dev/null | head -1)
   node "$(cd "$SKILL_DIR" && pwd)/scripts/pdf-text.mjs" "<pdf-path>"
   ```

   Output is one `--- pN ---` block per page.

   If it prints no pages, or pages with no text, the PDF is probably scanned
   images. Stop and report the file as unextractable — do **not** fall back to
   reading it as images unless the user has explicitly asked for that, and never
   invent content.

   For spreadsheets, `scripts/xlsx-text.mjs` takes the workbook path (listing its
   sheets) and then a sheet id (`worksheets/sheet1`) to dump that sheet.

2. **Identify the document template.** A long-lived system's specifications
   usually come in more than one generation, with different section sets and
   different vintages. Before converting a corpus, establish which templates
   exist and what distinguishes them, then record which one each document uses
   in the `template` front-matter field.

   Detect sections by matching headings **ignoring all whitespace**: word
   processors emit letter-spaced text, so `Main Flow` can arrive as
   `M ain F low`.

   The workspace's `CLAUDE.md` may already document the templates present in
   this corpus and how to tell them apart. Check there first. If it does not and
   you can see only one document, describe the template you found rather than
   guessing at a taxonomy.

3. **Segment into sections.** A heading string can occur several times: in the
   table of contents, as the body heading, and sometimes as a *column header*
   inside a table.

   Do **not** mechanically take the first or last occurrence — both are wrong on
   real documents. Instead, pick the occurrence that is followed by prose rather
   than by another heading, and ignore occurrences that sit inside a table row.
   The contents page is recognisable as a dense run of headings with page numbers
   and little else between them; skip that block wholesale.

4. **Repair extraction defects — this is the part only you can do.** Word
   processors lay text out by position, so the extractor recovers the characters
   but not always the spacing. Expect a few percent of the text mass to be
   affected, concentrated in the largest documents. Three faults, in increasing
   order of danger:

   - **Letter-spacing**: `Base l ined`, `UC1 53`, `Pre -Conditions`.
   - **Collapsed word spaces**: `flowwillbecontrolledbyrelevant`.
   - **Collapsed spaces that also swallow a character.** This is the fault most
     likely to produce a plausible-looking wrong word, so check for it
     explicitly. A capital letter following a space is the usual casualty:
     `teachstage` → "At each stage", `Thector` → "The Actor", `Takection` →
     "Take Action". When a de-spaced run yields a non-word that becomes a word
     by reinserting one capital, that is this fault — not an unknown term.

   Repair these **only where the intended reading is unambiguous**. Where it is
   not, keep the raw text, mark it inline with `<!-- unclear: ... -->`, **and**
   add a matching entry to the Extraction warnings section — inline for the
   reader who reaches that line, the list for anyone auditing the file. Never
   guess at a business rule, threshold, or identifier: a garbled rule is
   recoverable, a silently invented one is not.

   Content that is *contradictory in the source* is not an extraction fault.
   Preserve both readings verbatim and record the discrepancy in the warnings
   section; do not reconcile it.

5. **Preserve structure that carries meaning.** These are usually the
   highest-value parts of a specification; keep them as tables or lists, not
   prose:

   - Numbered process or flow steps, with any per-step reference columns
   - Branches, exception paths and alternative flows, with their own step numbers
   - Business rule identifiers, bound to the step that raises them
   - Requirement traceability references
   - Cross-references to other specifications (invokes / invoked-by)

   Keep identifiers **exactly** as the source writes them. Identifier schemes
   often carry more structure than they appear to — letter suffixes, bracketed
   former numbers, zero padding — and a downstream join will silently mismatch
   if you normalise them.

6. **Drop the noise.** Remove the running header and footer that repeat on every
   page — typically the document title, document reference, date, status and
   `Page n of m`, plus the bare dates and page numbers that follow them.
   Collapse the revision-history table to a single line naming the current
   version and date; the full history remains in the source PDF.

7. **Redact personal data.** Replace individuals' names with a consistent fake
   equivalent, keeping one mapping throughout a file. Most personal names sit in
   the revision history, which step 6 has already collapsed, so this usually
   applies to only a few names elsewhere in the document — check design notes,
   assumptions and open-issue sections. Team and role names are **not** personal
   data; leave them intact.

8. **Write the output** to `output/legacy-specs/<doc-id>.md`, creating the
   directory first — or `output/legacy-specs/<namespace>-<doc-id>.md` where the
   corpus needs a namespace (see the filename rule below). Derive `<doc-id>`
   from the source filename, preserving the identifier exactly — including any
   letter suffix, which usually denotes a genuinely different document.

   The `legacy-` prefix is deliberate: these are specifications *extracted from*
   the system being replaced, and reveng also writes feature specifications
   *for* its replacement (`output/features/`). Keeping the two apart by name
   stops a reader — or a downstream agent — conflating what the old system was
   specified to do with what the new one is being asked to do.

   If the workspace `CLAUDE.md` names a different output location or id
   convention for this corpus, follow that instead.

## Output format

Begin with YAML front matter, then the sections in document order:

```markdown
---
id: <document identifier from the source>
title: "<document title>"
version: "<version>"
template: <which template generation this document uses>
namespace: <see below; omit if the corpus has a single flat identifier space>
source: "<path to the source PDF, relative to the workspace root>"
pages: 12
sections_found: 12
extraction_warnings: 0
---

# <id> — <title>

## <first section>
...
```

### Field definitions

- `pages` — the page count the extractor reports.
- `sections_found` — the number of **top-level numbered** sections located
  (`12.1` counts as part of section 12, not as its own).
- `extraction_warnings` — the number of entries in the Extraction warnings
  section; `0` if there are none.
- `version` — the document version. Prefer the filename and title page: running
  page headers are often stale word-processor fields and can disagree with the
  document's actual version and status. Record any such conflict as a warning.
- Output filename is `<doc-id>.md` — **no version suffix** — when the corpus has
  one flat identifier space. Where it does not, the filename must carry the
  namespace too: `<namespace>-<doc-id>.md`. A bare `<doc-id>.md` is then
  ambiguous, and the ambiguity is not harmless: a curator resuming an
  interrupted run decides what to skip by asking whether the output file already
  exists, so one namespace's document silently suppresses conversion of the
  other's. Use the same namespace string as the front matter, lowercased.
- If you are about to overwrite an existing file for the same id **and
  namespace**, compare versions first and keep the higher one, noting the other
  in the warnings section. Two versions of one document must never silently
  overwrite each other.

### When identifiers are ambiguous, carry a namespace

**A document number alone does not always identify a document.** Long-lived
systems accumulate sub-projects that restart numbering from 1, so the same
number can denote two entirely unrelated specifications, sometimes as two files
in the same directory distinguished only by title.

Before converting a corpus, check whether its identifier space is flat. If it is
not, set `namespace` on **every** document in that corpus — not only the ones
whose numbers actually collide. A document belonging to a sub-project needs its
namespace recorded even where its own number happens to be unique, because a
later document can collide with it, and because a reader cannot tell an
unqualified identifier from an unchecked one.

The workspace `CLAUDE.md` or a catalogue artefact under `output/reference/` may
name the namespaces and the colliding identifiers; check there first, and prefer
a catalogue lookup over inferring from the title. If a document's namespace
cannot be determined, set `namespace: unknown` and add a warning — never guess.

### Record what you could not do

If anything was unclear or unrepairable, end the file with:

```markdown
## Extraction warnings

- Section "Business Rules": step reference garbled, kept raw — `<original text>`
```

Set `extraction_warnings` in the front matter to the number of entries. An empty
warnings section is fine and preferable to a silent repair.

## Rules

- **Never fabricate content.** If the extractor returns nothing for a section,
  write the heading with `_No content extracted._` beneath it. If a table's
  headings extracted but it has no data rows, keep the headings and write
  `_No rows in source._` below them — a populated-but-empty table is different
  from a section that failed to extract.
- **Do not summarise.** This is a conversion, not an analysis. Downstream agents
  do the interpreting; your output must preserve what the specification says,
  including detail that looks redundant.
- **Do not read the PDF as images.** The extractor is the supported route.
