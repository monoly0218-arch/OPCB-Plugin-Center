/** OPCB UI Standard — host React factory; no runtime dependencies. */
export const VERSION = '1.0.0-candidate.1';
const join = (...names) => names.filter(Boolean).join(' ');
const tones = new Set(['neutral', 'info', 'success', 'warning', 'danger']);
const variants = new Set(['default', 'primary', 'quiet', 'danger']);

export function createUI(React) {
  if (typeof React?.createElement !== 'function') throw new TypeError('Pass the host React instance to createUI');
  const h = React.createElement;

  function Button({ children, variant = 'default', className, type = 'button', ...props }) {
    return h('button', { ...props, type, className: join('opcb-button', className), 'data-variant': variants.has(variant) ? variant : 'default' }, children);
  }
  function IconButton({ label, children, className, type = 'button', ...props }) {
    if (typeof label !== 'string' || !label.trim()) throw new TypeError('IconButton requires a readable label');
    return h('button', { ...props, type, className: join('opcb-icon-button', className), 'aria-label': label }, children);
  }
  function Input({ className, type = 'text', ...props }) {
    return h('input', { ...props, type, className: join('opcb-input', className) });
  }
  function Chip({ children, tone = 'neutral', className, ...props }) {
    return h('span', { ...props, className: join('opcb-chip', className), 'data-tone': tones.has(tone) ? tone : 'neutral' }, children);
  }
  function Panel({ children, className, as = 'section', ...props }) {
    return h(as, { ...props, className: join('opcb-panel', className) }, children);
  }
  /** The open button and actions are siblings. Title/meta are plain text. */
  function ObjectRow({ title, meta, onOpen, actions, children, selected = false, className, ...props }) {
    const content = [
      h('span', { className: 'opcb-row-title', key: 'title' }, String(title ?? '')),
      meta == null ? null : h('span', { className: 'opcb-row-meta', key: 'meta' }, String(meta)),
    ];
    return h('div', { ...props, className: join('opcb-row', className), 'data-selected': selected ? 'true' : 'false' },
      onOpen
        ? h('button', { type: 'button', className: 'opcb-row-open', onClick: onOpen, 'aria-label': `打开 ${String(title ?? '')}`, 'aria-current': selected ? 'true' : undefined }, ...content)
        : h('div', { className: 'opcb-row-content' }, ...content),
      children,
      actions ? h('div', { className: 'opcb-row-actions' }, actions) : null,
    );
  }
  function Field({ id, label, help, error, children, className, ...props }) {
    if (typeof id !== 'string' || !id.trim()) throw new TypeError('Field requires a stable id');
    const helpId = `${id}-help`, errorId = `${id}-error`;
    const describedBy = [help ? helpId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined;
    const control = typeof children === 'function'
      ? children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })
      : children;
    return h('div', { ...props, className: join('opcb-form-row', className) },
      h('label', { htmlFor: id, className: 'opcb-field-label' }, label),
      control,
      help ? h('p', { id: helpId, className: 'opcb-field-help' }, help) : null,
      error ? h('p', { id: errorId, className: 'opcb-field-error', role: 'alert' }, error) : null,
    );
  }
  function EmptyState({ title, description, action, className, role = 'status', ...props }) {
    return h('section', { ...props, role, className: join('opcb-empty', className) },
      h('h2', { className: 'opcb-empty-title' }, title),
      description ? h('p', { className: 'opcb-empty-description' }, description) : null,
      action,
    );
  }
  function Workspace({ nav, inspector, children, theme = 'host', navOpen = false, inspectorOpen = false, className, label = '插件工作区', ...props }) {
    const safeTheme = ['host', 'light', 'dark'].includes(theme) ? theme : 'host';
    return h('div', { ...props, className: join('opcb-ui', className), 'data-theme': safeTheme, 'data-nav': navOpen ? 'open' : 'closed', 'data-inspector': inspector && inspectorOpen ? 'open' : 'closed', 'aria-label': label },
      h('div', { className: 'opcb-shell' },
        h('nav', { className: 'opcb-nav', 'aria-label': '插件导航' }, nav),
        h('main', { className: 'opcb-main' }, children),
        inspector ? h('aside', { className: 'opcb-inspector', 'aria-label': '当前对象详情' }, inspector) : null,
      ),
    );
  }
  /** Pass bundled CSS text; the factory never reads files or loads URLs. */
  function StyleSheet({ css, nonce }) {
    if (typeof css !== 'string') throw new TypeError('StyleSheet requires bundled CSS text');
    return h('style', { 'data-opcb-ui-version': VERSION, ...(nonce ? { nonce } : {}) }, css);
  }

  return { Button, IconButton, Input, Chip, Panel, ObjectRow, Field, EmptyState, Workspace, StyleSheet };
}
