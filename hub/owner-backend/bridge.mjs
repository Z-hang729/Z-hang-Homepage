// This script runs on the Worker's origin in a top-level window. The website
// receives content and status only; GitHub credentials and session cookies
// never leave the Worker origin.
const bridgeScript = String.raw`
const clientOrigin = new URL(location.href).searchParams.get('client_origin');
const client = window.opener;
const allowedMethods = new Set(['session','snapshot','file','publish','history','status','logout']);
let csrf = null;
let active = false;
let loginPoll = null;
const authEvents = typeof BroadcastChannel === 'function' ? new BroadcastChannel('zhang-owner-auth') : null;
const status = document.querySelector('[data-status]');
const send = message => client?.postMessage({namespace:'zhang-owner',...message},clientOrigin);
async function bootstrap() {
  const response = await fetch('/api/session',{credentials:'same-origin',headers:{'X-Owner-Bridge':'1'}});
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || '登录状态读取失败。');
  csrf = payload.csrf || null;
  if (payload.authenticated && loginPoll) { clearInterval(loginPoll); loginPoll=null; send({type:'session-changed',authenticated:true}); }
  document.querySelector('[data-login]').hidden = payload.authenticated;
  status.textContent = payload.authenticated ? '已连接 Owner Mode。请保持此窗口打开，回到网站编辑。' : '请使用自己的 GitHub 账号登录。';
  return payload;
}
const loginLink = document.querySelector('[data-login]');
loginLink.href = '/auth/login?client_origin='+encodeURIComponent(clientOrigin);
loginLink.target = '_blank';
loginLink.rel = 'noopener';
loginLink.addEventListener('click',event=>{
  event.preventDefault();
  window.open(loginLink.href,'zhang-owner-login','popup,width=600,height=720,noopener');
  const started=Date.now();
  clearInterval(loginPoll);
  loginPoll=setInterval(()=>{
    if (Date.now()-started>600000) { clearInterval(loginPoll);loginPoll=null;return; }
    bootstrap().catch(error=>{status.textContent=error.message});
  },2000);
});
if (authEvents) authEvents.addEventListener('message',event=>{if(event.data==='authenticated') bootstrap().then(()=>send({type:'session-changed',authenticated:true})).catch(error=>{status.textContent=error.message})});
window.addEventListener('message',async event=>{
  if (!client || event.source !== client || event.origin !== clientOrigin || event.data?.namespace !== 'zhang-owner') return;
  const {type,id,method,params} = event.data;
  if (type === 'hello') { send({type:'ready',version:1}); return; }
  if (type !== 'request' || typeof id !== 'string' || id.length > 100 || !allowedMethods.has(method)) return;
  if (active) { send({type:'response',id,ok:false,error:{code:'BRIDGE_BUSY',message:'请等待当前操作完成。',status:409}}); return; }
  active = true;
  try {
    if (method === 'session') {
      const result = await bootstrap();
      const {csrf:ignored,...safeResult} = result;
      send({type:'response',id,ok:true,result:safeResult});
    } else {
      if (!csrf) throw Object.assign(new Error('请先登录 GitHub。'),{code:'AUTH_REQUIRED',status:401});
      const response = await fetch('/api/rpc',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({method,params:params||{}})});
      const result = await response.json();
      send({type:'response',id,ok:response.ok,...(response.ok ? {result} : {error:result.error})});
      if (method === 'logout' || response.status === 401) { csrf=null; await bootstrap(); }
    }
  } catch(error) {
    send({type:'response',id,ok:false,error:{code:error.code||'BRIDGE_ERROR',message:error.message||'后端连接失败。',status:error.status||502}});
  } finally { active=false; }
});
bootstrap().then(()=>send({type:'ready',version:1})).catch(error=>{status.textContent=error.message;send({type:'error',error:{code:'BRIDGE_ERROR',message:error.message,status:502}})});
`;

export function bridgePage(nonce) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Z-hang · Owner Connection</title><style nonce="${nonce}">body{font:17px/1.7 system-ui,sans-serif;background:#f6f4ee;color:#173d42;margin:0;padding:3rem 1.5rem}main{max-width:36rem;margin:auto}a{display:inline-block;padding:.6rem 1rem;background:#173d42;color:white;border-radius:5px;text-decoration:none}small{display:block;margin-top:2rem;color:#617479}</style></head><body><main><p>OWNER CONNECTION</p><h1>连接网站编辑模式</h1><p data-status>正在读取登录状态…</p><a data-login href="/auth/login">使用 GitHub 登录</a><small>此窗口负责安全认证。GitHub 凭据只存于后端；编辑完成后可退出登录并关闭此窗口。</small></main><script nonce="${nonce}">${bridgeScript}</script></body></html>`;
}

export function authenticationCompletePage(nonce) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Owner 登录成功</title></head><body><h1>GitHub 身份验证完成</h1><p>请返回网站编辑连接窗口。此窗口可以关闭。</p><script nonce="${nonce}">if(typeof BroadcastChannel==='function'){const channel=new BroadcastChannel('zhang-owner-auth');channel.postMessage('authenticated');channel.close()}window.close()</script></body></html>`;
}

export { bridgeScript };
