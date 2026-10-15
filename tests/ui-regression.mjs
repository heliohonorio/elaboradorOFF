
import {chromium, webkit, devices} from 'playwright';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {writeFile,mkdir} from 'node:fs/promises';

const checks=[],failures=[],out='qa-output';
await mkdir(out,{recursive:true});
const scenario=[
 '1. A presente manifestação é destinada exclusivamente ao teste de paginação, sem alteração do padrão institucional. '.repeat(3),
 ...Array.from({length:11},(_,i)=>(i+2)+'. Solicito verificar a perfeita preservação do texto, das margens, do brasão, da assinatura e do rodapé. '.repeat(3))
].join('\n');
function compact(s){return String(s).replace(/\s+/g,' ').trim()}
async function fill(page,text=scenario){
 await page.locator('#start-create').click();
 await page.evaluate((payload)=>{
  const vals={
   grad:'Sd PM',re:'153115-8',nome:'USUÁRIO DE TESTE',guerra:'TESTE',cidade:'São Paulo',
   emailUnidade:'planejamentodefrota',data:'2026-10-15',numero:'DL 00/2026',
   destinatario:'Sr Comandante',assunto:'Verificação dos botões',relato:payload
  };
  for(const [key,value] of Object.entries(vals)){
   const field=document.getElementById(key);
   field.value=value;field.dispatchEvent(new Event('input',{bubbles:true}));
  }
 },text);
 await page.waitForTimeout(200);
}
const f=n=>Math.round(n*100)/100;
async function getA4Geometry(page){
 return await page.evaluate(()=>{
  paginateDocument();
  const pages=[...document.querySelectorAll('#preview-frame > article.paper')];
  pages.forEach(p=>p.style.zoom='1');
  const round=n=>Math.round(n*10)/10;
  function dims(el,parent){
   if(!el)return null;
   const r=el.getBoundingClientRect(),o=parent.getBoundingClientRect();
   const cs=getComputedStyle(el);
   return {
    x:round(r.left-o.left),y:round(r.top-o.top),w:round(r.width),h:round(r.height),
    font:cs.fontFamily,size:cs.fontSize,weight:cs.fontWeight,
    lineHeight:cs.lineHeight,indent:cs.textIndent,
    marginTop:cs.marginTop,marginBottom:cs.marginBottom
   };
  }
  const v=pages.map(p=>{
   const children=[...p.querySelectorAll('.body .relato-paragraph')];
   return {
    w:round(p.getBoundingClientRect().width),h:round(p.getBoundingClientRect().height),
    classes:p.className,
    head:dims(p.querySelector('.letter-head'),p),
    crest:dims(p.querySelector('.crest'),p),
    email:dims(p.querySelector('.crest-unit-email'),p),
    meta:dims(p.querySelector('.meta'),p),
    body:dims(p.querySelector('.body'),p),
    paragraphs:children.map(x=>({text:x.textContent,dims:dims(x,p)})),
    signature:dims(p.querySelector('.signature'),p),
    motto:dims(p.querySelector('.motto'),p)
   };
  });
  fitPaper();
  return {pages:v,words:pages.flatMap(p=>[...p.querySelectorAll('.relato-paragraph')].map(q=>q.textContent)).join(' ')};
 });
}
function match(expected,actual,label){
 assert.equal(compact(actual.words),compact(expected.words),label+': texto diferente');
 assert.equal(actual.pages.length,expected.pages.length,label+': alterou número de páginas');
 const walk=(a,b,path)=>{
   if(a===null||b===null){assert.equal(a,b,path);return}
   if(typeof a==='number'&&typeof b==='number'){assert.ok(Math.abs(a-b)<1.1,path+': geometria A4 alterada '+a+' => '+b);return}
   if(typeof a==='string'||typeof a==='boolean'){assert.equal(a,b,path);return}
   if(Array.isArray(a)){assert.equal(a.length,b.length,path);a.forEach((x,i)=>walk(x,b[i],path+'['+i+']'));return}
   for(const k of Object.keys(a)){assert.ok(Object.hasOwn(b,k),path+'.'+k);walk(a[k],b[k],path+'.'+k)}
 };
 walk(expected.pages,actual.pages,label);
}
async function test(engine,device,deviceName){
 const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true});
 const ctx=await browser.newContext({...device,acceptDownloads:true});
 const page=await ctx.newPage();
 const prefix=engine+'/'+deviceName;
 const run=async(name,body)=>{
  try{await body();checks.push({name:prefix+'/'+name,ok:true});console.log('PASSOU',prefix+'/'+name)}
  catch(e){failures.push({name:prefix+'/'+name,error:e.stack||String(e)});checks.push({name:prefix+'/'+name,ok:false});console.log('FALHOU',prefix+'/'+name,e.message)}
 };
 try{
  const ref='file://'+resolve('qa-baseline/index.html');
  const current='file://'+resolve('index.html');
  let baseline;
  await run('referencia-A4',async()=>{
   await page.goto(ref,{waitUntil:'domcontentloaded'});
   await fill(page);
   baseline=await getA4Geometry(page);
   assert.ok(baseline.pages.length>=2,'referência precisa ser multipágina');
  });
  await run('geometria-A4-inalterada',async()=>{
   await page.goto(current,{waitUntil:'domcontentloaded'});
   await fill(page);
   const candidate=await getA4Geometry(page);
   match(baseline,candidate,prefix);
  });
  await run('agrupamento-e-nomes',async()=>{
   for(const id of ['ai','restore','clear','print','share','preview-toggle','sign-open','edit-paper']){
    assert.equal(await page.locator('#'+id).count(),1,'botão sem identificador único: '+id);
   }

   assert.equal(await page.locator('.form .document-actions .pdf-actions').count(),1,'ações do PDF não estão juntas');
   assert.equal(await page.locator('.form .document-actions .ai-actions').count(),1,'ferramenta de IA ausente');
   assert.equal(await page.locator('.form .document-actions .action-group-title').count(),0,'há títulos redundantes');
   assert.equal(await page.locator('.doc-head .preview-toolbar > button').count(),3,'controles A4 não estão agrupados');
   assert.equal(await page.locator('#share').innerText(),'Compartilhar PDF');
   assert.equal(await page.locator('#clear').innerText(),'Limpar formulário');
   assert.equal(await page.locator('#print').innerText(),'Salvar ou imprimir PDF');
   assert.equal(await page.locator('#edit-paper').innerText(),'Editar');
   const order=await page.locator('.form .document-actions button').evaluateAll(ns=>ns.map(n=>n.id));
   assert.deepEqual(order,['ai','restore','print','share','clear'],'ordem das ações inconsistente');
   for(const id of ['clear','preview-toggle','sign-open','edit-paper']){
    const box=await page.locator('#'+id).boundingBox();
    assert.ok(box&&box.height>=42,'alvo de toque muito pequeno: '+id);
    const size=await page.locator('#'+id).evaluate(n=>parseFloat(getComputedStyle(n).fontSize));
    assert.ok(size>=14,'texto do botão pequeno: '+id);
   }
   assert.ok(await page.locator('.form .document-actions .ai-actions').isHidden(),'IA aparece fora da etapa de elaboração');
   assert.ok(await page.locator('.form > #progress').isHidden(),'contador de etapas redundante aparece na tela');
   assert.ok(await page.locator('#print').isHidden(),'Salvar PDF aparece antes de terminar as etapas');
   assert.ok(await page.locator('#share').isHidden(),'Compartilhar aparece antes de terminar as etapas');
   assert.ok(await page.locator('.intro').isHidden(),'Introdução repetida ocupa espaço no formulário');
   if(deviceName!=='desktop'){
    assert.equal(await page.locator('#preview-toggle').getAttribute('aria-expanded'),'false','prévia mobile deve iniciar recolhida');
    assert.equal(await page.locator('#preview-toggle').innerText(),'Visualizar A4');
   }
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
   assert.ok(overflow<=1,'interface cria barra horizontal: '+overflow);
   await page.screenshot({path:out+'/'+engine+'-'+deviceName+'-botoes.png',fullPage:true});
  });
  await run('etapas-intuitivas',async()=>{
   assert.ok((await page.locator('.stage-tab.active').innerText()).includes('Identificação'));
   await page.locator('#next-step').click();
   assert.ok((await page.locator('.stage-tab.active').innerText()).includes('Destinatário'));
   await page.locator('#next-step').click();
   assert.ok((await page.locator('.stage-tab.active').innerText()).includes('Elaboração'));
   assert.ok(await page.locator('.form .document-actions .ai-actions').isVisible(),'IA não aparece na etapa de elaboração');
   assert.ok(await page.locator('#ai').isVisible(),'botão de IA indisponível');
   for(const id of ['print','share']){
    assert.ok(await page.locator('#'+id).isVisible(),'botão não aparece ao concluir as etapas: '+id);
    const box=await page.locator('#'+id).boundingBox();
    assert.ok(box&&box.height>=42,'área de toque pequena após concluir: '+id);
   }
   const after=await getA4Geometry(page);
   match(baseline,after,prefix+'/após etapas');
  });
  await run('previsualizacao-e-edicao',async()=>{
   const initial=await page.locator('#preview-toggle').getAttribute('aria-expanded');
   await page.locator('#preview-toggle').click();
   assert.equal(await page.locator('#preview-toggle').getAttribute('aria-expanded'),initial==='true'?'false':'true');
   await page.locator('#preview-toggle').click();
   assert.equal(await page.locator('#preview-toggle').getAttribute('aria-expanded'),initial);
   await page.locator('#edit-paper').click();
   assert.equal(await page.locator('#edit-paper').getAttribute('aria-pressed'),'true');
   await page.locator('#edit-paper').click();
   assert.equal(await page.locator('#edit-paper').getAttribute('aria-pressed'),'false');
   const preview=await getA4Geometry(page);
   match(baseline,preview,prefix+'/após edição');
  });
  await run('modal-assinatura',async()=>{
   await page.locator('#sign-open').click();
   assert.ok(await page.locator('#sign-dialog').isVisible());
   await page.locator('#sign-cancel').click();
   assert.ok(!(await page.locator('#sign-dialog').isVisible()));
  });
  await run('restaurar-e-limpar',async()=>{
   assert.ok(await page.locator('#restore').isHidden(),'restaurar relato deve permanecer oculto inicialmente');
   page.once('dialog',d=>d.accept());
   await page.locator('#clear').click();
   assert.equal(await page.locator('#relato').inputValue(),'');
   assert.equal(await page.locator('#nome').inputValue(),'');
   assert.equal(await page.locator('#share').innerText(),'Compartilhar PDF');
  });
 }finally{await ctx.close();await browser.close()}
}
await test('chromium',{viewport:{width:1366,height:900}},'desktop');
await test('chromium',{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:3},'mobile');
await test('webkit',{...devices['iPhone 13']},'iphone');
await writeFile(out+'/ui-testes.json',JSON.stringify({checks,failures},null,2));
console.log('RESUMO INTERFACE: '+checks.filter(c=>c.ok).length+'/'+checks.length+' passaram');
if(failures.length){console.error('FALHAS:',JSON.stringify(failures,null,2));process.exitCode=1}
