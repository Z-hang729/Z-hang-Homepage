import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=async path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('BaseLayout keeps the Person identity schema and accepts page-specific structured data',async()=>{
  const layout=await source('src/layouts/BaseLayout.astro');
  assert.match(layout,/['"]@type['"]:\s*['"]Person['"]/);
  assert.match(layout,/structuredData\?:\s*Record/);
  assert.match(layout,/application\/ld\+json/);
});

test('research and project Article pages expose source metadata as schema.org records',async()=>{
  const article=await source('src/components/Article.astro');
  assert.match(article,/schemaType\s*=\s*entry\.collection\s*===\s*'research'\s*\?\s*'ResearchProject'/);
  assert.match(article,/entry\.collection\s*===\s*'projects'\s*\?\s*'CreativeWork'/);
  assert.match(article,/structuredData=\{structuredData\}/);
});

test('references and packages emit scholarly metadata without inventing records',async()=>{
  const reference=await source('src/pages/references/[slug].astro');
  const packagePage=await source('src/components/ResearchPackageDetail.astro');
  assert.match(reference,/ScholarlyArticle/);
  assert.match(reference,/record\.doi/);
  assert.match(packagePage,/['"]@type['"]:\s*['"]Dataset['"]/);
  assert.match(packagePage,/entry\.version/);
  assert.match(packagePage,/structuredData=\{packageSchema\}/);
});

