// Register bytes through the FontFace API, as the native HTML reader does.
// Data-URL @font-face is blocked by Buzz desktop's default font CSP.
export function registerWorkspaceFonts(ctx) {
  ctx.effect(() => {
    if (typeof FontFace !== 'function' || typeof document === 'undefined') return;
    let stopped = false;
    const loaded = [];
    const fonts = typeof OPCB_FACTORY_ASSETS_FONTS === 'object' ? OPCB_FACTORY_ASSETS_FONTS : [];
    for (const font of fonts) {
      const bytes = Uint8Array.from(atob(font.data), c => c.charCodeAt(0));
      const face = new FontFace(font.family, bytes, {weight: font.weight});
      face.load().then(value => {
        if (!stopped) { document.fonts.add(value); loaded.push(value); }
      }).catch(() => {});
    }
    return () => { stopped = true; loaded.forEach(face => document.fonts.delete(face)); };
  });
}
