// ============ App Prestação de Contas (iPhone / PWA) ============
const VERSAO = "3.1.1 — 22/07/2026";
const $ = id => document.getElementById(id);
document.getElementById("ver").textContent = "v" + VERSAO.split(" ")[0];
document.getElementById("footer").innerHTML =
  "Desenvolvido por <b>Leandro de Oliveira Santos</b> · v" + VERSAO;

let RECEIPTS = [];   // {img(dataURL), data, valor, categoria, justificativa, texto}
let KM = [];

// ---------- persistência dos dados pessoais (fica no aparelho) ----------
const PERSIST = ["nome","cpf","depto","banco","agencia","conta","pix","assinatura_nome","km_taxa"];
function carregarDados(){
  PERSIST.forEach(k=>{ const v=localStorage.getItem("pc_"+k); if(v!=null && $(k)) $(k).value=v; });
}
function salvarDados(){
  PERSIST.forEach(k=>{ if($(k)) localStorage.setItem("pc_"+k, $(k).value); });
}
PERSIST.forEach(k=>{ const el=$(k); if(el) el.addEventListener("change", salvarDados); });
carregarDados();

// ---------- helpers ----------
function brl(v){ return "R$ " + (Number(v)||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function parseMoney(s){ if(typeof s==="number")return s; s=(s||"").toString().replace("R$","").trim();
  if(s.includes(","))s=s.replace(/\./g,"").replace(",","."); return parseFloat(s)||0; }
function isoToBR(v){ if(!v)return ""; const p=v.split("-"); return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:v; }
const CATS=["Passagem","Locomocao","Refeicao","Hospedagem","Outros","Anexo"];
const CAT_LABEL={Passagem:"Passagem",Locomocao:"Locomoção",Refeicao:"Refeição",Hospedagem:"Hospedagem",Outros:"Outros",Anexo:"📎 Só anexo"};

// ---------- layout normal / km ----------
document.querySelectorAll('input[name=layout]').forEach(r=> r.onchange = toggleLayout);
function toggleLayout(){
  const km = document.querySelector('input[name=layout]:checked').value==="km";
  document.querySelectorAll('.km-only').forEach(e=> e.classList.toggle('hide', !km));
}

// ---------- câmera + OCR ----------
$("btnFoto").onclick = ()=> $("file").click();
$("file").onchange = e => { const fs=[...e.target.files]; e.target.value=""; if(fs.length) lerNotas(fs); };

if(window.pdfjsLib){
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
}

async function redimensionar(file){
  const img = await createImageBitmap(file);
  const max=1500, m=Math.max(img.width,img.height), f=m>max?max/m:1;
  const c=document.createElement("canvas"); c.width=Math.round(img.width*f); c.height=Math.round(img.height*f);
  c.getContext("2d").drawImage(img,0,0,c.width,c.height);
  return c;
}

// extrai as imagens JPEG embutidas no PDF (caso do scanner do iPhone) — sem render
async function extrairImagensEmbutidas(bytes){
  const pdf = await PDFLib.PDFDocument.load(bytes, {ignoreEncryption:true});
  const imgs=[];
  for(const [ref,obj] of pdf.context.enumerateIndirectObjects()){
    const d = obj && obj.dict; if(!d || !obj.contents) continue;
    const sub = d.get(PDFLib.PDFName.of("Subtype"));
    const filt = d.get(PDFLib.PDFName.of("Filter"));
    if(sub && sub.toString()==="/Image" && filt && filt.toString().includes("DCTDecode")){
      imgs.push(obj.contents);
    }
  }
  return imgs;
}

// PDF (ex.: scanner do iPhone) -> uma imagem por página
async function pdfParaCanvases(file){
  const bytes = new Uint8Array(await file.arrayBuffer());
  // 1) caminho principal: extrair as fotos embutidas (scanner). Rápido e robusto.
  try{
    const imgs = await extrairImagensEmbutidas(bytes);
    if(imgs.length){
      const out=[];
      for(const b of imgs){ try{ out.push(await redimensionar(new Blob([b],{type:"image/jpeg"}))); }catch(e){} }
      if(out.length) return out;
    }
  }catch(e){}
  // 2) reserva: PDF de texto (sem imagem) -> renderiza via pdf.js
  const pdf = await pdfjsLib.getDocument({data:bytes}).promise;
  const out=[];
  for(let p=1;p<=pdf.numPages;p++){
    const page = await pdf.getPage(p);
    const base = page.getViewport({scale:1});
    const scale = Math.min(1600/Math.max(base.width,base.height), 3);
    const vp = page.getViewport({scale});
    const c=document.createElement("canvas"); c.width=Math.round(vp.width); c.height=Math.round(vp.height);
    await page.render({canvasContext:c.getContext("2d"), viewport:vp}).promise;
    out.push(c);
  }
  return out;
}

async function lerNotas(files){
  // expande arquivos em imagens (cada página de PDF vira uma nota)
  $("status").innerHTML='<span class="spin"></span> Preparando…';
  let itens=[];
  for(const f of files){
    if(f.type==="application/pdf" || /\.pdf$/i.test(f.name)){
      try{ (await pdfParaCanvases(f)).forEach(c=>itens.push(c)); }catch(e){}
    }else{
      try{ itens.push(await redimensionar(f)); }catch(e){}
    }
  }
  if(!itens.length){ $("status").innerHTML='<span class="err">Nenhuma imagem encontrada nesse arquivo.</span>'; return; }

  const worker = await Tesseract.createWorker('por');
  for(let i=0;i<itens.length;i++){
    $("status").innerHTML = `<span class="spin"></span> Lendo nota ${i+1} de ${itens.length}…`
      + (i===0 ? " (a 1ª baixa o motor, aguarde)" : "");
    try{
      const canvas = itens[i];
      const img = canvas.toDataURL("image/jpeg", 0.8);
      const { data } = await worker.recognize(canvas);
      const ex = window.PC.extrair(data.text || "");
      RECEIPTS.push({ img, data: ex.data||"", valor: ex.valor||0,
                      categoria: ex.categoria, justificativa: "", texto: data.text });
      render();
    }catch(err){
      RECEIPTS.push({ img:"", data:"", valor:0, categoria:"Outros", justificativa:"", texto:"", erro:String(err) });
      render();
    }
  }
  await worker.terminate();
  $("status").innerHTML = `<span class="ok">✓ ${itens.length} nota(s) lida(s).</span>`;
}

// ---------- tabela de revisão ----------
function render(){
  const box = $("notas"); box.innerHTML="";
  RECEIPTS.forEach((r,i)=>{
    const isAnexo = r.categoria==="Anexo";
    const opts = CATS.map(c=>`<option value="${c}" ${c===r.categoria?"selected":""}>${CAT_LABEL[c]}</option>`).join("");
    const el = document.createElement("div"); el.className="nota";
    el.innerHTML = `
      ${r.img?`<img src="${r.img}">`:`<div style="width:52px"></div>`}
      <div class="campos">
        <input placeholder="dd/mm/aaaa" value="${r.data||""}" onchange="RECEIPTS[${i}].data=this.value">
        <select onchange="setCat(${i},this.value)">${opts}</select>
        <input inputmode="decimal" ${isAnexo?"disabled placeholder='—'":`value="${(Number(r.valor)||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}"`} onchange="RECEIPTS[${i}].valor=parseMoney(this.value);recalc()">
        <input class="fw" placeholder="${isAnexo?'ex: mapa da rota / pedágio':'justificativa'}" value="${r.justificativa||""}" onchange="RECEIPTS[${i}].justificativa=this.value">
      </div>
      <button class="btn-x" onclick="delNota(${i})">✕</button>`;
    box.appendChild(el);
  });
  $("reviewCard").classList.toggle("hide", RECEIPTS.length===0);
  $("btnGerar").disabled = RECEIPTS.length===0;
  recalc();
}
function setCat(i,v){ RECEIPTS[i].categoria=v; render(); }
function delNota(i){ RECEIPTS.splice(i,1); render(); }
function recalc(){
  const t = RECEIPTS.reduce((s,r)=> s + (r.categoria==="Anexo"?0:(Number(r.valor)||0)), 0);
  $("total").textContent = brl(t);
}

// ---------- KM ----------
function addKm(){ KM.push({data:"",ki:"",kf:"",just:""}); renderKm(); }
function renderKm(){
  const tb = $("kmTable").querySelector("tbody"); tb.innerHTML="";
  const taxa = parseMoney($("km_taxa").value)||1.9;
  KM.forEach((k,i)=>{
    const rod = (parseMoney(k.kf)-parseMoney(k.ki))||0;
    const tr=document.createElement("tr");
    tr.innerHTML=`
      <td><input placeholder="dd/mm" value="${k.data||""}" onchange="KM[${i}].data=this.value"></td>
      <td><input inputmode="numeric" value="${k.ki||""}" onchange="KM[${i}].ki=this.value;renderKm()"></td>
      <td><input inputmode="numeric" value="${k.kf||""}" onchange="KM[${i}].kf=this.value;renderKm()"></td>
      <td>${rod>0?rod.toFixed(0):""}</td>
      <td>${rod>0?brl(rod*taxa):""}</td>
      <td><button class="btn-x" onclick="KM.splice(${i},1);renderKm()">✕</button></td>`;
    tb.appendChild(tr);
  });
}
$("km_taxa").addEventListener("change", ()=>{ renderKm(); salvarDados(); });

// ---------- gerar PDF ----------
$("btnGerar").onclick = gerar;
async function gerar(){
  salvarDados();
  const btn=$("btnGerar"); btn.disabled=true; const old=btn.textContent; btn.textContent="Gerando…";
  try{
    const layout = document.querySelector('input[name=layout]:checked').value;
    const dados = {
      layout,
      nome:$("nome").value, cpf:$("cpf").value, depto:$("depto").value,
      destino:$("destino").value, objetivo:$("objetivo").value,
      inicio:isoToBR($("inicio").value), termino:isoToBR($("termino").value),
      banco:$("banco").value, agencia:$("agencia").value, conta:$("conta").value,
      pix:$("pix").value, assinatura_nome:$("assinatura_nome").value,
      adiantamento_data:isoToBR($("adiantamento_data").value),
      adiantamento_valor:parseMoney($("adiantamento_valor").value),
      km_taxa:parseMoney($("km_taxa").value)||1.9,
      receipts:RECEIPTS, km:KM,
    };
    const bytes = await window.PC.gerarPDF(dados);
    const blob = new Blob([bytes],{type:"application/pdf"});
    const destino=(dados.destino||"VIAGEM").toUpperCase().replace(/\s+/g,"-");
    let mesano=""; if(dados.inicio.includes("/")){const p=dados.inicio.split("/");mesano=`${p[1]}-${p[2]}`;}
    const nome=`PRESTACAO DE CONTAS - ${destino} ${mesano}.pdf`.trim();
    const file=new File([blob],nome,{type:"application/pdf"});
    // iPhone: usa o menu Compartilhar (salvar em Arquivos, enviar, etc.)
    if(navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({files:[file], title:nome});
    }else{
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a"); a.href=url; a.download=nome; a.click();
      setTimeout(()=>URL.revokeObjectURL(url),4000);
    }
    $("status").innerHTML='<span class="ok">✓ PDF gerado!</span>';
  }catch(e){ alert("Erro ao gerar PDF: "+e.message); }
  btn.disabled=false; btn.textContent=old;
}

// service worker (offline)
if("serviceWorker" in navigator){ navigator.serviceWorker.register("sw.js").catch(()=>{}); }
