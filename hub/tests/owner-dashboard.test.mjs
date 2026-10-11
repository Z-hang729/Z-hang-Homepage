import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardCounts,dashboardHealthSummary,fileRecordsFromSnapshot,recordsFromSnapshot,researchHealth} from '../src/lib/owner/dashboard.mjs';

const file=(path,content)=>({path,content});
const model={
  entries:{
    research:[{slug:'solar-alignment',metadata:{title:'TiO solar alignment'}}],
    projects:[
      {slug:'active',metadata:{title:'Active project',status:'In Progress'}},
      {slug:'done',metadata:{title:'Finished project',status:'Completed'}},
    ],
    notes:[{slug:'course',metadata:{title:'Space physics'}}],
  },
  logs:[{metadata:{title:'First run',project:'solar-alignment',date:'2026-10-01'}}],
  documents:[{kind:'notes',metadata:{title:'Chapter 1'}},{kind:'research',metadata:{title:'Methods'}}],
  assets:[{path:'hub/public/uploads/images/figure.png',size:1024}],
};
const snapshot={files:[
  file('hub/src/data/files/observation.json',JSON.stringify({id:'observation',name:'observation.fits',relatedResearch:['solar-alignment']})),
  file('hub/src/data/figures/alignment.json',JSON.stringify({id:'figure:alignment',title:'Alignment',relatedResearch:['research:solar-alignment'],publicationStatus:'draft'})),
  file('hub/src/data/references/source.json',JSON.stringify({id:'reference:source',title:'Source',relatedResearch:['research:solar-alignment'],publicationStatus:'published'})),
  file('hub/src/data/packages/run.json',JSON.stringify({id:'package:run',title:'Run',relatedResearch:['research:solar-alignment'],publicationStatus:'draft'})),
]};

test('dashboard counts include owner records without changing public filtering',()=>{
  const counts=dashboardCounts(model,snapshot);
  assert.deepEqual(counts,{research:1,activeProjects:1,projects:2,logs:1,notes:1,chapters:1,files:1,uploadedAssets:1,figures:1,references:1,packages:1});
  assert.equal(recordsFromSnapshot(snapshot,'figures').length,1);
  assert.equal(fileRecordsFromSnapshot(snapshot).length,1);
});

test('research health reports reminders instead of mutating the model',()=>{
  const before=structuredClone(model),health=researchHealth(model,snapshot)[0];
  assert.equal(health.title,'TiO solar alignment');
  assert.equal(health.files,1);
  assert.equal(health.logs,1);
  assert.equal(health.figures,1);
  assert.equal(health.references,1);
  assert.equal(health.packages,1);
  assert.deepEqual(health.missing.map(item=>item.key),['readme']);
  assert.equal(health.completeness,5/6);
  assert.deepEqual(model,before);
  assert.equal(dashboardHealthSummary(model,snapshot).missing,1);
});

test('research health ignores unrelated records and recognises README metadata',()=>{
  const withReadme=structuredClone(snapshot);
  withReadme.files[0].content=JSON.stringify({id:'observation',name:'README.md',relatedResearch:['research:solar-alignment']});
  withReadme.files.push(file('hub/src/data/references/other.json',JSON.stringify({id:'reference:other',title:'Other',relatedResearch:['research:another'],publicationStatus:'published'})));
  const [health]=researchHealth(model,withReadme);
  assert.equal(health.missing.length,0);
  assert.equal(health.references,1);
});

