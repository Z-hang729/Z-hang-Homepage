import {existsSync,readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {ACADEMIC_KINDS,isPublicAcademic,validateAcademicRecord,validateAcademicCV} from './academic-schema.mjs';

// These are source records, not a second database of graph links or attachments.
export function readAcademicRecords(kind,{publicOnly=true,root=process.cwd()}={}){
  if(!ACADEMIC_KINDS[kind])throw new Error('Unknown academic collection.');
  const directory=path.join(root,'src','data',kind);
  if(!existsSync(directory))return [];
  const records=readdirSync(directory).filter(name=>name.endsWith('.json')).sort().map(name=>{
    const record=JSON.parse(readFileSync(path.join(directory,name),'utf8'));
    return validateAcademicRecord(kind,record,{path:`hub/src/data/${kind}/${name}`});
  });
  return publicOnly?records.filter(isPublicAcademic):records;
}
export function readCVRecord({root=process.cwd()}={}){
  const filename=path.join(root,'src','data','cv.json');
  return existsSync(filename)?validateAcademicCV(JSON.parse(readFileSync(filename,'utf8'))):{};
}
