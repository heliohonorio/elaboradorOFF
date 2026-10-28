/* PM P-118 — edição restrita ao primeiro encaminhamento do superior. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const prefix='p118-supervisor-';
const baseFields=['re','grad','nome','opm','local','pedido','dias','inicio','tipo','ordem','boletim','motivo'];
const gradeOptions=['3º Sgt PM','2º Sgt PM','1º Sgt PM','Subten PM','2º Ten PM','1º Ten PM','Cap PM','Maj PM','Ten Cel PM','Cel PM'];
const fields=['decision','date','grade','war','re'];
let mode=false,signature=null,baseOriginal=null,applicantOriginal=null;
const safe=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const field=(id,label,control)=>'<div class="p118-field"><label for="'+prefix+id+'">'+label+'</label>'+control+'</div>';
const input=(id,type,max,placeholder='')=>'<input id="'+prefix+id+'" type="'+type+'"'+(max?' maxlength="'+max+'"':'')+
 (placeholder?' placeholder="'+safe(placeholder)+'"':'')+(type==='text'?' autocomplete="off"':'')+'>';
function setup(){
 const wrapper=document.createElement('fieldset');
 wrapper.id='p118-supervisor-fields';wrapper.hidden=true;
 wrapper.innerHTML='<legend>Encaminhamento 1 — Superior imediato</legend>'+
 '<p class="hint">Preencha apenas o primeiro encaminhamento. Os dados do policial, sua assinatura e os demais campos do PM P-118 permanecem sem edição.</p>'+
 field('decision','Parecer *','<select id="'+prefix+'decision"><option value="">Aguardando decisão</option><option value="sim">Pela concessão / autorização</option><option value="nao">Pela não concessão / autorização</option></select>')+
 field('date','Data *',input('date','date'))+
 field('grade','Posto ou graduação *','<select id="'+prefix+'grade"><option value="">Selecione...</option>'+gradeOptions.map(g=>'<option>'+g+'</option>').join('')+'</select>')+
 field('war','Nome de guerra *',input('war','text',40,'Ex.: FILHO'))+
 field('re','RE - DC *',input('re','text',8,'000000-0'))+
 '<div class="p118-supervisor-sign"><label>Assinatura do superior imediato *</label><button type="button" class="btn alt" id="p118-supervisor-sign">✍ Assinar encaminhamento 1</button>'+
 '<p class="hint" id="p118-supervisor-sign-help">A assinatura será aplicada sobre a identificação do superior no primeiro encaminhamento, sem alterar a assinatura do solicitante.</p></div>';
 $('p118-form').querySelector('.actions').before(wrapper);
 const first=$('p118-paper').querySelector('.p118-approvals table');
 const decision=first.rows[1].cells[0],data=first.rows[2].cells[0],signed=first.rows[2].cells[1];
 decision.querySelectorAll('.p118-check').forEach(box=>box.classList.add('p118-first-check'));
 const dateOut=document.createElement('span');dateOut.id='p118-supervisor-out-date';dateOut.className='p118-supervisor-value';data.append(dateOut);
 signed.classList.add('p118-first-sign-cell');
 const stamp=document.createElement('div');stamp.className='p118-first-signature';stamp.id='p118-first-signature';
 stamp.innerHTML='<span id="p118-supervisor-out-identity" class="p118-supervisor-identity"></span><img id="p118-supervisor-ink" alt="Assinatura do superior imediato" hidden>';
 signed.append(stamp);
 for(const id of fields){
  const control=$(prefix+id);
  control.addEventListener('input',()=>{
   if(!mode||signature)return;
   if(id==='war')control.value=control.value.toLocaleUpperCase('pt-BR');
   if(id==='re'){
    const digits=control.value.replace(/\D/g,'').slice(0,7);
    control.value=digits.length>6?digits.slice(0,6)+'-'+digits.slice(6):digits;
   }
   render();
  });
  control.addEventListener('change',render);
 }
 $('p118-supervisor-sign').addEventListener('click',()=>{
  if(!mode)return;
  if(signature){
   if(!confirm('Refazer assinatura? A assinatura anterior do superior será removida e seus campos serão liberados para correção.'))return;
   signature=null;render();
   return;
  }
  if(!valid(false))return;
  window.openP118SupervisorSignature();
 });
 render();
}
const text=id=>($(prefix+id)?.value||'').trim();
function valid(report=true){
 if(!mode)return false;
 const missing=fields.find(id=>!text(id));
 if(missing){
  if(report){$('p118-status').textContent='Preencha o parecer, data, posto/graduação, nome de guerra e RE do superior.';$(prefix+missing).focus()}
  return false;
 }
 if(!gradeOptions.includes(text('grade'))||!/^\d{6}-\d$/.test(text('re'))){
  if(report)$('p118-status').textContent='Confira a graduação (3º Sgt PM ou superior) e o RE no formato 000000-0.';
  return false;
 }
 return true;
}
function render(){
 if(!$('p118-supervisor-fields'))return;
 const table=$('p118-paper').querySelector('.p118-approvals table');
 const checks=table.rows[1].cells[0].querySelectorAll('.p118-first-check');
 checks[0].textContent=mode&&text('decision')==='sim'?'X':'';
 checks[1].textContent=mode&&text('decision')==='nao'?'X':'';
 const d=text('date'),parts=d.split('-');
 $('p118-supervisor-out-date').textContent=mode&&d?parts[2]+'/'+parts[1]+'/'+parts[0].slice(-2):'';
 const identity=$('p118-supervisor-out-identity');
 identity.textContent=mode?[text('grade'),text('war')].filter(Boolean).join(' ') +(text('re')?'\nRE '+text('re'):''):'';
 const ink=$('p118-supervisor-ink');ink.hidden=!mode||!signature;
 if(mode&&signature)ink.src=signature;else ink.removeAttribute('src');
 for(const id of fields)$(prefix+id).disabled=!!signature;
 const signButton=$('p118-supervisor-sign');
 signButton.textContent=signature?'↺ Refazer assinatura do superior':'✍ Assinar encaminhamento 1';
 $('p118-supervisor-sign-help').textContent=signature?
 'Encaminhamento assinado. Para corrigir seus dados, refaça somente a assinatura do superior. O pedido original permanece intacto.':
 'A assinatura ficará sobre a graduação, o nome de guerra e o RE no primeiro encaminhamento.';
 $('p118-export-docx').hidden=mode;
 $('p118-export-open').textContent=mode?'Salvar/compartilhar PDF':'Salvar/compartilhar arquivo';
 $('p118-export-open').disabled=mode&&!signature;
 $('p118-print').disabled=mode&&!signature;
 $('p118-sign').hidden=mode;
 $('p118-clear').hidden=mode;
}
function applySignature(png){
 if(!mode||signature||!valid(true))return false;
 signature=png;render();
 $('p118-status').textContent='Encaminhamento 1 assinado. O documento está pronto para salvar ou compartilhar em PDF.';
 return true;
}
function resetApplicantVisibility(){
 const form=$('p118-form');
 form.classList.toggle('p118-review-mode',mode);
 for(const key of baseFields){
  const control=$('p118-'+key);
  control.disabled=mode;
 }
 $('p118-supervisor-fields').hidden=!mode;
}
function restore(data){
 if(!data||data.kind!=='elaboradoroff-p118'||data.version!==1||!data.base||typeof data.base!=='object')throw Error('Word P-118 não reconhecido.');
 if(typeof data.signature!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data.signature))throw Error('Este P-118 não possui assinatura do policial. Solicite uma nova via assinada.');
 clear();
 for(const key of baseFields){
  const control=$('p118-'+key);
  if(typeof data.base[key]!=='string')throw Error('O P-118 recebido está incompleto.');
  control.value=data.base[key];
 }
 mode=true;
 baseOriginal=JSON.stringify(Object.fromEntries(baseFields.map(key=>[key,$('p118-'+key).value])));
 applicantOriginal=data.signature;
 resetApplicantVisibility();render();
 return applicantOriginal;
}
function snapshot(applicantSignature){
 const base=Object.fromEntries(baseFields.map(key=>[key,$('p118-'+key).value]));
 return {kind:'elaboradoroff-p118',version:1,base,responsible:{},signature:applicantSignature||null};
}
function clear(){
 mode=false;signature=null;baseOriginal=null;applicantOriginal=null;
 for(const id of fields)$(prefix+id).value='';
 resetApplicantVisibility();
 render();
}
function isSupervisorMode(){return mode}
function isSigned(){return !!signature}
function isApplicantUnchanged(){
 return !mode||(JSON.stringify(Object.fromEntries(baseFields.map(key=>[key,$('p118-'+key).value])))===baseOriginal);
}
function readyForPdf(){
 if(!mode)return true;
 if(!signature){$('p118-status').textContent='O superior precisa assinar o Encaminhamento 1 antes de finalizar.';return false}
 if(!isApplicantUnchanged()){$('p118-status').textContent='Os dados originais do solicitante não podem ser alterados. Solicite um novo documento.';return false}
 return true;
}
const decodeBase64=raw=>{
 const decoded=atob(raw.replace(/\s+/g,''));const bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0));
 return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
};
async function readWord(file,loader){
 const bytes=new Uint8Array(await file.arrayBuffer());
 let xml=null;
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),decoder=new TextDecoder();
 for(let i=0;i+30<bytes.length;){
  if(view.getUint32(i,true)!==0x04034b50)break;
  const method=view.getUint16(i+8,true),compressed=view.getUint32(i+18,true),
   nameLength=view.getUint16(i+26,true),extraLength=view.getUint16(i+28,true),
   path=decoder.decode(bytes.subarray(i+30,i+30+nameLength)),start=i+30+nameLength+extraLength;
  if(path==='customXml/item1.xml'&&method===0){xml=decoder.decode(bytes.subarray(start,start+compressed));break}
  if(!compressed||start+compressed>bytes.length)break;
  i=start+compressed;
 }
 if(!xml){
  await loader('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',()=>!!window.JSZip);
  const archive=await window.JSZip.loadAsync(bytes),item=archive.file('customXml/item1.xml');
  if(!item)return null;
  xml=await item.async('string');
 }
 const doc=new DOMParser().parseFromString(xml,'text/xml');
 if(doc.querySelector('parsererror')||doc.documentElement.localName!=='p118'||doc.documentElement.namespaceURI!=='urn:elaboradoroff:p118')throw Error('Dados de edição do P-118 inválidos.');
 if(doc.documentElement.textContent.length>2000000)throw Error('Arquivo de edição muito grande.');
 const result=JSON.parse(decodeBase64(doc.documentElement.textContent));
 if(result?.kind!=='elaboradoroff-p118'||result?.version!==1)throw Error('Arquivo P-118 incompatível com esta versão.');
 return result;
}
window.P118Workflow={setup,render,restore,snapshot,clear,valid,isSupervisorMode,isSigned,isApplicantUnchanged,readyForPdf,applySignature,readWord};
})();