---
name: curate-specification
description: Turns a deterministically-extracted specification draft into analysis-ready markdown. Repairs the extraction defects the draft flags, resolves identifiers and namespaces against the corpus catalogue, redacts personal data against the corpus mapping, and records source-internal contradictions rather than silently resolving them. It performs no extraction of its own. Use this when a specification's content must be readable by downstream analysis agents.
allowed-tools: Read, Glob, Grep, Write, Edit, Bash(mkdir*)
---

You are turning a deterministically-extracted specification draft into
analysis-ready markdown.

## Input

`$ARGUMENTS` carries the draft path and, when the caller has already resolved
them, the decisions that determine where the output goes:

```
<draft-path> | id=<id> | namespace=<namespace> | out=<output-dir>
```

Use what you are given rather than re-deriving it. A curator dispatching you has
the corpus catalogue; you have one document, so it can resolve a namespace you
cannot. Where only a path is passed, fall back to deriving `id` from the source
filename and the namespace rule below.

`namespace=unknown` is a deliberate signal, not a value: the caller could not
place the document. Write it through to the front matter and the filename
unchanged, and add a warning saying the namespace is unresolved. Do not
substitute a guess — a wrong namespace is indistinguishable from a right one
downstream, whereas `unknown` is a question anyone can see.

A draft is a `.md` file with `draft: true` in its front matter, produced by the
export tooling. Its source PDF is named in that front matter, and its own
manifest entry sits beside it as `<draft-stem>.manifest.json`.

**Read that file, not the corpus manifest.** `<extracted>/manifest.json` holds
every document's entry; reading it to find one costs far more than everything
else you read put together, for an answer the small file gives directly.

## What is yours to do, and what is not

A script gets the text out; you make the judgements it cannot. Keeping that line
clear is the whole point, because the two have wildly different costs.

**Not yours.** Extraction, template identification, section segmentation,
header and footer removal, and finding defects. All of it is mechanical, and
where a corpus has been through a deterministic extractor you will be handed a
draft with that work already done and its defects listed. Redoing any of it
means holding a whole document in context and reasoning over it turn after turn
to reach a conclusion a regex already reached.

**Yours.** Four things a script cannot do:

- **Repairing a flagged defect**, where the intended reading takes judgement.
- **Resolving an identifier**, where a corpus's numbering is not flat and the
  namespace has to come from a catalogue.
- **Redacting personal data**, consistently against a corpus-wide mapping.
- **Noticing a source-internal contradiction** — a rule scoped to one step but
  attached to another, a flow numbered differently in two places — and
  preserving both readings rather than quietly picking one.

Only the first of those is conditional. A draft with no flagged defects still
needs its structure preserved, its identifier resolved and its names redacted —
every step below except the repair. Do not manufacture repair work to fill it.

## Steps

1. **Read the draft and its manifest entry.**

   Your input is a `.md` draft produced by a deterministic extractor, not a PDF.
   The text is already out, the template is identified in the front matter, the
   sections are segmented, and the running header and footer are gone.

   **Read `<draft-stem>.manifest.json`, beside the draft** — this document's own
   entry, listing the defects the extractor found with a page number and a
   sample each. Read it before anything else: it is the list of what needs your
   attention. Do **not** read the corpus-wide `<extracted>/manifest.json`; it
   carries every document's entry, and reading it to reach one costs more than
   everything else you read put together.

   A draft with no defects listed skips step 2 and nothing else — the remaining
   steps apply to every document.

   **This skill does not extract PDFs.** If you were handed a PDF rather than a
   draft, stop and say so — the corpus needs its extractor run first. Do not
   read the PDF as images, and do not improvise an extraction: text recovered by
   guesswork is indistinguishable from text recovered correctly, which makes a
   wrong reading permanent and invisible.

   The draft's front matter names the source PDF. Open it only to settle a
   defect the draft cannot settle alone.

   Catalogue spreadsheets are extracted by the same tooling, into a `sheets/`
   directory beside the drafts. Read those rather than the workbooks.

2. **Repair extraction defects — this is the part only you can do.** Word
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

   This includes a contradiction inside a single cell or sentence — a reference
   whose number and title disagree, say `AF04 Manually Add Animal` where AF04 is
   *Remove* and AF03 is *Add*. Nothing is garbled, so it does not read as an
   extraction defect, and "repair where unambiguous" invites correcting it. Do
   not: which half is wrong is a question about the source system, not about the
   text, and the answer may be that the reference is right and the title stale.

3. **Preserve structure that carries meaning.** These are usually the
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

