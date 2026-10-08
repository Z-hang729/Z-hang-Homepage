# Phase 4 Owner guide

Sign in through the existing **Owner sign in** link. The workspace and **Add** menu now expose **Figures**, **References / BibTeX**, **Academic CV** and **Research Packages**. The footer's **Academic publishing** link opens all public modules, including Activity.

## Publish a scientific figure

Upload the actual source through the existing File Library first, or select an existing file. Choose **Figures → New figure**, then select its stable original File ID. Enter the title, date, meaningful caption and alt text. Record the actual source/authors/license; keep Unknown/Unspecified when uncertain. Optionally choose a raster thumbnail and Research/Note/Project/Package relations. The preview uses the existing viewer and original download.

Save to the browser draft. When ready, explicitly select public visibility and published status, then use the normal review/publish action. Academic records still marked draft, including draft history, block remote publication of the batch; finish them or remove their pending change before publishing. Both browser and service enforce this rule. Visibility controls discovery, not repository privacy. A public record must point to available public files and published academic targets.

## Maintain references and insert citations

Choose **References / BibTeX** to add manually or import a `.bib` file. Review parsed fields before accepting. A DOI lookup fills a review form; it does not publish automatically. If a service fails or metadata is incomplete, enter the missing information manually.

For detected duplicates choose **Merge**, **Keep separate**, or **Cancel**. Stable record IDs identify pages; citation keys identify authored `[@citationKey]` syntax. Do not rename keys without updating their citations.

In an existing Markdown editor, choose **Insert citation**, find a reference and insert at the cursor. The renderer creates an APA/IEEE citation and a reference list from the shared bibliography. Existing code and mathematics remain code and mathematics. References are collected literature, not automatically personal publications.

## Use Activity

Activity appears automatically from dated public, published authority records. Demo records, unpublished drafts and undated content do not manufacture activity. Open an event to read its original source; use type, tag, date and text filters to browse.

## Update CV and download PDF

Choose **Academic CV**. Keep inherited profile fields, or edit CV-only wording without changing the Homepage. Add real education/experience and explicitly select existing public non-demo Research/Projects. Confirm authorship for any publication entry. Reorder/hide sections and save to the draft.

After the ordinary Owner publish and Pages build finish, `/cv/` and **Download CV PDF** use the updated structured information. The downloadable PDF supports selectable bilingual text, links and A4 pagination. Browser print is also available.

## Document reproducible research

Choose **Research Packages → New package**, or **Create Research Package** on an existing Research Log. Review inherited metadata, then assign existing Library files their actual roles: inputs, code, configuration, intermediate results, outputs or documentation. Add figures, references, actual environment/parameters/steps and a complete Git commit SHA when pinning external code.

Save documented work with the appropriate status. **Verified Reproducible** requires your explicit confirmation, verification date, method and actual evidence. The site records that evidence; it does not run the experiment.

Published package payloads are frozen. Choose **Create new version** before changing scientific inputs, code, methods or outputs. The prior saved record remains an immutable snapshot. Download the manifest/README or individual original files; no large combined ZIP is generated. Preserve old files under their existing IDs when old package versions depend on them.

## Edit, delete and publish safely

All modules reuse the same local draft, review, undo, recovery and conflict checks. Deletion requires typing the stable ID and fails while another record or CV still references it. Original file deletion is also blocked by Figure/package/history references. Remove the appropriate relations and publish first.

The publish interface separates **saved to GitHub**, **build running**, and **Pages deployed**. Wait for the latest commit's successful deployment before checking the formal website. Confidential content should never be committed or uploaded to this public repository; unlisted means absent from discovery, not private.
