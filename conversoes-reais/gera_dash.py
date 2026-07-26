#!/usr/bin/env python3
"""Renderiza o dash de Conversoes Reais (completo + one-page) a partir de dados.json."""
import json
import os
from html import escape

BASE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(f"{BASE}/dados.json", encoding="utf-8"))
G = D["grupo"]

# paleta validada (slots categoricos, superficie escura #141b24)
C_REAL, C_DECL, C_OK, C_ALERTA = "#3987e5", "#5b6874", "#199e70", "#c98500"

CSS = """
*{box-sizing:border-box}
body{margin:0;background:#0b0f14;color:#e6edf3;font-family:-apple-system,BlinkMacSystemFont,
"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;line-height:1.5}
a{color:inherit;text-decoration:none}
.wrap{max-width:1080px;margin:0 auto;padding:44px 20px 72px}
.eyebrow{color:#8b98a5;font-size:12px;letter-spacing:1.6px;text-transform:uppercase}
h1{font-size:30px;margin:8px 0 6px;letter-spacing:.3px}
h1 .b{color:#f59e0b}
.sub{color:#8b98a5;font-size:14.5px;margin-bottom:8px;max-width:760px}
.stamp{color:#5f6b78;font-size:12px;margin-bottom:32px}
h2{font-size:19px;margin:44px 0 4px}
.h2sub{color:#8b98a5;font-size:13.5px;margin-bottom:18px;max-width:760px}
.card{background:#141b24;border:1px solid #1f2a36;border-radius:16px;padding:22px 24px}
.hero{display:grid;grid-template-columns:1.05fr 1fr;gap:20px;align-items:stretch;margin-bottom:26px}
.hero .card{display:flex;flex-direction:column;justify-content:center}
.hero .tiles{grid-template-columns:1fr 1fr}
.hero .big{font-size:56px;font-weight:700;letter-spacing:-1.5px;line-height:1;color:#f59e0b}
.hero .bigsub{color:#8b98a5;font-size:14px;margin-top:10px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
.tile{background:#141b24;border:1px solid #1f2a36;border-radius:13px;padding:15px 17px}
.tile .k{color:#8b98a5;font-size:11.5px;letter-spacing:.7px;text-transform:uppercase}
.tile .v{font-size:26px;font-weight:650;margin-top:6px;letter-spacing:-.5px}
.tile .d{color:#5f6b78;font-size:12px;margin-top:3px}
.bars{display:flex;flex-direction:column;gap:15px}
.row{display:grid;grid-template-columns:132px 1fr;gap:14px;align-items:center}
.row .lbl{font-size:13.5px;color:#c3ccd6;text-align:right}
.pair{display:flex;flex-direction:column;gap:4px}
.track{display:flex;align-items:center;gap:9px}
.bar{height:15px;border-radius:0 4px 4px 0;min-width:2px;flex:0 0 auto}
.track b{font-size:11.5px;color:#8b98a5;font-weight:500;white-space:nowrap;
font-variant-numeric:tabular-nums}
.track.r b{color:#c3ccd6;font-weight:650}
.legend{display:flex;gap:18px;margin:0 0 20px;font-size:12.5px;color:#8b98a5;flex-wrap:wrap}
.legend i{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:6px;
vertical-align:-1px}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th{text-align:right;color:#8b98a5;font-weight:600;font-size:11.5px;letter-spacing:.7px;
text-transform:uppercase;padding:0 0 10px;border-bottom:1px solid #1f2a36}
th:first-child{text-align:left}
td{padding:11px 0;border-bottom:1px solid #161f2a;text-align:right;
font-variant-numeric:tabular-nums}
td:first-child{text-align:left;font-variant-numeric:normal}
tr:last-child td{border-bottom:0}
.up{color:#4ade80}.warn{color:#c98500}.crit{color:#e66767}
.pill{display:inline-block;font-size:11px;padding:2px 8px;border-radius:999px;
background:#1f2a36;color:#8b98a5;margin-left:7px}
.nota{color:#5f6b78;font-size:12.5px;line-height:1.7;margin-top:14px}
footer{margin-top:52px;padding-top:20px;border-top:1px solid #1f2a36;color:#5f6b78;
font-size:12.5px;line-height:1.7}
.como{background:#111820;border:1px solid #1f2a36;border-radius:13px;padding:18px 20px;
color:#8b98a5;font-size:13px;line-height:1.75;margin-top:16px}
.como b{color:#c3ccd6}
@media(max-width:720px){.hero{grid-template-columns:1fr}.row{grid-template-columns:96px 1fr}
.wrap{padding:30px 15px 50px}h1{font-size:24px}.hero .big{font-size:42px}}
"""


