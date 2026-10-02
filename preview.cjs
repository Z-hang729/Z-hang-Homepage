const http=require('node:http'),fs=require('node:fs');
(async()=>{
const {createWorker}=await import('./server.mjs');const {createLocalRuntime}=await import('./local-runtime.mjs');
const env=createLocalRuntime();
const files={'index.html':'text/html; charset=utf-8','archive.html':'text/html; charset=utf-8','style.css':'text/css; charset=utf-8','app.js':'text/javascript; charset=utf-8','archive.css':'text/css; charset=utf-8','archive.js':'text/javascript; charset=utf-8'};
http.createServer(async(req,res)=>{try{if(!['127.0.0.1:4173','localhost:4173'].includes(req.headers.host)){res.writeHead(403);return res.end()}
const headers={...req.headers,'oai-authenticated-user-id':'local-preview-owner','oai-authenticated-user-email':'z-hang729@outlook.com'};
const request=new Request('http://127.0.0.1:4173'+req.url,{method:req.method,headers,...(['GET','HEAD'].includes(req.method)?{}:{body:req,duplex:'half'})});
const assets=Object.fromEntries(Object.entries(files).map(([f,type])=>[f,{type,body:fs.readFileSync('dist/'+f,'utf8')}]));
const reply=await createWorker(assets).fetch(request,env);res.writeHead(reply.status,Object.fromEntries(reply.headers));
if(!reply.body)return res.end();const {Readable}=await import('node:stream');Readable.fromWeb(reply.body).pipe(res);
}catch(e){console.error(e);res.writeHead(500);res.end('Preview error')}}).listen(4173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4173'));
})();
