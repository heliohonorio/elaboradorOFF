import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('qa-output',{recursive:true});
for(const engine of [chromium,webkit]){
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.route('**/functions/v1/contador-visitas',r=>r.fulfill({status:200,contentType:'application/json',body:'{"total":1}',headers:{'access-control-allow-origin':'*'}}));
  await page.goto('file://'+resolve('index.html'));
  await page.addScriptTag({path:resolve('node_modules/jspdf/dist/jspdf.umd.min.js')});
  await page.addScriptTag({path:resolve('node_modules/html2canvas/dist/html2canvas.min.js')});
  await page.locator('#start-create').click();
  await page.locator('[data-document-type="afastamento"]').click();
  for(const [w,h] of [[514,504],[720,160],[160,480]]){
   const result=await page.evaluate(async({w,h})=>{
    const make=(width,height,color)=>{
     const c=document.createElement('canvas');c.width=width;c.height=height;
     const ctx=c.getContext('2d');ctx.strokeStyle=color;ctx.lineWidth=3;
     ctx.strokeRect(8,8,width-16,height-16);
     ctx.beginPath();ctx.moveTo(8,height-8);ctx.quadraticCurveTo(width/2,8,width-8,height/2);ctx.stroke();
     return c.toDataURL();
    };
    const applicant=make(w,h,'#d000d0'),supervisor=make(w,h,'#00bcbc');
    const count=(canvas,cyan,pageImage=false)=>{
     const d=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
     let left=canvas.width,right=-1,top=canvas.height,bottom=-1;
     for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
      // Medir somente a região da assinatura: o brasão também contém essas cores.
      if(pageImage&&(cyan?y<canvas.height*.7:x<canvas.width*.6||y>canvas.height*.25))continue;
      const i=(y*canvas.width+x)*4;
      if(d[i+3]>90&&(cyan?d[i]<90&&d[i+1]>110&&d[i+2]>110:d[i]>110&&d[i+1]<90&&d[i+2]>110)){
       left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
      }
     }
     return right<left?null:(right-left+1)/(bottom-top+1);
    };
    const scan=async(uri,cyan=false)=>{
     const img=new Image();img.src=uri;await img.decode();
     const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;
     c.getContext('2d').drawImage(img,0,0);return count(c,cyan);
    };
    P118Workflow.clear();
    for(const [key,value] of Object.entries({re:'123456-7',grad:'Sd PM',nome:'TESTE DE PROPORÇÃO',opm:'DL',local:'SÃO PAULO',pedido:'2026-10-30',dias:'1',inicio:'2026-11-01',tipo:'ds',ordem:'',boletim:'',motivo:'Teste de assinatura.'}))el('p118-'+key).value=value;
    p118Signature=applicant;renderP118();
    await el('p118-ink').decode();
    const originalStyle=el('p118-ink').getAttribute('style');
    const captured=[],old=window.html2canvas;
    window.html2canvas=async(...args)=>{
     const canvas=await old(...args);captured.push({applicant:count(canvas,false,true),supervisor:count(canvas,true,true)});
     return canvas;
    };
    try{
     const png=await createP118WordSnapshot();
     const word=createP118WordDocument(png,P118Workflow.snapshot(p118Signature));
     const data=await P118Workflow.readWord(word,()=>{throw Error('Word deveria ser legível sem fallback')});
     const rawUnchanged=data.signature===applicant;
     const firstPdf=await createP118Pdf();
     p118Signature=P118Workflow.restore(data);openP118();
     for(const [key,value] of Object.entries({decision:'sim',date:'2026-10-30',grade:'3º Sgt PM',war:'TESTE',re:'765432-1'}))el('p118-supervisor-'+key).value=value;
     P118Workflow.render();
     if(!P118Workflow.applySignature(supervisor))throw Error('Não aplicou assinatura do superior');
     const finalPdf=await createP118Pdf();
     const ink=el('p118-supervisor-ink'),cell=el('p118-first-signature').parentElement;
     const overlay={width:parseFloat(getComputedStyle(ink).width),cellWidth:parseFloat(getComputedStyle(cell).width),overflow:getComputedStyle(cell).overflow};
     return {expected:await scan(applicant),supervisorExpected:await scan(supervisor,true),captured,rawUnchanged,
      styleUnchanged:el('p118-ink').getAttribute('style')===originalStyle,
      sourceUnchanged:el('p118-ink').src===applicant,overlay,
      wordPng:png,finalPdf:Array.from(new Uint8Array(await finalPdf.arrayBuffer())),
      pdfSizes:[firstPdf.size,finalPdf.size]};
    }finally{window.html2canvas=old}
   },{w,h});
   console.log('MEDIDAS',engine.name(),w,h,JSON.stringify({expected:result.expected,captured:result.captured}));
   if(w===514){await writeFile('qa-output/p118-ratio-debug.png',Buffer.from(result.wordPng.split(',')[1],'base64'))}
   assert(result.rawUnchanged&&result.sourceUnchanged&&result.styleUnchanged,'Original e prévia preservados após exportar e reimportar');
   assert.equal(result.captured.length,3,'Word, PDF inicial e PDF autorizado renderizados');
   for(const capture of result.captured){
    assert(capture.applicant,'Tinta do solicitante presente');
    assert(Math.abs(capture.applicant/result.expected-1)<.06,'Assinatura do solicitante sem deformação: '+JSON.stringify({expected:result.expected,captured:result.captured}));
   }
   assert(Math.abs(result.captured[2].supervisor/result.supervisorExpected-1)<.06,'Assinatura do superior sem deformação');
   assert(result.overlay.width>result.overlay.cellWidth,'Área de sobreposição do superior preservada');
   assert.equal(result.overlay.overflow,'visible');
   assert(result.pdfSizes.every(size=>size>15000));
   if(w===514){
    await writeFile('qa-output/p118-ratio-'+engine.name()+'.png',Buffer.from(result.wordPng.split(',')[1],'base64'));
    await writeFile('qa-output/p118-ratio-'+engine.name()+'.pdf',Buffer.from(result.finalPdf));
   }
   console.log('PASSOU proporções P-118',engine.name(),w,h,JSON.stringify(result.captured));
  }
 }finally{await browser.close()}
}
