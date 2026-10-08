# Research Reproducibility Packages

Research packages document real experiments and reuse existing assets. They do not run Python/IDL, launch notebooks, download large inputs, calculate large-file hashes automatically, or create ZIP archives in a visitor’s browser. No demonstration experiments are published.

## Authority and file roles

Authority: `src/data/packages/<slug>.json`; ID: `package:<slug>`. `src/lib/research-packages.mjs` exports pure `normalizePackage` / `validatePackage`, manifest/README/citation helpers and version helpers. File roles are explicit lists:

- `inputs`: input observations or datasets.
- `code`: uploaded source code.
- `configuration`: configuration files.
- `intermediate`: intermediate results.
- `outputs`: final outputs.
- `documentation`: supporting documents.

Each item is `{fileId, sha256?, size?, originalName?, storageProvider?, uploadedAt?}`. `fileId` reuses the stable Library ID without `file:`. Owner selection captures available size, checksum, provider, original filename and upload date. Missing checksums remain absent and are displayed as **Not verified**. Each file has one explicit role within a package; repeated references are rejected. Neither package deletion nor figure deletion deletes Library originals.

`figures` contains typed `figure:slug` IDs and `references` contains typed `reference:slug` IDs. Research, logs, notes, projects and other objects use the shared typed `related*` IDs or `relations`. Knowledge Connections provides backlinks; there is no duplicate backlink database.

## Experimental record

Common fields include title, description, actual date, updated date, authors, source, license, tags, publication and visibility. Unknown provenance stays `Unspecified` / `Unknown`. Environment, parameters, steps and notes accept Markdown; environment/parameters can also use structured JSON records. Missing software versions remain unknown. Commands are rendered as sanitized text/Markdown and never executed.

`codeVersion` can record `{repositoryUrl, commitSha, tag, filePath, pinned}`. A pin requires a full concrete 40- or 64-character Git commit SHA. A mutable branch URL or tag does not establish a pin. Uploaded source code uses its File Library reference and optional SHA-256 instead.

Secret-like environment/parameter values, tokens and private-key material are rejected. Placeholders such as `${API_KEY}` or `Unknown` may document required variables; actual credential values must stay outside the package. Device-local drafts do not make a public repository suitable for sensitive data.

## Honest reproducibility status

- **Documented**: the experimental record is documented; no verified rerun is claimed.
- **Partially Reproducible**: some needed materials or environment are available.
- **Verified Reproducible**: an actual rerun has explicit Owner confirmation and `verification: {ownerConfirmed: true, verifiedAt, method, evidence}`.
- **Not Reproducible**: known critical materials or procedures are missing or blocked.

The system never infers Verified Reproducible from a README, complete-looking file list, matching metadata digests or a successful website build. Verification method and evidence must describe real work.

## Owner workflow

Open **Research packages** in Owner workspace to create, edit, remove or version a package. Select existing Library files for each role; select existing figures and bibliography references. Save the device-local draft, review the manifest preview and use the existing authorized publish workflow.

**Create Research Package** on an existing Research Log inherits its title, dates, Research relation and log ID. Log file links appear as suggestions only. The Owner must review and assign input/code/output roles, environment and parameters; no file role is guessed.

A published version is immutable scientific metadata. Use **Create new version** before changing its payload. New version creation uses the saved authoritative record, preserves the old full record in `history`, starts the new version as a Documented draft, and clears the new version’s verification claim. The previous verification evidence remains attached to its historical version. An unchanged published package can still be archived or have visibility changed through the controlled shared workflow. Stable IDs do not change on ordinary edits.

## Versions and integrity

Default version: `1.0.0`; use semantic versions. `history` contains immutable snapshots with the same ID and unique versions. Historical records have no nested history. Shared server-side change validation protects previous published and archived payloads and snapshots from alteration; returning the same published version to draft is forbidden. Finish and publish the current draft before creating another version. Academic drafts, including draft history, stay local and block remote publication until reviewed and marked published.

Recorded checksums are compared to current Library metadata. If a checksum or recorded size differs, the current package cannot silently continue to identify the changed file. Preserve the old Library object or create a new package version with a new stable file reference. Historical pages explicitly show checksum mismatches or missing current files. A matching metadata digest means **bytes not rechecked**; it does not claim that the server/browser downloaded and hashed the file.

Only `public` + `published` records generate public pages and downloads. Draft and unlisted versions do not get public version routes. Private research must remain in real private storage rather than this static public site.

Existing incoming references can remain while the next version is edited locally. They do not authorize a draft to be sent to GitHub: the final remote batch must restore a valid published target and pass the strict shared relation checks.

## Downloads and citation

Current routes:

- `/packages/<slug>/`
- `/packages/<slug>/manifest.json`
- `/packages/<slug>/README.md`

Stable version routes:

- `/packages/<slug>/versions/<version>/`
- `/packages/<slug>/versions/<version>/manifest.json`
- `/packages/<slug>/versions/<version>/README.md`

Manifest schema version is `1`. Exports include the package version, role-specific stable file references, recorded integrity metadata, typed figure/reference relationships, environment, parameters, procedure and evidence when present. GitHub Pages base paths are included in generated links. Each available Library original retains its individual preview/download link. No large live ZIP is generated.

Package citations are available as plain text and BibTeX, including the actual version and stable URL. Unknown authors are not replaced with the site owner. No DOI is invented. A real owner-entered citation can be preserved in `citation`.

## Verification commands

`node --test tests/research-packages.test.mjs` covers file roles, missing/duplicate references, checksum metadata, environment/secret validation, concrete code pins, evidence requirements, manifest/README export, immutable snapshot independence, Research Log defaults, citations and public route boundaries. Shared Owner integration tests must additionally exercise staged CRUD, authorization, graph relationships, visibility and version-history enforcement. A website test does not itself verify any scientific experiment.

`node scripts/phase4-assets-owner-qa.mjs` passed nine real browser workflow groups with all records confined to RAM. It verified Research Log defaults without role inference, deliberate input/code/output selection, Figure/Reference backlinks, checksum-bearing manifest/README previews, rejection of unsubstantiated verification, explicit publication, immutable published payloads, exact retained version snapshots, new-version editing and protected metadata deletion. The editor fit 390 px without horizontal overflow. Reports and reviewed PNGs are in `.local/qa/phase4-assets-owner/`.

`tests/storage-backend.test.mjs` includes actual authenticated Worker RPC regressions for a published Figure original and a file referenced only by package history. Both block `storage-delete` with `deletePublished: true` before any provider DELETE, preserve original bytes and live pointers, reject stale confirmations after metadata removal, and allow a fresh explicit deletion only after the referencing record has been removed through publication.
