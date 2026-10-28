import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const output=await mkdtemp(join(tmpdir(),'p118-optional-'));
for(const engine of [chromium,webkit]){
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:850},acceptDownloads:true});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/functions/v1/contador-visitas',route=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"total":1}'}));
  await page.goto(pathToFileURL(resolve('index.html')).href);
  await page.addScriptTag({path:resolve('node_modules/html2canvas/dist/html2canvas.min.js')});
  await page.addScriptTag({path:resolve('node_modules/jspdf/dist/jspdf.umd.min.js')});

  // Os três modelos administrativos usam o mesmo campo facultativo de assinatura.
  for(const type of ['parte','memorando','oficio']){
   await page.locator('#start-create').click();
   await page.locator('.type-option[data-document-type="'+type+'"]').click();
   assert.equal(await page.locator('#sign-pad').getAttribute('required'),null);
   assert.equal(await page.locator('#signature').count(),1,'Área de assinatura permanece no documento');
   assert.equal(await page.evaluate(()=>handwrittenSignature),null,'Não precisa desenhar em '+type);
   await page.locator('#return-home').click();
  }

  await page.locator('#start-create').click();
  await page.locator('.type-option[data-document-type="afastamento"]').click();
  for(const [id,value] of Object.entries({
   'p118-re':'1531158','p118-nome':'MILITAR DE TESTE','p118-opm':'DL',
   'p118-local':'SAO PAULO','p118-pedido':'2026-10-28','p118-dias':'2',
   'p118-inicio':'2026-11-03','p118-motivo':'Teste de assinatura facultativa.'
  }))await page.locator('#'+id).fill(value);
  await page.locator('#p118-grad').selectOption('Sd PM');
  assert.equal(await page.evaluate(()=>validateP118()),true,'P-118 sem assinatura deve ser válido');
  assert.ok(await page.locator('#p118-ink').isHidden(),'Não cria assinatura automática');
  await page.locator('#p118-export-open').click();
  await page.locator('#p118-export-docx').click();
  await page.locator('#p118-export-save').waitFor({state:'visible',timeout:15000});
  assert.ok(await page.locator('#p118-export-docx').evaluate(e=>e.classList.contains('export-ready')),'Word preparado');
  const record=await page.evaluate(async()=>{
   return await window.P118Workflow.readWord(p118ExportFile,async()=>{throw Error('Leitura não deveria depender de CDN')});
  });
  assert.equal(record.signature,null,'Word sem assinatura mantém dados para importar');
  assert.equal(record.base.nome,'MILITAR DE TESTE');
  const down=page.waitForEvent('download');
  await page.locator('#p118-export-save').click();
  const download=await down;
  const saved=join(output,engine.name()+'-p118-sem-assinatura.docx');
  await download.saveAs(saved);
  assert.ok((await page.locator('#p118-export-result').textContent()).includes('Download iniciado'));
  await page.locator('#p118-export-close').click();

  // O indicador é mostrado NO botão PDF durante a preparação real.
  await page.evaluate(()=>{
   window.__originalP118Pdf=createP118Pdf;
   createP118Pdf=()=>new Promise(resolve=>{
    window.__finishP118Pdf=()=>resolve(new Blob(['%PDF-1.4\nTESTE'],{type:'application/pdf'}));
   });
  });
  await page.locator('#p118-export-open').click();
  await page.locator('#p118-export-pdf').click();
  await page.waitForFunction(()=>!!window.__finishP118Pdf);
  const loading=await page.locator('#p118-export-pdf').evaluate(b=>({busy:b.getAttribute('aria-busy'),loading:b.classList.contains('export-preparing'),text:b.textContent,disabled:b.disabled}));
  assert.equal(loading.busy,'true');
  assert.equal(loading.loading,true);
  assert.ok(loading.text.includes('Preparando PDF'));
  assert.equal(loading.disabled,true);
  assert.ok(await page.locator('#p118-export-actions').isHidden());
  await page.evaluate(()=>window.__finishP118Pdf());
  await page.locator('#p118-export-save').waitFor({state:'visible'});
  assert.ok(await page.locator('#p118-export-pdf').evaluate(e=>e.classList.contains('export-ready')));
  await page.evaluate(()=>{createP118Pdf=window.__originalP118Pdf});
  await page.locator('#p118-export-close').click();

  // O botão de impressão também comunica preparação e volta ao normal.
  await page.evaluate(()=>{window.__printed=false;window.print=()=>{window.__printed=true}});
  await page.locator('#p118-print').click();
  await page.waitForFunction(()=>window.__printed===true);
  await page.waitForFunction(()=>!document.querySelector('#p118-print').classList.contains('export-preparing'));
  assert.equal(await page.locator('#p118-print').innerText(),'Imprimir');

  // Superior importa o Word sem assinatura: mantém identificação original bloqueada.
  await page.locator('#return-home').click();
  await page.locator('#start-authorize').click();
  await page.locator('#authorize-file').setInputFiles(saved);
  await page.locator('#p118-supervisor-fields').waitFor({state:'visible',timeout:15000});
  assert.ok(await page.locator('#p118-ink').isHidden());
  assert.ok(await page.locator('#p118-nome').isDisabled());
  assert.equal(await page.locator('#p118-nome').inputValue(),'MILITAR DE TESTE');
  await page.locator('#p118-supervisor-decision').selectOption('sim');
  await page.locator('#p118-supervisor-date').fill('2026-11-04');
  await page.locator('#p118-supervisor-grade').selectOption('3º Sgt PM');
  await page.locator('#p118-supervisor-war').fill('SILVA');
  await page.locator('#p118-supervisor-re').fill('9876543');
  assert.ok(await page.locator('#p118-supervisor-ink').isHidden());
  assert.equal(await page.evaluate(()=>validateP118()),true,'Superior pode concluir sem assinatura');
  assert.ok(await page.locator('#p118-export-open').isEnabled());
  assert.ok(await page.locator('#p118-print').isEnabled());
  await page.locator('#p118-export-open').click(); // Superior gera somente PDF
  await page.locator('#p118-export-save').waitFor({state:'visible',timeout:15000});
  assert.ok(await page.locator('#p118-export-docx').isHidden(),'Superior não exporta Word');
  await page.locator('#p118-export-close').click();
  assert.deepEqual(errors,[],'Nenhum erro JS');
  console.log('PASSOU assinatura opcional e botões de carregamento:',engine.name());
  await page.close();
 }finally{await browser.close()}
}
