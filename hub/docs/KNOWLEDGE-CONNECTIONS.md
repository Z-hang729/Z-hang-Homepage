# Knowledge connections

The existing Markdown/frontmatter, file JSON and stable routes remain the source of truth. There is no second database and no automatically invented academic relationship.

## Stable IDs

| Content | ID | Existing route |
| --- | --- | --- |
| Research | `research:<slug>` | `/research/<slug>/` |
| Course | `note:<slug>` | `/notes/<slug>/` |
| Chapter | `note:<course>/files/<path-without-extension>` | `/notes/<course>/files/<path>/` |
| Project | `project:<slug>` | `/projects/<slug>/` |
| Research log | `log:<project>/<filename-without-extension>` | `/research/<project>/logs/<filename>/` |
| File | `file:<UUID>` | `/files/<UUID>/` |

IDs come from existing paths or UUIDs, never display titles. Renaming a title preserves links. File replacement/moving preserves its UUID. Moving a source Markdown path is a separate developer operation requiring reference updates; the browser editor does not silently rename paths.

## Explicit relations

```yaml
relations:
  - target: note:electrodynamics
    type: related
  - target: file:cd72635e-49c0-4206-aad6-1f5937bfeb0c
    type: attachment
```

Types are `related`, `references`, `uses`, `derivedFrom`, and `attachment`. This example describes syntax; it does not create a published relationship. Optional `relatedNotes`, `relatedProjects`, `relatedResearch`, `relatedFiles`, and imported chapters' `sourceFileId` are read compatibly. Existing Library multi-parent fields continue to work unchanged.

The same graph produces outgoing **Related content** and incoming **Referenced by**. There is no manually maintained reverse list. Multiple links are deduplicated by source, target, type and optional anchor. Cycles are valid and require no recursive traversal. Tag-based suggestions remain labeled separately when explicit connections exist.

## Links in Markdown

```md
[[note:electrodynamics|Electrodynamics]]
[[notes/electrodynamics]]
[[note:electrodynamics/files/01#sec:introduction|Introduction]]
[Ordinary link](/notes/electrodynamics/)
```

Wiki links resolve IDs or supported content paths and optionally override the visible title. Code blocks, inline code, math and existing links are preserved. Ordinary internal Markdown links also produce references. Unresolvable wiki/metadata targets fail validation; final built HTML link checking verifies anchors and duplicate DOM IDs. External ordinary links are not treated as internal content.

## Owner workflow

Sign in with the existing Owner authentication. Article cards/details and logs expose **Connections**; **Add** and Ctrl/Cmd+K also offer an **Add Relation** command. Select existing targets, choose the relationship, and save to the current draft. Remove a row to remove an explicit relation. References written in the body are displayed separately and must be removed by editing that Markdown/wiki link.

New logs, chapters, file references and relation edits can be staged together, then reviewed/published as one existing CAS-protected Git transaction. The server validates references against the resulting complete snapshot, so a relation may point to content created in that same batch. A deletion that leaves broken references is rejected; detach references first or include the necessary detach edits in the same batch. Published files referenced by logs/notes also block destructive provider deletion until those references have been removed and published.

## Search and future graph

The existing Pagefind index includes course/chapter/log text and public file metadata. Content type is exposed through Pagefind's existing filters and metadata; connected content titles are searchable on the source page. See [Pagefind filters](https://pagefind.app/docs/filtering/) and [metadata](https://pagefind.app/docs/metadata/). File Library's fast local metadata search remains available.

`/knowledge.json` is a static, portable `{nodes, edges}` projection of the same source model. It omits raw Markdown, secrets, unlisted files and edges to hidden nodes. It can support a future graph UI without adding a graph library to ordinary page loads. No interactive 3D graph or AI-generated relationship inference is added in this phase.
