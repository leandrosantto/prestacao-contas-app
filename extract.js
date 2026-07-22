// Extração de valor/data/categoria a partir do texto do OCR.
// Mesma lógica do app do PC, portada para JS.
(function(){
  const MONEY = /(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})(?!\d)/g;
  const DATE = /\b(\d{2})[\/.\-](\d{2})[\/.\-](\d{2,4})\b/;
  function strip(s){return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");}

  const KW = {
    Passagem:["passagem","latam","gol ","azul","voo","embarque","localizador","bilhete","aereo","avianca"],
    Locomocao:["uber","99app","99 ","taxi","cabify","estacion","pedagio","sem parar","conectcar",
               "posto","combustivel","gasolina","etanol","diesel","abastecimento","movida","localiza",
               "unidas","locadora","onibus","rodoviaria","metro"],
    Hospedagem:["hotel","hospedagem","pousada","hostel","airbnb","diaria","booking","resort","ibis","flat"],
    Refeicao:["restaurante","lanchonete","ifood","mcdonald","burger","padaria","cafe","cafeteria","bar ",
              "pizza","refeicao","alimentacao","churrascaria","buona","outback","subway","habib","spoleto",
              "coco bambu","marmita","acai","food","lanche"],
  };

  function classificar(texto){
    const t = strip(texto);
    let best="Outros", sc=0;
    for(const c in KW){ let s=0; for(const k of KW[c]) if(t.includes(strip(k))) s++; if(s>sc){sc=s;best=c;} }
    return sc ? best : "Outros";
  }

  function toFloat(intp,dec){ return parseFloat(intp.replace(/\./g,"")+"."+dec); }

  function extrair(texto){
    const linhas = texto.split("\n").filter(l=>l.trim());
    let all=[], tot=[];
    for(const ln of linhas){
      const low = strip(ln); let m; MONEY.lastIndex=0;
      while((m=MONEY.exec(ln))){
        const v = toFloat(m[1],m[2]); if(v<=0) continue; all.push(v);
        if(low.includes("total") && !low.includes("subtotal") && !low.includes("itens")
           && !low.includes("item") && !low.includes("desconto")) tot.push(v);
      }
    }
    let valor=null;
    if(tot.length) valor=Math.max(...tot); else if(all.length) valor=Math.max(...all);
    let data=null;
    for(const ln of linhas){
      const m = ln.match(DATE);
      if(m){ let[,d,mo,y]=m; if(y.length===2)y="20"+y;
        if(+d>=1&&+d<=31&&+mo>=1&&+mo<=12&&+y>=2000&&+y<=2100){data=`${d}/${mo}/${y}`;break;} }
    }
    return { valor, data, categoria: classificar(texto) };
  }

  window.PC = window.PC || {};
  window.PC.extrair = extrair;
})();