def n(x):
    return f"{x:,}".replace(",", ".")


def money(v):
    if v >= 1_000_000_000:
        return f"R$ {v/1_000_000_000:.2f} bi".replace(".", ",")
    return f"R$ {v/1_000_000:.1f} mi".replace(".", ",")


def head(title, extra=""):
    return (f'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
            f'<meta name="robots" content="noindex,nofollow">'
            f'<meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{escape(title)}</title><style>{CSS}{extra}</style></head><body><div class="wrap">')


def tile(k, v, d=""):
    return (f'<div class="tile"><div class="k">{k}</div><div class="v">{v}</div>'
            f'<div class="d">{d}</div></div>')


def barra_dupla(itens, campo_a, campo_b, maxv, fmt=n):
    """Uma linha por item, duas barras: declarado (cinza) e real (azul).

    Os valores ficam FORA da barra: dentro eles somem nas barras curtas e
    brigam com o preenchimento nas longas.
    """
    out = ['<div class="bars">']
    for it in itens:
        a, b = it[campo_a], it[campo_b]
        # 78% da largura no maximo, o resto e a faixa reservada aos numeros
        wa = max(0.4, 78 * a / maxv) if maxv else 0
        wb = max(0.4, 78 * b / maxv) if maxv else 0
        d = b - a
        extra = (f' <span style="color:{C_OK if d>0 else "#5f6b78"}">'
                 f'{"+" if d>0 else ""}{fmt(d)}</span>') if d else ""
        out.append(
            f'<div class="row"><div class="lbl">{escape(it["midia"])}</div><div class="pair">'
            f'<div class="track"><div class="bar" style="width:{wa:.1f}%;background:{C_DECL}">'
            f'</div><b>{fmt(a)}</b></div>'
            f'<div class="track r"><div class="bar" style="width:{wb:.1f}%;background:{C_REAL}">'
            f'</div><b>{fmt(b)}{extra}</b></div></div></div>')
    out.append("</div>")
    return "".join(out)


def linha_mensal(meses):
    """SVG: % de vendas com midia rastreavel, declarado vs real, mes a mes."""
    if len(meses) < 2:
        return ""
    W, H, PL, PR, PT, PB = 900, 220, 42, 16, 18, 34
    iw, ih = W - PL - PR, H - PT - PB
    topo = max(max(m["pct_depois"] for m in meses) * 1.18, 10)
    xs = [PL + iw * i / (len(meses) - 1) for i in range(len(meses))]

    def y(v):
        return PT + ih - ih * v / topo

    def path(campo):
        return " ".join(f"{'M' if i == 0 else 'L'}{x:.1f},{y(m[campo]):.1f}"
                        for i, (x, m) in enumerate(zip(xs, meses)))

    g = [f'<svg viewBox="0 0 {W} {H}" style="width:100%;height:auto" role="img" '
         f'aria-label="Percentual de vendas com midia rastreavel por mes">']
    for frac in (0, .25, .5, .75, 1):
        yy = PT + ih - ih * frac
        g.append(f'<line x1="{PL}" y1="{yy:.1f}" x2="{W-PR}" y2="{yy:.1f}" stroke="#1f2a36"/>')
        g.append(f'<text x="{PL-8}" y="{yy+4:.1f}" fill="#5f6b78" font-size="11" '
                 f'text-anchor="end">{topo*frac:.0f}%</text>')
    for campo, cor in (("pct_antes", C_DECL), ("pct_depois", C_REAL)):
        g.append(f'<path d="{path(campo)}" fill="none" stroke="{cor}" stroke-width="2" '
                 f'stroke-linecap="round" stroke-linejoin="round"/>')
        for x, m in zip(xs, meses):
            g.append(f'<circle cx="{x:.1f}" cy="{y(m[campo]):.1f}" r="4" fill="{cor}" '
                     f'stroke="#141b24" stroke-width="2"/>')
    for i, (x, m) in enumerate(zip(xs, meses)):
        g.append(f'<text x="{x:.1f}" y="{H-12}" fill="#5f6b78" font-size="11" '
                 f'text-anchor="middle">{m["mes"][5:]}</text>')
        if i == len(meses) - 1:
            for campo, cor in (("pct_antes", C_DECL), ("pct_depois", C_REAL)):
                # o rotulo e formatado antes: um .replace no f-string inteiro
                # corromperia as coordenadas do SVG
                txt = f'{m[campo]:.0f}%'
                g.append(f'<text x="{x-9:.1f}" y="{y(m[campo])-11:.1f}" fill="{cor}" '
                         f'font-size="12.5" font-weight="650" text-anchor="end">{txt}</text>')
    g.append("</svg>")
    return "".join(g)


