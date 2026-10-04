import {CODE_LANGUAGES} from './highlight.js';

export async function renderPreview(markdown,target,base) {
  const [{unified},{default:parse},{default:gfm},{default:math},{default:rehype},{default:sanitize,defaultSchema},{default:katex},{default:stringify}]=await Promise.all([import('unified'),import('remark-parse'),import('remark-gfm'),import('remark-math'),import('remark-rehype'),import('rehype-sanitize'),import('rehype-katex'),import('rehype-stringify')]);
  let diagramCount=0;const diagrams=[];
  function transform(){return tree=>{function walk(node){if(['link','image','definition'].includes(node.type)&&node.url?.startsWith('/')&&!node.url.startsWith('//'))node.url=base.replace(/\/$/,'')+node.url;if(node.type==='code'&&node.lang==='mermaid'){diagrams.push(node.value);node.value='Diagram preview '+(++diagramCount);node.lang='owner-mermaid';}node.children?.forEach(walk);}walk(tree);};}
  const schema={...defaultSchema,attributes:{...defaultSchema.attributes,code:[...(defaultSchema.attributes.code||[]),['className',/^language-./,'math-inline','math-display']]}};
  const html=await unified().use(parse).use(gfm).use(math).use(transform).use(rehype).use(sanitize,schema).use(katex).use(stringify).process(markdown);
  target.innerHTML=String(html);
  if(target.querySelector('pre > code:not(.language-owner-mermaid)')){const {highlightCodeBlocks}=await import('./highlight.js');await highlightCodeBlocks(target);}
  if(diagrams.length){const {default:mermaid}=await import('mermaid');mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:document.documentElement.dataset.theme==='dark'?'dark':'neutral'});let index=0;for(const code of target.querySelectorAll('code.language-owner-mermaid')){const source=diagrams[index++];const result=await mermaid.render('owner-mermaid-'+crypto.randomUUID(),source);const wrapper=document.createElement('div');wrapper.className='owner-diagram';wrapper.innerHTML=result.svg;code.parentElement.replaceWith(wrapper);}}
  for(const anchor of target.querySelectorAll('a')){anchor.target='_blank';anchor.rel='noopener noreferrer';}
}
export function markdownEditor(value,base) {
  const host=document.createElement('div');host.className='owner-markdown';
  const toolbar=document.createElement('div');toolbar.className='owner-markdown-toolbar';
  const textarea=document.createElement('textarea');textarea.className='owner-markdown-source';textarea.value=value;textarea.rows=16;textarea.setAttribute('aria-label','Markdown content');
  const preview=document.createElement('div');preview.className='owner-markdown-preview prose';preview.setAttribute('aria-label','Markdown preview');
  const status=document.createElement('p');status.className='owner-muted';status.setAttribute('role','status');
  const languageLabel=document.createElement('label');languageLabel.className='owner-field owner-code-language';const languageTitle=document.createElement('span');languageTitle.textContent='Code language';const language=document.createElement('select');language.setAttribute('aria-label','Code language');language.dataset.ownerCodeLanguage='';
  for(const [value,label] of CODE_LANGUAGES){const option=document.createElement('option');option.value=value;option.textContent=label;language.append(option);}language.value='python';languageLabel.append(languageTitle,language);
  const snippets=[['Heading','\n## Heading\n'],['Bold','**text**'],['Italic','*text*'],['Link','[title](https://example.org)'],['Image','![description](/uploads/figure.png)'],['Code',null],['Equation','\n$$\n\\nabla \\cdot \\mathbf B = 0\n$$\n'],['Quote','\n> Quote\n'],['Table','\n| Quantity | Value |\n| --- | --- |\n| Units | SI |\n'],['Callout','\n> **Note**\n> Explain the assumption.\n'],['Mermaid','\n```mermaid\nflowchart LR\n  A[Question] --> B[Method]\n```\n']];
  for(const [label,snippet] of snippets){if(label==='Code')toolbar.append(languageLabel);const action=document.createElement('button');action.type='button';action.textContent=label;action.addEventListener('click',()=>{let insertion=snippet;if(label==='Code'){const selected=textarea.value.slice(textarea.selectionStart,textarea.selectionEnd),runs=selected.match(/`+/g)||[],fence='`'.repeat(runs.reduce((size,run)=>Math.max(size,run.length+1),3));insertion=`\n${fence}${language.value}\n${selected||'Write code here'}\n${fence}\n`;}textarea.setRangeText(insertion,textarea.selectionStart,textarea.selectionEnd,'end');textarea.focus();textarea.dispatchEvent(new Event('input',{bubbles:true}));});toolbar.append(action);}
  let timer,serial=0;
  async function update(){const version=++serial;try{const temporary=document.createElement('div');await renderPreview(textarea.value,temporary,base);if(version!==serial)return;preview.replaceChildren(...temporary.childNodes);status.textContent='';}catch(error){if(version===serial)status.textContent='Preview: '+error.message;}}
  textarea.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(update,350);});
  host.append(toolbar,textarea,preview,status);update();return {node:host,textarea,value:()=>textarea.value};
}
