#!/usr/bin/env python3
"""Dash operacional de vendas por mídia: de onde saiu, como está agora, o que mudou."""
import json
import os
from html import escape

BASE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(f"{BASE}/dados_midia.json", encoding="utf-8"))
P, COB = D["pulso"], D["cobertura"]

# Paleta validada na superficie #141b24. O cinza de "sem origem" reprova no piso
# de croma de proposito: ausencia de informacao nao deve competir por identidade
# com as series que carregam significado.
C_CAPT, C_OUTRA, C_SEM = "#3987e5", "#199e70", "#5b6874"
C_SOBE, C_CAI, C_ACC = "#4ade80", "#e66767", "#f59e0b"

CSS = """
*{box-sizing:border-box}
body{margin:0;background:#0b0f14;color:#e6edf3;font-family:-apple-system,BlinkMacSystemFont,
"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;line-height:1.5}
.wrap{max-width:1120px;margin:0 auto;padding:44px 20px 72px}
.eyebrow{color:#8b98a5;font-size:12px;letter-spacing:1.6px;text-transform:uppercase}
h1{font-size:30px;margin:8px 0 6px;letter-spacing:.3px}
h1 .b{color:var(--acc,#f59e0b)}
.sub{color:#8b98a5;font-size:14.5px;max-width:780px}
.stamp{color:#5f6b78;font-size:12px;margin:14px 0 30px}
h2{font-size:19px;margin:46px 0 4px}
.h2sub{color:#8b98a5;font-size:13.5px;margin-bottom:16px;max-width:780px}
h3{font-size:15px;margin:26px 0 10px;color:#c3ccd6}
.card{background:#141b24;border:1px solid #1f2a36;border-radius:16px;padding:22px 24px}
.pulso{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.pulso .card .top{display:flex;justify-content:space-between;align-items:baseline;gap:12px;
margin-bottom:16px}
.pulso .t{font-size:12px;letter-spacing:.9px;text-transform:uppercase;color:#8b98a5;
font-weight:600}
.pulso .per{font-size:12px;color:#5f6b78}
.tri{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.met .k{font-size:11px;letter-spacing:.6px;text-transform:uppercase;color:#8b98a5}
.met .v{font-size:30px;font-weight:700;letter-spacing:-1px;line-height:1.1;margin-top:5px;
font-variant-numeric:tabular-nums}
.met .d{font-size:12.5px;margin-top:4px;font-variant-numeric:tabular-nums}
.cmp{color:#5f6b78;font-size:12px;margin-top:14px;padding-top:12px;border-top:1px solid #1f2a36}
.up{color:#4ade80}.down{color:#e66767}.flat{color:#8b98a5}
.legend{display:flex;gap:18px;margin:0 0 14px;font-size:12.5px;color:#8b98a5;flex-wrap:wrap}
.legend i{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:6px;
vertical-align:-1px}
table{width:100%;border-collapse:collapse;font-size:13.5px}
.scroll{overflow-x:auto}
th{text-align:right;color:#8b98a5;font-weight:600;font-size:11.5px;letter-spacing:.7px;
text-transform:uppercase;padding:0 0 10px;border-bottom:1px solid #1f2a36;white-space:nowrap}
th:first-child{text-align:left}
td{padding:10px 0;border-bottom:1px solid #161f2a;text-align:right;
font-variant-numeric:tabular-nums;white-space:nowrap}
td:first-child{text-align:left;font-variant-numeric:normal;white-space:normal}
tr:last-child td{border-bottom:0}
td+td,th+th{padding-left:16px}
.nome{font-weight:600}
.tags{margin-top:3px}
.tag{display:inline-block;font-size:10.5px;letter-spacing:.4px;text-transform:uppercase;
padding:1px 7px;border-radius:999px;background:#1f2a36;color:#8b98a5;margin-right:5px}
.mov{display:flex;flex-direction:column;gap:0}
.mov .l{display:grid;grid-template-columns:74px 1fr auto;gap:14px;align-items:baseline;
padding:13px 0;border-bottom:1px solid #161f2a}
.mov .l:last-child{border-bottom:0}
.badge{font-size:10.5px;letter-spacing:.7px;text-transform:uppercase;font-weight:700;
padding:2px 0;text-align:center;border-radius:6px}
.b-sumiu{color:#e66767;background:rgba(230,103,103,.12)}
.b-caiu{color:#e66767;background:rgba(230,103,103,.08)}
.b-subiu{color:#4ade80;background:rgba(74,222,128,.10)}
.b-novo{color:#f59e0b;background:rgba(245,158,11,.12)}
.mov .n{font-size:13.5px}
.mov .n span{color:#5f6b78;font-size:12px;display:block;margin-top:2px}
.mov .v{font-size:12.5px;color:#8b98a5;white-space:nowrap;font-variant-numeric:tabular-nums}
.nota{color:#5f6b78;font-size:12.5px;line-height:1.7;margin-top:14px}
.aviso{background:#111820;border:1px solid #1f2a36;border-left:3px solid #c98500;
border-radius:10px;padding:14px 18px;color:#8b98a5;font-size:13px;line-height:1.7;margin:16px 0}
.aviso b{color:#c3ccd6}
footer{margin-top:52px;padding-top:20px;border-top:1px solid #1f2a36;color:#5f6b78;
font-size:12.5px;line-height:1.7}
@media(max-width:820px){.pulso{grid-template-columns:1fr}.tri{grid-template-columns:1fr 1fr}
.wrap{padding:30px 15px 50px}h1{font-size:24px}.mov .l{grid-template-columns:64px 1fr}
.mov .v{grid-column:2}}
"""


