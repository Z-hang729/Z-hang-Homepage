import {readAcademicRecords} from '../src/lib/academic-records.mjs';
import {remarkCitations} from '../src/lib/bibliography.mjs';

// Runs before remark-base, so citation targets share the site's GitHub Pages base.
// The source JSON is the authority; no generated citation database is written.
export default function remarkBibliography(){
  return (tree,file)=>remarkCitations({references:readAcademicRecords('references',{publicOnly:true})})(tree,file);
}
