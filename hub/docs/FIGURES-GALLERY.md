# Scientific Figures Gallery

`/figures/` is a curated scientific view over existing File Library assets. It is not another upload store. No figures are seeded; the production gallery stays empty until genuine figure metadata is published.

## Authority and schema

Authority: `src/data/figures/<slug>.json`; ID: `figure:<slug>`. The filename and stable ID must agree. `src/lib/figures.mjs` exports pure browser/Worker-safe `normalizeFigure` and `validateFigure`; validation throws on invalid metadata. Optional metadata is normalized to honest defaults, including empty authors, `source: Unspecified` and `license: Unknown`.

Required scientific fields are `title`, real ISO `date`, `fileId`, `caption` and `altText`. `fileId` is the Library’s existing stable ID, normally a UUID, without a `file:` prefix. `updated` defaults to the recorded date, never build time. Optional fields include `description`, `category`, `tags`, `authors`, `source`, `license`, `thumbnailId`, `displayTransformation` and `featured`.

Common metadata includes `visibility` (`public` or `unlisted`), `publicationStatus` (`draft`, `published`, `archived`), `relations`, and typed stable-ID lists `relatedResearch`, `relatedNotes`, `relatedProjects`, `relatedFiles`, `relatedPackages`, `relatedFigures`, `relatedReferences`, `relatedLogs`. Connections and backlinks use the shared Knowledge Connections graph.

Only explicitly `published` + `public` figures generate public routes. Public figures must reference public files. An absent data directory produces the real empty state. Private records do not belong in this public GitHub repository. Unlisted does not provide confidentiality.

## Owner workflow

1. Open **Figures** from Owner workspace or the Figures page controls.
2. Add metadata, a stable `figure:slug`, scientific caption and meaningful alt text.
3. Select an existing original in Library. No second upload is made. Optionally choose a safe raster thumbnail (PNG/JPEG/WebP/GIF/AVIF/BMP).
4. Add scientific category, tags, provenance and existing Research/Notes/Package relationships.
5. Save to the existing device-local Owner draft. Preview and review, select Published when ready, save, then publish the batch. Records still marked Draft are blocked from remote publication.
6. To remove a figure, enter its complete stable ID. The server validates incoming references. Only the gallery metadata is deleted; the original and thumbnail remain in Library.

Unknown source, license or authorship must stay Unknown/Unspecified. Do not infer that an external scientific image belongs to the site owner.

## Public display and scientific handling

The gallery supports search, category/tag/research/date filters, deterministic date/title sorting, grid/list modes and copy links. Detail pages show sanitized Markdown captions, provenance, original filename, dimensions when known, checksum metadata, related content and the original download.

Detail pages reuse `src/file-preview/preview.js` and its existing image/FITS/PDF viewers. Image zoom, mouse pan, native touch scrolling, fullscreen and fit controls come from the existing viewer. The gallery adds a dark preview background switch. No duplicate image viewer is maintained.

Original bytes and pixel dimensions are not rewritten. `displayTransformation` documents any contrast stretch, gamma, colormap or normalization used for a display asset. A thumbnail can be a derivative but is explicitly separate from the original. Original dimensions are preserved from Library metadata or measured only when the preview URL is also the original URL. Loaded preview dimensions have a separate label so a smaller preview cannot silently replace original resolution. Missing dimensions are not invented. A recorded SHA-256 is metadata, not a claim that this browser reran an integrity check.

## Validation

`node --test tests/figures.test.mjs` covers provenance defaults, publication admission, valid/invalid original and thumbnail references, preservation of originals, caption/alt requirements, filters, sorting and sanitized Markdown. Shared Owner and graph tests cover authorization, staging and protected deletion. Browser QA must separately verify the viewer on desktop and mobile; source-level viewer checks are not a substitute for that browser result.

`node scripts/phase4-assets-owner-qa.mjs` was executed successfully with nine browser workflow groups. It bundles the real Owner editors, gallery page script and existing image viewer into an isolated Chrome session; source records exist only in RAM and all staging uses `mergeDraftChanges` / `validateDraftChanges`. The run confirmed create/edit, exact-ID/protected removal, reuse of Library originals, gallery filtering/list mode, image zoom/download/pan controls and a 390 px editor without horizontal overflow. Report and reviewed screenshots are in `.local/qa/phase4-assets-owner/`; no external upload call or production content write occurred.
