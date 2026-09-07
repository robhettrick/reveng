---
name: curate-transcript
description: Curates a stakeholder interview transcript by removing off-topic content (incumbent team agenda, feature requests, distractions) while preserving application walkthrough and domain knowledge verbatim.
allowed-tools: Read, Edit, Bash(mkdir*;cp*)
---

You are curating a stakeholder interview transcript. Your job is to remove off-topic passages. All kept text is preserved mechanically — you never write or rewrite any transcript content.

## Input

The transcript file path is: `$ARGUMENTS`

## Steps

1. **Derive the output path** by taking the filename, inserting `_curated` before
   the extension, and placing it under `output/transcripts/`. **Preserve the
   source extension** — a markdown transcript stays markdown, because its front
   matter and structure are part of the content:
   - `transcripts/interview-1.txt` → `output/transcripts/interview-1_curated.txt`
   - `transcripts/deep-dive.txt` → `output/transcripts/deep-dive_curated.txt`
   - `<export>/transcripts/demo.md` → `output/transcripts/demo_curated.md`

   Downstream analysts glob `output/transcripts/*_curated.*`, so any extension is
   found — but only if `_curated` is present, which is what marks the file as
   safe to read.

2. **Ensure the output directory exists** by running `mkdir -p output/transcripts`.

3. **Copy the original file** to the output path using `cp`. This creates an exact mechanical copy that preserves all text verbatim.

   **Then repair any relative links.** A transcript may reference sibling assets
   — extracted video frames, images — by a path relative to its own directory,
   e.g. `![0:07](../frames/<id>/<name>/frame-00007-80s.jpg)`. Copying the file
   to `output/transcripts/` silently breaks every one of them, because the path
   now resolves against `output/` instead of the source directory.

   Rewrite each such link to point at the asset where it actually lives, as a
   path relative to the new location — do **not** copy the assets themselves,
   which can be tens of megabytes of frames duplicating what the export already
   holds. For a transcript curated from `<export>/transcripts/` into
   `output/transcripts/`, `../frames/…` becomes `../../<export>/frames/…`.

   This is a mechanical path substitution, not an edit to the transcript's
   words. Count the links before and after and confirm the number is unchanged;
   spot-check that one rewritten path resolves to a file that exists.

4. **Read the output file** using the Read tool.

5. **Identify passages to remove.** Classify content into two categories:

   **Keep** — content directly about the application or its domain:
   - Application walkthrough content: screen descriptions, user flows, functionality explanations, how the system behaves
   - Domain knowledge: business rules, terminology, processes, regulations that the application implements
   - Technical details about the application: architecture, data flows, infrastructure it runs on
   - Integrations and dependencies: third-party systems, external services, APIs, data exchanges, upstream/downstream applications the system connects to

   **Remove** — everything else, including but not limited to:
   - The incumbent modernisation team's agenda, plans, opinions, or approach discussions
   - Stakeholder feature requests or wishlists for new functionality
   - Project management discussions: team structure, suppliers, contracts, timelines, staffing, resourcing, delivery plans
   - Meeting logistics and scheduling: arranging follow-ups, calendar availability, session housekeeping
   - Personal context about individuals: career history, background, role introductions beyond job title
   - Technical tangents unrelated to the application itself: DPIA processes, data protection policy, procurement procedures, programme governance
   - Social pleasantries, small talk, greetings, sign-offs, thanks, and chitchat
   - Meta-discussion about the interview process itself
   - Tangential conversation not related to the current application or its domain

   **When in doubt, remove** — but never remove content that describes how the application behaves, what it connects to, or what domain rules it implements. These transcripts are typically recordings of sessions where third-party vendors explored legacy applications as part of a migration engagement. We are not interested in the vendors' migration plans, modernisation approach, or opinions — only the as-is state of the application they were examining. The test is: does this passage describe what the application does today, or what someone planned to do with it? Keep the former, remove the latter.

6. **Remove each identified passage** using the Edit tool on the output file. For each passage:
   - Set `old_string` to the **exact text** of the passage to remove (copy it precisely, including whitespace, timestamps and line breaks)
   - Set `new_string` to an empty string `""`
   - If removing a passage leaves adjacent blank lines, make a follow-up Edit to collapse them to a single blank line

7. **Return a confirmation message** containing:
   - The output file path
   - A brief summary of what categories of content were removed, with approximate counts (e.g. "Removed: 3 passages discussing the incumbent team's migration timeline, 2 feature requests for a new reporting dashboard")
   - If nothing was removed, state that the transcript contained no off-topic material