def n(x):
    return f"{x:,}".replace(",", ".")


def money(v):
    if v >= 1_000_000_000:
        return f"R$ {v/1_000_000_000:.2f} bi".replace(".", ",")
    if v >= 1_000_000:
        return f"R$ {v/1_000_000:.0f} mi"
    return f"R$ {v/1000:.0f} mil"


def seta(v, atual=None):
    if v is None:
        # sem base anterior: dizer "nova" informa, "sem base" so confunde
        return ('<span style="color:#f59e0b">nova</span>' if atual
                else '<span class="flat">–</span>')
    if v > 1.5:
        return f'<span class="up">▲ {v:.0f}%</span>'.replace(".0", "")
    if v < -1.5:
        return f'<span class="down">▼ {abs(v):.0f}%</span>'.replace(".0", "")
    return '<span class="flat">estável</span>'


def bloco_pulso(b):
    a, p, v = b["atual"], b["anterior"], b["var"]
    m = [f'<div class="card"><div class="top"><div class="t">{b["label"]}</div>'
         f'<div class="per">vs {b["cmp_label"]}</div></div><div class="tri">']
    for k, rot in (("vendas", "Vendas"), ("origem", "Com origem"), ("captacao", "De mídia")):
        m.append(f'<div class="met"><div class="k">{rot}</div>'
                 f'<div class="v">{n(a[k])}</div><div class="d">{seta(v[k])}</div></div>')
    m.append('</div>')
    m.append(f'<div class="cmp">No período comparado: {n(p["vendas"])} vendas, '
             f'{n(p["origem"])} com origem, {n(p["captacao"])} de mídia. '
             f'Valor negociado agora: {money(a["valor"])}.</div></div>')
    return "".join(m)


