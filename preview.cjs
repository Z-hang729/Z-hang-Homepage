const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
(async()=>{
const {DatabaseSync}=await import('node:sqlite');const {createWorker}=await import('./server.mjs');
fs.mkdirSync('.local',{recursive:true});const db=new DatabaseSync('.local/preview.sqlite');
if(!db.prepare("SELECT name FROM sqlite_master WHERE name='profile'").get())for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')))db.exec(fs.readFileSync('drizzle/'+f,'utf8'));
const env={DB:{prepare(q){let args=[];return{bind(...v){args=v;return this},async first(){return db.prepare(q).get(...args)||null},async run(){return{meta:{changes:Number(db.prepare(q).run(...args).changes)}}}}}}};
const files={'index.html':'text/html; charset=utf-8','archive.html':'text/html; charset=utf-8','style.css':'text/css; charset=utf-8','app.js':'text/javascript; charset=utf-8'};
http.createServer(async(req,res)=>{try{if(!['127.0.0.1:4173','localhost:4173'].includes(req.headers.host)){res.writeHead(403);return res.end()}
const chunks=[];for await(const chunk of req)chunks.push(chunk);
const headers={...req.headers,'oai-authenticated-user-id':'local-preview-owner','oai-authenticated-user-email':'z-hang729@outlook.com'};
const request=new Request('http://127.0.0.1:4173'+req.url,{method:req.method,headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});
const assets=Object.fromEntries(Object.entries(files).map(([f,type])=>[f,{type,body:fs.readFileSync(path.join('dist',f),'utf8')}]));
const reply=await createWorker(assets).fetch(request,env);res.writeHead(reply.status,Object.fromEntries(reply.headers));res.end(Buffer.from(await reply.arrayBuffer()));
}catch(e){console.error(e);res.writeHead(500);res.end('Preview error')}}).listen(4173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4173'));
})();
