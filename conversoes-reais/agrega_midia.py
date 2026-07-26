#!/usr/bin/env python3
"""Agrega o dash operacional: de onde saiu venda, como está agora, o que mudou.

Fonte: vendas_cruzadas.ndjson (a atribuicao) + leads_enriq.ndjson (campanha,
conjunto, anuncio e UTM do lead que levou o credito).

Todo recorte de periodo compara com a janela IMEDIATAMENTE anterior do MESMO
tamanho. Comparar mes corrente parcial com mes anterior inteiro produz queda
que nao existe, e isso ja custou caro nos dashs de Midia.
"""
import json
import os
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timedelta

BASE = os.path.dirname(os.path.abspath(__file__))
MES_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
          "agosto", "setembro", "outubro", "novembro", "dezembro"]

# ---------------------------------------------------------------- parser de nome
# Conservador de proposito: marca so quando o token aparece isolado, senao
# "GM" casaria dentro de qualquer palavra. Nome nunca deixa de ser exibido cru.
SEG_EMOJI = {"🟩": "Novos", "🟧": "Seminovos", "🟦": "Venda Direta",
             "🟫": "Remarketing", "🟥": "Outros"}
MARCA_TOK = {
    "BJC": "Bajaj", "BAJ": "Bajaj", "BAJAJ": "Bajaj",
    "GM": "Chevrolet", "CHEV": "Chevrolet",
    "VW": "Volkswagen",
    "NI": "Nissan", "NISSAN": "Nissan",
    "GWM": "GWM", "GWC": "GWM",
    "OJ": "Omoda Jaecoo", "OJC": "Omoda Jaecoo", "OMODA": "Omoda Jaecoo",
    "GAC": "GAC", "GCC": "GAC",
    "ZK": "Zeekr", "ZEEKR": "Zeekr",
}
FORMATO_TOK = {
    "FORM": "Formulário", "FORMULARIO": "Formulário",
    "WPP": "WhatsApp", "WA": "WhatsApp", "MSG": "WhatsApp", "MENSAGEM": "WhatsApp",
    "RMKT": "Remarketing", "ALCANCE": "Alcance", "TRAFEGO": "Tráfego",
}


def tokens(nome):
    sem_acento = "".join(c for c in unicodedata.normalize("NFD", nome)
                         if unicodedata.category(c) != "Mn")
    return [t for t in re.split(r"[^A-Za-z0-9]+", sem_acento.upper()) if t]


def parse_campanha(nome):
    if not nome:
        return {}
    out = {}
    for e, seg in SEG_EMOJI.items():
        if nome.startswith(e):
            out["segmento"] = seg
            break
    tks = tokens(nome)
    for t in tks:
        if t in MARCA_TOK and "marca" not in out:
            out["marca"] = MARCA_TOK[t]
        if t in FORMATO_TOK and "formato" not in out:
            out["formato"] = FORMATO_TOK[t]
    return out


# ---------------------------------------------------------------- dados
enr = {}
for line in open(f"{BASE}/dados/leads_enriq.ndjson", encoding="utf-8"):
    r = json.loads(line)
    enr[r["Id"]] = r
rows = [json.loads(l) for l in open(f"{BASE}/dados/vendas_cruzadas.ndjson", encoding="utf-8")]

ATE = max(r["dt_venda"] for r in rows)
ate_dt = datetime.strptime(ATE, "%Y-%m-%d")


def dia(d):
    return d.strftime("%Y-%m-%d")


def janela(rs, ini, fim):
    return [r for r in rs if ini <= r["dt_venda"] <= fim]


def conta(rs):
    return {
        "vendas": len(rs),
        "origem": sum(1 for r in rs if r["classe_real"] != "sem_origem"),
        "captacao": sum(1 for r in rs if r["captacao_real"]),
        "valor": round(sum(r["valor"] or 0 for r in rs)),
    }


def var(a, b):
    """Variacao percentual de b (anterior) para a (atual)."""
    if not b:
        return None
    return round(100 * (a - b) / b, 1)


# ---------------------------------------------------------------- pulso
ini_mes = ATE[:8] + "01"
dias_corridos = int(ATE[8:10])
# mesmo numero de dias do mes anterior, para nao comparar parcial com inteiro
prim_mes = datetime.strptime(ini_mes, "%Y-%m-%d")
fim_ant = prim_mes - timedelta(days=1)
ini_ant = fim_ant.replace(day=1)
fim_ant_eq = min(ini_ant + timedelta(days=dias_corridos - 1), fim_ant)

