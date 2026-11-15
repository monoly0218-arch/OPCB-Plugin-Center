# OPCB Mobile Design & Results

Candidate **0.1.0-rc.9**, plugin ID `opcb.mobile-design`, page `design`.

A live design review workspace with the existing native execution chat. Keeps the agreed five Ayo mappings and the current personal HTML with English mobile screens. Public distribution contains no private HTML, media or conversation identifiers.

## Live results

New owner-authorized result bindings update the already open preview through a memory-only local event stream. No manual refresh or plugin reinstall is needed for HTML revisions. The native conversation stays open. The preview restores its current screen, comparison, form/demo state, scroll and theme. Drawing or editing a note defers the update until that note is saved or cancelled. Original-version annotations remain attached to their source and document hash. Arbitrary HTML without the OPCB app-state hooks still displays, but cannot promise full interaction-state restoration.

The Agent publishes its revised self-contained HTML into the same execution conversation and updates the existing binding with `opcb_mobile_design_bind`. This is a result update, not an automatic update of executable plugin code. Plugin code/permission changes retain native review.

## Annotate

1. Select **Annotate**, then drag a box on a phone screen or original reference.
2. Enter the requested change and save. The editor stays open until personal storage confirms the note.
3. Default **Batch & send** accumulates notes. Review the prompt, remove individual notes, then select **Confirm & send** once. It sends one message to the bound channel using the owner's native session; delivery/retry remains in Buzz's outbox.
4. **Add to chat draft** appends each saved note and its location to the matching native composer. Existing text is preserved; no message is sent. If that composer is unavailable, the note remains in the batch for manual retry.

Notes contain page, element, normalized box, label, comment, source message/URL and document SHA-256. Up to 50 pending notes, 2,000 characters per comment. Pending notes persist in the owner's scoped Artifact preferences for that execution channel. Sending or transferring to the draft removes pending items. Draft text is independent: removing a pending note does not rewrite text already inserted into a native draft. Sending uses the bound channel timeline; arbitrary thread composers are never targeted. A single-agent DM automatically addresses its Agent under the native session contract; other channel recipient behavior follows Buzz.

## Compatibility and permissions

Official latest stable and installed Studio host verified **Buzz 1.0.2**, API v1. Uses `react/pages/conversation/relay/artifactStorage/agents/browser/host`, optional feature-checked composer tool registration. macOS Buzz and Python 3 are required for preview. No new host grants; only the previously reviewed `python3 -I` preview process. No host build, upgrade or restart.

The preview has a random loopback address and path. Its HTML runs in an opaque-origin sandbox; outbound network/IPC is blocked. A same-origin, token-protected annotation endpoint passes bounded draft notes to the plugin. Only the host-owned **Confirm & send** action can publish. Close, identity/community changes, lost channel access and plugin replacement retire the owned process and subscriptions. No credentials, persistent server or external endpoint.

Local source/binding and access checks remain. Android, iOS, physical-phone use, production generation, SMS, registration and publication are outside desktop validation. Native installation and actual Buzz rendering/composer behavior require owner update review and acceptance; browser API fixtures are not native-app acceptance.

## Build and validation

Source `src/mobile-design`, deterministic bundle `scripts/build_mobile_design.mjs`. Full validation `npm run ci`, packaging `python3 scripts/package_release.py`.

References: [Ayo / Revmp](https://revmp.studio/), [original post](https://x.com/akwaabaaa/status/2102046830846439432). Design method: [Unslop by Damir Sokolovsky](https://github.com/heydamir/unslop), CC BY 4.0.

## Navigation correction

Restores the primary entry to the left app dock and supplies a self-contained phone SVG icon. Removes the separate Live updates strip. Annotation mode stays in the existing Plan/Results toolbar. Within this plugin preview only, hides the native browser address/navigation toolbar through a scoped accessibility selector; native error/retry rendering remains. Official Buzz1.0.2 Browser API has no chrome visibility option. No host changes or new permissions. Same plugin/page IDs, owner-scoped binding and source, live updates, annotations and execution chat are preserved. Native installation requires owner review.

## Native iframe loading correction

Buzz1.0.2 applies its HTTP/HTTPS navigation policy to subframes too. Prior srcdoc navigation used about:srcdoc, which native Buzz rejects. This version serves each exact document revision on the same random loopback HTTP origin, keeps the iframe opaque-origin sandbox, and sets a separate restrictive document CSP. The event stream carries revision metadata, not the full HTML. Three recent HTML bodies are retained in memory; older paths return404. No extra grants or host modifications. A 15-second document handshake deadline exposes Retry preview rather than leaving Applying latest design indefinitely.

## Stable review and single-row toolbar

Normal viewing has one 52px toolbar: Plan, Results, result view, Annotate, note mode and More. Try the flow, Theme, Import HTML and Open execution chat are retained under More. The embedded document hides its duplicate title/navigation chrome in this workspace; source HTML remains intact. Small widths scroll the toolbar horizontally. Live status stays offscreen unless loading fails.

Unchanged binding and note snapshots preserve React state; identical document hashes do not reach the worker or trigger broadcasts; each document accepts initialization once. Replayed view commands leave the current view intact. No timer reloads the document. New authorized content still restores state after an unfinished note is saved.

## Review position and Chinese workspace

Chinese single-row review controls. Plan and Results retain the same preview rather than unmounting it. Only navigation, viewport scroll, theme and annotation mode are saved under the owner/channel-scoped review-position preference. Uploaded media, input and chat content are not persisted in that preference. Live document updates transfer full in-memory demo state; a browser guest reopened on the same session restores the last page and scroll. Annotation capture suppresses underlying phone navigation. Native installation and actual-device acceptance still require review.
