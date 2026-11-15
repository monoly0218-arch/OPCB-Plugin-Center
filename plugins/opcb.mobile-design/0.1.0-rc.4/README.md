# OPCB Mobile Design & Results

Candidate **0.1.0-rc.4**, plugin ID `opcb.mobile-design`, page `design`.

A live design review workspace with the existing native execution chat. Keeps the agreed five Ayo mappings and the 22-screen personal English HTML. Public distribution contains no private HTML, media or conversation identifiers.

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