LEGENDA = (f'<div class="legend"><span><i style="background:{C_DECL}"></i>'
           f'O que o Sales registra</span>'
           f'<span><i style="background:{C_REAL}"></i>Origem real (cruzamento)</span></div>')

# ------------------------------------------------------------------ dash completo
# So as midias de captacao no grafico: com "Lead Avulso" (10 mil) na mesma escala,
# todas as outras viram risquinho e o grafico deixa de contar a historia.
midias_top = [m for m in D["midias"] if m["rastreavel"] and max(m["real"], m["declarado"]) >= 10]
maxv = max(max(m["real"], m["declarado"]) for m in midias_top)
nao_midia = [m for m in D["midias"] if not m["rastreavel"] and m["real"] >= 10]
lojas_ruins = sorted([l for l in D["lojas"] if l["vendas"] >= 60 and not l["patio"]],
                     key=lambda l: -l["pct_avulso"])[:15]

p = [head("Conversoes Reais · Grupo Carrera")]
p.append('<div class="eyebrow">Grupo Carrera · Comercial</div>')
p.append('<h1>Conversões <span class="b">Reais</span></h1>')
p.append('<div class="sub">De onde as vendas vêm de verdade. O Sales registra a maioria das '
         'vendas sem mídia, porque a Opportunity nasce no balcão em vez de converter o lead '
         'que já existia. Aqui cada venda é cruzada por telefone e email contra a base de '
         'leads para recuperar a origem.</div>')
p.append(f'<div class="stamp">Vendas de {D["cobertura"]["de"][8:10]}/{D["cobertura"]["de"][5:7]} '
         f'a {D["cobertura"]["ate"][8:10]}/{D["cobertura"]["ate"][5:7]}/{D["cobertura"]["ate"][:4]} '
         f'· atualizado em {D["gerado_em"]}</div>')

p.append('<div class="hero"><div class="card">')
p.append(f'<div class="big">{G["fator"]}x</div>'.replace(".", ","))
p.append('<div class="bigsub">é o tamanho real da mídia dentro das vendas, comparado ao que '
         f'o Sales mostra. Saímos de <b>{n(G["antes"])}</b> vendas com origem rastreável para '
         f'<b>{n(G["depois"])}</b>.</div>')
p.append('</div><div class="tiles">')
p.append(tile("Vendas no período", n(G["vendas"]), money(G["valor"])))
p.append(tile("Com origem, hoje", f'{G["pct_antes"]:.1f}%'.replace(".", ","),
              f'{n(G["antes"])} vendas'))
p.append(tile("Com origem, real", f'{G["pct_depois"]:.1f}%'.replace(".", ","),
              f'{n(G["depois"])} vendas'))
p.append(tile("Vendas recuperadas", n(G["recuperadas"]), "origem que estava escondida"))
p.append("</div></div>")

p.append('<h2>O de-para: o que o Sales diz e o que aconteceu</h2>')
p.append('<div class="h2sub">Cada mídia de captação com o volume de vendas que o Sales atribui '
         'a ela e o volume que o cruzamento encontrou. Toda mídia cresce, nenhuma encolhe: o que '
         'o Sales registra é sempre um subconjunto do que aconteceu.</div>')