4. **Redact personal data.** Replace individuals' names with a consistent
   pseudonym, taken from the corpus's mapping rather than invented — the same
   person must be the same pseudonym in every document, or a downstream reader
   cannot tell two mentions apart.

   **Read `pseudonyms.md` beside the drafts, not the full mapping.** It lists
   the replacements in use and nothing else. That is what both your checks need:
   a name on that list is *already redacted*, so leave it alone; a personal name
   not on it is either unmapped or not a person. The full map additionally holds
   every source value, and reading it would put those into your context for no
   benefit — which is the opposite of what the mapping is for, and it is the
   largest thing you would read.

   Where a draft arrives already redacted — the usual case, since extraction
   applies the mapping — you will meet pseudonyms rather than source values.
   Re-pseudonymising one mints a second identity for one person.

   **Report a new identity; do not add it to the mapping yourself.** Several
   converters run in parallel and cannot see each other's choices, so two
   meeting the same person mint two pseudonyms for them — the exact corpus-wide
   inconsistency the mapping exists to prevent. Let the caller mint it once.

   Report it in exactly this form, with no free-text slot for the name:

   ```
   NEW-PSEUDONYM: shape=<initials|forename|surname|forename-surname>
                  where=<section and row, e.g. "10.2 Open Issues, Assigned To">
                  placeholder=<the string you wrote in the body>
   ```

   **`shape` and `where` locate the value; they never contain it.** A coordinator
   opens the draft at `where` and reads it there — that is the point. Writing the
   value into this line puts the identity back into the very file the redaction
   removed it from, and does so in the section a reader is least likely to check.
   If you cannot describe a value without quoting it, quote nothing and give
   `where` alone.

   Where the mapping states its own protocol for this, that protocol wins over
   this instruction: it knows how many writers the run has.

   **Your input may already be redacted.** Where a corpus has been through an
   earlier redaction pass, the names you meet are already pseudonyms — and
   minting a fresh pseudonym for one is the exact corpus-wide inconsistency the
   mapping exists to prevent. Check the mapping's *pseudonym* column before
   treating a name as a source value: if it is already there as a replacement,
   leave it alone.

   Most personal names sit in the revision history, which the extractor has
   already collapsed, so this usually applies to a few names elsewhere — check design
   notes, assumptions and open-issue sections. Team, role and organisation names
   are **not** personal data; leave them intact.

   **Never write a source name into your output — including in a warning.** It
   is tempting to explain a redaction decision by quoting what you redacted:
   *"two author readings, `Ann Example` and `A. Example`"*. That puts the
   identity straight back into a file whose whole purpose was to remove it, and
   it does so in the section a reader is least likely to check. Write the
   observation with the pseudonym, or describe the shape of the problem without
   naming anyone — *"a mapped surname appeared with its final consonant
   doubled; same identity, added to the mapping"* records the finding perfectly
   well. The mapping file is the one place a source value belongs.

5. **Check your own output for source values before writing it.** Take the
   source column of the mapping and search what you are about to write. The
   expected result is zero matches. This is not the same as having redacted the
   body: the breach happens in the *warnings*, where you explain a decision by
   quoting the thing the decision removed, and it has happened on every run
   where this check was left implicit.

   If a warning cannot be written without naming a value, the warning is wrong,
   not the rule — describe where the value is instead.

6. **Write the output** to the `out=` directory you were given, else
   `output/legacy-specs/`. The filename is `<doc-id>.md`, or
   `<namespace>-<doc-id>.md` where the corpus needs a namespace — see the
   filename rule below.

   Where `id=` and `namespace=` were passed, use them. Otherwise derive
   `<doc-id>` from the source filename, preserving the identifier exactly,
   including any letter suffix, which usually denotes a genuinely different
   document.

   Create the directory with `mkdir -p` before writing; do not assume the
   writing tool makes parent directories. If `mkdir` is not available to you —
   you may be running inside a subagent with a narrower grant than this skill
   requests — say so and stop rather than writing to a path that does not
   exist.

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

- `template` — carry through the draft's own value. You no longer derive this;
  the extractor did. If a draft has no `template`, set it to `unknown` and add a
  warning rather than guessing, so the gap is visible to whoever checks the
  output.
- `title` — the document's own title. The draft may not carry one; take it from
  the corpus catalogue the workspace `CLAUDE.md` names, else from the source
  filename. Where the document's title contradicts itself between its filename,
  its heading and its screen captions, use the catalogue's and record the
  contradiction as a warning rather than choosing silently.
- `pages` — the page count the extractor reports.
- `sections_found` — the number of top-level (`##`) sections in the document you
  wrote that came from the source document. Two headings never count: the
  Extraction warnings section, and the draft's `## Extracted index`, which the
  extractor generated rather than the source. Nothing else is excluded — not on
  the source's own numbering, not on the manifest's count, and not on a
  judgement about which sections are "real".

  **Do not carry the `## Extracted index` into your output at all.** It is a
  scanner's working note, it is known to over-report (unpadded variants of
  identifiers it already matched), and duplicating it into a converted document
  gives a downstream reader a second, worse copy of information the body already
  carries.

  It is defined this way so it can be **checked mechanically** — count the `##`
  headings in the file and the field must equal it. A field a reader has to
  trust is worth less than one they can verify, and earlier conventions that
  counted only "substantive" sections produced files that disagree with each
  other and cannot be compared.

  Where you drop a heading the extractor emitted — a repeated table column
  header that a page break turned into a false section, say — your count is
  lower than the manifest's, and yours is correct. Note the disagreement in your
  warnings so the difference is explained rather than looking like an error.

- `extraction_warnings` — the number of entries in the Extraction warnings
  section; `0` if there are none. That section holds two kinds of entry — a
  defect you could not repair, and a contradiction the source itself contains —
  and this field counts both. They are listed together because a reader needs
  the same thing from each: a note that the document is not to be taken at face
  value here.
- `draft: true` marks a deterministically-extracted draft that has not yet been
  through this skill. **Drop the key when you convert one**, so a later run can
  tell a finished conversion from an input awaiting one.
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

  This applies within a run — two drafts of one document reaching you in the
  same batch. Across runs it is the caller's job: it decides what to skip before
  dispatching you, and it is the only one that can see both the draft and the
  output already on disk. You see one document, so do not try to make that call
  or warn about it.

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
- **A source name never appears in your output**, not in the body and not in a
  warning. Pseudonyms only; the mapping file is the sole place a source value
  belongs.
- **Do not re-extract what is already extracted.** If you were handed a draft,
  the source PDF is for resolving a defect you cannot settle from the draft —
  not a second opinion on text a script has already read correctly.
