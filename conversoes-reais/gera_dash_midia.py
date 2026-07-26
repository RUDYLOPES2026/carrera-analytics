#!/usr/bin/env python3
"""Dash operacional de vendas por mídia, no padrão dos dashs de Meta do Carrera:
header fixo com filtros, KPIs grandes, Chart.js e seções em card.

O dataset inteiro vai embutido e o JavaScript refiltra tudo: sem isso o filtro
do topo não valeria no gráfico nem nos rankings, que é o jeito que o Rudy usa.
"""
import json
import os

BASE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(f"{BASE}/dados_midia.json", encoding="utf-8"))

CSS = """
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0a0a;color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',
Roboto,sans-serif;font-size:16px;line-height:1.45}
.wrap{max-width:1280px;margin:0 auto;padding:0 20px 90px}
.head{position:sticky;top:0;z-index:100;background:linear-gradient(180deg,#0a0a0a 72%,
rgba(10,10,10,0));padding:20px 0 14px;border-bottom:1px solid #1f1f1f;backdrop-filter:blur(7px)}
.brandrow{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.logo{width:42px;height:42px;border-radius:11px;background:linear-gradient(135deg,#f59e0b,#b45309);
display:flex;align-items:center;justify-content:center;font-weight:800;color:#0a0a0a;font-size:20px}
.h1{font-size:25px;font-weight:800;letter-spacing:-.5px}.h1 b{color:#f59e0b}
.htag{font-size:13px;color:#a1a1aa}
.pill{margin-left:auto;font-size:12px;color:#a1a1aa;border:1px solid #2a2a2a;border-radius:999px;
padding:6px 13px}
.filters{display:flex;gap:10px 18px;align-items:center;flex-wrap:wrap;margin-top:14px}
/* rotulo e grupo andam juntos: soltos, o "Segmento" fica orfao numa linha e os
   botoes dele na seguinte */
.fgrp{display:inline-flex;align-items:center;gap:8px}
.filterlbl{font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:.5px;
white-space:nowrap}
.segfilter{display:inline-flex;background:#141414;border:1px solid #242424;border-radius:13px;
padding:5px;gap:3px;flex-wrap:wrap}
.segbtn{padding:8px 15px;border:none;background:none;color:#a1a1aa;font-weight:700;font-size:13.5px;
border-radius:9px;cursor:pointer;transition:.12s;display:flex;flex-direction:column;
align-items:center;gap:1px;line-height:1.1}
.segbtn small{font-size:10px;font-weight:600;opacity:.7}
.segbtn:hover{color:#f4f4f5}
.segbtn.on{background:#f59e0b;color:#0a0a0a}
.segbtn.on small{opacity:.85}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:22px 0 0}
.kpi{background:#141414;border:1px solid #222;border-radius:16px;padding:18px}
.kpi .l{font-size:12px;color:#a1a1aa;text-transform:uppercase;letter-spacing:.6px}
.kpi .v{font-size:29px;font-weight:800;margin-top:6px;letter-spacing:-1px}
.kpi .v.gold{color:#f59e0b}
.kpi .s{font-size:12px;color:#71717a;margin-top:4px}
.kpi .s b.up{color:#4ade80}.kpi .s b.dn{color:#f87171}.kpi .s b.fl{color:#a1a1aa}
.sec{margin-top:34px}
.secttl{font-size:19px;font-weight:800;display:flex;align-items:center;gap:9px;margin-bottom:3px}
.secttl .dot{width:9px;height:9px;border-radius:50%;background:#f59e0b}
.secsub{font-size:13px;color:#a1a1aa;margin-bottom:15px;max-width:900px}
.panel{background:#141414;border:1px solid #222;border-radius:16px;padding:20px}
.chartbox{height:300px}
/* ranking em barra, no lugar de tabela */
.rk{display:flex;flex-direction:column;gap:11px}
.rkrow{display:grid;grid-template-columns:150px 1fr 128px;gap:14px;align-items:center}
.rknome{font-size:13.5px;font-weight:600;text-align:right;line-height:1.25}
.rknome span{display:block;font-size:10.5px;font-weight:600;color:#71717a;text-transform:uppercase;
letter-spacing:.4px}
.rkbar{height:26px;border-radius:0 7px 7px 0;min-width:3px;display:flex;align-items:center;
justify-content:flex-end;padding-right:9px;font-size:12.5px;font-weight:800;color:#0a0a0a}
.rkdelta{font-size:12.5px;color:#71717a;font-variant-numeric:tabular-nums}
.rkdelta b{font-weight:800}
.up{color:#4ade80}.dn{color:#f87171}.fl{color:#a1a1aa}
/* cards de campanha e anuncio */
.cgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(232px,1fr));gap:12px}
.ccard{background:#141414;border:1px solid #222;border-radius:15px;padding:14px;
border-top:3px solid #f59e0b;display:flex;flex-direction:column;gap:8px}
/* st-* e nao up/dn: .up e classe global de cor e pintaria o card inteiro de verde */
.ccard.st-dn{border-top-color:#f87171}.ccard.st-up{border-top-color:#4ade80}
.ccard.st-nv{border-top-color:#38bdf8}
.cname{font-size:12.5px;font-weight:700;line-height:1.32;min-height:50px;
overflow-wrap:anywhere}
.ctags{display:flex;gap:4px;flex-wrap:wrap}
.ctag{font-size:9.5px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;
background:#1e1e22;color:#a1a1aa;border-radius:6px;padding:2px 7px}
.crow{display:flex;align-items:baseline;justify-content:space-between;
border-top:1px solid #222;padding-top:9px}
.cbig{font-size:23px;font-weight:800;letter-spacing:-.6px}
.cbig small{font-size:11px;color:#71717a;font-weight:600;margin-left:3px}
.cvar{font-size:12px;font-weight:800}
/* movimentos */
.mgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(268px,1fr));gap:12px}
.mv{background:#141414;border:1px solid #222;border-left:3px solid #3f3f46;border-radius:12px;
padding:14px 16px}
.mv.subiu{border-left-color:#4ade80}.mv.caiu{border-left-color:#f87171}
.mv.novo{border-left-color:#38bdf8}.mv.sumiu{border-left-color:#71717a}
.mvtop{font-size:10px;font-weight:800;letter-spacing:1.1px;text-transform:uppercase;
color:#71717a;margin-bottom:5px}
.mvn{font-size:13.5px;font-weight:700;line-height:1.3}
.mvv{font-size:12.5px;color:#a1a1aa;margin-top:6px;font-variant-numeric:tabular-nums}
.aviso{background:#12100a;border:1px solid #3a2f10;border-left:3px solid #f59e0b;
border-radius:12px;padding:14px 18px;color:#a1a1aa;font-size:13px;line-height:1.65;margin:0 0 15px}
.aviso b{color:#e4e4e7}
.vazio{color:#71717a;font-size:13.5px;padding:26px 0;text-align:center}
.conclusao{background:linear-gradient(135deg,#0d0a02 0%,#1a1404 100%);border:1px solid #f59e0b;
border-radius:14px;padding:20px 22px;margin-top:34px}
.conclusao h2{color:#f59e0b;font-size:11px;letter-spacing:2px;text-transform:uppercase;
margin-bottom:12px}
.conclusao ul{list-style:none}
.conclusao li{padding:8px 0 8px 24px;font-size:14px;color:#eee;line-height:1.6;position:relative}
.conclusao li::before{content:'→';position:absolute;left:0;color:#f59e0b;font-weight:900}
.conclusao li b{color:#f59e0b}
footer{margin-top:40px;padding-top:18px;border-top:1px solid #1f1f1f;color:#52525b;
font-size:12.5px;line-height:1.7}
@media(max-width:900px){.kpis{grid-template-columns:1fr 1fr}
.rkrow{grid-template-columns:104px 1fr}.rkdelta{grid-column:2}}
@media(max-width:560px){.kpis{grid-template-columns:1fr}.h1{font-size:20px}}
"""

