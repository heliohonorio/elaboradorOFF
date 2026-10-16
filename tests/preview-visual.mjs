import {chromium,webkit,devices} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';

const results=[], output='qa-output';
await mkdir(output,{recursive:true});
const paragraph='Solicito o registro de manifestação para conferir a continuidade das páginas e a preservação do modelo de parte da Polícia Militar.';
for (const item of [
 {engine:'chromium',label:'desktop',viewport:{width:1366,height:900}},
 {engine:'chromium',label:'android',viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:3},
 {engine:'webkit',label:'iphone',...devices['iPhone 13']}
]){
 const browser=await (item.engine==='webkit'?webkit:chromium).launch({headless:true});
 const context=await browser.newContext(item);
 const page=await context.newPage();
 try{
  await page.goto('file://'+resolve('index.html'),{waitUntil:'domcontentloaded'});
  await page.locator('#start-create').click();
  await page.locator('.type-option[data-document-type="parte"]').click();
  await page.evaluate(()=>{document.querySelector('#emailUnidade').value='cpam1'});
  await page.evaluate(()=>{document.querySelector('#emailUnidade').dispatchEvent(new Event('input',{bubbles:true}))});
  if((await page.locator('#preview-toggle').getAttribute('aria-expanded'))==='false')
    await page.locator('#preview-toggle').click();
  await page.waitForTimeout(350);
  const data=await page.evaluate(()=>{
   const frame=document.querySelector('#preview-frame'),p=document.querySelector('#paper');
   const c=p.querySelector('.crest-caption'),meta=[...p.querySelectorAll('.meta-line')],h=p.querySelector('h3');
   const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
   const intersects=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
   return {count:document.querySelectorAll('#preview-frame>article.paper').length,scaled:frame.classList.contains('preview-scaled'),
    scale:parseFloat(frame.style.getPropertyValue('--paper-preview-scale')),width:frame.clientWidth,
    paper:rect(p),caption:rect(c),heading:rect(h),lines:meta.map(x=>({text:x.textContent,rect:rect(x)})),
    overlaps:meta.filter(x=>intersects(rect(c),rect(x))).map(x=>x.textContent),
    overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    actualZoom:getComputedStyle(p).zoom,cssTransform:getComputedStyle(p).transform};
  });
  assert.equal(data.scaled,true,'escala visual não aplicada');
  assert.equal(data.actualZoom,'1','zoom fracionário ainda ativo');
  assert.ok(data.paper.width<=data.width+1,'folha sai do espaço disponível');
  assert.ok(data.paper.width>0&&data.paper.height>0,'prévia sem dimensões');
  assert.equal(data.overlaps.length,0,'e-mail/site sobreposto aos dados do cabeçalho: '+data.overlaps.join(','));
  assert.ok(data.overflow<=1,'rolagem horizontal inesperada: '+data.overflow);
  await page.locator('#preview-frame').screenshot({path:output+'/preview-'+item.label+'-vazio.png'});
  await page.evaluate(text=>{const f=document.querySelector('#relato');f.value=text;f.dispatchEvent(new Event('input',{bubbles:true}));},
   Array.from({length:15},(_,i)=>(i+1)+'. '+(paragraph+' ').repeat(5)).join('\n'));
  await page.waitForTimeout(250);
  const long=await page.evaluate(()=>{
    const frame=document.querySelector('#preview-frame'),p=[...frame.querySelectorAll('article.paper')];
    const scale=parseFloat(frame.style.getPropertyValue('--paper-preview-scale'));
    const height=p[0].getBoundingClientRect().height;
    const blank=p.slice(1).map((x,i)=>x.getBoundingClientRect().top-p[i].getBoundingClientRect().bottom);
    return {scale,pages:p.length,blank,maxBlank:Math.max(...blank,0)};
  });
  assert.ok(long.pages>=2,'relato não criou páginas suficientes');
  assert.ok(long.maxBlank<=24,'vão entre folhas excessivo: '+JSON.stringify(long));
  await page.locator('#preview-frame').screenshot({path:output+'/preview-'+item.label+'-longo.png'});
  results.push({label:item.label,ok:true,data,long});
  console.log('PASSOU PREVIEW',item.label,JSON.stringify({scale:data.scale,overlaps:data.overlaps,long}));
 }catch(e){
  results.push({label:item.label,ok:false,error:String(e)});
  console.error('FALHOU PREVIEW',item.label,String(e));
 }finally{await context.close();await browser.close()}
}
await writeFile(output+'/preview-visual.json',JSON.stringify(results,null,2));
console.log('RESUMO PREVIEW:',results.filter(r=>r.ok).length+'/'+results.length);
if(results.some(r=>!r.ok))process.exitCode=1;
