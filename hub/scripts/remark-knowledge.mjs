import {readKnowledgeGraph} from './knowledge-source.mjs';
import {remarkKnowledgeLinks,knowledgeNode} from '../src/lib/knowledge.mjs';

export default function remarkKnowledge(){
  return (tree,file)=>{
    const graph=readKnowledgeGraph(),source=knowledgeNode(String(file.path||'').replaceAll('\\','/').replace(/^.*?\/src\//,'src/'),file.data?.astro?.frontmatter||{});
    return remarkKnowledgeLinks({nodes:graph.nodes,source})(tree,file);
  };
}
