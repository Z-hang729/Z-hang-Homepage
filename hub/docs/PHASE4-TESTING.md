# Phase 4 verification

## Automated gates

- `npm test`: all existing and new unit/integration suites, including narrow write paths, expected revisions, safe metadata, citations, graph/backlinks, unchanged bodies, draft isolation, CV selections, immutable versions and provider-first file deletion. An authenticated service fixture proves draft records and draft historical snapshots cause zero Git mutations, while a reviewed published record commits.
- `npm run check`: Astro/TypeScript diagnostics.
- `npm run lint`: JavaScript syntax checking; this is a syntax gate, not an ESLint style audit.
- `npm run build`: content validation, actual CV PDF generation, Astro routes, Pagefind and local links/assets/anchors.
- `node scripts/phase4-preservation.mjs`: compares 25 protected original source/asset files with the pre-change manifest. Baseline is captured once with `--capture` before edits.
- `owner-backend/storage-runtime.mjs`: real workerd/SQLite Durable Object fixture validating authentication, streaming uploads, atomic metadata publication and public HEAD/Range/download checksums.

Public-graph tests exclude descendants of hidden/missing parents and cyclic parent chains. A referenced published package can stage its next version as a local draft without breaking existing backlinks; the server's default publication checks remain strict, and the complete reviewed batch must contain publishable records.

## Actual browser workflows

The following scripts use a dedicated isolated Chromium profile, actual editors, the shared stage/publish validation and RAM-only fictional fixtures. They never log into or mutate production:

- `node scripts/phase4-assets-owner-qa.mjs`: 9 groups covering Figure CRUD, original selection, package from Log, role review, citations/backlinks, manifests, version history, verification refusal, deletion protection, gallery controls and reused image viewer.
- `node scripts/phase4-bibliography-owner-qa.mjs`: 8 groups covering manual editing, CSL preview, BibTeX review/import, all duplicate choices, mocked DOI review/failure fallback, cursor insertion, safe preview and deletion protection.
- `node scripts/phase4-cv-owner-qa.mjs`: 6 groups covering inheritance, explicit selections/authorship, ordering/hiding, real IndexedDB draft recovery, mobile layout and actual Activity filtering.
- `node scripts/phase4-public-fixture-qa.mjs`: a separate source copy under `.local`, populated-route builds and browser checks. Draft/unlisted canaries test public routes, graph, sitemap, bibliography export and search. No fixture is written to production content collections.

Evidence is stored under ignored `.local/qa/phase4-*` directories, with screenshots and machine-readable reports. DOI browser tests use mocked providers; review and fallback are tested independently of an external service's availability.

## PDF and preservation

PDF.js tests extract actual bilingual text, A4 page dimensions and link annotations, verify deterministic rebuilds and protect unrelated PDFs. The long-content fixture checks all 35 experiences, every page's real content and text bounds. The actual one-page CV and first/last pages of a five-page CJK/English fixture were rendered using Poppler and visually inspected.

`node scripts/phase4-production-qa.mjs --before` records the live Homepage text, headings, section order, navigation, original PDF SHA-256 and screenshots. `--after` compares these and verifies all new routes, themes/mobile layouts, Pagefind, graph and deployed CV bytes, plus existing Library/image/PDF functionality. Production checks permit only GET/HEAD/OPTIONS and record attempted writes.

## Honest limits

Owner editing is verified using actual browser forms and shared backend fixtures. No new production test research, test upload or test publication is created. An interactive fresh GitHub OAuth sign-in is not claimed as a new automated acceptance test. Final exact test counts, deployment SHA, Actions run and production results are recorded in the completion report after release.

DOI lookup depends on external availability. Checksums compare recorded metadata unless file bytes are explicitly fetched and hashed. Reproducibility status records the Owner's evidence and never claims automatic experimental execution. No large R2 upload capability is added by this phase.
