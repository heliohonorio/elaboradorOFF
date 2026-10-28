import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
const output=await mkdtemp(join(tmpdir(),'export-button-'));
console.log('Capturas:',output);
for(const engine of [chromium,webkit]){
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:850},isMobile:true,hasTouch:true,acceptDownloads:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/functions/v1/contador-visitas',r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"total":1}'}));
  await page.goto(pathToFileURL(resolve('index.html')).href);
  await page.locator('#start-create').click();await page.locator('[data-document-type="afastamento"]').click();
  for(const [key,value]of Object.entries({re:'1234567',nome:'MILITAR DE TESTE',opm:'DL',local:'SÃO PAULO',pedido:'2026-10-28',dias:'1',inicio:'2026-11-03',motivo:'Teste do fluxo de exportação.'}))await page.locator('#p118-'+key).fill(value);
  await page.locator('#p118-grad').selectOption('Sd PM');
  await page.evaluate(()=>{
   // Segurar a geração permite verificar o estado anterior à conclusão.
   createP118Pdf=()=>new Promise((resolve,reject)=>{window.finishExport=()=>resolve(new Blob(['TESTE'],{type:'application/pdf'}));window.failExport=()=>reject(Error('Falha simulada'))});
   createP118WordSnapshot=()=>new Promise(resolve=>{window.finishWord=()=>resolve({})});
   window.createP118WordDocument=()=>new Blob(['TESTE'],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
   Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
   Object.defineProperty(navigator,'share',{configurable:true,value:()=>new Promise((resolve,reject)=>{window.finishShare=resolve;window.cancelShare=()=>reject(new DOMException('Cancelado','AbortError'))})});
  });
  await page.locator('#p118-export-open').click();
  assert.equal(await page.locator('#p118-export-docx strong').innerText(),'Enviar para superior assinar');
  assert.match(await page.locator('#p118-export-docx small').innerText(),/Autorizar DS\/LP.*Encaminhamento 1 e assina/);
  await page.locator('#p118-export-docx').click();await page.waitForFunction(()=>!!window.finishWord);
  await page.waitForFunction(()=>Number(document.querySelector('#p118-export-docx').dataset.exportProgress)>8);
  const pending=await page.locator('#p118-export-docx').evaluate(b=>({fill:getComputedStyle(b).backgroundSize,image:getComputedStyle(b).backgroundImage,busy:b.getAttribute('aria-busy'),value:Number(b.dataset.exportProgress),disabled:b.disabled}));
  assert.match(pending.fill,/100%$/,'Preenchimento ocupa a altura inteira');assert.match(pending.image,/linear-gradient/);
  assert.equal(pending.busy,'true');assert.ok(pending.value>5&&pending.value<100);assert.ok(pending.disabled);
  await page.locator('.p118-export-box').screenshot({path:join(output,engine.name()+'-preparando.png')});
  await page.evaluate(()=>window.finishWord());
  await page.locator('#p118-export-save').waitFor({state:'visible'});
  assert.equal(await page.locator('#p118-export-docx').getAttribute('data-export-progress'),'100');
  assert.equal(await page.locator('#p118-export-docx strong').innerText(),'Enviar para superior assinar');
  await page.locator('.p118-export-box').screenshot({path:join(output,engine.name()+'-pronto.png')});
  const download=page.waitForEvent('download');await page.locator('#p118-export-save').click();await download;
  await page.waitForFunction(()=>document.querySelector('#p118-export-save').classList.contains('export-ready'));
  assert.equal(await page.locator('#p118-export-save').getAttribute('data-export-progress'),'100');
  await page.locator('#p118-export-share').click();await page.waitForFunction(()=>!!window.finishShare);
  assert.equal(await page.locator('#p118-export-share').getAttribute('aria-busy'),'true');
  await page.evaluate(()=>window.cancelShare());
  await page.waitForFunction(()=>!document.querySelector('#p118-export-share').disabled);
  assert.equal(await page.locator('#p118-export-share').getAttribute('data-export-progress'),null,'Cancelar não indica sucesso');
  await page.locator('#p118-export-share').click();await page.evaluate(()=>window.finishShare());
  await page.waitForFunction(()=>document.querySelector('#p118-export-share').classList.contains('export-ready'));
  assert.equal(await page.locator('#p118-export-share').getAttribute('data-export-progress'),'100');
  // Falha limpa o progresso e permite tentar novamente.
  await page.locator('#p118-export-pdf').click();await page.waitForFunction(()=>!!window.failExport);
  await page.evaluate(()=>window.failExport());
  await page.waitForFunction(()=>!document.querySelector('#p118-export-pdf').disabled);
  assert.equal(await page.locator('#p118-export-pdf').getAttribute('aria-busy'),null);
  assert.equal(await page.locator('#p118-export-pdf').getAttribute('data-export-progress'),null);
  assert.ok(await page.locator('#p118-export-actions').isHidden());
  await page.evaluate(()=>{window.finishExport=null});
  await page.locator('#p118-export-pdf').click();await page.waitForFunction(()=>!!window.finishExport);await page.evaluate(()=>window.finishExport());
  await page.locator('#p118-export-save').waitFor({state:'visible'});
  assert.equal(await page.locator('#p118-export-pdf').getAttribute('data-export-progress'),'100');
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('#p118-export-pdf').evaluate(b=>getComputedStyle(b).transitionDuration),'0s');
  assert.deepEqual(errors,[]);console.log('OK',engine.name(),': Word/PDF, salvar, enviar, cancelar e falha');
 }finally{await browser.close()}
}