d7_ini = ate_dt - timedelta(days=6)
d7_ant_fim = d7_ini - timedelta(days=1)
d7_ant_ini = d7_ant_fim - timedelta(days=6)

mes_atual = janela(rows, ini_mes, ATE)
mes_ant = janela(rows, dia(ini_ant), dia(fim_ant_eq))
d7 = janela(rows, dia(d7_ini), ATE)
d7_ant = janela(rows, dia(d7_ant_ini), dia(d7_ant_fim))

pulso = {
    "mes": {
        "label": f"{MES_PT[prim_mes.month - 1]}, dias 1 a {dias_corridos}",
        "cmp_label": f"mesmos {dias_corridos} dias de {MES_PT[ini_ant.month - 1]}",
        "atual": conta(mes_atual), "anterior": conta(mes_ant),
    },
    "d7": {
        "label": f"{dia(d7_ini)[8:10]}/{dia(d7_ini)[5:7]} a {ATE[8:10]}/{ATE[5:7]}",
        "cmp_label": "7 dias anteriores",
        "atual": conta(d7), "anterior": conta(d7_ant),
    },
}
for b in pulso.values():
    b["var"] = {k: var(b["atual"][k], b["anterior"][k]) for k in ("vendas", "origem", "captacao")}

# ---------------------------------------------------------------- serie diaria
serie = []
for i in range(59, -1, -1):
    d = dia(ate_dt - timedelta(days=i))
    rs = [r for r in rows if r["dt_venda"] == d]
    serie.append({
        "dia": d,
        "captacao": sum(1 for r in rs if r["captacao_real"]),
        "outra": sum(1 for r in rs if r["classe_real"] == "outra_origem"),
        "sem": sum(1 for r in rs if r["classe_real"] == "sem_origem"),
        "total": len(rs),
    })

# ---------------------------------------------------------------- 30d x 30d
a30_ini = dia(ate_dt - timedelta(days=29))
p30_fim = dia(ate_dt - timedelta(days=30))
p30_ini = dia(ate_dt - timedelta(days=59))
a30 = janela(rows, a30_ini, ATE)
p30 = janela(rows, p30_ini, p30_fim)


def ranking(rs_a, rs_p, chave, minimo=3):
    ca, cp = Counter(), Counter()
    for r in rs_a:
        k = chave(r)
        if k:
            ca[k] += 1
    for r in rs_p:
        k = chave(r)
        if k:
            cp[k] += 1
    out = []
    for k in set(ca) | set(cp):
        if max(ca[k], cp[k]) < minimo:
            continue
        out.append({"nome": k, "atual": ca[k], "anterior": cp[k],
                    "delta": ca[k] - cp[k], "var": var(ca[k], cp[k])})
    out.sort(key=lambda x: -x["atual"])
    return out


classe_de = {}
for r in rows:
    classe_de[r["midia_real"]] = r["classe_real"]
rank_origem = ranking(a30, p30, lambda r: r["midia_real"], minimo=1)
for x in rank_origem:
    x["classe"] = classe_de.get(x["nome"], "sem_origem")


def campo(nome):
    return lambda r: (enr.get(r["lead_id_capt"]) or {}).get(nome)


rank_camp = ranking(a30, p30, campo("CampaignName__c"), minimo=2)
for x in rank_camp:
    x.update(parse_campanha(x["nome"]))
rank_adset = ranking(a30, p30, campo("AdGroupName__c"), minimo=2)
rank_ad = ranking(a30, p30, campo("AdName__c"), minimo=2)
rank_utm = ranking(a30, p30, campo("UTM_Campaign__c"), minimo=3)

# ---------------------------------------------------------------- movimentos
# O que um diretor quer ver sem procurar: o que sumiu, o que nasceu, o que
# disparou. Piso de volume para nao encher a tela de ruido de 2 vendas.
movimentos = []


