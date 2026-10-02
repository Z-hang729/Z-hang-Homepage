import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const files={'index.html':'text/html; charset=utf-8','archive.html':'text/html; charset=utf-8','style.css':'text/css; charset=utf-8','app.js':'text/javascript; charset=utf-8'};
const assets=Object.fromEntries(Object.entries(files).map(([name,type])=>[name,{type,body:readFileSync('dist/'+name,'utf8')}]));
mkdirSync('dist/server',{recursive:true});
writeFileSync('dist/server/index.js',readFileSync('server.mjs','utf8')+'\nexport default createWorker('+JSON.stringify(assets)+');\n');
console.log('Worker built with home, archive and profile API.');
