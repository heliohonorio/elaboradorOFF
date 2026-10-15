
import { chromium, webkit, devices } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const out='qa-output', issues=[], results=[];
await mkdir(out,{recursive:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const sentence='Solicito a análise da presente manifestação administrativa, considerando a distribuição correta das palavras, o alinhamento institucional e as margens obrigatórias de todas as folhas.';
const scenarios=[
 {name:'curto',text:'1. Solicito o registro do presente documento de teste.',max:1},
 {name:'dez-itens',text:Array.from({length:10},(_,i)=>(i+1)+'. '+(sentence+' ').repeat(3)).join('\n'),max:5},
 {name:'vinte-itens',text:Array.from({length:20},(_,i)=>(i+1)+'. '+(sentence+' ').repeat(5)).join('\n'),max:11},
 {name:'paragrafo-grande',text:'1. '+(sentence+' ').repeat(40)+'\n2. Encerramento do relato, preservando a assinatura.',max:9},
 {name:'com-linhas-vazias',text:Array.from({length:12},(_,i)=>(i+1)+'. '+sentence).join('\n\n'),max:5}
];
const normalize=s=>(s.match(/\S+/g)||[]).join(' ');
async function measure(page){
 return await page.evaluate(()=>{
   paginateDocument();
   const pages=[...document.querySelectorAll('#preview-frame > article.paper')];
   pages.forEach(p=>p.style.zoom='1');
   const observed={msg:document.getElementById('validation').textContent,count:pages.length,pages:pages.map((p,i)=>{
     const r=p.getBoundingClientRect();
     const stop=r.bottom-parseFloat(getComputedStyle(p).paddingBottom);
     const txt=[...p.querySelectorAll('.relato-paragraph')];
     const sig=p.querySelector('.signature');
     const motto=p.querySelector('.motto');
     return {
       num:i+1,stop:stop,words:txt.map(x=>x.textContent).join(' '),fragments:txt.length,
       textEnd:txt.length?txt.at(-1).getBoundingClientRect().bottom:null,
       blank:txt.length?stop-txt.at(-1).getBoundingClientRect().bottom:null,
       sign:!!sig,signEnd:sig?.getBoundingClientRect().bottom||null,
       motto:!!motto&&getComputedStyle(motto).display!=='none',
       overflow: [...txt,sig].filter(Boolean).some(n=>n.getBoundingClientRect().bottom>stop+2),
       font:txt[0]?getComputedStyle(txt[0]).fontSize:'',
       firstIndent:txt[0]?getComputedStyle(txt[0]).textIndent:'',
       bodyMargin:p.querySelector('.body')?getComputedStyle(p.querySelector('.body')).marginTop:''
     };
   })};
   fitPaper();
   return observed;
 });
}
function verify(m,raw,name){
 assert.ok(!m.msg.startsWith('Não foi possível'),name+' '+m.msg);
 assert.ok(m.count>0&&m.count<=40,name+' folhas fora do limite');
 assert.equal(normalize(m.pages.map(p=>p.words).join(' ')),normalize(raw),name+' texto alterado, perdido ou repetido');
 assert.ok(m.pages.every(p=>p.fragments>0),name+' folha em branco');
 assert.equal(m.pages.filter(p=>p.sign).length,1,name+' assinatura repetida/ausente');
 assert.ok(m.pages.at(-1).sign&&m.pages.at(-1).fragments>0,name+' folha apenas com assinatura');
 assert.equal(m.pages.filter(p=>p.motto).length,1,name+' lema duplicado');
 assert.ok(m.pages.every(p=>!p.overflow),name+' texto ou assinatura ultrapassa a margem inferior: '+JSON.stringify(m.pages.map(p=>({n:p.num,blank:Math.round(p.blank||0),textEnd:p.textEnd,signEnd:p.signEnd,stop:p.stop,sign:p.sign}))));
 assert.ok(m.pages.every(p=>p.font==='16px'),name+' perdeu Times New Roman 12pt');
 const excess=m.pages.slice(0,-1).filter(p=>p.blank>190);
 assert.ok(!excess.length,name+' quebra precoce '+JSON.stringify(excess.map(p=>({n:p.num,blank:Math.round(p.blank)}))));
}
async function run(engine,device,deviceName){
 const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true});
 const context=await browser.newContext({...device,acceptDownloads:true});
 const page=await context.newPage();
 const jsErrors=[];
 page.on('pageerror',e=>jsErrors.push(e.message));
 const prefix=engine+'/'+deviceName;
 async function check(name,fn){
  try{const extra=await fn();results.push({name:prefix+'/'+name,ok:true,...extra});console.log('PASSOU',prefix+'/'+name,extra||'')}
  catch(e){issues.push({name:prefix+'/'+name,error:e.stack||String(e)});results.push({name:prefix+'/'+name,ok:false,error:e.message});console.error('FALHOU',prefix+'/'+name,e.message)}
 }
 try{
  await page.goto('file://'+resolve('index.html'),{waitUntil:'domcontentloaded'});
  await page.locator('#start-create').click();
  await page.evaluate(()=>{
   const fields={grad:'Sd PM',re:'153115-8',nome:'USUÁRIO DE TESTE',guerra:'TESTE',cidade:'São Paulo',emailUnidade:'opmunidade123456',data:'2026-10-15',numero:'DL 00/2026',destinatario:'Sr Comandante',assunto:'Teste de formatação'};
   for(const [k,v] of Object.entries(fields)){const node=document.getElementById(k);node.value=v;node.dispatchEvent(new Event('input',{bubbles:true}))}
  });
  await wait(250);
  for(const sample of scenarios){
   await check(sample.name,async()=>{
     await page.evaluate(t=>{const node=document.getElementById('relato');node.value=t;node.dispatchEvent(new Event('input',{bubbles:true}))},sample.text);
     await wait(170);
     const a=await measure(page);
     console.log('MEDIDAS',prefix+'/'+sample.name,JSON.stringify(a.pages.map(p=>({n:p.num,blank:Math.round(p.blank||0),stop:Math.round(p.stop),textEnd:Math.round(p.textEnd||0),signEnd:Math.round(p.signEnd||0),sign:p.sign,overflow:p.overflow}))));verify(a,sample.text,sample.name);
     assert.ok(a.count<=sample.max,'número excessivo de páginas: '+a.count);
     const b=await measure(page);
     assert.deepEqual(a.pages.map(p=>p.words),b.pages.map(p=>p.words),'paginação instável');
     await page.screenshot({path:out+'/'+engine+'-'+deviceName+'-'+sample.name+'.png',fullPage:true});
     return {pages:a.count,blank:a.pages.map(p=>Math.round(p.blank||0))};
   });
  }
  await check('ocultar-visualizar-A4',async()=>{
    const before=await measure(page);
    await page.locator('#preview-toggle').click();
    assert.equal(await page.locator('#preview-toggle').innerText(),'Visualizar A4');
    assert.equal(await page.locator('#preview-toggle').getAttribute('aria-expanded'),'false');
    const hidden=await measure(page);
    verify(hidden,await page.locator('#relato').inputValue(),'A4 oculto');
    await page.locator('#preview-toggle').click();
    assert.equal(await page.locator('#preview-toggle').innerText(),'Ocultar A4');
    assert.equal((await measure(page)).count,before.count);
  });
  await check('assinatura-sem-deslizar',async()=>{
    await page.locator('#sign-open').click();
    assert.ok(await page.locator('#sign-dialog').isVisible());
    const before=await page.evaluate(()=>window.scrollY);
    const pad=await page.locator('#sign-pad').boundingBox();
    assert.ok(pad);
    await page.mouse.move(pad.x+pad.width*.24,pad.y+pad.height*.55);
    await page.mouse.down();
    for(let i=0;i<12;i++)await page.mouse.move(pad.x+pad.width*(.25+i*.036),pad.y+pad.height*(.48+.12*Math.sin(i)));
    await page.mouse.up();
    assert.ok(Math.abs((await page.evaluate(()=>window.scrollY))-before)<3,'tela deslocou ao assinar');
    await page.locator('#sign-apply').click();
    await page.waitForTimeout(330);
    assert.ok((await page.locator('.paper-last .signature-handwriting').count())===1,'assinatura não posicionada: '+JSON.stringify(await page.evaluate(()=>({signed:!!handwrittenSignature,marks:[...document.querySelectorAll('.signature-handwriting')].length,dialogHidden:document.getElementById('sign-dialog').hidden,feedback:document.getElementById('sign-feedback').textContent}))));
    const after=await measure(page);
    assert.ok(after.pages.at(-1).sign&&after.pages.at(-1).fragments>0);
  });
  await check('pdf-compartilhado-real',async()=>{
    const preview=await measure(page);
    await page.addScriptTag({path:resolve('node_modules/jspdf/dist/jspdf.umd.min.js')});
    await page.addScriptTag({path:resolve('node_modules/html2canvas/dist/html2canvas.min.js')});
    await page.locator('#share').click();
    await page.waitForFunction(()=>{const b=document.getElementById('share');return !b.disabled&&b.textContent.includes('PDF pronto')},null,{timeout:95000});
    const pending=page.waitForEvent('download',{timeout:25000});
    await page.locator('#share').click();
    const downloaded=await pending;
    const bytes=await readFile(await downloaded.path());
    const pdf=await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(),preview.count,'PDF e prévia divergem em número de folhas');
    assert.ok(bytes.length>20000,'PDF vazio');
    await writeFile(out+'/'+engine+'-'+deviceName+'-exportado.pdf',bytes);
    return {pages:pdf.getPageCount(),size:bytes.length};
  });
  if(jsErrors.length)issues.push({name:prefix+'/erros-JS',error:jsErrors.join('; ')});
 }catch(e){issues.push({name:prefix+'/inicialização',error:e.stack||String(e)})}
 finally{await browser.close()}
}
await run('chromium',{viewport:{width:1366,height:900}},'desktop');
await run('chromium',{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:3},'mobile');
await run('webkit',{...devices['iPhone 13']},'iphone');
await writeFile(out+'/resultados.json',JSON.stringify({results,issues},null,2));
console.log('\nRESUMO: '+results.filter(r=>r.ok).length+'/'+results.length+' verificações passaram');
if(issues.length){console.error('FALHAS DETECTADAS:\n'+JSON.stringify(issues,null,2));process.exitCode=1}
