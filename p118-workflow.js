/* Edição local do formulário PM P-118 recebido em Word do ElaboradorOFF. */
(function(){
'use strict';
const prefix='p118-supervisor-';
const baseFields=['re','grad','nome','opm','local','pedido','dias','inicio','tipo','ordem','boletim','motivo'];
const extraFields=['sec-result','sec-obs','sec-re','sec-guerra','sec-data', ...[1,2,3,4].flatMap(i=>['decision-'+i,'date-'+i,'name-'+i])];
const $=id=>document.getElementById(id);
const field=(id,label,kind='text',limit=55)=>{
 let control;
 if(kind==='select'){
  control='<select id="'+prefix+id+'"><option value="">Aguardando decisão</option><option value="sim">Sim / favorável</option><option value="nao">Não / desfavorável</option></select>';
 }else if(kind==='textarea'){
  control='<textarea id="'+prefix+id+'" rows="2" maxlength="'+limit+'"></textarea>';
 }else{
  control='<input id="'+prefix+id+'" type="'+kind+'"'+(kind==='text'?' maxlength="'+limit+'"':'')+'>';
 }
 return '<div class="p118-field"><label for="'+prefix+id+'">'+label+'</label>'+control+'</div>';
};
function section(){
 const wrapper=document.createElement('fieldset');
 wrapper.id='p118-supervisor-fields';wrapper.hidden=true;
 wrapper.innerHTML='<legend>3. Secretaria / Superiores</legend>'+
 '<p class="hint">Complete somente os campos sob responsabilidade da Secretaria/P1 e dos superiores. A assinatura e o carimbo permanecem reservados para o responsável.</p>'+
 '<h3>Secretaria / P1</h3>'+field('sec-result','Faz jus ao afastamento?','select')+
 field('sec-obs','Observações','textarea',90)+
 '<div class="p118-pair">'+field('sec-re','RE - DC', 'text',12)+field('sec-guerra','Nome de guerra','text',40)+'</div>'+
 field('sec-data','Data','date')+
 [1,2,3,4].map(i=>'<h3>'+(i===4?'CMT / Diretor / Chefe':'Encaminhamento '+i)+'</h3>'+
 field('decision-'+i,i===4?'Autorização':'Parecer','select')+
 '<div class="p118-pair">'+field('date-'+i,'Data','date')+field('name-'+i,'Nome / função do responsável','text',40)+'</div>'
 ).join('');
 $('p118-form').querySelector('.actions').before(wrapper);
 extraFields.forEach(id=>$(prefix+id).addEventListener('input',()=>window.renderP118?.()));
 extraFields.forEach(id=>$(prefix+id).addEventListener('change',()=>window.renderP118?.()));
 const sec=$('p118-paper').querySelector('.p118-secret'),rows=sec.rows;
 rows[1].cells[1].appendChild(makeOutput('sec-obs'));
 for(const [idx,name] of ['sec-re','sec-guerra','sec-data'].entries())rows[2].cells[idx].appendChild(makeOutput(name));
 const approvalTables=[...$('p118-paper').querySelectorAll('.p118-approvals table')];
 approvalTables.forEach((table,index)=>{
  table.rows[1].cells[0].appendChild(makeOutput('approval-'+(index+1)));
  table.rows[2].cells[0].appendChild(makeOutput('date-'+(index+1)));
  table.rows[2].cells[1].appendChild(makeOutput('name-'+(index+1)));
 });
}
function makeOutput(id){
 const node=document.createElement('span');node.className='p118-supervisor-value';node.id='p118-supervisor-output-'+id;return node;
}
function localDate(value){if(!value)return '';const [y,m,d]=value.split('-');return [d,m,y?.slice(-2)].join('/')}
function text(name){return ($(prefix+name)?.value||'').trim()}
function render(){
 if(!$('p118-supervisor-fields'))return;
 const secret=$('p118-paper').querySelector('.p118-secret');
 const result=text('sec-result'),checks=secret.rows[1].cells[0].querySelectorAll('.p118-check');
 checks[0].textContent=result==='sim'?'X':'';
 checks[1].textContent=result==='nao'?'X':'';
 for(const id of ['sec-obs','sec-re','sec-guerra','sec-data']){
  $('p118-supervisor-output-'+id).textContent=id==='sec-data'?localDate(text(id)):text(id);
 }
 const approvals=[...$('p118-paper').querySelectorAll('.p118-approvals table')];
 approvals.forEach((table,index)=>{
  const i=index+1,decision=text('decision-'+i),boxes=table.rows[1].cells[0].querySelectorAll('.p118-check');
  boxes[0].textContent=decision==='sim'?'X':'';
  boxes[1].textContent=decision==='nao'?'X':'';
  $('p118-supervisor-output-approval-'+i).textContent='';
  $('p118-supervisor-output-date-'+i).textContent=localDate(text('date-'+i));
  $('p118-supervisor-output-name-'+i).textContent=text('name-'+i);
 });
}
function snapshot(signature){
 const base={};for(const id of baseFields)base[id]=$('p118-'+id).value;
 const responsible={};for(const id of extraFields)responsible[id]=text(id);
 return {kind:'elaboradoroff-p118',version:1,base,responsible,signature:signature||null};
}
function restore(data){
 if(!data||data.kind!=='elaboradoroff-p118'||data.version!==1||!data.base||!data.responsible)throw Error('Este Word não contém um formulário P-118 compatível.');
 for(const id of baseFields){
  const field=$('p118-'+id),value=data.base[id];
  if(typeof value==='string')field.value=value.slice(0,field.maxLength>0?field.maxLength:500);
 }
 for(const id of extraFields){
  const field=$(prefix+id),value=data.responsible[id];
  if(typeof value==='string')field.value=value.slice(0,field.maxLength>0?field.maxLength:500);
 }
 $('p118-supervisor-fields').hidden=false;
 render();
 return typeof data.signature==='string'&&/^data:image\/png;base64,/.test(data.signature)?data.signature:null;
}
function clear(){
 for(const id of extraFields)$(prefix+id).value='';
 $('p118-supervisor-fields').hidden=true;render();
}
const fromBase64=raw=>{
 const decoded=atob(raw.replace(/\s+/g,''));const bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0));
 return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
};
async function readWord(file,loader){
 // Generated Word files have uncompressed manifest; JSZip also reads Word files re-saved by Office.
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
  const archive=await window.JSZip.loadAsync(bytes);
  const item=archive.file('customXml/item1.xml');
  if(!item)return null;
  xml=await item.async('string');
 }
 const doc=new DOMParser().parseFromString(xml,'text/xml');
 if(doc.querySelector('parsererror')||doc.documentElement.localName!=='p118'||doc.documentElement.namespaceURI!=='urn:elaboradoroff:p118')throw Error('Dados de edição do P-118 inválidos.');
 const raw=doc.documentElement.textContent;
 if(raw.length>2000000)throw Error('Arquivo de edição muito grande.');
 const result=JSON.parse(fromBase64(raw));
 if(result?.kind!=='elaboradoroff-p118'||result?.version!==1)throw Error('Arquivo P-118 incompatível com esta versão.');
 return result;
}
window.P118Workflow={setup:section,render,snapshot,restore,clear,readWord};
})();