# Phase 4 — scholarly publishing and reproducibility

Phase 4 extends the existing Astro/GitHub Pages site. The Homepage profile, content, section order, main navigation, original uploads and reading URLs are preserved. One **Academic publishing** footer link opens the independent module hub.

- **Figures**: captioned scientific figures, original File Library IDs, provenance, alt text, category/tag/date/research filters, grid/list views and existing image/PDF/scientific preview engines.
- **References**: structured bibliography, mature BibTeX import/export, reviewed DOI lookup, duplicate resolution, real APA/IEEE CSL rendering, cursor citation insertion and Knowledge Connections backlinks.
- **Activity**: a dated view of published authoritative research, notes, chapters, figures and packages. No separate activity database or fabricated updates.
- **CV**: the existing online CV now supports CV-only overrides and explicit real project selections. One derived build-time PDF embeds Chinese and English fonts and preserves unrelated original PDFs.
- **Research packages**: reviewed input/code/configuration/intermediate/output/documentation roles, file IDs/checksums, concrete code revisions, methods/parameters/environment, immutable published versions, manifest/README and actual verification evidence.

Shared Owner publication retains the existing login, browser drafts, atomic GitHub commits, expected-SHA conflict checks, review and deployment status. Only narrowly permitted academic JSON paths are added to the write policy. Existing Markdown and MDX bodies are preserved.

No migration rewrites existing records. New collections start empty; `src/data/cv.json` is optional and the current real profile remains the inherited source. No publications, research results, licenses or authorship are inferred.

Academic draft records and draft history are rejected by both client and service before remote publication. Published and archived package payloads remain immutable even after a status change. Public Git history is not private storage: unlisted/archived metadata and manually committed files remain readable. Keep confidential work outside this repository and unpublished edits in the existing local draft store.

See [Owner guide](PHASE4-OWNER-GUIDE.md), [audit](PHASE4-AUDIT.md), [verification](PHASE4-TESTING.md), and the five module documents.