p.append(LEGENDA)
p.append('<div class="card">' + barra_dupla(midias_top, "declarado", "real", maxv) + '</div>')

p.append('<h2>O que sobra sem origem</h2>')
p.append('<div class="h2sub">Estes registros não são mídia de captação. Continuam grandes '
         'depois do cruzamento porque são vendas de cliente que nunca passou por um lead '
         'rastreável, ou o lead é anterior a 2026 e está fora desta base.</div>')
p.append('<div class="card"><table><tr><th>Registro</th><th>O Sales diz</th>'
         '<th>Depois do cruzamento</th><th>Variação</th></tr>')
for m in nao_midia:
    d = m["real"] - m["declarado"]
    cls = "up" if d < 0 else ""
    p.append(f'<tr><td><b>{escape(m["midia"])}</b></td><td>{n(m["declarado"])}</td>'
             f'<td>{n(m["real"])}</td>'
             f'<td class="{cls}">{"+" if d > 0 else ""}{n(d)}</td></tr>')
p.append("</table></div>")

p.append('<h2>A origem se perde no mesmo ritmo todo mês</h2>')
p.append('<div class="h2sub">Percentual das vendas do mês com mídia rastreável, antes e depois '
         'do cruzamento. A distância entre as duas linhas é o tamanho do buraco de registro.</div>')
p.append(LEGENDA)
p.append('<div class="card">' + linha_mensal(D["meses"]) + '</div>')

p.append('<h2>Por marca</h2>')
p.append('<div class="h2sub">Quanto cada marca perde de origem no registro e qual é a mídia '
         'que de fato mais vende nela.</div>')
p.append('<div class="card"><table><tr><th>Marca</th><th>Vendas</th><th>Com origem hoje</th>'
         '<th>Com origem real</th><th>Recuperadas</th><th>Mídia que mais vende</th></tr>')
for m in D["marcas"]:
    if m["vendas"] < 50:
        continue
    t = m["real_top_rastr"]
    top = t[0] if t else {"midia": "-", "n": 0}
    seg = (f'<span class="pill">2º {escape(t[1]["midia"])} {n(t[1]["n"])}</span>'
           if len(t) > 1 else "")
    p.append(f'<tr><td><b>{escape(m["marca"])}</b></td><td>{n(m["vendas"])}</td>'
             f'<td>{m["pct_antes"]:.0f}%</td><td class="up">{m["pct_depois"]:.0f}%</td>'
             f'<td>+{n(m["recuperadas"])}</td>'
             f'<td>{escape(top["midia"])} <b>{n(top["n"])}</b>{seg}</td></tr>')
p.append("</table></div>")

p.append('<h2>Onde o registro quebra</h2>')
p.append('<div class="h2sub">Lojas de varejo com mais de 60 vendas, ordenadas pelo percentual '
         'de vendas registradas como Lead Avulso. Não é ranking de performance comercial, é de '
         'disciplina de CRM: quanto maior, mais cega fica a análise de mídia daquela loja. '
         'Pátio e atacado ficam fora, porque lá o avulso é o normal do negócio.</div>')
p.append('<div class="card"><table><tr><th>Loja</th><th>Marca</th><th>Vendas</th>'
         '<th>Como avulso</th><th>% avulso</th><th>Origem recuperada</th></tr>')
for l in lojas_ruins:
    cls = "crit" if l["pct_avulso"] >= 70 else ("warn" if l["pct_avulso"] >= 50 else "")
    p.append(f'<tr><td><b>{escape(l["loja"])}</b></td><td>{escape(l["marca"])}</td>'
             f'<td>{n(l["vendas"])}</td><td>{n(l["avulso"])}</td>'
             f'<td class="{cls}">{l["pct_avulso"]:.0f}%</td>'
             f'<td>+{n(l["recuperadas"])}</td></tr>')
p.append("</table></div>")

p.append('<h2>Por tipo de venda</h2>')
p.append('<div class="card"><table><tr><th>Interesse</th><th>Vendas</th><th>Com origem hoje</th>'
         '<th>Com origem real</th><th>Mídia que mais vende</th></tr>')
