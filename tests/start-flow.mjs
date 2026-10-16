import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';

const baseUrl = 'http://127.0.0.1:8765/';
const documents = [
  { type: 'parte', label: 'Parte', needsAddress: false },
  { type: 'oficio', label: 'Ofício', needsAddress: true },
  { type: 'memorando', label: 'Memorando', needsAddress: false }
];

let checks = 0;
function check(value, message) {
  assert.ok(value, message);
  checks++;
}

for (const engine of [chromium, webkit]) {
  const browser = await engine.launch({ headless: true });
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 850 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      // O contador externo não participa do editor. Resposta local evita
      // falhas de CORS ou indisponibilidade desse serviço durante o teste.
      await page.route('**/functions/v1/contador-visitas', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET,POST,OPTIONS',
          'access-control-allow-headers': '*'
        },
        body: '{"total":1}'
      }));
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

      check(await page.locator('#start-choices').isVisible(), 'Tela inicial acessível');
      check(await page.locator('#document-type-chooser').isHidden(), 'Escolha do tipo só após Criar');
      check(await page.locator('#document-type').isHidden(), 'Select antigo não está visível');
      check((await page.locator('#start-heading').textContent()).trim() === 'O que deseja fazer?', 'Título inicial correto');

      await page.locator('#start-create').click();
      check(await page.locator('#document-type-chooser').isVisible(), 'Etapa de seleção abriu');
      check(await page.locator('#start-choices').isHidden(), 'Botões iniciais ocultos');
      check(await page.locator('.type-option').count() === 3, 'Exatamente três tipos');
      check(await page.locator('.type-option').first().evaluate(el => el === document.activeElement), 'Foco de teclado na primeira opção');

      await page.locator('#choose-document-back').click();
      check(await page.locator('#start-choices').isVisible(), 'Voltar reabre o início');
      check(await page.locator('#document-type-chooser').isHidden(), 'Voltar fecha a seleção');

      await page.locator('#start-import').click();
      check(await page.locator('#import-panel').isVisible(), 'Importar existente permanece funcional');
      await page.locator('#import-back').click();
      check(await page.locator('#import-panel').isHidden(), 'Voltar da importação permanece funcional');

      for (const item of documents) {
        await page.locator('#start-create').click();
        await page.locator('.type-option[data-document-type="' + item.type + '"]').click();
        check(await page.locator('#editor-layout').isVisible(), 'Editor abriu: ' + item.label);
        check(await page.locator('#start-screen').isHidden(), 'Tela inicial fechou: ' + item.label);
        const info = await page.evaluate(() => ({
          type: document.querySelector('#document-type').value,
          heading: document.querySelector('.form > h2').textContent,
          addressHidden: document.querySelector('#address-step').hidden,
          addressRequired: document.querySelector('#enderecoUnidade').required,
          hasPaper: !!document.querySelector('#preview-frame .paper')
        }));
        check(info.type === item.type, 'Tipo correto: ' + item.label);
        check(info.heading.includes(item.label), 'Cabeçalho correto: ' + item.label);
        check(info.addressHidden === !item.needsAddress, 'Endereço exclusivo do Ofício: ' + item.label);
        check(info.addressRequired === item.needsAddress, 'Obrigatoriedade do endereço: ' + item.label);
        check(info.hasPaper, 'Prévia A4 preservada: ' + item.label);
        await page.locator('#return-home').click();
        check(await page.locator('#start-choices').isVisible(), 'Página inicial restaurada após ' + item.label);
        check(await page.locator('#document-type-chooser').isHidden(), 'Seletor fechado ao voltar: ' + item.label);
      }

      await page.locator('#start-create').click();
      await page.keyboard.press('Enter');
      check(await page.locator('#editor-layout').isVisible(), 'Teclado abre o primeiro tipo');
      await page.locator('#return-home').click();

      if (width === 390) {
        await page.locator('#start-create').click();
        const noOverflow = await page.locator('.type-option').evaluateAll(items => items.every(item => {
          const rect = item.getBoundingClientRect();
          return rect.left >= -1 && rect.right <= window.innerWidth + 1;
        }));
        check(noOverflow, 'Opções sem rolagem horizontal no celular');
      }
      check(errors.length === 0, 'JavaScript sem exceções: ' + errors.join('; '));
      await page.close();
      console.log(engine.name(), width + 'px: OK');
    }
  } finally {
    await browser.close();
  }
}
console.log('Total: ' + checks + ' verificações aprovadas.');
