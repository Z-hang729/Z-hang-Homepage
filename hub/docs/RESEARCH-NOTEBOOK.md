# Research Notebook

Research continues to use existing project pages and the `src/content/logs/<project>/<filename>.md` collection. Titles can change without changing log IDs or URLs. No current project, log body, Homepage text or Library original is migrated or rewritten by this upgrade.

## Data and identity

A log ID is its existing `<project>/<filename>` path. Its full reading page is `/research/<project>/logs/<filename>/`; the project retains its `#research-log` timeline. Same-day logs receive separate stable anchors. Existing trusted MDX logs can still render, and Owner can change their metadata while preserving their body.

```yaml
title: Owner-authored log title
project: existing-project-slug
date: 2026-10-08
updated: 2026-10-08
summary: Short owner-authored summary
status: In Progress
kind: note
tags: []
relatedFiles: []
relatedNotes: []
relatedProjects: []
attachments: []
```

This is a schema example, not a research result. `status` accepts Planning, In Progress, Completed or Paused. `kind` accepts note, experiment or result. Legacy logs use `date` for missing `updated`, `description` for missing `summary`, and `note` for missing `kind`; unspecified status stays unspecified. Existing fields and external attachment links remain supported.

`relatedFiles` contains stable File Library UUIDs. `relatedNotes` can reference a course (`note:<course>`) or chapter (`note:<course>/files/<path>`); legacy course slugs also work. `relatedProjects` contains existing project slugs. The shared knowledge graph derives backlinks from these references. Typed `relations` are supported by the shared relation editor. Each relationship is authored once.

## Owner workflow

1. Sign in through the existing Owner account and open a Research project. Choose **Add research log** (some existing dashboard buttons say **Add update**).
2. Enter title, date, updated date, optional summary/status/type/tags and Markdown content. The existing safe editor supports formula, table, code and diagram previews.
3. Under **Attach existing files**, select Library originals. One file can be selected in several logs without another upload. **Related notes / chapters** and **Related projects** save direct references.
4. For a new file, choose **Upload new attachment**. Finish the existing upload workflow and add the completed metadata to the draft. Close the uploader, then select the file in the refreshed list. Uploading does not automatically attach the file to the log or publish the log.
5. Choose **Save log to draft**. Review the draft and **Publish Changes** once for the log, related changes and uploaded-file metadata together.

**Edit research log** updates the same file and ID. **Delete research log** requires its exact current title, removes that log from the draft and keeps all referenced files, notes and projects. Publishing uses the existing expected-revision protection. A publish conflict requires reloading/reviewing rather than silently overwriting another change.

Research page sections continue to use ordinary Markdown headings and the existing **Arrange sections** editor. Add and reorder the sections that contain your work; no empty notebook sections or research conclusions are generated.

## Reading and timeline

The timeline sorts by the log date, newest first, with a stable ID tie-break for same-day logs. Visitors can combine Tag and Status filters, expand/collapse visible logs, open a full reading page, and navigate to the newer/older log. Full pages show related Library files, notes/projects and automatically derived knowledge connections.

Progress summaries use the current project's status, actual updated dates and non-demo records. Recent experiments and latest result appear only when a real log explicitly has that type. Existing demo logs stay marked as examples and do not become reported research results.

## Troubleshooting

- **File missing from choices:** complete the upload, add its metadata to the draft, close the uploader or choose **Refresh file choices**. New originals keep using the existing storage provider.
- **Unavailable reference:** the editor retains the ID so an unrelated edit cannot silently erase it. Restore the target or explicitly uncheck the reference. Shared validation reports missing targets before publish/build.
- **No matching logs:** clear Tag/Status filters. A project without logs shows an honest empty state.
- **MDX body is read-only:** trusted existing MDX remains compatible. Owner authoring uses safe Markdown; executable MDX changes use the developer workflow.
- **Title changed:** use the same reading URL; it is based on the filename, not title.
- **Published changes are delayed:** the draft must first be published, then the existing GitHub Pages build must finish. Use the existing publishing status before refreshing the public page.

## Implementation and checks

`src/lib/research.mjs` owns stable identities, dates, sort/filter/neighbors and derived summaries. `ResearchTimeline.astro` and `ResearchLogPage.astro` render reading views. `src/owner/research-log-editor.js` reuses Owner forms, CAS drafts, Markdown safety and the existing upload queue. Log CRUD stays in `src/lib/owner/model.mjs`; shared schema, policy and knowledge graph validate cross-content references.

Focused tests: `node --test tests/research-notebook.test.mjs`. Isolated browser checks: `node scripts/research-owner-browser-qa.mjs`. Browser fixtures are local and never write to production or real Library providers.
