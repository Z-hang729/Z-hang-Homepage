# Academic Bibliography

References are shared literature records, not an automatic list of Z-hang's publications. The production bibliography is intentionally empty until actual records are added and reviewed. All example literature used in tests is isolated from `src/data/references`.

## Authority and identity

Each reference has one JSON authority file, `src/data/references/<lowercase-hyphen-slug>.json`, with a stable `reference:<slug>` ID. Its independent `citationKey` preserves case and underscores, for example `Smith_2026`. Renaming a title does not change either identity. Keys are case-sensitive and must be unique across the library; DOIs are normalized for comparison. Existing Research, Notes, Projects, File Library, and Knowledge Connections IDs are reused.

The schema accepts journal articles, conference papers, books, book chapters, theses, preprints, reports, datasets, software, web resources, and other sources. `title`, authors, year, container, publisher, volume, issue, pages, DOI, arXiv, URL, abstract, tags, BibTeX, relations, and provenance are optional where appropriate. Missing fields remain missing. Authors can be literal strings or structured CSL-style objects (`given`, `family`, or `literal`); use structured objects for reliable family/given-name formatting. New entries default to `publicationStatus: draft` and do not enter public pages, exports, or the public graph. Public rendering requires both `visibility: public` and `publicationStatus: published`. Unlisted and archived records are also excluded. Repository files are not private storage: keep confidential research outside this public repository.

`src/lib/bibliography-model.mjs` is the portable validation, duplicate detection, and citation scanning boundary. It has no Citation.js/CSL dependency. `src/lib/bibliography.mjs` contains the mature BibTeX and CSL processors and DOI retrieval; it is loaded by build-time pages or by the Owner editor when needed. The homepage does not load a bibliography parser or CSL engine.

## Owner workflow

Open **Owner workspace → References** to add, edit, search, sort, export, or remove records. Save changes to the existing Owner draft, review each record and mark ready records Published, then review the complete batch and publish through the existing authenticated GitHub workflow. Any academic record still marked Draft blocks remote publication of that batch; the browser and service both enforce this. The same server-authorized change validator, optimistic baseline SHA, conflict handling, and atomic publication channel are used as existing content; the bibliography adds no second admin or database.

The editor keeps stable IDs fixed during an edit, supports tags and selections from existing research/notes/projects/packages, and records Owner-edited fields in provenance. Citation preview displays APA, IEEE, and BibTeX before save. A record is publicly visible only after selecting **Published**, saving to draft, and publishing the reviewed batch. Delete shows incoming Knowledge Connections; referenced records cannot be removed while their citations/relations remain.

## BibTeX

The parser and exporter use Citation.js `@citation-js/core`, `@citation-js/plugin-bibtex`, and `@citation-js/plugin-csl`, pinned to `0.9.0`. Parsing is explicitly forced to BibTeX text; it never fetches or executes code from a file. Imports are limited to 1 MiB and 500 records. Nested braces, string macros and concatenation, LaTeX accents, multiple authors, Unicode names, and duplicate keys are handled by the library parser. Raw parsed BibTeX fields are retained per entry. Export uses the library formatter, preserves unchanged protected fields and custom fields, and enables UTF-8 output so Chinese names are not discarded by the library's ASCII-only default.

Import flow: choose/paste `.bib` → **Parse and preview** → inspect each entry → **Import reviewed entries to draft**. Imported records are device-local drafts. Edit each ready entry and mark Published before remote publication; an unfinished entry blocks the batch. Duplicate keys remain separate candidates during preview. The complete import is staged only after all duplicate decisions; cancellation saves none of that import.

Duplicate review prioritizes normalized DOI, then exact citation key, then normalized title plus authors and year. Similar titles never cause automatic deletion. Choices are:

- **Merge**: retain the chosen existing ID, key, and Owner values; fill missing fields and combine tags/relations.
- **Keep separate**: explicitly confirm a unique ID and key; duplicate DOI records can remain intentionally separate.
- **Cancel**: leave the snapshot unchanged.

