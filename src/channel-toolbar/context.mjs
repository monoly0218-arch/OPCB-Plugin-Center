// The chat header uses Buzz's native ghost/toolbar button contract. Package and
// primary-page identity artwork remains with the original plugin.
export function channelControl(React, kind, props) {
  const h = React.createElement;
  const disabled = !props.available();
  const label = kind === 'artifacts' ? '产物' : '任务';
  const path = kind === 'artifacts'
    ? 'M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z'
    : 'M4 5h16v15H4V5Zm4 0V3h8v2M8 10l1 1 2-2m2 1h4m-9 5 1 1 2-2m2 1h4';
  return h('button', {
    type: 'button', className: 'buzz-button', 'data-buzz-ui': '',
    'data-variant': 'ghost', 'data-size': 'sm', 'data-button-shape': 'control',
    'data-icon-variant': 'ghost', 'data-icon-size': 'toolbar', 'data-icon-shape': 'control',
    'aria-label': label, title: label, 'aria-expanded': !!props.pressed,
    disabled, 'data-disabled': disabled ? '' : undefined,
    onClick: event => {
      if (!props.available()) return;
      event.currentTarget.focus();
      props.toggle((kind === 'artifacts' ? 'opcb:chat-artifacts:' : 'opcb-task-progress:') + props.context.channelId);
    },
  }, h('span', {className: 'buzz-button-label'}, h('svg', {
    viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round',
    'aria-hidden': true, focusable: false,
  }, h('path', {d: path}))));
}

export function withChannelToolbar(context, pluginId) {
  const panels = context.panels;
  const service = new Proxy(panels, {get(target, key) {
    if (key === 'register') return contribution => {
      let next = contribution;
      const kind = pluginId === 'opcb.chat-artifacts' && contribution.id === 'artifacts' ? 'artifacts'
        : pluginId === 'opcb.task-center' && contribution.id === 'task-progress' ? 'tasks' : null;
      if (kind) next = {...contribution, channelLauncher: props => channelControl(context.react, kind, props)};
      if (pluginId === 'opcb.higgsfield-mailbox' && contribution.id === 'mailbox'
        || pluginId === 'opcb.project-workspace' && ['space', 'artifacts'].includes(contribution.id)) {
        const {channelLauncher, ...retained} = contribution;
        next = retained;
      }
      return target.register(next);
    };
    const value = Reflect.get(target, key, target);
    return typeof value === 'function' ? value.bind(target) : value;
  }});
  return new Proxy(context, {get(target, key) {
    if (key === 'panels') return service;
    const value = Reflect.get(target, key, target);
    return typeof value === 'function' ? value.bind(target) : value;
  }});
}
