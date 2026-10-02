(() => {
  const byId = id => document.getElementById(id);
  const colors = {ink:'#2a465a',wine:'#733c48',forest:'#36574b'};
  let current, busy=false, loaded=false;
  const dialog=byId('editor'), form=byId('profile-form');
  function render(data) {
    current=data;
    for(const key of ['name','affiliation','subtitle','bio']) if(byId(key)) byId(key).textContent=data.profile[key];
    const signature=document.querySelector('.signature');if(signature)signature.textContent=data.profile.name;
    const root=document.documentElement;
    root.style.setProperty('--accent',colors[data.profile.accent]);
    root.style.setProperty('--body-size',data.profile.fontSize+'px');
    root.style.setProperty('--content-width',data.profile.width+'px');
    if(byId('name'))document.title=data.profile.name+' · 个人简介';
    if(byId('edit'))byId('edit').hidden=!data.canEdit;
  }
  async function load(){try{const response=await fetch('/api/profile',{cache:'no-store'});if(!response.ok)throw Error();render(await response.json());loaded=true;}catch{byId('page-status').textContent='暂时无法读取已保存的简介。请刷新重试；为避免覆盖内容，编辑暂不可用。';}}
  function open(){if(!loaded||!current.canEdit)return;for(const key of Object.keys(current.profile))if(form.elements.namedItem(key))form.elements.namedItem(key).value=current.profile[key];byId('save-status').textContent='';dialog.showModal();}
  function dirty(){return Object.keys(current.profile).some(key=>form.elements.namedItem(key)&&form.elements.namedItem(key).value!==String(current.profile[key]));}
  function close(){if(busy)return;if(dirty()&&!confirm('有尚未保存的修改，确定放弃吗？'))return;dialog.close();}
  if(form){byId('edit').addEventListener('click',open);byId('close').addEventListener('click',close);byId('cancel').addEventListener('click',close);dialog.addEventListener('cancel',e=>{e.preventDefault();close()});window.addEventListener('beforeunload',e=>{if(dialog.open&&dirty()){e.preventDefault();e.returnValue='';}});
    form.addEventListener('submit',async e=>{e.preventDefault();if(busy)return;busy=true;for(const b of form.querySelectorAll('button'))b.disabled=true;byId('save-status').textContent='正在保存…';const profile=Object.fromEntries(new FormData(form));try{const response=await fetch('/api/profile',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile,revision:current.revision})});const result=await response.json();if(!response.ok)throw Error(result.error||'保存失败，请重试。');render(result);byId('page-status').textContent='简介与外观已保存到网站。';dialog.close();}catch(error){byId('save-status').textContent=error.message||'网络不可用，输入已保留，请重试。';}finally{busy=false;for(const b of form.querySelectorAll('button'))b.disabled=false;}});
  }
  load();
})();