Public BibTeX downloads are `/references.bib` and `/references/<slug>.bib`. They contain only published public records. Owner **Export all BibTeX** includes the current Owner snapshot, including unpublished drafts, for personal use. Neither export silently resolves duplicate keys.

## DOI metadata

The implementation was checked against the official [Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/) and [DataCite singleton DOI API](https://support.datacite.org/docs/api-get-doi) on 2026-10-08. It uses Crossref `GET /works/{doi}`, falling back to DataCite `GET /dois/{doi}` only when Crossref reports not found. It does not query other metadata services or impersonate a mailto address. The portable lookup helper permits an explicitly configured `mailto` option for Crossref's polite pool.

Requests omit credentials, limit the response to 1 MiB, use an abort timeout (8 seconds by default), and respect failure/rate-limit responses. DOI metadata is untrusted text. It is displayed for explicit review before **Apply reviewed metadata**, which updates the form; saving remains a separate step. Existing stable identity is preserved. Provenance stores the source API, DOI, source endpoint, verification timestamp, and Owner-edited fields. Lookup failure leaves manual entry usable and does not invent missing metadata or overwrite Owner content.

## CSL and Markdown citations

APA uses Citation.js's bundled maintained CSL style; IEEE uses the official [CSL styles repository's IEEE definition](https://github.com/citation-style-language/styles/blob/master/ieee.csl), vendored with its CC-BY-SA attribution in `src/lib/csl/ieee-style.mjs`. Citation.js's citeproc engine generates all APA/IEEE bibliography and inline outputs. These are not manually assembled approximations.

Use **Insert citation** in the existing Markdown editor to choose a current reference at the cursor, or write `[@citationKey]`. Multiple keys can use `[@KeyA; @KeyB]`. The document defaults to IEEE; `citationStyle: apa` or `citationStyle: ieee` in frontmatter selects the style. Repeated citations keep their numbering and resolve to `/references/<stable-slug>/`. A document reference list is generated from the same records. Code blocks, inline code, math, and raw HTML are not interpreted as citations. Unknown keys cause validation/build failure. Owner preview can explicitly resolve draft records; public builds cannot.

The citation scanner adds edges to the existing Knowledge Connections graph, so reference details show Research/Note/Package backlinks without maintaining a separate reverse-link database. Citation URLs pass through the existing GitHub Pages base-path transform. All reference metadata is rendered as text; Markdown preview retains the existing sanitization layer.

## Verification

Executed successfully:

- `node --test tests/bibliography.test.mjs`: 16 tests covering import/export, accents/braces/macros, Unicode, duplicate keys/DOIs, missing metadata, actual APA/IEEE CSL, code/math exclusions, stable citation links and source-scoped bibliography anchors for embedded logs, draft isolation, DOI success/fallback/failure/timeout/response bounds, shared backlinks, deletion protection, and stable Owner edits.
- `node scripts/phase4-bibliography-owner-qa.mjs`: 8 real browser workflow groups with in-memory snapshots and mocked DOI APIs. Covers actual forms and `ctx.stage`, explicit duplicate choices, metadata review, manual fallback, cursor insertion and safe preview, backlink-aware deletion, and 390px mobile layout. Evidence: `.local/qa/phase4-bibliography/results.json` and `reference-mobile.png`.

The browser fixture never authenticates, writes production records, uploads files, or publishes. Tests do not depend on external DOI services being live. The complete Phase 4 release separately records type checking, build, content validation, public populated-route verification, homepage regression, and deployment status.

## Practical limits

BibTeX and CSL standards cannot infer missing authors, dates, source rights, or publication ownership. Literal author names intentionally avoid guessing a Western family/given-name split. Imported source metadata must still be checked. Changes to a citation key require updating its authored citations; stable reference IDs remain unchanged. Referencing a draft record from public content is a validation error. Bibliography import does not download papers/movies or register new DOIs.
