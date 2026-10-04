const ownerRoute=location.pathname.endsWith('/owner/')||location.pathname.endsWith('/owner');
if(ownerRoute||['local-development','github'].includes(sessionStorage.getItem('zh-owner-active')||'')){
  import('../owner/client.js').then(module=>module.startOwner()).catch(error=>{const status=document.querySelector('[data-owner-login-status]');if(status)status.textContent=error.message;});
}
