/** Original OPCB outline paths. No font, asset URL or third-party runtime. */
const paths = Object.freeze({
  library: 'M4 4h5v16H4z M11 4h4v16h-4z M17 4h3v16h-3z',
  board: 'M4 4h16v16H4z M9 4v16 M15 4v16',
  document: 'M6 3h9l4 4v14H6z M14 3v5h5 M9 12h7 M9 16h5',
  image: 'M4 4h16v16H4z M4 16l5-6 4 4 3-3 4 5 M15 8h.01',
  folder: 'M3 7h7l2-3h9v16H3z',
  search: 'M20 20l-5-5 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  close: 'M6 6l12 12 M18 6L6 18',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  back: 'M19 12H5 M11 6l-6 6 6 6',
  settings: 'M4 7h16 M4 17h16 M8 4v6 M16 14v6',
  check: 'M5 12l4 4L19 6',
  clock: 'M12 8v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  warning: 'M12 3l10 18H2z M12 9v5 M12 18h.01',
  shield: 'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 12l3 3 5-6',
});
export const ICON_NAMES = Object.freeze(Object.keys(paths));
export function createIcons(React) {
  if (typeof React?.createElement !== 'function') throw new TypeError('Pass host React');
  return function Icon({ name = 'document', label, size = 20, ...props }) {
    if (!(name in paths)) throw new RangeError(`Unknown OPCB icon: ${name}`);
    return React.createElement('svg', {
      ...props, width: size, height: size, viewBox: '0 0 24 24',
      fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
      strokeLinecap: 'round', strokeLinejoin: 'round', focusable: 'false',
      ...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true }),
    }, React.createElement('path', { d: paths[name] }));
  };
}