JS = r"""
const D = __DADOS__;
const DIA = D.dims.dia, MARCA = D.dims.marca, SEG = D.dims.seg, ORIGEM = D.dims.origem;
const CAMP = D.dims.campanha, AD = D.dims.anuncio, UTM = D.dims.utm;
const CLS = ['captacao','outra_origem','sem_origem'];
const CORCLS = ['#3b82f6','#22c55e','#52525b'];
const CLSNOME = ['Mídia e portais','Outras origens','Sem origem'];
// indice da linha: 0 dia,1 marca,2 seg,3 origem,4 classe,5 camp,6 ad,7 utm,8 loja,9 valor,10 capt
const L = D.linhas;

let F = {marca:'ALL', seg:'ALL', per:'mes'};

const nf = n => n.toLocaleString('pt-BR');
const dstr = i => DIA[i];

function janelas(){
  const ate = D.ate, ateD = new Date(ate+'T12:00:00');
  let ini, iniAnt, fimAnt, label, labelAnt;
  if(F.per==='mes'){
    ini = ate.slice(0,8)+'01';
    const nd = parseInt(ate.slice(8,10),10);
    const pm = new Date(ateD); pm.setDate(1); pm.setDate(0);        // ultimo dia do mes anterior
    const pIni = new Date(pm); pIni.setDate(1);
    const pFim = new Date(pIni); pFim.setDate(Math.min(nd, pm.getDate()));
    iniAnt = iso(pIni); fimAnt = iso(pFim);
    label = 'mês corrente, '+nd+' dias'; labelAnt = 'mesmos '+nd+' dias do mês anterior';
  } else {
    const n = F.per==='30d'?30:90;
    const i = new Date(ateD); i.setDate(i.getDate()-(n-1)); ini = iso(i);
    const fa = new Date(i); fa.setDate(fa.getDate()-1); fimAnt = iso(fa);
    const ia = new Date(fa); ia.setDate(ia.getDate()-(n-1)); iniAnt = iso(ia);
    label = 'últimos '+n+' dias'; labelAnt = n+' dias anteriores';
  }
  return {ini, fim:ate, iniAnt, fimAnt, label, labelAnt};
}
function iso(d){return d.toISOString().slice(0,10);}

function passa(r){
  if(F.marca!=='ALL' && MARCA[r[1]]!==F.marca) return false;
  if(F.seg!=='ALL' && SEG[r[2]]!==F.seg) return false;
  return true;
}
function noPeriodo(ini,fim){
  return L.filter(r=>{const d=DIA[r[0]]; return d>=ini && d<=fim && passa(r);});
}

function kpis(rs){
  const v = rs.length;
  const capt = rs.filter(r=>r[10]===1).length;
  const orig = rs.filter(r=>r[4]!==2).length;
  const valor = rs.reduce((a,r)=>a+r[9],0);
  return {v, capt, orig, valor, pct: v? 100*capt/v : 0};
}
function delta(a,b){
  if(!b) return {t:'—', c:'fl'};
  const p = 100*(a-b)/b;
  if(Math.abs(p)<1.5) return {t:'estável', c:'fl'};
  return {t:(p>0?'▲ ':'▼ ')+Math.abs(p).toFixed(0)+'%', c:p>0?'up':'dn'};
}

function contar(rs, campo){
  const m = new Map();
  rs.forEach(r=>{const k=r[campo]; if(k>=0) m.set(k,(m.get(k)||0)+1);});
  return m;
}
function ranking(a, p, campo, dim, minimo){
  const ca=contar(a,campo), cp=contar(p,campo);
  const ks = new Set([...ca.keys(),...cp.keys()]);
  const out=[];
  ks.forEach(k=>{
    const x=ca.get(k)||0, y=cp.get(k)||0;
    if(Math.max(x,y)<minimo) return;
    out.push({k, nome:dim[k], a:x, p:y, var: y? 100*(x-y)/y : null});
  });
  out.sort((u,v)=>v.a-u.a || v.p-u.p);
  return out;
}

/* ---------------- render ---------------- */
let chart=null;
function render(){
  const w = janelas();
  const atual = noPeriodo(w.ini, w.fim);
  const ant   = noPeriodo(w.iniAnt, w.fimAnt);
  const k = kpis(atual), ka = kpis(ant);

  const dv=delta(k.v,ka.v), dc=delta(k.capt,ka.capt), dp=delta(k.pct,ka.pct);
  const topO = ranking(atual, ant, 3, ORIGEM, 1).filter(o=>D.origem_classe[o.k]!==2)[0];
  document.getElementById('kpis').innerHTML = `
   <div class="kpi"><div class="l">Vendas · ${w.label}</div><div class="v">${nf(k.v)}</div>
     <div class="s"><b class="${dv.c}">${dv.t}</b> vs ${nf(ka.v)} · ${w.labelAnt}</div></div>
   <div class="kpi"><div class="l">Vieram de mídia</div><div class="v gold">${nf(k.capt)}</div>
     <div class="s"><b class="${dc.c}">${dc.t}</b> vs ${nf(ka.capt)} no período anterior</div></div>
   <div class="kpi"><div class="l">Peso da mídia</div><div class="v">${k.pct.toFixed(0)}%</div>
     <div class="s"><b class="${dp.c}">${dp.t}</b> · ${nf(k.orig)} vendas com origem</div></div>
   <div class="kpi"><div class="l">Mídia que mais vende</div>
     <div class="v" style="font-size:23px">${topO?topO.nome:'—'}</div>
     <div class="s">${topO?nf(topO.a)+' vendas no período':'sem venda de mídia no recorte'}</div></div>`;

  desenhaGrafico(w);
  desenhaOrigens(atual, ant, w);
  desenhaMovimentos(atual, ant);
  desenhaCards('camps', ranking(atual,ant,5,CAMP,1).slice(0,12), true);
  desenhaCards('ads',   ranking(atual,ant,6,AD,1).slice(0,12), false);
  desenhaCards('utms',  ranking(atual,ant,7,UTM,2).slice(0,12), false);
  desenhaConclusao(atual, ant, w, k, ka, topO);
  document.querySelectorAll('.perlbl').forEach(e=>e.textContent=w.label);
}

function desenhaGrafico(w){
  // serie diaria dos ultimos 60 dias, sempre, para o grafico nao encolher
  const ate = new Date(D.ate+'T12:00:00');
  const dias=[]; for(let i=59;i>=0;i--){const d=new Date(ate); d.setDate(d.getDate()-i); dias.push(iso(d));}
  const pos = new Map(dias.map((d,i)=>[d,i]));
  const s = [0,1,2].map(()=>new Array(60).fill(0));
  L.forEach(r=>{ if(!passa(r)) return; const i=pos.get(DIA[r[0]]); if(i===undefined) return; s[r[4]][i]++; });
  const ds = [0,1,2].map(c=>({label:CLSNOME[c], data:s[c], backgroundColor:CORCLS[c],
    borderRadius:{topLeft:3,topRight:3}, borderSkipped:false, stack:'v'}));
  const labels = dias.map(d=>d.slice(8,10)+'/'+d.slice(5,7));
  if(chart){ chart.data.labels=labels; chart.data.datasets.forEach((d,i)=>d.data=ds[i].data); chart.update(); return; }
  chart = new Chart(document.getElementById('graf'), {
    type:'bar', data:{labels, datasets:ds},
    options:{responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
      plugins:{legend:{display:false},
        tooltip:{backgroundColor:'#18181b',borderColor:'#3f3f46',borderWidth:1,padding:11,
          titleColor:'#f4f4f5',bodyColor:'#d4d4d8',
          callbacks:{footer:it=>'Total: '+it.reduce((a,x)=>a+x.parsed.y,0)+' vendas'}}},
      scales:{x:{stacked:true,grid:{display:false},ticks:{color:'#52525b',font:{size:10},
                 maxRotation:0,autoSkip:true,maxTicksLimit:12}},
              y:{stacked:true,grid:{color:'#1c1c1f'},ticks:{color:'#52525b',font:{size:11},precision:0},
                 border:{display:false}}}}});
}

function desenhaOrigens(a,p,w){
  const r = ranking(a,p,3,ORIGEM,1);
  const max = Math.max(...r.map(x=>x.a), 1);
  document.getElementById('origens').innerHTML = r.length? r.map(o=>{
    const c = D.origem_classe[o.k];
    const d = o.var===null ? (o.a? '<b class="up">nova</b>' : '<b class="fl">—</b>')
      : (Math.abs(o.var)<1.5 ? '<b class="fl">estável</b>'
        : `<b class="${o.var>0?'up':'dn'}">${o.var>0?'▲':'▼'} ${Math.abs(o.var).toFixed(0)}%</b>`);
    return `<div class="rkrow">
      <div class="rknome">${o.nome}<span>${CLSNOME[c]}</span></div>
      <div class="rkbar" style="width:${Math.max(3,100*o.a/max)}%;background:${CORCLS[c]}">${nf(o.a)}</div>
      <div class="rkdelta">${d} <span style="color:#52525b">· antes ${nf(o.p)}</span></div></div>`;
  }).join('') : '<div class="vazio">Nenhuma venda neste recorte.</div>';
}

function desenhaMovimentos(a,p){
  const alvos=[[3,ORIGEM,'Origem',6,15],[5,CAMP,'Campanha',3,5],[6,AD,'Anúncio',3,5]];
  let mv=[];
  alvos.forEach(([campo,dim,nivel,pisoNovo,pisoVar])=>{
    ranking(a,p,campo,dim,1).forEach(x=>{
      if(x.p===0 && x.a>=pisoNovo) mv.push({t:'novo',nivel,nome:x.nome,txt:`0 para ${x.a} vendas`,peso:x.a});
      else if(x.a===0 && x.p>=pisoNovo+1) mv.push({t:'sumiu',nivel,nome:x.nome,txt:`${x.p} para 0 vendas`,peso:x.p});
      else if(x.var!==null && Math.abs(x.var)>=40 && Math.max(x.a,x.p)>=pisoVar)
        mv.push({t:x.var>0?'subiu':'caiu',nivel,nome:x.nome,
                 txt:`${x.p} para ${x.a} vendas (${x.var>0?'+':''}${x.var.toFixed(0)}%)`,peso:Math.max(x.a,x.p)});
    });
  });
  const ord={sumiu:0,caiu:1,subiu:2,novo:3}, cap={};
  mv.sort((u,v)=>ord[u.t]-ord[v.t] || v.peso-u.peso);
  mv = mv.filter(m=>{cap[m.t]=(cap[m.t]||0)+1; return cap[m.t]<=3;});
  const ROT={sumiu:'Zerou',caiu:'Caiu',subiu:'Subiu',novo:'Novo'};
  document.getElementById('movs').innerHTML = mv.length? mv.map(m=>
    `<div class="mv ${m.t}"><div class="mvtop">${ROT[m.t]} · ${m.nivel}</div>
     <div class="mvn">${m.nome}</div><div class="mvv">${m.txt}</div></div>`).join('')
    : '<div class="vazio">Nada se moveu o suficiente para virar alerta neste recorte.</div>';
}

function desenhaCards(id, itens, tags){
  const el = document.getElementById(id);
  if(!itens.length){ el.innerHTML='<div class="vazio">Sem dados identificados neste recorte.</div>'; return; }
  el.innerHTML = itens.map(x=>{
    let cls='', vtxt='<span class="cvar fl">—</span>';
    if(x.var===null && x.a){ cls='st-nv'; vtxt='<span class="cvar" style="color:#38bdf8">nova</span>'; }
    else if(x.var!==null && Math.abs(x.var)>=15){ cls=x.var>0?'st-up':'st-dn';
      vtxt=`<span class="cvar ${x.var>0?'up':'dn'}">${x.var>0?'▲':'▼'} ${Math.abs(x.var).toFixed(0)}%</span>`; }
    else if(x.var!==null) vtxt='<span class="cvar fl">estável</span>';
    const t = (tags && D.camp_tags[x.k] && D.camp_tags[x.k].length)
      ? `<div class="ctags">${D.camp_tags[x.k].map(g=>`<span class="ctag">${g}</span>`).join('')}</div>` : '';
    return `<div class="ccard ${cls}"><div class="cname">${x.nome}</div>${t}
      <div class="crow"><div class="cbig">${nf(x.a)}<small>vendas</small></div>${vtxt}</div>
      <div style="font-size:11px;color:#52525b">período anterior: ${nf(x.p)}</div></div>`;
  }).join('');
}

function desenhaConclusao(a,p,w,k,ka,topO){
  const li=[];
  const dv = ka.v? 100*(k.v-ka.v)/ka.v : 0;
  const dpct = k.pct - ka.pct;
  const alvo = (F.marca==='ALL'?'O grupo':F.marca) + (F.seg==='ALL'?'':' em '+F.seg.toLowerCase());
  li.push(`${alvo} vendeu <b>${nf(k.v)}</b> no período, ${dv>=0?'alta':'queda'} de <b>${Math.abs(dv).toFixed(0)}%</b> contra ${w.labelAnt}.`);
  if(k.v) li.push(`<b>${k.pct.toFixed(0)}%</b> das vendas vieram de mídia${Math.abs(dpct)>=1?`, ${dpct>0?'ganhando':'perdendo'} <b>${Math.abs(dpct).toFixed(0)} pontos</b> contra o período anterior`:', praticamente o mesmo peso do período anterior'}.`);
  if(topO) li.push(`A mídia que mais vendeu foi <b>${topO.nome}</b>, com ${nf(topO.a)} vendas.`);
  const sem = a.filter(r=>r[4]===2).length;
  if(sem) li.push(`Ainda restam <b>${nf(sem)}</b> vendas sem origem identificada (${(100*sem/k.v).toFixed(0)}% do total). Elas não têm nenhum lead com origem nos 12 meses anteriores.`);
  document.getElementById('conc').innerHTML = li.map(t=>`<li>${t}</li>`).join('');
}

/* ---------------- filtros ---------------- */
function botoes(){
  const mk=(grp,val,rot,sub)=>`<button class="segbtn${F[grp]===val?' on':''}" data-g="${grp}" data-v="${val}">${rot}${sub?`<small>${sub}</small>`:''}</button>`;
  const marcas = [...MARCA].filter(m=>m!=='Outros').sort();
  document.getElementById('fmarca').innerHTML =
    mk('marca','ALL','Todas','') + marcas.map(m=>mk('marca',m,m,'')).join('');
  const segs = ['Novos','Seminovos','Venda Direta'].filter(s=>SEG.includes(s));
  document.getElementById('fseg').innerHTML =
    mk('seg','ALL','Todos','') + segs.map(s=>mk('seg',s,s,'')).join('');
  document.getElementById('fper').innerHTML =
    mk('per','mes','Mês atual','') + mk('per','30d','30 dias','') + mk('per','90d','90 dias','');
  document.querySelectorAll('.segbtn').forEach(b=>b.onclick=()=>{
    F[b.dataset.g]=b.dataset.v; botoes(); render();
  });
}
botoes(); render();
"""


