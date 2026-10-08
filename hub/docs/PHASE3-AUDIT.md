# Phase 3 audit — 2026-10-08

Baseline: `cc18c1daaf22bb5d90e490afe63dc2b2c9dc85e6`, branch `main`, clean working tree; remote `origin/main` matched. Backup branch `backup/before-phase3-knowledge-system` was created and pushed before implementation. The local `.local/phase3/baseline.json` fingerprints 23 existing content, profile, navigation, homepage, original-file and style files. Public Homepage screenshots/text and the existing PDF checksum were captured with an isolated read-only browser.

| Module | Existing | Missing | Action |
| --- | --- | --- | --- |
| Research Notebook | `logs/<project>/<slug>.md`, project status, inline logs, Markdown editing, Owner create/edit/delete, attachments, CAS draft publication | Stable individual log pages, same-day safe anchors, filtering/collapse, updated/status/summary, Library and note references | Extend the existing log collection and editor |
| Digital Notes | Course collection, `files/**/*.md(x)` reading routes, document CRUD, KaTeX, Shiki, TOC, active headings, responsive TOC, figures, references | Chapter order/navigation, chapter-specific metadata/neighbors, reading progress, ordinary-Markdown academic environments and working references, explicit online Library import | Extend the existing document model and Markdown pipeline |
| Knowledge Connections | Stable content paths, file UUIDs and multi-parent metadata, tag-based related cards, Pagefind | Explicit typed links, automatic backlinks, wiki links, shared resolver/validation, static graph, Owner relation controls | Add one shared relation resolver over the existing sources |
| Security & Tests | Server-authorized GitHub App, exact repository grant, CSRF/PKCE, path/Markdown validation, optimistic revisions, atomic Git publication, isolated browser fixtures, 197 tests | Cross-module relation and academic-rendering cases, Phase 3 end-to-end workflow and preservation assertions | Extend existing tests and validation |
| File Library | Universal upload queue, folders, previews, original downloads, stable IDs, GitHub Releases, optional R2 adapter | Integration with logs/chapters | Reuse; no storage redesign |
| Deployment | npm lockfile, Node 24, Astro 7.3.5, existing check/test/build/link-check GitHub Pages workflow, existing Worker | Publish compatible validation bundle after shared model changes | Retain the existing providers and deployment workflow |

Sources inspected: `src/content.config.ts`, `src/lib/content.ts`, `src/components/Article.astro`, `src/owner/{client,editors,documents}.js`, `src/lib/owner/{model,policy}.mjs`, existing routes, file metadata, `astro.config.mjs`, `package.json`, and `.github/workflows/deploy.yml`.

No existing academic entries or original binaries need to be moved or rewritten. Optional metadata and fallbacks preserve the three existing demonstration logs and the existing course/project pages. Demonstration examples remain explicitly labeled; no fabricated research results or courses are added to production.

The user separately authorized deleting the eight displayed text groups and the Library heading's orange period shown in the screenshots. Those precise deletions are the only intentional Homepage presentation changes; personal data, section order, styles, original files, and other titles remain protected. Phase 3 features belong on article, log, and chapter pages. New fixtures are confined to isolated test copies.
