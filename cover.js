// Gera o PDF (capa CINESYSTEM P&B + notinhas anexadas) usando pdf-lib.
(function(){
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const A4=[595.28,841.89], M=36, W=A4[0]-2*M;
  const BLACK=rgb(0,0,0), GREY=rgb(0.75,0.75,0.75), LGREY=rgb(0.95,0.95,0.95);

  function brl(v){ v=Number(v)||0; return "R$ "+v.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function num(v){ if(typeof v==="number")return v; const s=String(v||"");
    return s.includes(",")?parseFloat(s.replace(/\./g,"").replace(",","."))||0:parseFloat(s)||0; }
  function parseDate(s){ const m=String(s||"").match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
    if(!m)return null; let[,d,mo,y]=m; if(y.length===2)y="20"+y; const dt=new Date(+y,+mo-1,+d); return isNaN(dt)?null:dt; }
  function dias(a,b,mais){ const x=parseDate(a),y=parseDate(b); if(!x||!y)return 0;
    let d=Math.round((y-x)/86400000); if(mais)d+=1; return Math.max(d,0); }

  let F, FB;
  function fit(txt,size,maxW){ txt=String(txt==null?"":txt);
    if(F.widthOfTextAtSize(txt,size)<=maxW) return txt;
    while(txt.length>1 && F.widthOfTextAtSize(txt+"…",size)>maxW) txt=txt.slice(0,-1);
    return txt+"…"; }

  // desenha uma tabela; rows=[[cell,...]]; cell={t,b,a('l'|'c'|'r'),bg,span,size}
  function table(page,x,yTop,colW,rows,opt={}){
    const rowH=opt.rowH||14, pad=3, def=opt.size||7;
    let y=yTop;
    for(const row of rows){
      const h = row._h||rowH;
      let cx=x, ci=0;
      for(const cell of row){
        const span=cell.span||1;
        let cw=0; for(let s=0;s<span;s++) cw+=colW[ci+s]||0;
        if(cell.bg) page.drawRectangle({x:cx,y:y-h,width:cw,height:h,color:cell.bg});
        page.drawRectangle({x:cx,y:y-h,width:cw,height:h,borderColor:BLACK,borderWidth:.5});
        const t=cell.t; if(t!=null && t!==""){
          const size=cell.size||def, font=cell.b?FB:F;
          const s=fit(t,size,cw-2*pad);
          const tw=font.widthOfTextAtSize(s,size);
          let tx=cx+pad; if(cell.a==="c")tx=cx+(cw-tw)/2; else if(cell.a==="r")tx=cx+cw-pad-tw;
          page.drawText(s,{x:tx,y:y-h+(h-size)/2+1,size,font,color:BLACK});
        }
        cx+=cw; ci+=span;
      }
      y-=h;
    }
    return y;
  }
  function bar(page,x,y,text,size){ // faixa de seção (cinza claro, texto centralizado)
    const h=16; page.drawRectangle({x,y:y-h,width:W,height:h,color:LGREY,borderColor:BLACK,borderWidth:.5});
    const tw=FB.widthOfTextAtSize(text,size); page.drawText(text,{x:x+(W-tw)/2,y:y-h+5,size,font:FB,color:BLACK});
    return y-h;
  }
  function dataUrlToBytes(u){ const b=atob(u.split(",")[1]); const a=new Uint8Array(b.length);
    for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i); return a; }

  async function gerarPDF(d){
    const doc=await PDFDocument.create();
    F=await doc.embedFont(StandardFonts.Helvetica); FB=await doc.embedFont(StandardFonts.HelveticaBold);
    const page=doc.addPage(A4);
    let y=A4[1]-M;

    // título
    const tit="RELATÓRIO DE PRESTAÇÃO DE CONTAS", ts=13;
    page.drawText(tit,{x:M+(W-FB.widthOfTextAtSize(tit,ts))/2,y:y-13,size:ts,font:FB,color:BLACK});
    y-=20;

    // logo + datas
    let logoImg=null, lw=W*0.34, lh=0;
    try{ const bytes=await fetch("logo.png").then(r=>r.arrayBuffer());
         logoImg=await doc.embedPng(bytes); lh=lw*logoImg.height/logoImg.width; }catch(e){}
    const topH=52;
    if(logoImg) page.drawImage(logoImg,{x:M,y:y-topH+ (topH-Math.min(lh,topH))/2, width:lw, height:Math.min(lh,topH)});
    else { page.drawText("CINESYSTEM",{x:M,y:y-30,size:20,font:FB,color:BLACK}); }
    const emissao=new Date().toLocaleDateString("pt-BR");
    const rx=M+W*0.42, rc=[W*0.20,W*0.38];
    table(page,rx,y,rc,[
      [{t:"Emissão:",b:1},{t:emissao}],
      [{t:"Início:",b:1},{t:d.inicio}],
      [{t:"Término:",b:1},{t:d.termino}],
      [{t:"Moeda:",b:1},{t:"R$"}],
    ],{rowH:13});
    y-=topH;

    // info
    y=table(page,M,y,[W*0.14,W*0.56,W*0.10,W*0.20],[
      [{t:"DEPTO:",b:1,bg:LGREY},{t:d.depto,a:"c",b:1,span:3}],
      [{t:"NOME:",b:1,bg:LGREY},{t:d.nome,a:"c",b:1},{t:"CPF:",b:1,bg:LGREY},{t:d.cpf,a:"c",b:1}],
      [{t:"DESTINO:",b:1,bg:LGREY},{t:d.destino,a:"c",b:1,span:3}],
      [{t:"OBJETIVO:",b:1,bg:LGREY},{t:d.objetivo,a:"c",b:1,span:3}],
    ],{rowH:15});
    y-=2;

    // ordenar notas por data
    const recs=d.receipts.map((r,i)=>({r,i})).sort((a,b)=>{
      const da=parseDate(a.r.data), db=parseDate(b.r.data);
      if(da&&db)return da-db; if(da)return -1; if(db)return 1; return a.i-b.i;
    }).map(o=>o.r);

    // DETALHAMENTO DOS GASTOS
    y=bar(page,M,y,"DETALHAMENTO DOS GASTOS",9);
    const gc=[W*.105,W*.115,W*.155,W*.125,W*.12,W*.10,W*.12,W*.16];
    const head=["Data","Passagem","Locomoção","Refeição/Alim.","Hospedagem","Outros","Total R$","Justificativa"]
      .map(t=>({t,b:1,a:"c",bg:LGREY,size:6.5}));
    const tot={pa:0,lo:0,re:0,ho:0,ou:0,tt:0};
    const COL={Passagem:"pa",Locomocao:"lo",Refeicao:"re",Hospedagem:"ho",Outros:"ou"};
    const rows=[head];
    let ng=0;
    for(const r of recs){
      if(r.categoria==="Anexo") continue; ng++;
      const c={pa:0,lo:0,re:0,ho:0,ou:0}; c[COL[r.categoria]||"ou"]=num(r.valor);
      const rt=c.pa+c.lo+c.re+c.ho+c.ou;
      tot.pa+=c.pa;tot.lo+=c.lo;tot.re+=c.re;tot.ho+=c.ho;tot.ou+=c.ou;tot.tt+=rt;
      rows.push([{t:r.data,a:"c"},{t:c.pa?brl(c.pa):"",a:"c"},{t:c.lo?brl(c.lo):"",a:"c"},
        {t:c.re?brl(c.re):"",a:"c"},{t:c.ho?brl(c.ho):"",a:"c"},{t:c.ou?brl(c.ou):"",a:"c"},
        {t:rt?brl(rt):"",a:"c",bg:GREY},{t:r.justificativa,size:6.5}]);
    }
    for(let k=ng;k<7;k++) rows.push([{},{},{},{},{},{},{bg:GREY},{}]);
    rows.push([{t:"Total",b:1},{t:brl(tot.pa),a:"c",b:1},{t:brl(tot.lo),a:"c",b:1},
      {t:brl(tot.re),a:"c",b:1},{t:brl(tot.ho),a:"c",b:1},{t:brl(tot.ou),a:"c",b:1},
      {t:brl(tot.tt),a:"c",b:1,bg:GREY},{}]);
    y=table(page,M,y,gc,rows,{rowH:15});
    y-=6;

    // bloco intermediário
    const sub=tot.tt, adiant=num(d.adiantamento_valor);
    const nd=dias(d.inicio,d.termino,d.layout==="km");
    const media=nd?tot.re/nd:0;
    let compl=0;
    if(d.layout==="km") compl=d.km.reduce((s,k)=>s+Math.max(num(k.kf)-num(k.ki),0)*(num(d.km_taxa)||1.9),0);
    const reemb=sub+compl-adiant, tipo=reemb>0?"Reembolso":"Devolução";
    const yA=y;
    const yL=table(page,M,y,[W*.17,W*.23],[
      [{t:"Adiantamento",b:1,bg:GREY,span:2}],
      [{t:"Data",b:1,bg:LGREY},{t:d.adiantamento_data||""}],
      [{t:"Valor",b:1,bg:LGREY},{t:brl(adiant)}],
      [{t:"Média/dia",b:1,bg:LGREY},{t:brl(media)}],
      [{t:"QTD DIAS",b:1,bg:LGREY},{t:String(nd)}],
    ],{rowH:14});
    const rX=M+W*0.40;
    const yR=table(page,rX,yA,[W*.30,W*.30],[
      [{t:"Sub Total",b:1,bg:LGREY},{t:brl(sub)}],
      [{t:tipo,b:1,bg:LGREY},{t:brl(Math.abs(reemb))}],
      [{t:"DADOS BANCÁRIOS PARA REEMBOLSO",b:1,bg:GREY,a:"c",span:2,size:6.5}],
      [{t:"Banco: "+(d.banco||""),b:1,bg:LGREY},{t:"Ag "+(d.agencia||"")+" C/C "+(d.conta||"")}],
      [{t:"PIX",b:1,bg:LGREY},{t:d.pix||""}],
    ],{rowH:14});
    y=Math.min(yL,yR)-6;

    // seção inferior
    if(d.layout==="km"){
      y=bar(page,M,y,"RELATÓRIO DE REEMBOLSO KM/RODADO",9);
      const kc=[W*.14,W*.16,W*.16,W*.14,W*.16,W*.24];
      const kr=[["Data","KM Inicial","KM Final","KM rodado","Valor a receber","Justificativa"].map(t=>({t,b:1,a:"c",bg:LGREY,size:6.5}))];
      const taxa=num(d.km_taxa)||1.9;
      for(const k of d.km){ const ki=num(k.ki),kf=num(k.kf),rod=kf-ki;
        kr.push([{t:k.data,a:"c"},{t:ki?String(ki):"",a:"c"},{t:kf?String(kf):"",a:"c"},
          {t:rod?rod.toFixed(0):"",a:"c"},{t:rod?brl(rod*taxa):"",a:"c",bg:GREY},{t:k.just,size:6.5}]); }
      for(let k=d.km.length;k<4;k++) kr.push([{},{},{},{},{bg:GREY},{}]);
      kr.push([{t:"Total",b:1},{},{},{},{t:brl(compl),a:"c",b:1,bg:GREY},{}]);
      y=table(page,M,y,kc,kr,{rowH:15});
    }else{
      y=bar(page,M,y,"INFORMAÇÕES COMPLEMENTARES DA VIAGEM",9);
      const cc=[W*.12,W*.16,W*.14,W*.16,W*.18,W*.12,W*.12];
      const cr=[["Data","Localizador","Hospedagem","Locomoção","Trecho/Local","Total R$","Justif."].map(t=>({t,b:1,a:"c",bg:LGREY,size:6.5}))];
      for(let k=0;k<4;k++) cr.push([{},{},{},{},{},{bg:GREY},{}]);
      cr.push([{t:"Total",b:1},{},{},{},{},{t:brl(0),a:"c",b:1,bg:GREY},{}]);
      y=table(page,M,y,cc,cr,{rowH:15});
    }
    y-=6;
    // Total Viagem
    y=table(page,M,y,[W*.74,W*.26],[[{t:"Total Viagem",b:1,bg:LGREY},{t:brl(sub+compl),a:"c",b:1,bg:GREY}]],{rowH:17});
    y-=26;

    // assinaturas
    const linha="_______________________________________";
    const cx=M+W*0.55, half=W*0.45;
    function centro(txt,yy,bold,size){ const f=bold?FB:F; const w=f.widthOfTextAtSize(txt,size||9);
      page.drawText(txt,{x:M+half+(W-half)/2-w/2,y:yy,size:size||9,font:f,color:BLACK}); }
    page.drawText("data: ____/____/____",{x:M,y:y,size:8.5,font:F,color:BLACK});
    centro(linha,y,false,9); centro(d.assinatura_nome||d.nome||"",y-13,true,9);
    centro(linha,y-40,false,9); centro("Diretor Responsável",y-53,true,9);

    // ---- anexar as notinhas (imagens) ----
    for(const r of recs){
      if(!r.img) continue;
      const p=doc.addPage(A4);
      let img; try{ img=await doc.embedJpg(dataUrlToBytes(r.img)); }catch(e){ try{img=await doc.embedPng(dataUrlToBytes(r.img));}catch(_){continue;} }
      const maxW=A4[0]-2*20, maxH=A4[1]-2*20;
      const sc=Math.min(maxW/img.width, maxH/img.height);
      const iw=img.width*sc, ih=img.height*sc;
      p.drawImage(img,{x:(A4[0]-iw)/2,y:(A4[1]-ih)/2,width:iw,height:ih});
    }

    return await doc.save();
  }

  window.PC = window.PC || {};
  window.PC.gerarPDF = gerarPDF;
})();
