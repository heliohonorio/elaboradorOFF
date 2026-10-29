import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

for(const engine of [chromium,webkit]){
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:500}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/functions/v1/contador-visitas',route=>route.fulfill({
   status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"total":1}'
  }));
  await page.goto(pathToFileURL(resolve('index.html')).href);
  await page.locator('#start-create').click();
  await page.locator('[data-document-type="afastamento"]').click();
  await page.waitForTimeout(700);
  assert.ok(await page.locator('#p118-form').isVisible(),'Formulário aberto');
  const atOpen=await page.evaluate(()=>({
   top:document.querySelector('#p118-form').getBoundingClientRect().top,
   focused:document.activeElement.id,
   width:document.documentElement.scrollWidth,
   available:innerWidth
  }));
  assert.ok(atOpen.top>=-12&&atOpen.top<=90,'Ao abrir, o sistema rola até a identificação');
  assert.notEqual(atOpen.focused,'p118-re','Não abrir o teclado automaticamente no iPhone');
  assert.ok(atOpen.width<=atOpen.available+1,'Sem rolagem horizontal');

  // Simular somente a área visual reduzida pelo teclado; o layout não encolhe.
  await page.evaluate(()=>{
   Object.defineProperty(window.visualViewport,'height',{configurable:true,get:()=>innerHeight-200});
  });
  // Com teclado aberto, levar o campo focado à área visível.
  await page.evaluate(()=>{
   window.scrollTo({top:0,behavior:'instant'});
   document.getElementById('p118-motivo').focus({preventScroll:true});
  });
  await page.waitForTimeout(700);
  const field=await page.evaluate(()=>{
   const rect=document.getElementById('p118-motivo').getBoundingClientRect();
   const v=window.visualViewport;const offset=v?.offsetTop||0;
   return {top:rect.top,bottom:rect.bottom,visibleTop:offset,visibleBottom:offset+(v?.height||innerHeight)};
  });
  assert.ok(field.top>=field.visibleTop-6,'O campo focado não fica acima da tela');
  assert.ok(field.bottom<=field.visibleBottom+6,'O campo focado não fica abaixo da tela');

  await page.locator('#p118-re').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'p118-grad','Enter avança ao próximo campo');
  await page.locator('#p118-nome').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'p118-opm','Avança na ordem do formulário');
  await page.locator('#p118-motivo').focus();
  await page.locator('#p118-motivo').fill('Teste');
  await page.keyboard.press('Enter');
  assert.ok((await page.locator('#p118-motivo').inputValue()).includes('\n'),'Textarea mantém nova linha');

  await page.setViewportSize({width:390,height:500});
  await page.evaluate(()=>document.getElementById('p118-inicio').focus({preventScroll:true}));
  await page.waitForTimeout(450);
  const dateBounds=await page.evaluate(()=>{
   const rect=document.getElementById('p118-inicio').getBoundingClientRect();
   return {top:rect.top,bottom:rect.bottom,viewport:visualViewport?.height||innerHeight};
  });
  assert.ok(dateBounds.top>=-4&&dateBounds.bottom<=dateBounds.viewport+4,'Campo de data visível com janela reduzida');
  // Fechar o teclado mantendo o campo focado não deve puxar a página.
  await page.evaluate(()=>{
   delete window.visualViewport.height;
   window.scrollTo({top:0,behavior:'instant'});
   window.visualViewport.dispatchEvent(new Event('resize'));
  });
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(()=>scrollY),0,'Teclado fechado respeita a posição manual');

  // Variação pequena das barras do navegador não é abertura do teclado.
  await page.evaluate(()=>{
   document.getElementById('p118-motivo').focus({preventScroll:true});
   window.scrollTo({top:0,behavior:'instant'});
   Object.defineProperty(window.visualViewport,'height',{configurable:true,get:()=>innerHeight-60});
   window.visualViewport.dispatchEvent(new Event('resize'));
  });
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(()=>scrollY),0,'Barras do navegador não puxam a tela');

  // Um gesto manual cancela inclusive callbacks agendados durante o foco.
  await page.evaluate(()=>{
   Object.defineProperty(window.visualViewport,'height',{configurable:true,get:()=>innerHeight-200});
   document.getElementById('p118-inicio').focus({preventScroll:true});
   window.dispatchEvent(new Event('touchmove'));
   window.scrollTo({top:0,behavior:'instant'});
   window.visualViewport.dispatchEvent(new Event('resize'));
  });
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(()=>scrollY),0,'Rolagem manual tem prioridade com teclado aberto');
  await page.evaluate(()=>delete window.visualViewport.height);
  assert.deepEqual(errors,[],'Sem erros JavaScript');
  console.log('Auto-scroll P-118 OK:',engine.name());
  await page.close();
 }finally{await browser.close()}
}
