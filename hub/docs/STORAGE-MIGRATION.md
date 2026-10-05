# Storage migration and configuration

Baseline for this upgrade: `74f40cc8a5970db0b6f0a9ad9abfdd5de41d9aee`, backed up as `backup/before-file-system-v2`. Homepage profile, current focus, timeline, section layout, existing research/notes/projects and existing originals are frozen. No prior demo or Sites source is restored.

## Existing assets

Existing repository uploads and content attachments remain valid. They are not deleted or rewritten by enabling hybrid storage. New direct uploads use independently stored binaries and JSON metadata. Existing Markdown/MDX content needs no manual download-URL edits: new metadata associates with the current page ID and renders File Cards automatically.

The default GitHub Release provider uses the already authorized website repository. This keeps the GitHub App installation's existing exact repository scope. Separate asset storage remains supported through `ASSETS_REPO_NAME=Z-hang-Homepage-Assets` and `ASSETS_REPOSITORY_ID=<verified numeric ID>` after that repository exists and the owner explicitly completes the App installation update. The backend then requires exactly the two configured numeric repositories and the original minimum permissions; it does not accept broad installation grants. Existing website Release assets are not automatically moved.

To migrate an individual file, upload/verify the destination original, replace the same JSON record's provider fields while retaining the stable file ID, review and publish, verify the original download and preview, then clean up the unreferenced old asset. Do not change the stable website URL or remove old storage before publication succeeds.

## Enable R2 direct upload

1. The Cloudflare account owner activates R2 in the Cloudflare dashboard and confirms any required billing/account prompts. Do not put payment data or passwords in chat.
2. Create a dedicated private bucket, such as `z-hang-homepage-files`; add the Worker binding `FILE_BUCKET`. Keep public `r2.dev` access disabled. The Worker serves only published catalog entries, with original filename and safe headers.
3. Set `R2_ACCOUNT_ID` and `R2_BUCKET` backend variables. Create a bucket-scoped object read/write S3 credential and set `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` as **Worker Secrets**. Never use `PUBLIC_*`, repository files, browser localStorage or user-supplied chat text for permanent credentials.
4. Configure bucket CORS for the exact website origins. Allow PUT/GET/HEAD as needed, Content-Type, Content-MD5 and Range request headers, and expose ETag/Content-Length/Content-Range. Avoid `*` origins. Multipart completion requires the browser-readable ETag; signed Content-MD5 checks each transferred part without loading it all into memory.
5. Deploy the backend, inspect authenticated Storage Help, and verify a real direct multipart upload including interrupted/retried parts, byte count, checksum and stable original download. Local/mock multipart tests alone do not prove account provisioning or a live upload.

The public Worker origin remains stable. Transfer URLs expire after 15 minutes; reissuing a part URL requires an authenticated Owner RPC. Metadata stores stable Worker download/preview URLs and generated object keys, never presigned query strings. Huge uploads bypass Worker ingress and request-body buffering.

## Publish and rollback

The existing compare-and-swap commit checks current HEAD and all edited file revisions. A user update made while an upload is running is preserved; refresh/review the conflicting draft before publication. One batch of metadata causes one website commit/build, while provider uploads happen independently.

For a code rollback, use the backup as a comparison/reference and revert only the upgrade's implementation files. Do not reset main to the backup: that would erase subsequent user content edits. Keep new file metadata and storage objects until a compatible migration or reviewed deletion is complete.

Validation evidence belongs in `docs/VERIFICATION.md` and ignored local QA records. Record actual provider readiness separately from simulated behavior. GitHub-only functionality must remain available when object storage configuration is incomplete.
