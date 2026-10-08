# Phase 4 architecture audit

Baseline: `2a2cf93c84413410015f4654aedf85be45edbf91` (`main`). Backup branch: `backup/before-phase4-academic-publishing`, pushed before edits.

| Existing capability | Phase 4 approach |
| --- | --- |
| Astro static Pages, existing deployment workflow | Extend routes and build-time outputs; keep base path and deployment |
| Owner GitHub App, browser drafts, atomic CAS publish, CSRF and Durable Object coordination | Reuse unchanged authentication/commit flow; narrowly extend permitted JSON paths |
| Universal File Library, stable IDs, original checksums, preview engines | Figures and packages point to existing files; preserve originals and preview engines |
| MD/MDX collections and frontmatter editing | Retain all bodies and URLs; citations transform Markdown during rendering |
| Knowledge graph, references, backlinks | Extend the same graph with figure/reference/package nodes; no duplicate relation database |
| Pagefind and link checking | Index the new public routes; exclude unpublished data and private browser drafts |
| `/cv/` and real profile data | Extend with optional structured overrides/selections and one derived PDF |
| Homepage and shared design | Freeze its content, section order, main navigation and styling; add one footer publishing entry |

New source records: `src/data/figures/*.json`, `references/*.json`, `packages/*.json`, optional `cv.json`. Empty collections remain empty. No sample research is published.

## Preservation evidence

The pre-change production capture is in ignored `.local/qa/phase4/before.json`, with screenshots, exact Homepage main text/section order and original PDF SHA-256. The source manifest in `.local/phase4/baseline.json` records protected source and original asset hashes. These are compared again after deployment.

## Visibility boundary

This repository is public. Academic `draft` records and draft historical snapshots are blocked from remote publication in both the browser and service; local staging remains available. Mark a ready record `published` before reviewing and publishing. `unlisted` and `archived` metadata, and any manually committed files, remain readable from GitHub history. Those states exclude new records from public routes, exports, graph, activity and search; they are not confidential storage. Private uploads, encrypted storage and remote execution are outside Phase 4.
