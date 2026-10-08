import {STORAGE_LIMITS} from '../lib/files.mjs';
import {readPreviewBytes} from './parsers.mjs';
import {node,button,toolbar,copyButton,downloadLink} from './dom.js';

const aliases={py:'python',pro:'idl',c:'c',h:'c',cpp:'cpp',hpp:'cpp',cc:'cpp',cxx:'cpp',java:'java',js:'javascript',jsx:'jsx',ts:'typescript',tsx:'tsx',m:'matlab',f:'fortran-fixed-form',for:'fortran-fixed-form',f77:'fortran-fixed-form',f90:'fortran-free-form',f95:'fortran-free-form',r:'r',jl:'julia',sh:'bash',bash:'bash',ps1:'powershell',tex:'latex',json:'json',yaml:'yaml',yml:'yaml',html:'html',css:'css',sql:'sql',go:'go',rs:'rust',toml:'toml',xml:'xml'};
const loaders={
 python:()=>import('shiki/langs/python.mjs'),idl:()=>import('../../scripts/idl-language.mjs'),c:()=>import('shiki/langs/c.mjs'),cpp:()=>import('shiki/langs/cpp.mjs'),java:()=>import('shiki/langs/java.mjs'),javascript:()=>import('shiki/langs/javascript.mjs'),jsx:()=>import('shiki/langs/jsx.mjs'),typescript:()=>import('shiki/langs/typescript.mjs'),tsx:()=>import('shiki/langs/tsx.mjs'),matlab:()=>import('shiki/langs/matlab.mjs'),'fortran-fixed-form':()=>import('shiki/langs/fortran-fixed-form.mjs'),'fortran-free-form':()=>import('shiki/langs/fortran-free-form.mjs'),r:()=>import('shiki/langs/r.mjs'),julia:()=>import('shiki/langs/julia.mjs'),bash:()=>import('shiki/langs/bash.mjs'),powershell:()=>import('shiki/langs/powershell.mjs'),latex:()=>import('shiki/langs/latex.mjs'),json:()=>import('shiki/langs/json.mjs'),yaml:()=>import('shiki/langs/yaml.mjs'),html:()=>import('shiki/langs/html.mjs'),css:()=>import('shiki/langs/css.mjs'),sql:()=>import('shiki/langs/sql.mjs'),go:()=>import('shiki/langs/go.mjs'),rust:()=>import('shiki/langs/rust.mjs'),toml:()=>import('shiki/langs/toml.mjs'),xml:()=>import('shiki/langs/xml.mjs'),
};
let highlighterPromise;
async function highlight(text,language){if(!loaders[language]||text.length>100*1024||text.split('\n').length>1500)return null;highlighterPromise||=Promise.all([import('shiki/core'),import('shiki/engine/javascript'),import('shiki/themes/github-light.mjs'),import('shiki/themes/github-dark.mjs')]).then(([{createHighlighterCore},{createJavaScriptRegexEngine},light,dark])=>createHighlighterCore({langs:[],themes:[light.default,dark.default],engine:createJavaScriptRegexEngine()}));const instance=await highlighterPromise;if(!instance.getLoadedLanguages().includes(language)){const grammar=await loaders[language]();await instance.loadLanguage(grammar.default);}return instance.codeToTokensWithThemes(text,{lang:language,themes:{light:'github-light',dark:'github-dark'}});}

export async function renderCode(text,host,extension,{tools=true,file}={}) {
 const language=aliases[String(extension).toLowerCase()]||'text',allLines=text.split('\n'),limited=allLines.length>5000,display=limited?allLines.slice(0,5000).join('\n'):text;
 if(tools){const controls=toolbar();controls.append(node('span',language.replaceAll('-',' ')),copyButton(()=>text));if(file)controls.append(downloadLink(file));host.append(controls);}
 const pre=node('pre',undefined,{class:'file-code-viewer','aria-label':`${language} source code`}),code=node('code');pre.append(code);host.append(pre);
 let tokens;try{tokens=await highlight(display,language);}catch{/* Plain source remains available if a grammar cannot load. */}
 const lines=tokens||display.split('\n').map(content=>[{content}]),fragment=document.createDocumentFragment();
 lines.forEach((parts,index)=>{const line=node('span',undefined,{class:'file-code-line','data-line':index+1});for(const part of parts){const span=node('span',part.content),light=part.variants?.light,dark=part.variants?.dark;if(light?.color)span.style.color=light.color;if(dark?.color)span.style.setProperty('--file-code-dark',dark.color);if(light?.fontStyle&1)span.style.fontStyle='italic';if(light?.fontStyle&2)span.style.fontWeight='bold';line.append(span);}if(!parts.some(part=>part.content))line.append(document.createTextNode(' '));fragment.append(line);});code.append(fragment);
 if(limited)host.append(node('p','Preview truncated at 5,000 lines. Copy includes the loaded source; download the original for the complete file.',{class:'file-viewer-notice'}));
 return pre;
}

export async function renderTextViewer({file,src,host,status}) {
 let budget=Math.min(256*1024,STORAGE_LIMITS.previewTextBytes),text='',result;
 const controls=toolbar(),label=node('span','Plain text'),content=node('div'),more=button('Load more',async()=>{more.disabled=true;try{budget=Math.min(budget+256*1024,STORAGE_LIMITS.previewTextBytes);await update();}catch(error){status.textContent=error.message;}finally{more.disabled=false;}});
 controls.append(label,copyButton(()=>text),downloadLink(file));host.append(controls,content,more);
 async function update(){result=await readPreviewBytes(src,{limit:budget});text=new TextDecoder('utf-8',{fatal:true}).decode(result.bytes,{stream:result.truncated});if(text.includes('\0'))throw new Error('Binary content has no text preview. File information and the original download remain available.');content.replaceChildren();const ext=String(file.extension||'').toLowerCase();label.textContent=aliases[ext]||'Plain text';await renderCode(text,content,ext,{tools:false});more.hidden=!result.truncated||budget>=STORAGE_LIMITS.previewTextBytes;status.textContent=result.truncated?`Preview truncated: showing the first ${(result.bytes.length/1024).toFixed(0)} KB${more.hidden?' (preview limit reached)':''}. Download the original for the complete file.`:'';}
 await update();
}
