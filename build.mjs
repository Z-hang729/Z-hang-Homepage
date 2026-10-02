import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const files={'index.html':'text/html; charset=utf-8','archive.html':'text/html; charset=utf-8','style.css':'text/css; charset=utf-8','app.js':'text/javascript; charset=utf-8','archive.css':'text/css; charset=utf-8','archive.js':'text/javascript; charset=utf-8'};
const assets=Object.fromEntries(Object.entries(files).map(([name,type])=>[name,{type,body:readFileSync('dist/'+name,'utf8')}]));
mkdirSync('dist/server',{recursive:true});
const archive=readFileSync('archive-server.mjs','utf8');
const server=readFileSync('server.mjs','utf8').replace(/^import .*archive-server.mjs.*;\r?\n/,'');
writeFileSync('dist/server/index.js',archive+'\n'+server+'\nexport default createWorker('+JSON.stringify(assets)+');\n');
console.log('Worker built with profile, directories and file storage.');