def grafico_serie(serie):
    """Colunas empilhadas por dia: composicao e ritmo semanal na mesma leitura."""
    W, H, PL, PR, PT, PB = 1060, 250, 34, 10, 14, 30
    iw, ih = W - PL - PR, H - PT - PB
    topo = max(max(s["total"] for s in serie), 1) * 1.12
    bw = iw / len(serie)
    g = [f'<svg viewBox="0 0 {W} {H}" style="width:100%;height:auto" role="img" '
         f'aria-label="Vendas por dia nos ultimos 60 dias, por tipo de origem">']
    for frac in (0, .5, 1):
        yy = PT + ih - ih * frac
        g.append(f'<line x1="{PL}" y1="{yy:.1f}" x2="{W-PR}" y2="{yy:.1f}" stroke="#1f2a36"/>')
        g.append(f'<text x="{PL-7}" y="{yy+4:.1f}" fill="#5f6b78" font-size="10.5" '
                 f'text-anchor="end">{topo*frac:.0f}</text>')
    for i, s in enumerate(serie):
        x = PL + i * bw
        y = PT + ih
        # 2px de respiro entre colunas e entre segmentos, para a pilha nao virar bloco
        for chave, cor in (("captacao", C_CAPT), ("outra", C_OUTRA), ("sem", C_SEM)):
            h = ih * s[chave] / topo
            if h <= 0:
                continue
            y -= h
            g.append(f'<rect x="{x+1:.1f}" y="{y:.1f}" width="{max(bw-2,1):.1f}" '
                     f'height="{max(h-1,.8):.1f}" fill="{cor}"/>')
        if s["dia"][8:10] in ("01", "15"):
            g.append(f'<text x="{x+bw/2:.1f}" y="{H-10}" fill="#5f6b78" font-size="10.5" '
                     f'text-anchor="middle">{s["dia"][8:10]}/{s["dia"][5:7]}</text>')
    g.append("</svg>")
    return "".join(g)


CLS_ROT = {"captacao": "Mídia", "outra_origem": "Outra origem", "sem_origem": "Sem origem"}


def tabela_rank(itens, titulo_col, tags=False, classes=False, limite=None):
    m = ['<div class="card scroll"><table><tr>'
         f'<th>{titulo_col}</th><th>Últimos 30d</th><th>30d anteriores</th><th>Variação</th></tr>']
    for x in (itens[:limite] if limite else itens):
        t = ""
        if tags:
            chips = [x.get(k) for k in ("marca", "segmento", "formato") if x.get(k)]
            if chips:
                t = '<div class="tags">' + "".join(
                    f'<span class="tag">{escape(c)}</span>' for c in chips) + "</div>"
        if classes:
            # sem essa marcacao, Lead Avulso lidera a tabela e passa por midia
            c = x.get("classe", "sem_origem")
            cor = {"captacao": C_CAPT, "outra_origem": C_OUTRA}.get(c, C_SEM)
            t = (f'<div class="tags"><span class="tag" style="color:{cor}">'
                 f'{CLS_ROT[c]}</span></div>')
        m.append(f'<tr><td><div class="nome">{escape(x["nome"])}</div>{t}</td>'
                 f'<td>{n(x["atual"])}</td><td>{n(x["anterior"])}</td>'
                 f'<td>{seta(x["var"], x["atual"])}</td></tr>')
    m.append("</table></div>")
    return "".join(m)


p = [f'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
     f'<meta name="robots" content="noindex,nofollow">'
     f'<meta name="viewport" content="width=device-width,initial-scale=1">'
     f'<title>Vendas por Mídia · Grupo Carrera</title><style>{CSS}</style></head>'
     f'<body><div class="wrap">']
p.append('<div class="eyebrow">Grupo Carrera · Gestão de Marketing</div>')
p.append('<h1>Vendas por <span class="b">Mídia</span></h1>')
p.append('<div class="sub">De onde as vendas estão saindo agora. A origem de cada venda é '
         'reconstruída por cruzamento com a base de leads, então inclui as vendas que o Sales '
         'registrou como avulsas. Todo comparativo é contra a janela anterior do mesmo tamanho.'
         '</div>')
p.append(f'<div class="stamp">Vendas até {D["ate"][8:10]}/{D["ate"][5:7]}/{D["ate"][:4]} '
         f'· atualizado em {D["gerado_em"]}</div>')

p.append('<div class="pulso">' + bloco_pulso(P["mes"]) + bloco_pulso(P["d7"]) + '</div>')