def move(nivel, itens, piso_novo=4, piso_sumiu=5, piso_var=6):
    for x in itens:
        a, p = x["atual"], x["anterior"]
        if p == 0 and a >= piso_novo:
            movimentos.append({"tipo": "novo", "nivel": nivel, "nome": x["nome"],
                               "atual": a, "anterior": p,
                               "txt": f"0 para {a} vendas"})
        elif a == 0 and p >= piso_sumiu:
            movimentos.append({"tipo": "sumiu", "nivel": nivel, "nome": x["nome"],
                               "atual": a, "anterior": p,
                               "txt": f"{p} para 0 vendas"})
        elif x["var"] is not None and abs(x["var"]) >= 40 and max(a, p) >= piso_var:
            movimentos.append({
                "tipo": "subiu" if x["var"] > 0 else "caiu", "nivel": nivel,
                "nome": x["nome"], "atual": a, "anterior": p, "var": x["var"],
                "txt": f"{p} para {a} vendas ({'+' if x['var'] > 0 else ''}{x['var']:.0f}%)"
                       .replace(".0", "")})


move("Origem", rank_origem, piso_novo=6, piso_sumiu=8, piso_var=15)
move("Campanha", rank_camp)
move("Anúncio", rank_ad)
ordem = {"sumiu": 0, "caiu": 1, "subiu": 2, "novo": 3}
movimentos.sort(key=lambda m: (ordem[m["tipo"]], -max(m["atual"], m["anterior"])))
# Teto por tipo: sem isso, uma troca de agencia (varias campanhas velhas morrendo
# de uma vez) enche a lista de "caiu" e esconde o resto.
por_tipo = Counter()
equilibrado = []
for m in movimentos:
    if por_tipo[m["tipo"]] >= 4:
        continue
    por_tipo[m["tipo"]] += 1
    equilibrado.append(m)
movimentos = equilibrado

# ---------------------------------------------------------------- cobertura
capt_rows = [r for r in rows if r["captacao_real"]]
fb = [r for r in capt_rows if r["captacao_real"] == "Facebook"]
fb90 = [r for r in fb if r["dt_venda"] >= dia(ate_dt - timedelta(days=89))]
com = lambda rs, c: sum(1 for r in rs if (enr.get(r["lead_id_capt"]) or {}).get(c))
cobertura = {
    "capt_total": len(capt_rows), "capt_camp": com(capt_rows, "CampaignName__c"),
    "fb_total": len(fb), "fb_camp": com(fb, "CampaignName__c"),
    "fb90_total": len(fb90), "fb90_camp": com(fb90, "CampaignName__c"),
    "utm": com(capt_rows, "UTM_Campaign__c"),
}
for a, b, k in (("capt_camp", "capt_total", "capt_pct"), ("fb_camp", "fb_total", "fb_pct"),
                ("fb90_camp", "fb90_total", "fb90_pct"), ("utm", "capt_total", "utm_pct")):
    cobertura[k] = round(100 * cobertura[a] / cobertura[b], 1) if cobertura[b] else 0

saida = {
    "gerado_em": datetime.now().strftime("%d/%m/%Y %H:%M"),
    "ate": ATE,
    "janela_30d": {"atual": [a30_ini, ATE], "anterior": [p30_ini, p30_fim]},
    "pulso": pulso,
    "serie": serie,
    "rank_origem": rank_origem,
    "rank_campanha": rank_camp[:20],
    "rank_adset": rank_adset[:15],
    "rank_anuncio": rank_ad[:20],
    "rank_utm": rank_utm[:20],
    "movimentos": movimentos[:14],
    "cobertura": cobertura,
}
with open(f"{BASE}/dados_midia.json", "w", encoding="utf-8") as f:
    json.dump(saida, f, ensure_ascii=False, indent=1)

print(f"dados_midia.json gravado (até {ATE})")
print(f"  mês: {pulso['mes']['atual']['vendas']} vendas vs {pulso['mes']['anterior']['vendas']} "
      f"({pulso['mes']['var']['vendas']:+}%)")
print(f"  7d : {pulso['d7']['atual']['vendas']} vs {pulso['d7']['anterior']['vendas']} "
      f"({pulso['d7']['var']['vendas']:+}%)")
print(f"  campanhas {len(rank_camp)} | anúncios {len(rank_ad)} | UTMs {len(rank_utm)} "
      f"| movimentos {len(movimentos)}")
print(f"  cobertura Facebook 90d: {cobertura['fb90_pct']}%")