for i in D["interesses"]:
    if i["vendas"] < 50:
        continue
    t = i["real_top_rastr"]
    top = t[0] if t else {"midia": "-", "n": 0}
    p.append(f'<tr><td><b>{escape(i["interesse"])}</b></td><td>{n(i["vendas"])}</td>'
             f'<td>{i["pct_antes"]:.0f}%</td><td class="up">{i["pct_depois"]:.0f}%</td>'
             f'<td>{escape(top["midia"])} <b>{n(top["n"])}</b></td></tr>')
p.append("</table></div>")

p.append('<h2>Quanto dá para confiar neste número</h2>')
p.append('<div class="h2sub">Três checagens, porque o painel muda decisão de verba e o número '
         'precisa aguentar contestação.</div>')
p.append('<div class="card">')
p.append(f'<b style="font-size:15px">1. O método acerta quando dá para conferir.</b>'
         f'<div class="nota" style="margin-top:6px">Em <b>{n(G["aferic_base"])}</b> vendas o Sales '
         f'já registrou uma mídia rastreável e o cruzamento também encontrou uma. Nesse grupo de '
         f'controle os dois apontam para a <b>mesma mídia em {G["aferic_pct"]:.1f}%</b> dos casos. '
         f'As divergências são quase todas Facebook contra WhatsApp, que é o anúncio de clique '
         f'para WhatsApp aparecendo dos dois jeitos, não erro de identificação de pessoa.</div>')
p.append('<div style="height:20px"></div>')
p.append('<b style="font-size:15px">2. O ganho não depende de lead antigo.</b>'
         '<div class="nota" style="margin-top:6px">Se apertarmos a janela e só aceitarmos leads '
         'recentes, o resultado quase não muda:</div>'
         '<table style="margin-top:10px"><tr><th>Janela aceita para o lead</th>'
         '<th>Vendas com origem</th><th>% do total</th></tr>')
for s in G["sens"]:
    pct = f'{s["pct"]:.1f}%'.replace(".", ",")  # so o decimal, nunca o separador de milhar
    p.append(f'<tr><td>{s["janela"]}</td><td>{n(s["n"])}</td><td>{pct}</td></tr>')
p.append('</table>')
p.append('<div style="height:20px"></div>')
p.append('<b style="font-size:15px">3. Não é lead criado no balcão na hora da venda.</b>'
         '<div class="nota" style="margin-top:6px">Se as vendas recuperadas fossem só registro '
         'de balcão, o lead nasceria no mesmo dia da venda. Intervalo entre o lead e a venda, '
         'nas vendas recuperadas:</div>'
         '<table style="margin-top:10px"><tr><th>Intervalo</th><th>Vendas</th><th>%</th></tr>')
for f_ in G["lag_faixas"]:
    pct = f'{f_["pct"]:.1f}%'.replace(".", ",")
    p.append(f'<tr><td>{f_["faixa"]}</td><td>{n(f_["n"])}</td><td>{pct}</td></tr>')
p.append('</table></div>')

p.append('<h2>Como este número é montado</h2>')
p.append('<div class="como">'
         '<b>Venda</b> = Opportunity com data de aprovação da venda no período. '
         f'<b>Chave do cruzamento</b> = telefone normalizado em DDD mais 8 dígitos (colapsa o '
         'nono dígito) e email em minúsculo. O telefone do comprador está preenchido em 99,8% '
         'das vendas sem mídia, por isso a cobertura é alta.<br>'
         '<b>Origem real</b> = a mídia do lead mais recente daquele cliente criado até a data da '
         'venda, priorizando a última mídia rastreável. A prioridade existe porque o lead mais '
         'recente costuma ser o próprio registro de balcão, que esconderia a mídia que trouxe o '
         'cliente.<br>'
         '<b>Rastreável</b> = Facebook, WhatsApp, Webmotors, Mercado Livre, OLX, MobiAuto, Site '
         'Carrera, Lead Montadora e OPV Montadora. URA, autoatendimento, passagem de oficina, '
         'revenda e VD Corporate são canais conhecidos, mas não são captação de mídia, então não '
         'entram na conta de rastreável.<br>'
         f'<b>Base de leads</b> = leads criados em 2026. Venda cujo cliente virou lead em 2025 '
         f'não é recuperada aqui, então <b>{G["pct_depois"]:.0f}% é piso, não teto</b>. '
         f'Nas vendas recuperadas, a mediana entre o lead e a venda é de '
         f'{G["lag_mediana_rec"]} dias e '
         f'{sum(f_["pct"] for f_ in G["lag_faixas"][:-1]):.0f}% têm lead de até 90 dias antes.'
         '</div>')