def build():
    dados = json.dumps(D, ensure_ascii=False, separators=(",", ":"))
    js = JS.replace("__DADOS__", dados)
    cob = D["cobertura"]
    h = [f"""<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Vendas por Mídia · Grupo Carrera</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<style>{CSS}</style></head><body>
<div class="head"><div class="wrap" style="padding-bottom:0">
  <div class="brandrow"><div class="logo">C</div>
    <div><div class="h1">Vendas por <b>Mídia</b></div>
      <div class="htag">De onde a venda saiu de verdade, incluindo o que o Sales registrou como avulso</div></div>
    <div class="pill">Até {D['ate'][8:10]}/{D['ate'][5:7]} · {D['gerado_em']}</div></div>
  <div class="filters">
    <div class="fgrp"><span class="filterlbl">Marca</span>
      <div class="segfilter" id="fmarca"></div></div>
    <div class="fgrp"><span class="filterlbl">Segmento</span>
      <div class="segfilter" id="fseg"></div></div>
    <div class="fgrp"><span class="filterlbl">Período</span>
      <div class="segfilter" id="fper"></div></div>
  </div>
</div></div>
<div class="wrap">
  <div class="kpis" id="kpis"></div>

  <div class="sec">
    <div class="secttl"><span class="dot"></span>Vendas por dia</div>
    <div class="secsub">Últimos 60 dias, sempre. A altura é o total do dia e a cor é a composição
      por tipo de origem. Segue os filtros de marca e segmento do topo. O vale de fim de semana
      é normal do negócio.</div>
    <div class="panel"><div class="chartbox"><canvas id="graf"></canvas></div></div>
  </div>

  <div class="sec">
    <div class="secttl"><span class="dot"></span>De onde saiu venda</div>
    <div class="secsub">Cada origem no período escolhido, comparada com a janela anterior do
      mesmo tamanho.</div>
    <div class="panel"><div class="rk" id="origens"></div></div>
  </div>

  <div class="sec">
    <div class="secttl"><span class="dot"></span>O que mudou</div>
    <div class="secsub">Movimento de <b>venda</b>, não de veiculação: campanha desligada continua
      vendendo por semanas, porque o lead leva 19 dias em mediana para comprar, e campanha
      renomeada aparece como uma que zerou e outra que nasceu.</div>
    <div class="mgrid" id="movs"></div>
  </div>

  <div class="sec">
    <div class="secttl"><span class="dot"></span>Campanhas do Meta</div>
    <div class="secsub">As campanhas que mais geraram venda no período.</div>
    <div class="aviso"><b>Leia a cobertura antes do ranking.</b> Os campos de campanha e anúncio
      só existem no Salesforce desde março de 2026 e só chegam em lead de formulário do Meta.
      Nas vendas de Facebook dos últimos 90 dias, <b>{cob['fb90_camp']} de {cob['fb90_total']}
      têm campanha identificada ({cob['fb90_pct']}%)</b>. No acumulado do ano cai para
      {cob['capt_pct']}%, porque janeiro e fevereiro não têm o campo. O ranking é do que está
      identificado, não do universo inteiro.</div>
    <div class="cgrid" id="camps"></div>
  </div>

  <div class="sec">
    <div class="secttl"><span class="dot"></span>Anúncios</div>
    <div class="secsub">O criativo que puxou a venda, quando identificado.</div>
    <div class="cgrid" id="ads"></div>
  </div>

  <div class="sec">
    <div class="secttl"><span class="dot"></span>UTM Campaign</div>
    <div class="secsub">Pega o que o campo de campanha não pega, principalmente WhatsApp e CRM.
      <b>WA-FB-IA</b> é WhatsApp vindo de anúncio Meta; os <b>CRM-</b> são disparos, com marca e
      data no próprio código.</div>
    <div class="cgrid" id="utms"></div>
  </div>

  <div class="conclusao"><h2>Direção</h2><ul id="conc"></ul></div>

  <footer>Documento interno do Grupo Carrera. Fonte: Salesforce Sales Cloud. A origem de cada
    venda é reconstruída por cruzamento com a base de leads, por telefone e email, dentro dos 12
    meses anteriores à venda; o crédito vai integral para a origem mais recente. Este painel não
    altera nada no Salesforce.</footer>
</div>
<script>{js}</script></body></html>"""]
    out = f"{BASE}/vendas-por-midia.html"
    with open(out, "w", encoding="utf-8") as f:
        f.write("".join(h))
    print(f"HTML gerado: {out} ({os.path.getsize(out)/1024:.0f} KB)")


build()
