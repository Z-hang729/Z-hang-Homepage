import {ACADEMIC_KINDS,academicPath,validateAcademicRecord,validateAcademicCV} from './academic-schema.mjs';
import {validateChangeSet} from './owner/policy.mjs';

const files=snapshot=>snapshot.files instanceof Map?snapshot.files:new Map((snapshot.files||[]).map(file=>[file.path,file]));
export function academicSnapshotRecords(snapshot,kind){
  if(!ACADEMIC_KINDS[kind])throw new Error('Unknown academic collection.');
  return [...files(snapshot).values()].filter(file=>new RegExp('^hub/src/data/'+kind+'/[^/]+\\.json$').test(file.path)).map(file=>validateAcademicRecord(kind,JSON.parse(file.content),{path:file.path}));
}
export function academicRecordChanges(snapshot,{kind,record,originalId}={}){
  validateAcademicRecord(kind,record);
  if(originalId&&record.id!==originalId)throw new Error('Stable IDs cannot change. Create a separate record to use a new ID.');
  const path=academicPath(kind,record.id),existing=files(snapshot).get(path);
  if(!originalId&&existing)throw new Error('That stable ID already exists. Edit the existing record or choose a unique ID.');
  const change={path,action:'upsert',encoding:'utf8',content:JSON.stringify(record,null,2)+'\n',expectedSha:existing?.sha??null};
  return validateChangeSet([change],{snapshotFiles:snapshot.files,allowUnpublishedAcademicTargets:true}).changes;
}
export function deleteAcademicRecordChanges(snapshot,{kind,id,confirmation}={}){
  if(confirmation!==id)throw new Error('Type the complete stable ID to confirm removal.');
  const path=academicPath(kind,id),existing=files(snapshot).get(path);
  if(!existing)throw new Error('This academic record no longer exists.');
  return validateChangeSet([{path,action:'delete',expectedSha:existing.sha??null}],{snapshotFiles:snapshot.files,allowUnpublishedAcademicTargets:true}).changes;
}
export function cvChanges(snapshot,record){
  validateAcademicCV(record);
  const path='hub/src/data/cv.json',existing=files(snapshot).get(path);
  return validateChangeSet([{path,action:'upsert',encoding:'utf8',content:JSON.stringify(record,null,2)+'\n',expectedSha:existing?.sha??null}],{snapshotFiles:snapshot.files,allowUnpublishedAcademicTargets:true}).changes;
}
