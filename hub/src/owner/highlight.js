// Only the Owner editor imports this module. Languages load as they are used;
// the public reader continues to use its existing build-time highlighting.
export const CODE_LANGUAGES = [
  ['python','Python'], ['idl','IDL'], ['c','C'], ['cpp','C++'], ['java','Java'],
  ['javascript','JavaScript'], ['typescript','TypeScript'], ['matlab','MATLAB'],
  ['latex','LaTeX'], ['json','JSON'], ['bash','Bash'], ['yaml','YAML'], ['text','Plain text'],
];
const loaders = {
  python: () => import('shiki/langs/python.mjs'),
  idl: () => import('../../scripts/idl-language.mjs'),
  c: () => import('shiki/langs/c.mjs'),
  cpp: () => import('shiki/langs/cpp.mjs'),
  java: () => import('shiki/langs/java.mjs'),
  javascript: () => import('shiki/langs/javascript.mjs'),
  typescript: () => import('shiki/langs/typescript.mjs'),
  matlab: () => import('shiki/langs/matlab.mjs'),
  latex: () => import('shiki/langs/latex.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  bash: () => import('shiki/langs/bash.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
};
const aliases = { py:'python', python3:'python', 'c++':'cpp', cc:'cpp', cxx:'cpp', js:'javascript', ts:'typescript', tex:'latex', sh:'bash', shell:'bash', yml:'yaml' };
let highlighterPromise;
const loading = new Map();
export function normalizeCodeLanguage(language) { const value=String(language||'').toLowerCase(); return Object.hasOwn(aliases,value) ? aliases[value] : value; }
async function highlighter() {
  highlighterPromise ||= Promise.all([
    import('shiki/core'), import('shiki/engine/javascript'),
    import('shiki/themes/github-light.mjs'), import('shiki/themes/github-dark.mjs'),
  ]).then(([{createHighlighterCore},{createJavaScriptRegexEngine},light,dark]) => createHighlighterCore({
    langs:[], themes:[light.default,dark.default], engine:createJavaScriptRegexEngine(),
  })).catch(error=>{highlighterPromise=null;throw error;});
  return highlighterPromise;
}
export async function codeTokens(code, language) {
  const lang=normalizeCodeLanguage(language);
  // Large scientific listings remain legible without blocking live editing.
  if(!Object.hasOwn(loaders,lang) || code.length>100*1024 || code.split('\n').length>1500)return null;
  const instance=await highlighter();
  if(!instance.getLoadedLanguages().includes(lang)) {
    if(!loading.has(lang))loading.set(lang,loaders[lang]().then(grammar=>instance.loadLanguage(grammar.default)).catch(error=>{loading.delete(lang);throw error;}));
    await loading.get(lang);
  }
  return {
    language:lang,
    lines:instance.codeToTokensWithThemes(code,{lang,themes:{light:'github-light',dark:'github-dark'}}),
    light:instance.getTheme('github-light'),dark:instance.getTheme('github-dark'),
  };
}
export async function highlightCodeBlocks(target) {
  const blocks=[...target.querySelectorAll('pre > code')];
  await Promise.all(blocks.map(async code=>{
    const language=[...code.classList].find(name=>name.startsWith('language-'))?.slice(9);
    if(language==='owner-mermaid')return;
    let result;
    try { result=await codeTokens(code.textContent,language); } catch { return; }
    if(!result)return;
    const doc=code.ownerDocument,fragment=doc.createDocumentFragment();
    result.lines.forEach((tokens,index)=>{
      const line=doc.createElement('span');line.className='line';
      for(const token of tokens) {
        const span=doc.createElement('span');span.textContent=token.content;
        const light=token.variants.light,dark=token.variants.dark;
        if(light.color)span.style.color=light.color;
        if(dark.color)span.style.setProperty('--shiki-dark',dark.color);
        if(light.fontStyle&1)span.style.fontStyle='italic';
        if(light.fontStyle&2)span.style.fontWeight='bold';
        if(light.fontStyle&4)span.style.textDecoration='underline';
        line.append(span);
      }
      fragment.append(line);
      if(index<result.lines.length-1)fragment.append(doc.createTextNode('\n'));
    });
    code.replaceChildren(fragment);
    const pre=code.parentElement;pre.classList.add('astro-code','owner-code-highlighted');
    pre.dataset.ownerCodeLanguage=result.language;
    pre.style.color=result.light.fg;pre.style.backgroundColor=result.light.bg;
    pre.style.setProperty('--shiki-dark',result.dark.fg);
    pre.style.setProperty('--shiki-dark-bg',result.dark.bg);
  }));
}
