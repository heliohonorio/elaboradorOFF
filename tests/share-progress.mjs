import { chromium, webkit, devices } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

await mkdir('qa-output',{recursive:true});
for(const scenario of [
 {name:'desktop',engine:chromium,config:{viewport:{width:1366,height:900}}},
 {name:'iphone',engine:webkit,config:{...devices['iPhone 13']}}
]){
 const browser=await scenario.engine.launch({headless:true});
 const context=await browser.newContext({...scenario.config,acceptDownloads:true});
 const page=await context.newPage();
 try{
  await page.goto('file://'+resolve('index.html'),{waitUntil:'domcontentloaded'});
  await page.locator('#start-create').click();
  await page.evaluate(()=>{
   showStage(2);
   const relato=document.getElementById('relato');
   relato.value='1. Solicito, respeitosamente, análise administrativa desta manifestação.';
   relato.dispatchEvent(new Event('input',{bubbles:true}));
   window.__originalCreateDocumentPdf=createDocumentPdf;
   createDocumentPdf=async onProgress=>{
    onProgress?.(25);
    await new Promise(resolve=>{window.__finishPdf=resolve});
    onProgress?.(90);
    return new Blob(['%PDF-1.4\\nTESTE'],{type:'application/pdf'});
   };
  });
  const btn=page.locator('#share');
  assert.equal(await btn.innerText(),'Compartilhar PDF');
  await btn.click();
  await page.waitForFunction(()=>!!window.__finishPdf);
  const pending=await btn.evaluate(b=>({
   label:b.textContent,disabled:b.disabled,loading:b.classList.contains('share-loading'),
   ready:b.classList.contains('share-ready'),
   progress:Number(b.dataset.progress),
   gradient:getComputedStyle(b).backgroundImage
  }));
  assert.ok(pending.disabled,'botão não bloqueado na geração');
  assert.equal(pending.loading,true,'carregamento verde ausente');
  assert.equal(pending.ready,false,'indicou pronto antes de criar o PDF');
  assert.ok(pending.progress>=25&&pending.progress<100,'indicador antecipou a conclusão');
  assert.ok(pending.gradient.includes('linear-gradient'),'degradê verde não está aplicado');
  assert.ok(!pending.label.includes('pronto'),'rótulo adiantou conclusão');
  await btn.screenshot({path:'qa-output/botao-carregando-'+scenario.name+'.png'});
  await page.evaluate(()=>window.__finishPdf());
  await page.waitForFunction(()=>{
   const b=document.getElementById('share');
   return !b.disabled&&b.classList.contains('share-ready');
  },{timeout:6000});
  const ready=await btn.evaluate(b=>({
   label:b.textContent,disabled:b.disabled,ready:b.classList.contains('share-ready'),
   loading:b.classList.contains('share-loading'),
   progress:b.dataset.progress,fill:b.style.getPropertyValue('--share-progress')
  }));
  assert.ok(ready.label.includes('PDF pronto'),'texto final incorreto');
  assert.equal(ready.fill,'100%','botão não ficou completamente verde');
  assert.equal(ready.progress,'100');
  assert.equal(ready.disabled,false,'não voltou a permitir compartilhar');
  assert.equal(ready.loading,false);
  await btn.screenshot({path:'qa-output/botao-pronto-'+scenario.name+'.png'});

  await page.evaluate(()=>{
   const f=document.getElementById('relato');
   f.value+=' Complemento.';
   f.dispatchEvent(new Event('input',{bubbles:true}));
  });
  const reset=await btn.evaluate(b=>({
   label:b.textContent,loading:b.classList.contains('share-loading'),
   ready:b.classList.contains('share-ready'),progress:b.style.getPropertyValue('--share-progress')
  }));
  assert.equal(reset.label,'Compartilhar PDF','botão não retornou ao padrão após edição');
  assert.equal(reset.loading,false);
  assert.equal(reset.ready,false);
  assert.equal(reset.progress,'');

  await page.evaluate(()=>{
   createDocumentPdf=async()=>{throw Error('Falha simulada de exportação');};
  });
  await btn.click();
  await page.waitForFunction(()=>{
   const b=document.getElementById('share');
   return !b.disabled && document.getElementById('ai-status').textContent.includes('Falha simulada');
  });
  assert.equal(await btn.innerText(),'Compartilhar PDF','falha deixou botão como pronto');
  assert.equal(await btn.evaluate(b=>b.classList.contains('share-ready')),false);
  assert.equal(await btn.evaluate(b=>b.classList.contains('share-loading')),false);

  await page.evaluate(()=>{createDocumentPdf=window.__originalCreateDocumentPdf;});
  console.log('PASSOU progresso verde e erro no '+scenario.name,JSON.stringify({pending,ready,reset}));
 }finally{await context.close();await browser.close()}
}
