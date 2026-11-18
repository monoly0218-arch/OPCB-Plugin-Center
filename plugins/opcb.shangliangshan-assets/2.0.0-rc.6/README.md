# Asset library 2.0.0-rc.6

Native folder creation and membership, single/multiple passwordless sharing (72 hours or permanent), quick actions, batch trash with undo, restore, and administrator-only confirmed permanent deletion/empty trash. Server authorization and exact revision checks apply to every mutation. Shared file references and history are preserved when another asset still needs the original.

Same plugin ID, Buzz role mapping, process permission, 3dicons V1 identity, execution conversations and existing source pages. No private media, cookies or credentials are bundled. Python3 required on macOS. Source: src/shangliangshan-assets; build: node scripts/build_assets_actions.mjs; full checks: npm run ci. Tested against official v1.0.5/API1 and Studio 1.0.5-preview.2; native installation and owner acceptance are separate from component/browser verification. Android/iOS not verified.

Requires the matching assets backend routes deployed at https://staging.paolab.cn/assets/. Shares are anonymous bearer URLs. Original-site passwordless member selection retains its current identity limitation. The new version is delivered through the native review card and takes effect after owner confirmation.
