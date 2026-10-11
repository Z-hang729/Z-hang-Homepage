# Phase 4.1–4.7 integration audit

Date: 2026-10-12  
Scope: Academic Publishing information architecture only. The Homepage, shared `BaseLayout`, Search, Knowledge Connections, Dashboard and existing Research / Notes / Projects / Files content remain outside this change.

| Module | Existing | Missing before this pass | Action in this pass |
| --- | --- | --- | --- |
| Academic Publishing | `/academic/` already exposed Figures, References, Activity, Academic CV and Research Packages | The five cards did not explain how these records serve Research, Projects, Notes and Files | Added a small relationship map and context entry points while preserving all five module URLs and their empty-state behavior |
| Research | Existing `/research/` archive and project/log routes | No orientation from the publishing hub | Linked as the primary research context and described as the starting point for questions, methods and logs |
| Projects | Existing `/projects/` archive | The relationship to academic evidence was implicit | Linked as the durable thread under Research; Figures, References and Packages are presented as project evidence |
| Figures | Existing gallery, detail pages and File Library references | Gallery was visually isolated from the research workflow | Kept the existing module entry and documented that a Figure reuses an existing File ID and links to research context |
| References | Existing bibliography, DOI review, citation insertion and backlinks | Reference pages were not framed as shared research/notes infrastructure | Kept the existing module entry and documented shared use by Research and Notes; no publication data was added |
| Research Packages | Existing versioned reproducibility archive and six file roles | Package purpose was not visible from the hub | Kept the existing module entry and placed Packages after Projects in the relationship map |
| Files | Existing universal File Library and stable original IDs | The hub did not explain that academic modules reuse originals | Added Files as the terminal shared store; no duplicate upload path was introduced |
| Activity | Existing derived feed | Its relationship to published records was not obvious | Retained the module card and stated that the hub and module views are published-only |
| Academic CV | Existing structured CV and generated PDF | Its role as a derived view was not obvious | Retained the module card; no profile or publication records were changed |
| Search | Existing Pagefind and file search | No change requested in this slice | No files changed |
| Knowledge Graph | Existing Knowledge Connections graph | No change requested in this slice | No files changed |
| CMS / Dashboard | Existing Owner workspace and admin dashboard | No change requested in this slice | No files changed |
| Performance / accessibility | Existing scoped publishing styles and responsive routes | The hub needed relationship content without adding a heavy client library | Used static Astro markup, semantic links, visible focus states and responsive scoped CSS only |

## Information architecture decision

The hub now communicates this path without creating a second database or duplicating files:

`Research → Projects → Figures / References / Research Packages → File Library`

Notes can cite the same References and link back to Research. Figures and Packages select stable File Library records instead of uploading another copy. Existing global module pages remain the canonical destinations, so the integration is additive and preserves their current filters, detail pages and empty states.

## Verification

- Existing five module labels and destination paths are retained in `src/pages/academic.astro`.
- New relationship links use the existing `url()` helper, so GitHub Pages base paths remain correct.
- No Homepage source, `BaseLayout`, Search, Knowledge Connections, Dashboard or content collection files were modified.
- The page uses no client-side JavaScript or additional dependency; the relationship map is available to keyboard and screen-reader users as ordinary links.
