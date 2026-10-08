import PDFDocument from 'pdfkit';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import YAML from 'yaml';
import {deriveCV} from '../src/lib/academic-cv.mjs';
import {readKnowledgeGraph} from './knowledge-source.mjs';
import {readCVRecord} from '../src/lib/academic-records.mjs';

const PRODUCER='Z-hang Academic CV generator';
const DEFAULT_FONT=fileURLToPath(new URL('./fonts/NotoSansSC-Regular.ttf',import.meta.url));
const displayAuthor=author=>typeof author==='string'?author:author.literal||[author.given,author.family].filter(Boolean).join(' ');
const period=entry=>[entry.start,entry.end].filter(Boolean).join(' - ')||String(entry.date||entry.year||'');
/** Embedded CJK font, real selectable text, automatic pagination, and link annotations. */
export async function generateCVPDF({root=process.cwd(),outputPath,profile,cv,nodes,site='https://z-hang729.github.io',base='/Z-hang-Homepage',fontPath=DEFAULT_FONT,size='A4'}={}) {
  if(!['A4','LETTER'].includes(size))throw new Error('CV paper size must be A4 or LETTER.');
  profile??=YAML.parse(readFileSync(path.join(root,'src/data/profile.yaml'),'utf8'));
  cv??=readCVRecord({root});
  nodes??=readKnowledgeGraph(root).nodes;
  const data=deriveCV(profile,cv,nodes);
  outputPath??=path.join(root,'public/documents/academic-cv.pdf');
  if(existsSync(outputPath)&&!readFileSync(outputPath).includes(Buffer.from(PRODUCER)))throw new Error(`Existing PDF is protected: ${outputPath}. Choose another output path.`);
  if(!existsSync(fontPath))throw new Error('The bundled Noto Sans SC font is missing. Restore scripts/fonts before building.');
  const document=new PDFDocument({size,bufferPages:true,margins:{top:48,right:48,bottom:56,left:48},info:{Title:`${data.profile.displayName} - Academic CV`,Author:data.profile.displayName,Subject:'Academic curriculum vitae',Creator:PRODUCER,Producer:PRODUCER,CreationDate:new Date('2000-01-01T00:00:00Z'),ModDate:new Date('2000-01-01T00:00:00Z')}});
  document.registerFont('CV',fontPath).font('CV');
  const chunks=[],finished=new Promise((resolve,reject)=>{document.on('data',chunk=>chunks.push(chunk));document.on('end',resolve);document.on('error',reject);});
  const width=()=>document.page.width-96;
  const absolute=value=>/^(https?:|mailto:)/.test(value)?value:new URL(`${base.replace(/\/$/,'')}/${value.replace(/^\//,'')}`,site).href;
  function ensureRoom(height=48){if(document.y+height>document.page.height-document.page.margins.bottom)document.addPage();}
  function text(value,{size=10,color='#23363d',link,gap=5}={}){if(!value)return;document.font('CV').fontSize(size).fillColor(color).text(String(value),48,document.y,{width:width(),lineGap:2,paragraphGap:3,...link?{link:absolute(link)}:{}});document.y+=gap;}
  function heading(title){ensureRoom(62);document.y+=9;text(title,{size:13,color:'#286b70',gap:5});document.moveTo(48,document.y).lineTo(document.page.width-48,document.y).lineWidth(.5).strokeColor('#dbe0db').stroke();document.y+=8;}
  function entry(value){const item=typeof value==='string'?{title:value}:value;ensureRoom(45);text(item.title||item.institution||'',{size:10.5,link:item.url,gap:2});if(item.institution&&item.title)text(item.institution,{color:'#687779',gap:2});if(period(item))text(period(item),{size:9,color:'#687779',gap:3});if(item.authors?.length)text(item.authors.map(displayAuthor).join(', '),{size:9,gap:3});if(item.description)text(item.description);if(item.doi)text(`DOI: ${item.doi}`,{size:9,color:'#286b70',link:`https://doi.org/${item.doi}`});document.y+=5;}
  text(data.profile.displayName,{size:25,color:'#1c343c',gap:5});
  text([data.profile.degree,data.profile.secondDegree].filter(Boolean).join(' × '),{size:11,gap:3});
  text([data.profile.role,data.profile.university].filter(Boolean).join(', '),{size:10,color:'#687779',gap:7});
  for(const section of data.visibleSections){heading(section.title);if(section.id==='profile')text(data.profile.bio);else if(['skills','researchInterests'].includes(section.id))text(data[section.id].join(' · '));else if(section.id==='links')for(const item of data.links)text(item.title||item.url,{color:'#286b70',link:item.url});else for(const item of data[section.id])entry(item);}
  if(data.profile.email){heading('Contact');text(data.profile.email,{color:'#286b70',link:`mailto:${data.profile.email}`});}
  const range=document.bufferedPageRange();
  for(let number=range.start;number<range.start+range.count;number++){document.switchToPage(number);const bottom=document.page.margins.bottom;document.page.margins.bottom=0;document.font('CV').fontSize(8).fillColor('#687779').text(`${data.profile.displayName}  |  Academic CV  |  ${number+1} / ${range.count}`,48,document.page.height-33,{width:width(),align:'right',lineBreak:false});document.page.margins.bottom=bottom;}
  document.end();await finished;const buffer=Buffer.concat(chunks);mkdirSync(path.dirname(outputPath),{recursive:true});writeFileSync(outputPath,buffer);return {outputPath,pageCount:range.count,bytes:buffer.length,data};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){const result=await generateCVPDF();console.log(`Academic CV generated: ${result.pageCount} A4 page(s), ${result.bytes} bytes.`);}
