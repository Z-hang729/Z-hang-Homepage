const namespace = 'zhang-owner';
export async function connectLocal() {
  const endpoint = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/api/owner/`;
  const response = await fetch(endpoint + 'session/', { credentials: 'same-origin', cache: 'no-store' });
  const session = await response.json();
  if (!response.ok || !session.authenticated) throw new Error(session.error?.message || session.error || 'Local editing is unavailable. Start the local development server.');
  const csrf = session.csrfToken;
  return {mode: 'local-development', session,
    async call(method, params = {}) {
      const reply = await fetch(endpoint + 'rpc/', {method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json', 'X-Owner-CSRF': csrf}, body: JSON.stringify({method, params})});
      const data = await reply.json();
      if (!reply.ok || data.ok === false) {
        const error = new Error(data.error?.message || data.error || `Editing request failed (${reply.status}).`);
        error.code = data.error?.code || data.code; error.status = reply.status; throw error;
      }
      return data.result ?? data;
    }, close() {},
  };
}
export async function connectRemote(backendUrl) {
  const backend = new URL(backendUrl);
  if (backend.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(backend.hostname)) throw new Error('Owner authentication requires a secure HTTPS backend.');
  const bridgeUrl = new URL('/bridge/', backend); bridgeUrl.searchParams.set('client_origin', location.origin);
  const bridge = window.open(bridgeUrl.href, 'zhang-owner-auth', 'popup,width=540,height=700');
  if (!bridge) throw new Error('The sign-in window was blocked. Allow this window and try again.');
  let serial = 0; const pending = new Map(); let readyResolve;
  const ready = new Promise(resolve => {readyResolve = resolve;});
  const receive = event => {
    if (event.origin !== backend.origin || event.source !== bridge || event.data?.namespace !== namespace) return;
    if (event.data.type === 'ready') {readyResolve(); return;}
    if (event.data.type !== 'response') return;
    const request = pending.get(event.data.id); if (!request) return;
    clearTimeout(request.timer); pending.delete(event.data.id);
    if (event.data.ok) request.resolve(event.data.result);
    else {const error = new Error(event.data.error?.message || 'The authentication service could not complete this request.'); error.code = event.data.error?.code; error.status = event.data.error?.status; request.reject(error);}
  };
  window.addEventListener('message', receive);
  const helloTimer=setInterval(()=>{if(!bridge.closed)bridge.postMessage({namespace,type:'hello'},backend.origin);},500);
  ready.then(()=>clearInterval(helloTimer));
  const transport = {mode: 'github',
    async call(method, params = {}) {
      if (bridge.closed) throw new Error('The secure connection window was closed. Sign in again; your draft is preserved.');
      await Promise.race([ready, new Promise((_, reject) => setTimeout(() => reject(new Error('The authentication service did not respond. Your draft is preserved.')), 30000))]);
      return new Promise((resolve, reject) => {
        const id = String(++serial);
        const timer = setTimeout(() => {pending.delete(id); reject(new Error('The server did not respond. Check the connection before trying again; your draft is preserved.'));}, method === 'publish' ? 120000 : 60000);
        pending.set(id, {resolve,reject,timer}); bridge.postMessage({namespace,type:'request',id,method,params}, backend.origin);
      });
    },
    close() {clearInterval(helloTimer);window.removeEventListener('message', receive); for (const request of pending.values()) {clearTimeout(request.timer);request.reject(new Error('The editing connection was closed.'));} pending.clear(); bridge.close();},
  };
  for (let attempt=0;attempt<600;attempt++) {
    const session=await transport.call('session');
    if(session.authenticated){transport.session=session;return transport;}
    if(bridge.closed)break;
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  transport.close(); throw new Error('Sign-in was not completed. Your draft is preserved.');
}
