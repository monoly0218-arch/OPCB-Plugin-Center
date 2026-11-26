export const inject = ['react', 'pages', 'relay', 'opcbAgentActivation'];

export function apply({ react, pages, relay, opcbAgentActivation: service }) {
  const { createElement: h, useEffect, useState, useSyncExternalStore } = react;

  function Management({ scope }) {
    const [permission, setPermission] = useState('pending');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState();
    useEffect(() => {
      if (!scope) return;
      let current = true;
      service.canManage().then(
        allowed => { if (current) setPermission(allowed ? 'allowed' : 'denied'); },
        () => { if (current) setPermission('unavailable'); },
      );
      return () => { current = false; };
    }, [scope]);
    if (!scope || permission !== 'allowed') {
      const status = !scope ? '请先连接 OPCB 团队。' : {
        pending: '正在核对 OPCB 身份…',
        denied: '当前 OPCB 身份没有管理权限。',
        unavailable: '暂时无法核对权限，请重新打开此页面。',
      }[permission];
      return h('p', { role: 'status' }, status);
    }

    async function submit(event) {
      event.preventDefault();
      if (busy) return;
      const form = event.currentTarget;
      const fields = new FormData(form);
      setBusy(true);
      setError('');
      setResult(undefined);
      try {
        const issued = await service.issue({
          address: fields.get('address'), key: fields.get('key'), model: fields.get('model'),
        });
        if (relay.snapshot().scope !== scope) return;
        form.reset();
        setResult(issued);
      } catch {
        setError('口令未生成，请核对 API 地址、密钥和模型后重试。');
      } finally {
        setBusy(false);
      }
    }

    const field = (title, name, type, maxLength) => h('label', { className: 'grid gap-2' },
      h('span', null, title), h('input', {
        className: 'rounded-md border border-standard bg-transparent px-3 py-2',
        name, type, maxLength, required: true, disabled: busy, autoComplete: 'off',
      }));
    return h('form', { onSubmit: submit, className: 'grid max-w-xl gap-4' },
      field('API 地址', 'address', 'url', 2048), field('API 密钥', 'key', 'password', 4096),
      field('模型 ID', 'model', 'text', 200),
      h('button', { type: 'submit', disabled: busy, className: 'w-fit rounded-md border border-standard px-4 py-2' },
        busy ? '正在生成…' : '生成口令'),
      error && h('p', { role: 'alert' }, error),
      result && h('section', { role: 'status', className: 'grid gap-2' },
        h('label', { className: 'grid gap-2' }, h('span', null, '激活口令'),
          h('input', { className: 'rounded-md border border-standard bg-transparent px-3 py-2', readOnly: true, value: result.code })),
        h('p', null, `有效期至 ${new Date(result.expiresAt * 1000).toLocaleString()}。首位兑换者可在有效期内重试。`)));
  }

  function Page() {
    const current = useSyncExternalStore(relay.subscribe, relay.snapshot);
    const scope = current.status === 'ready' ? current.scope : undefined;
    return h('section', { className: 'h-full overflow-auto p-6' },
      h('h1', { className: 'mb-4 font-semibold' }, 'OPCB 智能体管理'), h(Management, { key: scope, scope }));
  }
  pages.register({ id: 'activate-admin', title: 'OPCB 智能体管理', layout: 'workspace', icon: OPCB_AGENT_ADMIN_ICON, component: Page });
}
