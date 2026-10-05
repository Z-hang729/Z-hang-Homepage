# File storage and the Owner workspace

The website repository remains the source of truth for content and file metadata. Original binaries are uploaded independently of Git commits. The upload queue does not impose a file-count or cumulative-byte ceiling. It runs three transfers at a time, hashes files in small chunks, and retains the original names and folder paths.

## Upload and publish

1. Sign in at **Owner workspace**, then choose **Upload** or **File manager**. Select files, a folder, or drag files/folders from Explorer.
2. Select General, Research, Notes, or Projects and the relevant existing page. Upload progress, transfer speed, provider and individual errors appear in the queue.
3. Successfully uploaded files become pending metadata in the existing draft. Failed files can be retried independently; pause/cancel does not resend completed files.
4. **Review & publish** saves the whole metadata batch in one commit. GitHub Actions then builds and deploys Pages once. Uploading and website publishing are separate operations.

Public GitHub Release assets are public storage: an uploaded asset's permanent GitHub address can be accessed before it is listed on the website. A draft is an unpublished website catalog, not a promise of private binary storage. This public repository supports public and unlisted files; unlisted files are omitted from the file-library index but are not confidential.

## Storage providers

The authoritative application routing/technical capacities are in `src/lib/files.mjs`. The backend exposes the actually available providers to the Owner UI. There is no claim of unlimited platform storage.

| Provider | Purpose | Transfer |
| --- | --- | --- |
| GitHub repository | Existing small content assets, avatars and covers | Approved content-only atomic commit; large binaries should use the queue |
| GitHub Releases | Ordinary PDF, Office, ZIP, notebook, code and scientific attachments | Raw bounded streaming relay, server-side GitHub authorization |
| R2 / external object storage | Files above the relay capacity, including multi-GB objects | Browser-to-R2 presigned PUT / multipart; file bytes do not enter the Worker |
| External URL | Zenodo, OSF, institutional archives and other permanent public files | Metadata only, no server-side arbitrary URL fetch |

[GitHub documents a per-asset Release capacity](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases). The secure streaming relay also has a separate ingress capacity: the default Cloudflare request-body limit is 100 MB. An upload above that capacity needs direct object storage even when it fits the GitHub asset capacity. GitHub's API does not supply a browser-safe, one-object presigned upload credential; a repository write token is never sent to the browser. Existing GitHub Release files can also be imported and synchronized without retransferring their bytes.

[R2 documents its current object and multipart limits](https://developers.cloudflare.com/r2/platform/limits/). The application considers these constraints, adjusts multipart part sizes to stay within 10,000 parts, and uses short-lived URLs restricted to one generated object key and part. These URLs are transfer credentials, never saved as public download/share links.

If R2 is not configured, GitHub Releases continue to work. The queue reports which file requires Storage configuration without rejecting the rest of the selection. Cloudflare account activation/billing confirmation must be completed by the account owner before provisioning R2.

## Original bytes, folders and links

Every published file has a stable `/files/<id>/` address and metadata under `src/data/files/<id>.json`. Metadata includes original/display name, folder path, size, MIME/extension, provider/key, permanent download/preview links, GitHub asset identifiers, dates, SHA256, category/page associations, tags and visibility. Renaming/moving metadata does not retransmit the binary. Replacement preserves the file ID while changing its storage key and update date.

GitHub normalizes physical Release asset names. Generated physical names avoid collisions; original names remain in metadata and the safe original-download endpoint sends the original filename through Content-Disposition. Scientific image bytes and resolution are preserved. Copy Link shares the website address. Provider migration can change metadata without changing that address.

Folder trees retain paths. **Download current folder** streams a ZIP of the current files directly to a file selected by the visitor in supported browsers. Optional uploaded bundles are clearly marked **Uploaded ZIP snapshot** because renaming, replacing or deleting individual files does not rewrite that older snapshot. A browser without streaming save support uses a bounded Blob fallback and gives a clear alternative for very large folders. This limit concerns ZIP generation in that browser, not uploading the folder.

## Preview behavior

Previews load only after opening them. Homepage loads do not retrieve attachment binaries.

| Type | Preview |
| --- | --- |
| PDF | Native browser PDF viewer, native page/zoom controls, full screen and original download |
| Raster images | Original image, zoom control and full screen |
| Markdown | Sanitized Markdown, tables, math and Mermaid in strict mode |
| Text/code/JSON | Bounded text, syntax highlighting where supported; JSON formatting |
| CSV/TSV | Bounded streamed prefix and the first 100 rows |
| Notebook | Static Markdown, source, plain outputs and safe raster outputs; no execution |
| Audio/video | Native browser playback with metadata preload |
| FITS/FTS | Bounded primary header, FITS axis order, dimensions, instrument, observation date and original download |
| Office/unknown/active files | Metadata and original download; no upload to a third-party preview service |

HTML, SVG and executables can be stored but are never inserted as active website content. The download endpoint uses attachment disposition, nosniff and a restrictive CSP. Macro documents and notebook code are never executed. Bounded previews cancel reading when their budget is reached, including when an upstream server ignores Range. Preview failure leaves the original Download available.

## Recovery and deletion

Multipart sessions and completed part receipts are kept in IndexedDB. Permanent storage/GitHub credentials are not stored there. After a refresh, reselect the original file/folder to resume; browsers do not always preserve access to selected File objects. Upload sessions may outlive an Owner login; fresh authentication is required to resume them. The queue verifies hashes rather than trusting only names.

Deleting or replacing a published file first stages a metadata change. Remote cleanup runs only after the metadata commit removes the old reference. Cleanup receipts survive failed cleanup, and File Manager can retry it. A failed publication retains the original draft and publication ID for safe retry. Do not delete provider objects manually while published metadata still references them.

Folder uploads may contain private research or credentials. Review the chosen files before publishing. This public site is intended for materials the owner chooses to share.
