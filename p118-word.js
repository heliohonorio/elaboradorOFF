/* Exportador PM P-118: DOCX editável sem depender de serviços externos.
   Conversão da mesma estrutura de tabelas da prévia para WordprocessingML. */
(function(){
'use strict';
const NS='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const TWIPS_MM=1440/25.4;
const esc=v=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const mm=v=>Math.round(v*TWIPS_MM);
const WIDTH=mm(180.5);
const paraProps='<w:pPr><w:spacing w:before="0" w:after="0" w:line="210" w:lineRule="auto"/></w:pPr>';
function run(text,opts={}){
 const pr='<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial"/><w:sz w:val="'+(opts.size||13)+'"/><w:szCs w:val="'+(opts.size||13)+'"/>'+(opts.bold?'<w:b/>':'')+'</w:rPr>';
 return String(text).split('\n').map((part,i)=>'<w:r>'+pr+(i?'<w:br/>':'')+'<w:t xml:space="preserve">'+esc(part)+'</w:t></w:r>').join('');
}
function paragraph(inner,props=''){
 return '<w:p>'+paraProps.replace('<w:pPr>','<w:pPr>'+props)+inner+'</w:p>';
}
function encodeNode(node,size=13,bold=false){
 if(node.nodeType===3)return run(node.nodeValue,size?{size,bold}:{bold});
 if(node.nodeType!==1)return '';
 const tag=node.tagName;
 if(tag==='BR')return '<w:r><w:br/></w:r>';
 if(node.classList.contains('p118-check')){
  const checked=node.textContent.trim()==='X';
  return run(checked?'☒':'☐',{size:13,bold:false});
 }
 const isValue=node.classList.contains('p118-value');
 const nextSize=isValue?22:size;
 const nextBold=bold||node.classList.contains('p118-section')||tag==='B'||tag==='STRONG';
 if(tag==='IMG'){
  if(node.id==='p118-ink'&&node.getAttribute('src')&&!node.hidden)return imageRun('rId2',43,13,2,'Assinatura');
  return '';
 }
 return [...node.childNodes].map(child=>encodeNode(child,nextSize,nextBold)).join('');
}
function contents(cell){
 const size=cell.classList.contains('p118-section')?22:13;
 let xml=[...cell.childNodes].map(child=>encodeNode(child,size,cell.classList.contains('p118-section'))).join('');
 if(!xml)xml=run('',{size});
 const alignment=cell.classList.contains('p118-section')?'<w:jc w:val="center"/>':'';
 return paragraph(xml,alignment);
}
function cellBorders(){
 return '<w:tcBorders>'+['top','left','bottom','right'].map(side=>'<w:'+side+' w:val="single" w:sz="5" w:color="000000"/>').join('')+'</w:tcBorders>';
}
function cellXml(content,width,options={}){
 const fill=options.shade?'<w:shd w:val="clear" w:color="auto" w:fill="C4C4C4"/>':'';
 const borders=options.noBorder?'':cellBorders();
 const margin=options.noBorder?0:mm(.7);
 const margins='<w:tcMar>'+['top','left','bottom','right'].map(side=>'<w:'+side+' w:w="'+margin+'" w:type="dxa"/>').join('')+'</w:tcMar>';
 const span=options.span>1?'<w:gridSpan w:val="'+options.span+'"/>':'';
 const merge=options.merge?'<w:vMerge w:val="'+options.merge+'"/>':'';
 return '<w:tc><w:tcPr><w:tcW w:w="'+width+'" w:type="dxa"/>'+span+merge+fill+borders+margins+'<w:vAlign w:val="top"/></w:tcPr>'+content+'</w:tc>';
}
function widths(table,cols,total){
 const defined=[...table.querySelectorAll(':scope > colgroup > col')].map(n=>parseFloat(n.style.width));
 if(defined.length===cols&&defined.every(n=>Number.isFinite(n)&&n>0)){
  const sum=defined.reduce((a,b)=>a+b,0);
  const w=defined.map(n=>Math.round(total*n/sum));w[cols-1]+=total-w.reduce((a,b)=>a+b,0);return w;
 }
 const w=Array.from({length:cols},()=>Math.floor(total/cols));w[w.length-1]+=total-w.reduce((a,b)=>a+b,0);return w;
}
function tableXml(table,total=WIDTH,options={}){
 const rows=[...table.rows];
 const cols=Math.max(1,...rows.map(tr=>[...tr.cells].reduce((n,c)=>n+c.colSpan,0)));
 const colWidths=widths(table,cols,total);
 const grid='<w:tblGrid>'+colWidths.map(w=>'<w:gridCol w:w="'+w+'"/>').join('')+'</w:tblGrid>';
 const outer=options.noBorder?'nil':'single';
 const border=options.noBorder?0:10;
 const tblProps='<w:tblPr><w:tblW w:w="'+total+'" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>'+['top','left','bottom','right'].map(x=>'<w:'+x+' w:val="'+outer+'" w:sz="'+border+'" w:color="000000"/>').join('')+'</w:tblBorders><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr>';
 const active=Array(cols).fill(null);
 const output=[];
 for(const tr of rows){
  let at=0,index=0,parts=[];
  const cells=[...tr.cells];
  while(at<cols){
   const pending=active[at];
   if(pending){
    const width=colWidths.slice(at,at+pending.span).reduce((a,b)=>a+b,0);
    parts.push(cellXml('<w:p/>',width,{span:pending.span,merge:'continue'}));
    for(let j=at;j<at+pending.span;j++){
     if(active[j]){active[j].remaining--;if(active[j].remaining===0)active[j]=null}
    }
    at+=pending.span;
    continue;
   }
   const cell=cells[index++];
   if(!cell)throw Error('Tabela do documento contém colunas incompatíveis.');
   const span=cell.colSpan||1,width=colWidths.slice(at,at+span).reduce((a,b)=>a+b,0);
   const rowSpan=cell.rowSpan||1;
   parts.push(cellXml(contents(cell),width,{shade:cell.classList.contains('p118-section'),span,merge:rowSpan>1?'restart':null}));
   if(rowSpan>1){
    const merged={remaining:rowSpan-1,span};
    for(let j=at;j<at+span;j++)active[j]=merged;
   }
   at+=span;
  }
  // A altura é calculada a partir da tabela A4 original, sem incluir o zoom da prévia.
  const rowHeight=Math.max(1,Math.round(tr.offsetHeight*15));
  output.push('<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="'+rowHeight+'" w:hRule="atLeast"/></w:trPr>'+parts.join('')+'</w:tr>');
 }
 return '<w:tbl>'+tblProps+grid+output.join('')+'</w:tbl>';
}
function imageRun(rel,widthMm,heightMm,id,description){
 const cx=Math.round(widthMm*36000),cy=Math.round(heightMm*36000);
 return '<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="'+cx+'" cy="'+cy+'"/><wp:docPr id="'+id+'" name="'+esc(description)+'"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="'+id+'" name="'+esc(description)+'"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="'+rel+'"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="'+cx+'" cy="'+cy+'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
}
function spacerXml(){return '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="55" w:lineRule="exact"/></w:pPr><w:r><w:rPr><w:sz w:val="2"/></w:rPr><w:t></w:t></w:r></w:p>'}
function headingXml(){
 const half=WIDTH/2|0;
 const logo=imageRun('rId1',18,19,1,'Brasão do Estado de São Paulo');
 const logoCell=paragraph(logo+run('  POLÍCIA MILITAR DO\n  ESTADO DE SÃO PAULO',{size:20,bold:true}),'<w:jc w:val="center"/>');
 const titleCell=paragraph(run('AFASTAMENTO',{size:22,bold:true}),'<w:jc w:val="center"/>');
 const first=cellXml(logoCell,half);
 const second=cellXml(titleCell,WIDTH-half);
 return '<w:tbl><w:tblPr><w:tblW w:w="'+WIDTH+'" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="'+half+'"/><w:gridCol w:w="'+(WIDTH-half)+'"/></w:tblGrid><w:tr><w:trPr><w:trHeight w:val="'+mm(22)+'" w:hRule="atLeast"/><w:cantSplit/></w:trPr>'+first+second+'</w:tr></w:tbl>';
}
function approvalsXml(root){
 const original=[...root.querySelectorAll(':scope > table')];
 if(original.length!==4)throw Error('Os quadros de autorização não estão completos.');
 const left=Math.floor((WIDTH-mm(1.5))/2),right=left,space=WIDTH-left-right;
 let rows='';
 for(let i=0;i<4;i+=2){
  const cells=[original[i],original[i+1]].map((table,j)=>{
   const xml=tableXml(table,j===0?left:right);
   // Parágrafo obrigatório após tabela aninhada.
   return cellXml(xml+'<w:p/>',j===0?left:right,{noBorder:true});
  });
  rows+='<w:tr><w:trPr><w:trHeight w:val="'+mm(24)+'" w:hRule="atLeast"/><w:cantSplit/></w:trPr>'+cells.join('')+'</w:tr>';
 }
 return '<w:tbl><w:tblPr><w:tblW w:w="'+WIDTH+'" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellSpacing w:w="'+space+'" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="'+left+'"/><w:gridCol w:w="'+right+'"/></w:tblGrid>'+rows+'</w:tbl>';
}
function decodeDataUrl(url){
 const match=/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(url||'');
 if(!match)throw Error('Não foi possível inserir a imagem no Word.');
 const binary=atob(match[1]),array=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)array[i]=binary.charCodeAt(i);
 return array;
}
const toBytes=s=>new TextEncoder().encode(s);
const crcTable=Array.from({length:256},(_,n)=>{
 let x=n;for(let i=0;i<8;i++)x=x&1?0xedb88320^(x>>>1):x>>>1;return x>>>0;
});
function crc32(bytes){let value=0xffffffff;for(const b of bytes)value=crcTable[(value^b)&255]^(value>>>8);return (value^0xffffffff)>>>0}
function le16(v){return [v&255,(v>>>8)&255]}
function le32(v){return [v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255]}
function zip(files){
 const local=[],central=[];let offset=0;
 for(const [name,data] of files){
  const filename=toBytes(name),bytes=typeof data==='string'?toBytes(data):data,crc=crc32(bytes);
  const head=Uint8Array.from([...le32(0x04034b50),...le16(20),...le16(0x0800),...le16(0),...le16(0),...le16(0),...le32(crc),...le32(bytes.length),...le32(bytes.length),...le16(filename.length),...le16(0)]);
  local.push(head,filename,bytes);
  const center=Uint8Array.from([...le32(0x02014b50),...le16(20),...le16(20),...le16(0x0800),...le16(0),...le16(0),...le16(0),...le32(crc),...le32(bytes.length),...le32(bytes.length),...le16(filename.length),...le16(0),...le16(0),...le16(0),...le16(0),...le32(0),...le32(offset)]);
  central.push(center,filename);
  offset+=head.length+filename.length+bytes.length;
 }
 const centralLength=central.reduce((sum,b)=>sum+b.length,0);
 const ending=Uint8Array.from([...le32(0x06054b50),...le16(0),...le16(0),...le16(files.length),...le16(files.length),...le32(centralLength),...le32(offset),...le16(0)]);
 const total=offset+centralLength+ending.length,result=new Uint8Array(total);
 let pos=0;for(const part of [...local,...central,ending]){result.set(part,pos);pos+=part.length}
 return result;
}
/* A representação impressa usa uma página ancorada no A4.
   Os dados para o editor do superior continuam em customXml/item1.xml. */
function pagePicture(){
 const width=210*36000,height=297*36000;
 return '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr><w:r><w:drawing>'+
  '<wp:anchor xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="0" locked="1" layoutInCell="1" allowOverlap="1">'+
  '<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV>'+
  '<wp:extent cx="'+width+'" cy="'+height+'"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>'+
  '<wp:docPr id="1" name="PM P-118 - Folha A4" descr="Formulário PM P-118. Para autorizar, abra este Word em Autorizar DS/LP no ElaboradorOFF."/>'+
  '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>'+
  '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'+
  '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="PM P-118"/><pic:cNvPicPr/></pic:nvPicPr>'+
  '<pic:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'+
  '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="'+width+'" cy="'+height+'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'+
  '</pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p>';
}
function create(snapshot,record){
 const page=decodeDataUrl(snapshot);
 if(!record||record.kind!=='elaboradoroff-p118'||record.version!==1||!record.base)throw Error('Os dados do P-118 estão incompletos.');
 const document='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="'+NS+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'+
  '<w:body>'+pagePicture()+'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>';
 const styles='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="'+NS+'"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>';
 const rels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/page1.png"/>'+
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'+
  '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../customXml/item1.xml"/></Relationships>';
 const types='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>'+
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'+
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>';
 const payload=JSON.stringify(record),raw=toBytes(payload);let binary='';
 for(let i=0;i<raw.length;i+=16384)binary+=String.fromCharCode(...raw.subarray(i,i+16384));
 const manifest='<?xml version="1.0" encoding="UTF-8"?><p118 xmlns="urn:elaboradoroff:p118" version="1">'+btoa(binary)+'</p118>';
 const files=[
  ['[Content_Types].xml',types],
  ['_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
  ['word/document.xml',document],['word/styles.xml',styles],['word/_rels/document.xml.rels',rels],
  ['word/media/page1.png',page],['customXml/item1.xml',manifest]
 ];
 return new Blob([zip(files)],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}
window.createP118WordDocument=create;
})();
