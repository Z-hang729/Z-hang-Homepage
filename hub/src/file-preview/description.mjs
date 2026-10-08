import {unified} from 'unified';
import parse from 'remark-parse';
import gfm from 'remark-gfm';
import math from 'remark-math';
import rehype from 'remark-rehype';
import sanitize,{defaultSchema} from 'rehype-sanitize';
import katex from 'rehype-katex';
import stringify from 'rehype-stringify';

/** Render public metadata at build time; raw HTML is never enabled. */
export async function renderFileDescription(markdown,base='/'){
 function links(){return tree=>{function walk(node){if(['link','image','definition'].includes(node.type)&&node.url?.startsWith('/')&&!node.url.startsWith('//'))node.url=base.replace(/\/$/,'')+node.url;node.children?.forEach(walk);}walk(tree);};}
 const schema={...defaultSchema,attributes:{...defaultSchema.attributes,code:[...(defaultSchema.attributes.code||[]),['className',/^language-./,'math-inline','math-display']]}};
 return String(await unified().use(parse).use(gfm).use(math).use(links).use(rehype).use(sanitize,schema).use(katex).use(stringify).process(String(markdown||'')));
}
