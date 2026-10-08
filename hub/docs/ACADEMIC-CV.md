# Academic CV

The existing `/cv/` page is extended in place. Its initial profile and education still come from the current owner-authored `src/data/profile.yaml`. No migration rewrites that YAML or the homepage. Empty sections, including Publications, are hidden.

## One data source, two views

`deriveCV(profile, record, nodes)` in `src/lib/academic-cv.mjs` supplies both the online page and the PDF generator. Optional `src/data/cv.json` holds CV-only overrides and explicit selections. If it does not exist, the CV inherits the real profile; a placeholder CV record is not generated.

The schema supports:

- `schemaVersion: 1` and CV-only `profile` fields: displayName, role, university, degree, secondDegree, bio, public email, GitHub, location.
- Optional `education`, `researchInterests`, `skills`, `researchExperience`, `presentations`, `awards`, `software`, `teaching`, `service`, and `links`.
- `selectedResearch: [{id: "research:existing-id", description: "Optional CV wording"}]` and `selectedProjects: [{id: "project:existing-id", description: "Optional CV wording"}]`.
- `publications` with an existing `referenceId` or owner-authored title/authors/year/URL, and explicit `ownerConfirmed: true`.
- `sections: [{id, visible, order}]` for ordering and visibility.

Omitted education, interests, skills, awards, and presentations inherit existing profile values. An explicit empty list suppresses a section. Selected research and projects default to empty; example/demo content is never selected automatically or published as a real CV achievement. Private, unlisted, draft, archived, and demo selections do not render.

References are reading/citation records. They become CV Publications only after the Owner selects a specific entry and confirms actual authorship. The system does not infer authorship from the existence of a reference. Existing owner-authored profile publications remain compatible.

## Owner workflow

1. Sign in through the existing Owner workspace and choose **Academic CV**.
2. Keep **Use current homepage profile** checked to inherit profile fields, or enter CV-only wording.
3. Add/reorder education or real research experience. Select existing public research/projects and optionally shorten their descriptions for the CV.
4. Add a publication only when it is a real authored output; confirm authorship explicitly.
5. Arrange sections or hide sections. Empty sections are hidden automatically.
6. Save to the draft, review the normal Owner batch, and publish.

The editor stages only `hub/src/data/cv.json` through `cvChanges(snapshot, cv)`. The existing authentication, expected-SHA conflict checks, draft recovery, review, and publish transport apply. CV editing does not stage profile/homepage YAML. No private phone or address is requested.

## PDF generation

Run `node scripts/generate-cv-pdf.mjs`, or let the existing build hook run it. Output is `public/documents/academic-cv.pdf`. The page links to the generated file unless the owner has already configured a separate `profile.cvPdf` asset; that original link is preserved.

The generator uses PDFKit and the bundled SIL-licensed regular Noto Sans SC TrueType font. It embeds a real font subset and Unicode maps, renders selectable Chinese/English text, uses A4 by default, wraps long text, paginates automatically, and writes clickable link annotations. The programmatic API also accepts `size: "LETTER"`. No PDF generator is sent to the homepage browser bundle.

Pre-existing unrelated files at the output path are protected. Only a PDF carrying this generator's producer marker may be replaced on rebuild. Fixed non-content PDF metadata dates ensure deterministic binary rebuilds and never create a false CV update date. PDF metadata dates are technical reproducibility fields, not a statement about the author's academic history.

## Verification

`node --test tests/cv.test.mjs tests/cv-pdf.test.mjs` covers actual inherited education, independent descriptions, explicit selections, hidden empty sections, publication authorship, private/draft exclusion, Owner SHA-aware staging, safe links, A4 dimensions, embedded selectable Chinese/English text, real link annotations, long-content pagination, protected original PDFs, and deterministic rebuilds.

The actual generated one-page CV was rendered with Poppler and visually inspected for margins, Chinese/English glyphs, section spacing, contact links, and the page footer. Browser print remains available as an additional online-page export route.

`node scripts/phase4-cv-owner-qa.mjs` runs the actual Owner form in an isolated Chrome/Edge browser. Its records stay in the fixture's browser memory/IndexedDB, and it makes no external writes. It covers inherited profile fields, adding education, selecting existing stable-ID research/projects, section order/visibility, explicit publication authorship, shared publication validation, draft restoration after a browser reload, and a 390px mobile layout. Evidence is stored under `.local/qa/phase4-cv-owner/`.

The long-content PDF regression extracts every page through PDF.js, checks that every page contains body text, verifies text bounding boxes stay within page margins, and confirms all 35 experience entries survive pagination. A separate five-page bilingual fixture was rendered at its first and last page for visual review.
