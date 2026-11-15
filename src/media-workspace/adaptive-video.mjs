export function fitMedia(width, height, mediaWidth, mediaHeight) {
  if (![width, height, mediaWidth, mediaHeight].every(v => Number.isFinite(v) && v > 0)) return null;
  const scale = Math.min(width / mediaWidth, height / mediaHeight);
  return {width: Math.floor(mediaWidth * scale), height: Math.floor(mediaHeight * scale)};
}
// Measure the real interior pane, rather than using screen vh or a fixed player
// height. A portrait movie gets a portrait surface, not a wide black rectangle.
export function createAdaptiveVideo(React) {
  const h = React.createElement;
  return function AdaptiveVideo({src, poster, label = '素材视频预览', onError}) {
    const root = React.useRef(null), [dimensions, setDimensions] = React.useState([16, 9]);
    const [size, setSize] = React.useState(null);
    React.useLayoutEffect(() => {
      const stage = root.current?.parentElement;
      const pane = root.current?.closest('.mw-current, .mw-asset-detail') || stage;
      if (!stage || !pane) return;
      const measure = () => {
        if (stage.clientWidth < 1 || pane.clientHeight < 1) return;
        const top = Math.max(0, stage.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop);
        const available = Math.max(160, pane.clientHeight - top - 160);
        const next = fitMedia(stage.clientWidth, available, ...dimensions);
        setSize(previous => next && (previous?.width !== next.width || previous?.height !== next.height) ? next : previous);
      };
      const observer = new ResizeObserver(measure);
      observer.observe(stage); if (pane !== stage) observer.observe(pane);
      measure(); return () => observer.disconnect();
    }, [dimensions[0], dimensions[1]]);
    return h('div', {ref: root, className: 'mw-adaptive-video', 'data-aspect': dimensions.join(':'), style: {height: size?.height || 180}},
      h('video', {key: src, src, poster, controls: true, playsInline: true, preload: 'metadata', 'aria-label': label,
        style: {width: size?.width || '100%', height: size?.height || '100%', aspectRatio: `${dimensions[0]} / ${dimensions[1]}`},
        onLoadedMetadata: e => { const v = e.currentTarget; if (v.videoWidth && v.videoHeight) setDimensions([v.videoWidth, v.videoHeight]); }, onError}));
  };
}
