#!/usr/bin/env python3
"""Renderiza o dash de Conversoes Reais (completo + one-page) a partir de dados.json."""
import json
import os
from html import escape

BASE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(f"{BASE}/dados.json", encoding="utf-8"))
G = D["grupo"]
O, C = G["origem"], G["captacao"]

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
.sub{color:#8b98a5;font-size:14.5px;margin-bottom:8px;max-width:770px}
.stamp{color:#5f6b78;font-size:12px;margin-bottom:30px}
h2{font-size:19px;margin:44px 0 4px}
.h2sub{color:#8b98a5;font-size:13.5px;margin-bottom:18px;max-width:770px}
.card{background:#141b24;border:1px solid #1f2a36;border-radius:16px;padding:22px 24px}
.duplo{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:8px}
.big{font-size:50px;font-weight:700;letter-spacing:-1.5px;line-height:1}
.bigsub{color:#8b98a5;font-size:13.5px;margin-top:9px}
.de-para{color:#5f6b78;font-size:12.5px;margin-top:12px;padding-top:11px;border-top:1px solid #1f2a36}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-top:16px}
.tile{background:#141b24;border:1px solid #1f2a36;border-radius:13px;padding:15px 17px}
.tile .k{color:#8b98a5;font-size:11.5px;letter-spacing:.7px;text-transform:uppercase}
.tile .v{font-size:25px;font-weight:650;margin-top:6px;letter-spacing:-.5px}
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
.grupo-tit{color:#8b98a5;font-size:11.5px;letter-spacing:1.2px;text-transform:uppercase;
margin:6px 0 14px;padding-bottom:8px;border-bottom:1px solid #1f2a36}
.grupo-tit:not(:first-child){margin-top:28px}
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
@media(max-width:760px){.duplo{grid-template-columns:1fr}.row{grid-template-columns:96px 1fr}
.wrap{padding:30px 15px 50px}h1{font-size:24px}.big{font-size:40px}}
"""


def n(x):
    return f"{x:,}".replace(",", ".")


def pct(x):
    return f"{x:.1f}%".replace(".", ",")


def money(v):
    if v >= 1_000_000_000:
        return f"R$ {v/1_000_000_000:.2f} bi".replace(".", ",")
    return f"R$ {v/1_000_000:.1f} mi".replace(".", ",")


def head(title):
    return (f'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
            f'<meta name="robots" content="noindex,nofollow">'
            f'<meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{escape(title)}</title><style>{CSS}</style></head><body><div class="wrap">')


def tile(k, v, d=""):
    return (f'<div class="tile"><div class="k">{k}</div><div class="v">{v}</div>'
            f'<div class="d">{d}</div></div>')


def cartao_nivel(titulo, sub, nv, cor):
    """Card de um dos dois niveis: percentual real grande + o de-para embaixo."""
    return (f'<div class="card"><div class="k" style="color:#8b98a5;font-size:11.5px;'
            f'letter-spacing:.7px;text-transform:uppercase">{titulo}</div>'
            f'<div class="big" style="color:{cor};margin-top:10px">{pct(nv["pct_depois"])}</div>'
            f'<div class="bigsub">{sub}</div>'
            f'<div class="de-para">O Sales mostra {pct(nv["pct_antes"])} '
            f'({n(nv["antes"])} vendas). O cruzamento acha {n(nv["depois"])}, '
            f'<b style="color:#c3ccd6">{str(nv["fator"]).replace(".", ",")}x</b>, '
            f'recuperando {n(nv["recuperadas"])}.</div></div>')


def barra_dupla(itens, maxv):
    """Duas barras por item: declarado (cinza) e real (azul). Valores FORA da
    barra: dentro somem nas curtas e brigam com o preenchimento nas longas."""
    out = ['<div class="bars">']
    for it in itens:
        a, b = it["declarado"], it["real"]
        wa = max(0.4, 78 * a / maxv) if maxv else 0
        wb = max(0.4, 78 * b / maxv) if maxv else 0
        d = b - a
        extra = (f' <span style="color:{C_OK if d > 0 else "#5f6b78"}">'
                 f'{"+" if d > 0 else ""}{n(d)}</span>') if d else ""
        out.append(
            f'<div class="row"><div class="lbl">{escape(it["midia"])}</div><div class="pair">'
            f'<div class="track"><div class="bar" style="width:{wa:.1f}%;background:{C_DECL}">'
            f'</div><b>{n(a)}</b></div>'
            f'<div class="track r"><div class="bar" style="width:{wb:.1f}%;background:{C_REAL}">'
            f'</div><b>{n(b)}{extra}</b></div></div></div>')
    out.append("</div>")
    return "".join(out)


def linha_mensal(meses):
    """SVG: % de vendas com origem e com captacao, mes a mes."""
    if len(meses) < 2:
        return ""
    W, H, PL, PR, PT, PB = 900, 230, 42, 16, 18, 34
    iw, ih = W - PL - PR, H - PT - PB
    topo = max(max(m["origem"]["pct_depois"] for m in meses) * 1.18, 10)
    xs = [PL + iw * i / (len(meses) - 1) for i in range(len(meses))]

    def y(v):
        return PT + ih - ih * v / topo

    series = [("origem", C_REAL), ("captacao", C_OK)]
    g = [f'<svg viewBox="0 0 {W} {H}" style="width:100%;height:auto" role="img" '
         f'aria-label="Percentual de vendas com origem e com captacao por mes">']
    for frac in (0, .25, .5, .75, 1):
        yy = PT + ih - ih * frac
        g.append(f'<line x1="{PL}" y1="{yy:.1f}" x2="{W-PR}" y2="{yy:.1f}" stroke="#1f2a36"/>')
        g.append(f'<text x="{PL-8}" y="{yy+4:.1f}" fill="#5f6b78" font-size="11" '
                 f'text-anchor="end">{topo*frac:.0f}%</text>')
    for chave, cor in series:
        d = " ".join(f"{'M' if i == 0 else 'L'}{x:.1f},{y(m[chave]['pct_depois']):.1f}"
                     for i, (x, m) in enumerate(zip(xs, meses)))
        g.append(f'<path d="{d}" fill="none" stroke="{cor}" stroke-width="2" '
                 f'stroke-linecap="round" stroke-linejoin="round"/>')
        for x, m in zip(xs, meses):
            g.append(f'<circle cx="{x:.1f}" cy="{y(m[chave]["pct_depois"]):.1f}" r="4" '
                     f'fill="{cor}" stroke="#141b24" stroke-width="2"/>')
    for i, (x, m) in enumerate(zip(xs, meses)):
        g.append(f'<text x="{x:.1f}" y="{H-12}" fill="#5f6b78" font-size="11" '
                 f'text-anchor="middle">{m["mes"][5:]}</text>')
        if i == len(meses) - 1:
            for chave, cor in series:
                # rotulo formatado antes: um replace no f-string inteiro
                # corromperia as coordenadas do SVG
                txt = f'{m[chave]["pct_depois"]:.0f}%'
                g.append(f'<text x="{x-9:.1f}" y="{y(m[chave]["pct_depois"])-11:.1f}" '
                         f'fill="{cor}" font-size="12.5" font-weight="650" '
                         f'text-anchor="end">{txt}</text>')
    g.append("</svg>")
    return "".join(g)


LEGENDA = (f'<div class="legend"><span><i style="background:{C_DECL}"></i>'
           f'O que o Sales registra</span>'
           f'<span><i style="background:{C_REAL}"></i>Real, depois do cruzamento</span></div>')

capt = [o for o in D["origens"] if o["classe"] == "captacao" and max(o["real"], o["declarado"]) >= 10]
outras = [o for o in D["origens"] if o["classe"] == "outra_origem" and max(o["real"], o["declarado"]) >= 10]
sem = [o for o in D["origens"] if o["classe"] == "sem_origem" and max(o["real"], o["declarado"]) >= 10]
maxv = max([max(o["real"], o["declarado"]) for o in capt + outras] or [1])
lojas_ruins = sorted([l for l in D["lojas"] if l["vendas"] >= 60 and not l["patio"]],
                     key=lambda l: -l["pct_avulso"])[:15]

# ------------------------------------------------------------------ dash completo
p = [head("Conversoes Reais · Grupo Carrera")]
p.append('<div class="eyebrow">Grupo Carrera · Comercial</div>')
p.append('<h1>Conversões <span class="b">Reais</span></h1>')
p.append('<div class="sub">De onde as vendas vêm de verdade. O Sales perde a origem da maior '
         'parte das vendas, porque a Opportunity nasce no balcão em vez de converter o lead que '
         'já existia. Aqui cada venda é cruzada por telefone e email contra a base de leads dos '
         '12 meses anteriores a ela.</div>')
p.append(f'<div class="stamp">Vendas de {D["cobertura"]["de"][8:10]}/{D["cobertura"]["de"][5:7]} '
         f'a {D["cobertura"]["ate"][8:10]}/{D["cobertura"]["ate"][5:7]}/{D["cobertura"]["ate"][:4]} '
         f'· {n(G["vendas"])} vendas · {money(G["valor"])} · atualizado em {D["gerado_em"]}</div>')

p.append('<div class="duplo">')
p.append(cartao_nivel("De onde o cliente veio", "das vendas têm origem identificada depois do "
                      "cruzamento. Conta qualquer porta de entrada real, inclusive telefone, "
                      "oficina e revenda.", O, "#f59e0b"))
p.append(cartao_nivel("Mídia paga e portais", "das vendas vêm de mídia de captação. É o recorte "
                      "que responde por verba: Facebook, WhatsApp, Webmotors, Mercado Livre, "
                      "OLX, site e montadora.", C, C_OK))
p.append("</div>")
p.append('<div class="tiles">')
p.append(tile("Vendas no período", n(G["vendas"]), money(G["valor"])))
# contagem, nao percentual: 19.058 de 19.062 arredonda para "100,0%" e o leitor
# estranha com razao, porque quatro vendas nao acharam lead
p.append(tile("Acharam lead", n(G["com_lead"]), f'de {n(G["vendas"])} vendas'))
p.append(tile("Origem recuperada", n(O["recuperadas"]), "o Sales não sabia"))
p.append(tile("Mídia recuperada", n(C["recuperadas"]), "estava fora do radar de verba"))
p.append("</div>")

p.append('<h2>O de-para: o que o Sales diz e o que aconteceu</h2>')
p.append('<div class="h2sub">Cada origem com o volume de vendas que o Sales atribui a ela e o '
         'volume que o cruzamento encontrou. Quase tudo cresce: o que o Sales registra é em '
         'geral um subconjunto do que aconteceu.</div>')
p.append(LEGENDA)
p.append('<div class="card">')
p.append('<div class="grupo-tit">Mídia paga e portais</div>' + barra_dupla(capt, maxv))
if outras:
    p.append('<div class="grupo-tit">Outras origens (não são mídia de captação)</div>'
             + barra_dupla(outras, maxv))
p.append("</div>")

p.append('<h2>O que sobra sem origem</h2>')
p.append('<div class="h2sub">Lead Avulso e AutoAtendimento não dizem de onde o cliente veio. '
         'O que sobra aqui depois do cruzamento é venda de cliente que nunca passou por um lead '
         'com origem nos 12 meses anteriores.</div>')
p.append('<div class="card"><table><tr><th>Registro</th><th>O Sales diz</th>'
         '<th>Depois do cruzamento</th><th>Variação</th></tr>')
for m in sem:
    d = m["real"] - m["declarado"]
    p.append(f'<tr><td><b>{escape(m["midia"])}</b></td><td>{n(m["declarado"])}</td>'
             f'<td>{n(m["real"])}</td>'
             f'<td class="{"up" if d < 0 else ""}">{"+" if d > 0 else ""}{n(d)}</td></tr>')
p.append("</table></div>")

p.append('<h2>Mês a mês</h2>')
p.append('<div class="h2sub">Percentual das vendas do mês com origem identificada e com mídia '
         'de captação, sempre depois do cruzamento.</div>')
p.append(f'<div class="legend"><span><i style="background:{C_REAL}"></i>Com origem</span>'
         f'<span><i style="background:{C_OK}"></i>Mídia paga e portais</span></div>')
p.append('<div class="card">' + linha_mensal(D["meses"]) + '</div>')

J = D["jornada"]
p.append('<h2>Quem trouxe e quem fechou</h2>')
p.append(f'<div class="h2sub">Em <b>{n(J["multitoque"])} vendas ({pct(J["pct_multitoque"])} '
         f'do total)</b> o cliente passou por mais de uma origem antes de comprar. O crédito do '
         f'painel vai todo para quem fechou, então a mídia que sempre abre a jornada e nunca '
         f'fecha parece vender menos do que vende. Esta tabela separa os dois papéis.</div>')
p.append('<div class="card"><table><tr><th>Origem</th><th>Participou</th><th>Trouxe</th>'
         '<th>Fechou</th><th>Saldo</th><th>Papel</th></tr>')
for a in J["assist"]:
    s = a["saldo"]
    # abrir e fechar sao papeis, nao virtude: a cor fica so no saldo, e sinaliza
    # onde o credito de ultimo toque subestima a origem
    if abs(s) < max(30, 0.08 * a["participou"]):
        papel, cls = "Equilibrada", ""
    elif s > 0:
        papel, cls = "Abre a jornada", "warn"
    else:
        papel, cls = "Fecha a venda", ""
    p.append(f'<tr><td><b>{escape(a["midia"])}</b></td><td>{n(a["participou"])}</td>'
             f'<td>{n(a["trouxe"])}</td><td>{n(a["fechou"])}</td>'
             f'<td class="{cls}">{"+" if s > 0 else ""}{n(s)}</td>'
             f'<td style="color:#8b98a5">{papel}</td></tr>')
p.append("</table>")
p.append('<div class="nota">Saldo positivo significa que a origem traz mais do que fecha, ou '
         'seja, o crédito de último toque a subestima. Saldo negativo é o contrário.</div>')
p.append("</div>")

p.append('<h3 style="font-size:16px;margin:26px 0 4px">Os caminhos mais comuns</h3>')
p.append('<div class="h2sub">Pares em que a origem que trouxe o cliente é diferente da que '
         'fechou a venda.</div>')
p.append('<div class="card"><table><tr><th>Trouxe o cliente</th><th>Fechou a venda</th>'
         '<th>Vendas</th></tr>')
for x in J["pares"]:
    p.append(f'<tr><td><b>{escape(x["de"])}</b></td><td>{escape(x["para"])}</td>'
             f'<td>{n(x["n"])}</td></tr>')
p.append("</table></div>")

p.append('<h2>Por marca</h2>')
p.append('<div class="h2sub">Quanto cada marca perde de origem no registro e qual é a mídia que '
         'de fato mais vende nela.</div>')
p.append('<div class="card"><table><tr><th>Marca</th><th>Vendas</th><th>Origem hoje</th>'
         '<th>Origem real</th><th>Mídia real</th><th>Mídia que mais vende</th></tr>')
for m in D["marcas"]:
    if m["vendas"] < 50:
        continue
    t = m["captacao_top"]
    top1 = t[0] if t else {"midia": "-", "n": 0}
    seg = (f'<span class="pill">2º {escape(t[1]["midia"])} {n(t[1]["n"])}</span>'
           if len(t) > 1 else "")
    p.append(f'<tr><td><b>{escape(m["marca"])}</b></td><td>{n(m["vendas"])}</td>'
             f'<td>{m["origem"]["pct_antes"]:.0f}%</td>'
             f'<td class="up">{m["origem"]["pct_depois"]:.0f}%</td>'
             f'<td>{m["captacao"]["pct_depois"]:.0f}%</td>'
             f'<td>{escape(top1["midia"])} <b>{n(top1["n"])}</b>{seg}</td></tr>')
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
             f'<td>+{n(l["origem"]["recuperadas"])}</td></tr>')
p.append("</table></div>")

p.append('<h2>Por tipo de venda</h2>')
p.append('<div class="card"><table><tr><th>Interesse</th><th>Vendas</th><th>Origem hoje</th>'
         '<th>Origem real</th><th>Mídia real</th><th>Mídia que mais vende</th></tr>')
for i in D["interesses"]:
    if i["vendas"] < 50:
        continue
    t = i["captacao_top"]
    top1 = t[0] if t else {"midia": "-", "n": 0}
    p.append(f'<tr><td><b>{escape(i["interesse"])}</b></td><td>{n(i["vendas"])}</td>'
             f'<td>{i["origem"]["pct_antes"]:.0f}%</td>'
             f'<td class="up">{i["origem"]["pct_depois"]:.0f}%</td>'
             f'<td>{i["captacao"]["pct_depois"]:.0f}%</td>'
             f'<td>{escape(top1["midia"])} <b>{n(top1["n"])}</b></td></tr>')
p.append("</table></div>")

p.append('<h2>Quanto dá para confiar neste número</h2>')
p.append('<div class="h2sub">Três checagens, porque o painel muda decisão de verba e o número '
         'precisa aguentar contestação.</div>')
p.append('<div class="card">')
p.append(f'<b style="font-size:15px">1. O método acerta quando dá para conferir.</b>'
         f'<div class="nota" style="margin-top:6px">Em <b>{n(G["aferic_base"])}</b> vendas o '
         f'Sales já registrou uma mídia de captação e o cruzamento também encontrou uma. Nesse '
         f'grupo de controle os dois apontam para a <b>mesma mídia em {pct(G["aferic_pct"])}</b> '
         f'dos casos. As divergências são quase todas Facebook contra WhatsApp, que é o anúncio '
         f'de clique para WhatsApp aparecendo dos dois jeitos, não erro de identificação de '
         f'pessoa.</div>')
p.append('<div style="height:20px"></div>')
p.append('<b style="font-size:15px">2. O ganho não depende de lead antigo.</b>'
         '<div class="nota" style="margin-top:6px">Apertando a janela e aceitando só leads '
         'recentes, o resultado se sustenta:</div>'
         '<table style="margin-top:10px"><tr><th>Janela aceita para o lead</th>'
         '<th>Vendas com origem</th><th>% do total</th></tr>')
for s in G["sens"]:
    p.append(f'<tr><td>{s["janela"]}</td><td>{n(s["n"])}</td><td>{pct(s["pct"])}</td></tr>')
p.append('</table>')
p.append('<div style="height:20px"></div>')
p.append('<b style="font-size:15px">3. Não é lead criado no balcão na hora da venda.</b>'
         '<div class="nota" style="margin-top:6px">Se as vendas recuperadas fossem só registro '
         'de balcão, o lead nasceria no mesmo dia da venda. Intervalo entre o lead e a venda, '
         'nas recuperadas:</div>'
         '<table style="margin-top:10px"><tr><th>Intervalo</th><th>Vendas</th><th>%</th></tr>')
for f_ in G["lag_faixas"]:
    p.append(f'<tr><td>{f_["faixa"]}</td><td>{n(f_["n"])}</td><td>{pct(f_["pct"])}</td></tr>')
p.append('</table></div>')

p.append('<h2>A regra, em uma tela</h2>')
p.append('<div class="como">'
         '<b>Venda</b> = Opportunity com data de aprovação da venda no período, nas fases '
         'Entregue, Faturado, Vendido, Pronto para Faturar e Aguardando Pagamento. É régua '
         'comercial, não fiscal: não é faturamento.<br>'
         '<b>Chave</b> = telefone normalizado em DDD mais 8 dígitos (colapsa o nono dígito) ou '
         'email em minúsculo; basta bater um dos dois. O telefone do comprador está preenchido '
         'em 99,8% das vendas sem origem, por isso a cobertura é alta. Email repetido em mais '
         'de 30 leads é descartado, porque é email de loja ou de vendedor. CPF não entra, só '
         'tem cerca de 34% de preenchimento.<br>'
         '<b>Janela</b> = 12 meses móveis antes de cada venda, não ano civil. Assim janeiro '
         'enxerga tanto quanto dezembro.<br>'
         '<b>Origem real</b> = a origem do lead mais recente do cliente dentro da janela. Se '
         'nenhum lead disser a origem, vale o lead mais recente; sem lead nenhum, fica o que a '
         'Opp declarou.<br>'
         '<b>Origem</b> = qualquer porta de entrada real, inclusive URA (telefone), passagem de '
         'oficina, revenda, evento e VD Corporate. <b>Não são origem</b> apenas Lead Avulso e '
         'AutoAtendimento, que não dizem de onde o cliente veio.<br>'
         '<b>Captação</b> = o subconjunto de mídia paga e portais (Facebook, WhatsApp, '
         'Webmotors, Mercado Livre, OLX, MobiAuto, Site Carrera, Lead Montadora, OPV Montadora). '
         'Calculado em separado para que URA e revenda não canibalizem o número de verba.<br>'
         '<b>Crédito</b> = 100% para uma única origem, sem atribuição fracionada. A venda vai '
         'para a loja da venda; a loja do lead é registrada mas não atribui.<br>'
         f'<b>Cobertura</b> = {n(G["com_lead"])} das {n(G["vendas"])} vendas '
         f'({pct(100 * G["com_lead"] / G["vendas"])}) encontraram pelo menos um lead. Nas '
         f'recuperadas, a mediana entre o lead e a venda é de {G["lag_mediana_rec"]} dias.'
         '</div>')

p.append('<footer>Documento interno do Grupo Carrera. Fonte: Salesforce Sales Cloud, extração '
         'direta. Este painel não altera nada no Sales, apenas reconstrói a origem das vendas '
         'por cruzamento de contato.</footer>')
p.append("</div></body></html>")

with open(f"{BASE}/conversoes-reais.html", "w", encoding="utf-8") as f:
    f.write("".join(p))

# ------------------------------------------------------------------ one-page
r = [head("Conversões Reais · Resumo · Grupo Carrera")]
r.append('<div class="eyebrow">Grupo Carrera · Comercial</div>')
r.append('<h1>Conversões <span class="b">Reais</span> · resumo</h1>')
r.append('<div class="sub">De onde as vendas vêm de verdade, depois de cruzar cada venda com a '
         'base de leads dos 12 meses anteriores, por telefone e email.</div>')
r.append(f'<div class="stamp">{n(G["vendas"])} vendas · {money(G["valor"])} · até '
         f'{D["cobertura"]["ate"][8:10]}/{D["cobertura"]["ate"][5:7]} · '
         f'atualizado em {D["gerado_em"]}</div>')
r.append('<div class="duplo">')
r.append(cartao_nivel("De onde o cliente veio", "das vendas têm origem identificada. Conta "
                      "qualquer porta de entrada real, inclusive telefone e oficina.",
                      O, "#f59e0b"))
r.append(cartao_nivel("Mídia paga e portais", "vêm de mídia de captação. É o recorte que "
                      "responde por verba.", C, C_OK))
r.append("</div>")
r.append('<h2>As mídias que mais vendem, de verdade</h2>')
r.append(LEGENDA)
top7 = [o for o in capt if o["real"] >= 30][:7]
r.append('<div class="card">' + barra_dupla(top7, max(max(o["real"], o["declarado"])
                                                      for o in top7)) + '</div>')
r.append('<h2>Por marca</h2>')
r.append('<div class="card"><table><tr><th>Marca</th><th>Vendas</th><th>Origem hoje</th>'
         '<th>Origem real</th><th>Mídia nº 1</th></tr>')
for m in D["marcas"][:8]:
    if m["vendas"] < 50:
        continue
    t = m["captacao_top"]
    top1 = t[0] if t else {"midia": "-", "n": 0}
    r.append(f'<tr><td><b>{escape(m["marca"])}</b></td><td>{n(m["vendas"])}</td>'
             f'<td>{m["origem"]["pct_antes"]:.0f}%</td>'
             f'<td class="up">{m["origem"]["pct_depois"]:.0f}%</td>'
             f'<td>{escape(top1["midia"])}</td></tr>')
r.append("</table></div>")
r.append('<div class="nota">O painel completo tem o de-para de todas as origens, a evolução mês '
         'a mês, o ranking de disciplina de CRM por loja, as três checagens do método e a regra '
         'inteira escrita.</div>')
r.append('<footer>Documento interno do Grupo Carrera. Fonte: Salesforce Sales Cloud.</footer>')
r.append("</div></body></html>")

with open(f"{BASE}/conversoes-reais-resumo.html", "w", encoding="utf-8") as f:
    f.write("".join(r))

print("HTML gerado: conversoes-reais.html e conversoes-reais-resumo.html")