# ---- movimentos primeiro: e o que se le em 30 segundos
if D["movimentos"]:
    p.append('<h2>O que mudou</h2>')
    p.append('<div class="h2sub">Comparando os últimos 30 dias com os 30 anteriores, no máximo '
             'quatro de cada tipo. É movimento de <b>venda</b>, não de veiculação: campanha '
             'desligada continua vendendo por semanas, porque o lead leva 19 dias em mediana '
             'para comprar, e campanha renomeada aparece como uma que zerou e outra que '
             'nasceu.</div>')
    p.append('<div class="card"><div class="mov">')
    ROT = {"sumiu": "Zerou", "caiu": "Caiu", "subiu": "Subiu", "novo": "Novo"}
    for m in D["movimentos"]:
        p.append(f'<div class="l"><div class="badge b-{m["tipo"]}">{ROT[m["tipo"]]}</div>'
                 f'<div class="n">{escape(m["nome"])}<span>{m["nivel"]}</span></div>'
                 f'<div class="v">{escape(m["txt"])}</div></div>')
    p.append('</div></div>')

p.append('<h2>Vendas por dia</h2>')
p.append('<div class="h2sub">Últimos 60 dias. A altura é o total de vendas do dia e a cor é a '
         'composição por tipo de origem. O vale de fim de semana é normal do negócio.</div>')
p.append(f'<div class="legend"><span><i style="background:{C_CAPT}"></i>Mídia e portais</span>'
         f'<span><i style="background:{C_OUTRA}"></i>Outras origens</span>'
         f'<span><i style="background:{C_SEM}"></i>Sem origem</span></div>')
p.append('<div class="card">' + grafico_serie(D["serie"]) + '</div>')

p.append('<h2>De onde saiu venda</h2>')
p.append('<div class="h2sub">Cada origem nos últimos 30 dias contra os 30 anteriores, ordenada '
         'por volume.</div>')
p.append(tabela_rank(D["rank_origem"], "Origem", classes=True))

p.append('<h2>Meta em detalhe</h2>')
fb = COB
p.append(f'<div class="aviso"><b>Leia a cobertura antes do ranking.</b> Os campos de campanha, '
         f'conjunto e anúncio só existem no Salesforce desde março de 2026, e só chegam em lead '
         f'de formulário do Meta. Nas vendas atribuídas ao Facebook nos últimos 90 dias, '
         f'<b>{fb["fb90_camp"]} de {fb["fb90_total"]} têm campanha identificada '
         f'({fb["fb90_pct"]:.0f}%)</b>. No acumulado de 2026 a cobertura cai para '
         f'{fb["capt_pct"]:.0f}% das vendas de mídia, porque janeiro e fevereiro não têm o campo. '
         f'Os rankings abaixo são do que está identificado, não do universo inteiro.</div>'
         .replace(".0%", "%"))

p.append('<h3>Por campanha</h3>')
p.append(tabela_rank(D["rank_campanha"], "Campanha", tags=True))
p.append('<h3>Por anúncio</h3>')
p.append(tabela_rank(D["rank_anuncio"], "Anúncio"))
p.append('<h3>Por conjunto</h3>')
p.append(tabela_rank(D["rank_adset"], "Conjunto de anúncios"))

p.append('<h2>Por UTM Campaign</h2>')
p.append(f'<div class="h2sub">Pega o que o campo de campanha não pega, principalmente WhatsApp '
         f'e CRM. Presente em {COB["utm_pct"]:.0f}% das vendas de mídia. '
         f'<b>WA-FB-IA</b> é WhatsApp vindo de anúncio Meta; os <b>CRM-</b> são disparos, com '
         f'marca e data no próprio código.</div>'.replace(".0%", "%"))
p.append(tabela_rank(D["rank_utm"], "UTM Campaign"))

p.append('<footer>Documento interno do Grupo Carrera. Fonte: Salesforce Sales Cloud. A '
         'atribuição segue a regra de Conversões Reais: origem do lead mais recente do cliente '
         'nos 12 meses anteriores à venda, crédito integral para uma origem. Este painel não '
         'altera nada no Salesforce.</footer>')
p.append("</div></body></html>")

with open(f"{BASE}/vendas-por-midia.html", "w", encoding="utf-8") as f:
    f.write("".join(p))
print("HTML gerado: vendas-por-midia.html")
