# Derived academic activity

`/activity/` is a read-only view of the same stable knowledge records used by Research, Notes, Projects, Figures, and Research Packages. It has no second activity database and no manual blog editor.

## Sources and publication rules

`deriveActivity(nodes, options)` reads the shared knowledge graph. It supports research projects, research logs, notes, course chapters (notes with a parent), projects, figures, and packages. Academic milestones may be supplied by an explicitly public, published, dated authority through `options.milestones`; the current profile timeline is not copied into a second dataset.

An activity source must have public visibility and published status. The shared graph marks existing public legacy content as published for backward compatibility; new publishing records use explicit `publicationStatus`. Draft, private, unlisted, archived, unpublished, and demo records are excluded. A child such as a research log or course chapter also needs a public published non-demo parent. Files are not independent activity sources, and no internal storage path or Owner-only field is serialized into the public feed.

## Dates and stable IDs

Publication date priority is `publishedAt`, then `date`, then `createdAt`. Dates must be genuine calendar dates in `YYYY-MM-DD`; an invalid or missing date means no event. A later real `updated`/`updatedAt` is used for research, logs, notes, course chapters, and projects. A build time is never used as a content date.

The feed shows one latest dated view per source. IDs are `sourceId:eventType`, for example `note:existing-note:note-updated`. Duplicate source/event pairs are removed. Sorting is descending by real date and then stable ID. Reordering records, rebuilding, and changes to formatting without a changed authority date cannot create additional activity entries. This is a current public activity view, not a commit-by-commit edit history.

## User interface

Entries are grouped by calendar month, carry a concrete date and activity type, and link back to the original stable content route. Available filters compose type, date range, tag, and multilingual search. Filtering happens over the already public rendered entries; the browser receives no draft/private records. A clear empty state appears when there is no real published non-demo work or when no entry matches.

The existing search build indexes the Activity page with its public text. Homepage sections and navigation data are unchanged by the Activity implementation.

## Owner workflow

Publish or update the original Research/Note/Project/Figure/Package in its existing Owner editor, with a real publication/updated date and public published state. Activity is derived on the next website build. To remove a source from public activity, archive it or change its visibility through its original editor. A published Package cannot return to Draft at the same version. No additional activity entry needs editing.

## Verification

`node --test tests/activity.test.mjs` covers published research updates, updated notes, packages and figures, excluded draft/private/demo data, parent privacy, date validation/sorting, duplicate removal, stable IDs, original source links, combined filters, empty input, rebuilding without fake events, and explicitly published milestones.

`node scripts/phase4-cv-owner-qa.mjs` also runs the actual Activity page filtering script against browser-only dated fixture records. It verifies combined Chinese/English search, type, tag and date filters, the original source link, no-results feedback, and reset behavior. No fixture record is written to the public website.
