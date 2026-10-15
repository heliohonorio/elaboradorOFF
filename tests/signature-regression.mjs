import { chromium, webkit, devices } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

await mkdir('qa-output',{recursive:true});
function nearRatio(actual,expected,label){
 assert.ok(Number.isFinite(actual)&&actual>0,label+' sem imagem');
 const error=Math.abs(actual/expected-1);
 assert.ok(error<0.13,label+' distorceu assinatura: '+actual.toFixed(3)+' vs '+expected.toFixed(3));
}
for(const scenario of [
 {label:'desktop',engine:chromium,device:{viewport:{width:1366,height:900}}},
 {label:'iphone',engine:webkit,device:{...devices['iPhone 13']}}
]){
 const browser=await scenario.engine.launch({headless:true});
 const context=await browser.newContext({...scenario.device,acceptDownloads:true});
 const page=await context.newPage();
 try{
  await page.goto('file://'+resolve('index.html'),{waitUntil:'domcontentloaded'});
  await page.locator('#start-create').click();
  await page.evaluate(()=>{
   const relato=document.getElementById('relato');
   relato.value='1. Solicito a alteração do mês de férias de janeiro para julho.\\n2. Justifico o pedido por viagem familiar.';
   relato.dispatchEvent(new Event('input',{bubbles:true}));
   const c=document.createElement('canvas');c.width=440;c.height=180;
   const ctx=c.getContext('2d');
   ctx.strokeStyle='#ed0000';ctx.lineWidth=7;ctx.lineCap='round';ctx.lineJoin='round';
   ctx.beginPath();ctx.moveTo(13,162);
   ctx.bezierCurveTo(102,8,145,165,212,50);
   ctx.bezierCurveTo(278,12,348,145,427,27);ctx.stroke();
   handwrittenSignature=c.toDataURL('image/png');
   render();
  });
  await page.waitForFunction(()=>{
   const img=document.querySelector('.paper-last .signature-handwriting');
   return img?.naturalWidth>0 && img.style.getPropertyValue('width');
  });
  await page.addScriptTag({path:resolve('node_modules/jspdf/dist/jspdf.umd.min.js')});
  await page.addScriptTag({path:resolve('node_modules/html2canvas/dist/html2canvas.min.js')});
  const metrics=await page.evaluate(async()=>{
   function redRatio(c){
    const {width,height}=c,pixels=c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,width,height).data;
    let x0=width,y0=height,x1=-1,y1=-1;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
     const i=(y*width+x)*4;
     if(pixels[i]>140&&pixels[i+1]<95&&pixels[i+2]<95&&pixels[i+3]>90){
      x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
     }
    }
    return x1<x0?null:(x1-x0+1)/(y1-y0+1);
   }
   const img=document.querySelector('.paper-last .signature-handwriting');
   const original=document.createElement('canvas');
   original.width=img.naturalWidth;original.height=img.naturalHeight;
   original.getContext('2d').drawImage(img,0,0);
   const sourceRatio=redRatio(original);
   const ink=img.getBoundingClientRect();
   const line=img.parentElement.querySelector('.signature-signing-line').getBoundingClientRect();
   const area=img.parentElement.getBoundingClientRect();
   const previewRatio=ink.width/ink.height;
   const rendered=[];
   const oldCanvas=window.html2canvas;
   window.html2canvas=async function(...args){
    const captured=await oldCanvas(...args);
    rendered.push(redRatio(captured));
    return captured;
   };
   try{
    const pdf=await createDocumentPdf();
    return {sourceRatio,previewRatio,rendered,pdfSize:pdf.size,
      naturalRatio:img.naturalWidth/img.naturalHeight,
      inside:ink.left>=area.left-.8&&ink.right<=area.right+.8
        &&ink.top>=area.top-.8&&ink.bottom<line.top+.8,
      padWidth:document.getElementById('sign-pad').width,
      padHeight:document.getElementById('sign-pad').height
    };
   }finally{window.html2canvas=oldCanvas}
  });
  assert.equal(metrics.padWidth,960);
  assert.equal(metrics.padHeight,480,'área de desenho não foi ampliada');
  assert.equal(metrics.inside,true,'assinatura ultrapassou a linha/área reservada');
  nearRatio(metrics.previewRatio,metrics.naturalRatio,'prévia');
  assert.ok(metrics.sourceRatio,'não foi possível medir a assinatura original');
  assert.equal(metrics.rendered.length,1,'PDF não gerou exatamente uma folha');
  nearRatio(metrics.rendered[0],metrics.sourceRatio,'assinatura rasterizada no PDF');
  assert.ok(metrics.pdfSize>15000,'PDF gerado está vazio');
  console.log('PASSOU assinatura '+scenario.label,JSON.stringify(metrics));
 }finally{await context.close();await browser.close()}
}