p.append('<footer>Documento interno do Grupo Carrera. Fonte: Salesforce Sales Cloud, '
         'extração direta. Este painel não altera nada no Sales, apenas reconstrói a origem '
         'das vendas por cruzamento de contato.</footer>')
p.append("</div></body></html>")

with open(f"{BASE}/conversoes-reais.html", "w", encoding="utf-8") as f:
    f.write("".join(p))

# ------------------------------------------------------------------ one-page
r = [head("Conversões Reais · Resumo · Grupo Carrera")]
r.append('<div class="eyebrow">Grupo Carrera · Comercial</div>')
r.append('<h1>Conversões <span class="b">Reais</span> · resumo</h1>')
r.append('<div class="sub">De onde as vendas vêm de verdade, depois de cruzar cada venda com a '
         'base de leads por telefone e email.</div>')
r.append(f'<div class="stamp">Vendas de 2026 até {D["cobertura"]["ate"][8:10]}/'
         f'{D["cobertura"]["ate"][5:7]} · atualizado em {D["gerado_em"]}</div>')
r.append('<div class="hero"><div class="card">')
r.append(f'<div class="big">{G["fator"]}x</div>'.replace(".", ","))
r.append('<div class="bigsub">é o tamanho real da mídia dentro das vendas, comparado ao que o '
         f'Sales mostra hoje.</div></div><div class="tiles">')
r.append(tile("Vendas", n(G["vendas"]), money(G["valor"])))
r.append(tile("Com origem hoje", f'{G["pct_antes"]:.0f}%', f'{n(G["antes"])} vendas'))
r.append(tile("Com origem real", f'{G["pct_depois"]:.0f}%', f'{n(G["depois"])} vendas'))
r.append(tile("Recuperadas", n(G["recuperadas"]), "origem escondida"))
r.append("</div></div>")
r.append('<h2>As mídias que mais vendem, de verdade</h2>')
r.append(LEGENDA)
top6 = [m for m in D["midias"] if m["rastreavel"] and m["real"] >= 30][:7]
r.append('<div class="card">' + barra_dupla(top6, "declarado", "real",
                                            max(max(m["real"], m["declarado"]) for m in top6))
         + '</div>')
r.append('<h2>Por marca</h2>')
r.append('<div class="card"><table><tr><th>Marca</th><th>Vendas</th><th>Origem hoje</th>'
         '<th>Origem real</th><th>Mídia nº 1</th></tr>')
for m in D["marcas"][:8]:
    if m["vendas"] < 50:
        continue
    t = m["real_top_rastr"]
    top = t[0] if t else {"midia": "-", "n": 0}
    r.append(f'<tr><td><b>{escape(m["marca"])}</b></td><td>{n(m["vendas"])}</td>'
             f'<td>{m["pct_antes"]:.0f}%</td><td class="up">{m["pct_depois"]:.0f}%</td>'
             f'<td>{escape(top["midia"])}</td></tr>')
r.append("</table></div>")
r.append(f'<div class="nota">O painel completo tem o de-para de todas as mídias, a evolução mês '
         f'a mês, o ranking de disciplina de CRM por loja e a metodologia. '
         f'Base: leads criados em 2026, então {G["pct_depois"]:.0f}% é piso.</div>')
r.append('<footer>Documento interno do Grupo Carrera. Fonte: Salesforce Sales Cloud.</footer>')
r.append("</div></body></html>")

with open(f"{BASE}/conversoes-reais-resumo.html", "w", encoding="utf-8") as f:
    f.write("".join(r))

print("HTML gerado: conversoes-reais.html e conversoes-reais-resumo.html")
