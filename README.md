# OPCB Mobile Design & Results · 0.1.0-rc.3-dock.1

仅将原生主页面入口改为最左侧应用栏（placement: dock）。保留页面 ID、图标、业务逻辑、全部权限和原配置键。不增加位置设置，不修改 Buzz 宿主。

基线为本轮 Studio 实际已安装的固定分发提交 `2cac8ed41410e29df76a3299e0d798c81712fb21`；仅修改 plugin.js 的页面 placement，manifest 与其他文件保持基线。旧版本保留。更新需 Buzz 原生审核及本人最终确认。

验证环境：官方最新稳定版与本机 Buzz 1.0.2；API v1 pages.register 的 dock。完整仓库 npm run ci 与包/校验核验；安装后原生入口及业务仍待本人验收，Android/iOS 未验收。依赖与业务边界沿用下列原版说明。

---

# OPCB Mobile Design & Results

Candidate **0.1.0-rc.3**, plugin ID `opcb.mobile-design`, page `design`.

An English design workspace with Plan and Results, personal HTML output, and the existing native Buzz execution conversation on the right. This candidate translates the plugin-owned interface, including loading, empty, access and retry states. It does not translate native Buzz UI or user-authored conversation history.

R3 personal HTML reviews all 22 screens against the closest original Ayo pattern. Each comparison records the prior difference and the applied correction. The mobile flow includes invite entry, feed, template, materials, Agent chat, creation, errors, result, sign-up, download guidance and returning-user pages. Original author images stay unchanged. Closest-pattern adaptations are labeled; they are not invented author screens or verified device captures.

## Five agreed mappings

- Social feed → Home
- Conversation & status → OPCB Agent chat
- People discovery → Create with your photo
- Profile → Save & publish
- Live / route result → Invite

## Privacy and execution

The public package contains code and mapping labels. It excludes personal chats, material, private HTML and current binding IDs. HTML results remain in their original conversation permissions. Binding retains the same owner-scoped Artifact preference and checks the original owner request, source message, conversation membership and revision. It creates no chat and sends no message. The existing owner/agent tools keep their names and authorization contract.

The right execution panel uses native `conversation.ui.Tabs`; messages, composer, agent selection and sending remain host-owned. The HTML's Agent screen is a local design simulation. Changing this simulation never submits a real job or message.

## Compatibility and preview

Verified baseline: official stable Buzz **1.0.2**, Studio installed **1.0.2**, API v1. Capabilities: `react/pages/conversation/relay/artifactStorage/agents/browser/host`.

HTML preview requires Mac Buzz and Python 3. A sandboxed `python3 -I` process holds the selected self-contained HTML in memory and exposes only a random loopback port/path. It blocks external resources and Buzz IPC and exits on close, identity changes or lost access. HTML is limited to 50 MB. No additional host privileges, external origins or core modifications.

The public distribution is a fixed commit in OPCB-Plugin-Center and requires the native review card and final owner approval. Installed state, binding state and actual native rendering are distinct. Android, iOS and real generation/sign-up/publishing are not validated by this desktop candidate.

## Build and validation

Sources: `src/mobile-design`; bundled through `scripts/build_mobile_design.mjs`. HTML-reader rc.2 preview helpers are bundled, so no separate reader installation is required.

Run `npm run ci`, package with `python3 scripts/package_release.py`. Binding, permission, identity, concurrent revision and readback regression checks remain. Browser evidence covers the private HTML flow; it does not substitute for native app acceptance after review.

References: [Ayo / Revmp](https://revmp.studio/), [original post](https://x.com/akwaabaaa/status/2102046830846439432). Method: [Unslop by Damir Sokolovsky](https://github.com/heydamir/unslop), CC BY 4.0.
