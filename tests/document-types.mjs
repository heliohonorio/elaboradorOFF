import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

for(const [name,browserType] of [['Chromium',chromium],['WebKit',webkit]]){
 const browser=await browserType.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.goto(pathToFileURL(resolve('index.html')).href);
  assert.equal(await page.locator('#document-type').inputValue(),'parte');
  await page.locator('#start-create').click();
  await page.locator('.type-option[data-document-type="parte"]').click();
  assert.equal(await page.locator('#address-step').isVisible(),false,'endereço não aparece na Parte');
  assert.equal(await page.locator('#crest-unit-address').isVisible(),false,'endereço não é impresso na Parte');
  assert.match(await page.locator('#meta').innerText(),/PARTE Nº/);

  await page.locator('#return-home').click();
  await page.locator('#start-create').click();
  await page.locator('.type-option[data-document-type="oficio"]').click();
  assert.equal(await page.locator('#address-step').isVisible(),true,'endereço aparece só em Ofício');
  assert.equal(await page.locator('#enderecoUnidade').evaluate(e=>e.required),true,'endereço obrigatório no Ofício');
  const address='Av. Cruzeiro do Sul, 260\nCanindé - São Paulo/SP\nCEP: 03033-001';
  await page.locator('#enderecoUnidade').fill(address);
  await page.locator('#emailUnidade').fill('unidade.teste');
  await page.locator('#numero').fill('DL-009/2026');
  await page.evaluate(()=>{const field=document.getElementById('assunto');field.value='Teste inicial';field.dispatchEvent(new Event('input',{bubbles:true}))});
  assert.match(await page.locator('#meta').innerText(),/OFÍCIO Nº DL-009\/2026/);
  assert.equal(await page.locator('#crest-unit-address').innerText(),address);
  const order=await page.evaluate(()=>{
   const parent=document.getElementById('crest-unit-email').parentElement;
   return [...parent.children].map(x=>x.id||x.className).slice(-2);
  });
  assert.deepEqual(order,['crest-unit-email','crest-unit-address'],'endereço imediatamente após email');

  await page.locator('#edit-paper').click();
  await page.locator('#meta').click();
  const oldMeta=await page.locator('#edit-value').inputValue();
  assert.ok(oldMeta.split('\n').length>=5,'editor de cabeçalho deve preservar linhas');
  const newMeta=oldMeta.replace('OFÍCIO Nº DL-009/2026','OFÍCIO Nº DL-023/2026').replace('Assunto: Teste inicial.','Assunto: Teste corrigido.');
  await page.locator('#edit-value').fill(newMeta);
  await page.locator('#edit-save').click();
  assert.match(await page.locator('#meta').innerText(),/OFÍCIO Nº DL-023\/2026/);
  assert.match(await page.locator('#meta').innerText(),/Teste corrigido/);
  assert.equal(await page.locator('#numero').inputValue(),'DL-023/2026');
  await page.evaluate(()=>{render();paginateDocument()});
  assert.match(await page.locator('#meta').innerText(),/OFÍCIO Nº DL-023\/2026/,'edição permanece após repaginar');

  await page.locator('#crest-unit-address').click();
  await page.locator('#edit-value').fill('Rua Nova, 123 - São Paulo/SP\nCEP: 01000-000');
  await page.locator('#edit-save').click();
  assert.match(await page.locator('#crest-unit-address').innerText(),/Rua Nova, 123/);

  await page.locator('#body').click();
  await page.locator('#edit-value').fill('Relato alterado diretamente a partir do A4.');
  await page.locator('#edit-save').click();
  assert.equal(await page.locator('#relato').inputValue(),'Relato alterado diretamente a partir do A4.');
  assert.match(await page.locator('#body').innerText(),/Relato alterado/);
  await page.locator('#edit-paper').click();

  await page.locator('#return-home').click();
  await page.locator('#start-create').click();
  await page.locator('.type-option[data-document-type="memorando"]').click();
  assert.equal(await page.locator('#address-step').isVisible(),false,'Memorando não mostra endereço');
  assert.equal(await page.locator('#crest-unit-address').isVisible(),false,'Memorando não imprime endereço');
  assert.match(await page.locator('#meta').innerText(),/MEMORANDO Nº/);
  assert.equal(await page.locator('#enderecoUnidade').evaluate(e=>e.required),false);

  await page.evaluate(()=>{const field=document.getElementById('relato');field.value=Array.from({length:70},(_,i)=>(i+1)+'. Parágrafo para testar a paginação sem alterar fonte e margens.').join('\n');field.dispatchEvent(new Event('input',{bubbles:true}))});
  await page.evaluate(()=>paginateDocument());
  assert.ok(await page.locator('#preview-frame > article.paper').count()>1,'cenário deve paginar');
  await page.locator('#edit-paper').click();
  await page.locator('#preview-frame > article.paper').nth(1).locator('.body').click();
  assert.match(await page.locator('#edit-value').inputValue(),/70\. Parágrafo/,'editar página 2 traz texto integral');
  await page.locator('#edit-cancel').click();
  assert.deepEqual(errors.filter(message=>!message.includes('/contador-visitas due to access control checks')),[],'sem erros JavaScript relacionados ao editor');
  console.log('OK '+name+': três tipos, endereço condicional, edição A4, repaginação e 2ª página.');
 }finally{await browser.close()}
}
