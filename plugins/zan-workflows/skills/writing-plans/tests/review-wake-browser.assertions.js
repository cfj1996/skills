globalThis.runReviewWakeBrowserAssertions = async function () {
  const failures = [];
  const check = (value, message) => { if (!value) failures.push(message); };
  const originalFetch = window.fetch;
  const token = 'private-browser-fixture-token';
  const config = port => ({ endpoint: `http://127.0.0.1:${port}/notify`, token, expiresAt: new Date(Date.now() + 60000).toISOString() });
  const mount = () => {
    const session = structuredClone(globalThis.reviewSession); session.sessionId = crypto.randomUUID();
    return globalThis.PageDeliveryReviewPanel.mountReviewPanel(session);
  };
  const submit = () => {
    const root = document.querySelector('[data-page-delivery-review-host]').shadowRoot;
    root.querySelector('[data-card-index="2"]').click();
    root.querySelector('[data-action="submit"]').click();
  };
  const settle = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };
  try {
    for (const reconnect of [false, true]) {
      const sent = [];
      let finishHealth;
      window.fetch = async (url, options) => {
        if (url.endsWith('/health')) {
          if (reconnect && url.includes(':41230')) return { ok: true, json: async () => ({ ready: true }) };
          return new Promise(resolve => { finishHealth = () => resolve({ ok: true, json: async () => ({ ready: true }) }); });
        }
        sent.push({ url, payload: JSON.parse(options.body) });
        return { ok: true, json: async () => ({ queued: true }) };
      };
      const api = mount();
      if (reconnect) await api.connectWakeBridge(config(41230));
      const connecting = api.connectWakeBridge(config(41231));
      submit();
      check(sent.length === 0, 'a submission during health check must not use a missing or old connection');
      finishHealth();
      check((await connecting).connected, 'the new health check must finish successfully');
      await settle();
      check(sent.length === 1 && sent[0].url === 'http://127.0.0.1:41231/notify', 'exactly one notification should go to the new connection');
      check(sent[0].payload.submissionId === api.exportSubmission().submissionId, 'notification identity must match the real exported submission');
      check(api.getState().notification.status === 'queued', 'successful delivery is visibly queued');
      check(!JSON.stringify(api.getState()).includes(token) && !JSON.stringify(api.exportSubmission()).includes(token), 'private bridge configuration must not enter review state or submissions');
      api.destroy();
    }
    let completeStaleHealth;
    let unexpected = 0;
    window.fetch = async url => url.endsWith('/health')
      ? new Promise(resolve => { completeStaleHealth = () => resolve({ ok: true, json: async () => ({ ready: true }) }); })
      : (unexpected += 1, { ok: true, json: async () => ({ queued: true }) });
    const api = mount();
    const pending = api.connectWakeBridge(config(41231)); submit(); api.destroy(); completeStaleHealth();
    check(!(await pending).connected && unexpected === 0, 'destroyed sessions must not notify after late health responses');
  } catch (error) { failures.push(error.message); }
  finally { window.fetch = originalFetch; }
  return { valid: failures.length === 0, failures };
};
