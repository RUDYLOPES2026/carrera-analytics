#!/usr/bin/env python3
"""Agrega o cruzamento em dados.json, a fonte unica do dash de Conversoes Reais.

Dois niveis, por decisao do Rudy em 26/07/2026:
  ORIGEM    = de onde o cliente veio. Tudo menos Lead Avulso e AutoAtendimento.
  CAPTACAO  = midia paga e portais. E o recorte que responde por verba.
"""
import json
import os
from collections import Counter, defaultdict
from datetime import datetime

BASE = os.path.dirname(os.path.abspath(__file__))

MARCA_NOME = {
    "GM": "Chevrolet", "VW": "Volkswagen", "NI": "Nissan", "GWC": "GWM",
    "OJC": "Omoda Jaecoo", "BJC": "Bajaj", "GCC": "GAC", "ZK": "Zeekr",
    "Outros": "Outros",
}

# Operacoes de patio/atacado: nao sao loja de varejo, entram no total mas ficam
# fora do ranking de disciplina de CRM (100% avulso ali e o normal do negocio).
PATIO = {"PAT VW ALPHAVILLE", "X.AGIL", "MAT GM", "MTZ BL"}

rows = [json.loads(l) for l in open(f"{BASE}/dados/vendas_cruzadas.ndjson", encoding="utf-8")]


def nivel(rs, campo_decl, campo_real, campo_rec):
    """Antes/depois/fator de um dos dois niveis de atribuicao."""
    n = len(rs)
    a = sum(1 for r in rs if campo_decl(r))
    d = sum(1 for r in rs if campo_real(r))
    return {
        "antes": a,
        "depois": d,
        "recuperadas": sum(1 for r in rs if r[campo_rec]),
        "pct_antes": round(100 * a / n, 1) if n else 0,
        "pct_depois": round(100 * d / n, 1) if n else 0,
        "fator": round(d / a, 2) if a else None,
    }


TEM_ORIGEM_DECL = lambda r: r["classe_declarada"] != "sem_origem"
TEM_ORIGEM_REAL = lambda r: r["classe_real"] != "sem_origem"
TEM_CAPT_DECL = lambda r: r["captacao_declarada"] is not None
TEM_CAPT_REAL = lambda r: r["captacao_real"] is not None


def bloco(rs):
    n = len(rs)
    if not n:
        return None
    avulso = sum(1 for r in rs if r["midia_declarada"] == "Lead Avulso")
    return {
        "vendas": n,
        "valor": round(sum(r["valor"] or 0 for r in rs)),
        "com_lead": sum(1 for r in rs if r["n_leads"]),
        "avulso": avulso,
        "pct_avulso": round(100 * avulso / n, 1),
        "origem": nivel(rs, TEM_ORIGEM_DECL, TEM_ORIGEM_REAL, "recuperada"),
        "captacao": nivel(rs, TEM_CAPT_DECL, TEM_CAPT_REAL, "recuperada_capt"),
    }


def top(rs, campo, k=6):
    c = Counter(r[campo] for r in rs if r[campo])
    return [{"midia": m, "n": v} for m, v in c.most_common(k)]


# ---------------------------------------------------------------- grupo
grupo = bloco(rows)

# Afericao: nas vendas em que o Sales JA sabia a origem e o cruzamento tambem
# achou uma, os dois apontam para a mesma? E o teste de credibilidade do metodo.
ctrl = [r for r in rows if r["classe_declarada"] == "captacao" and r["captacao_real"]]
acertos = sum(1 for r in ctrl if r["midia_declarada"] == r["captacao_real"])
grupo["aferic_base"] = len(ctrl)
grupo["aferic_pct"] = round(100 * acertos / len(ctrl), 1) if ctrl else None

# Sensibilidade: quanto do ganho sobrevive com janela mais curta.
recs = [r for r in rows if r["recuperada"] and r["lag_dias"] is not None]
base = grupo["origem"]["antes"]
grupo["sens"] = [{"janela": "12 meses (a regra)", "n": grupo["origem"]["depois"],
                  "pct": grupo["origem"]["pct_depois"]}]
for j in (90, 30):
    q = base + sum(1 for r in recs if r["lag_dias"] <= j)
    grupo["sens"].append({"janela": f"até {j} dias", "n": q,
                          "pct": round(100 * q / len(rows), 1)})

lags_rec = sorted(r["lag_dias"] for r in recs)
grupo["lag_mediana_rec"] = lags_rec[len(lags_rec) // 2] if lags_rec else None
faixas = [("Mesmo dia", 0, 0), ("1 a 2 dias", 1, 2), ("3 a 7 dias", 3, 7),
          ("8 a 30 dias", 8, 30), ("31 a 90 dias", 31, 90), ("Mais de 90 dias", 91, 10**6)]
grupo["lag_faixas"] = [
    {"faixa": nome, "n": (q := sum(1 for l in lags_rec if lo <= l <= hi)),
     "pct": round(100 * q / len(lags_rec), 1) if lags_rec else 0}
    for nome, lo, hi in faixas
]

# ---------------------------------------------------------------- de-para
decl_c, real_c = Counter(), Counter()
valor_real = defaultdict(float)
classe_de = {}
for r in rows:
    decl_c[r["midia_declarada"]] += 1
    real_c[r["midia_real"]] += 1
    valor_real[r["midia_real"]] += r["valor"] or 0
    classe_de[r["midia_real"]] = r["classe_real"]
    classe_de.setdefault(r["midia_declarada"], r["classe_declarada"])
origens = [{
    "midia": m,
    "declarado": decl_c[m],
    "real": real_c[m],
    "delta": real_c[m] - decl_c[m],
    "valor_real": round(valor_real[m]),
    "classe": classe_de.get(m, "sem_origem"),
} for m in sorted(set(decl_c) | set(real_c), key=lambda m: -real_c[m])]

# ---------------------------------------------------------------- recortes
por_mes = defaultdict(list)
for r in rows:
    por_mes[r["mes"]].append(r)
meses = [dict(mes=m, **bloco(rs)) for m, rs in sorted(por_mes.items())]

por_marca = defaultdict(list)
for r in rows:
    por_marca[r["marca"] or "Outros"].append(r)
marcas = []
for cod, rs in sorted(por_marca.items(), key=lambda kv: -len(kv[1])):
    b = bloco(rs)
    b.update(codigo=cod, marca=MARCA_NOME.get(cod, cod),
             origem_top=top(rs, "midia_real"), captacao_top=top(rs, "captacao_real"))
    marcas.append(b)

por_loja = defaultdict(list)
for r in rows:
    por_loja[r["empresa"] or "Sem loja"].append(r)
lojas = []
for loja, rs in por_loja.items():
    b = bloco(rs)
    cod = loja.split()[-1] if loja and " " in loja else "Outros"
    b.update(loja=loja, codigo=cod, marca=MARCA_NOME.get(cod, "Outros"), patio=loja in PATIO)
    lojas.append(b)
lojas.sort(key=lambda x: -x["vendas"])

por_int = defaultdict(list)
for r in rows:
    por_int[r["interesse"] or "Sem interesse"].append(r)
interesses = []
for i, rs in sorted(por_int.items(), key=lambda kv: -len(kv[1])):
    b = bloco(rs)
    b.update(interesse=i, origem_top=top(rs, "midia_real"), captacao_top=top(rs, "captacao_real"))
    interesses.append(b)

# ---------------------------------------------------------------- jornada
# Sob crédito de último toque, a mídia que sempre ABRE a jornada e nunca fecha
# parece não vender. "Trouxe" e "fechou" separam os dois papéis.
part, trouxe_c, fechou_c = Counter(), Counter(), Counter()
for r in rows:
    for m in r["jornada"]:
        part[m] += 1
    if r["trouxe"]:
        trouxe_c[r["trouxe"]] += 1
    if r["fechou"]:
        fechou_c[r["fechou"]] += 1
multi = [r for r in rows if r["multitoque"]]
pares = Counter((r["trouxe"], r["fechou"]) for r in multi if r["trouxe"] != r["fechou"])
jornada = {
    "multitoque": len(multi),
    "pct_multitoque": round(100 * len(multi) / len(rows), 1),
    "assist": [{"midia": m, "participou": part[m], "trouxe": trouxe_c[m],
                "fechou": fechou_c[m], "saldo": trouxe_c[m] - fechou_c[m]}
               for m, _ in part.most_common(14)],
    "pares": [{"de": a, "para": b, "n": v} for (a, b), v in pares.most_common(10)],
}

saida = {
    "gerado_em": datetime.now().strftime("%d/%m/%Y %H:%M"),
    "jornada": jornada,
    "cobertura": {
        "de": min(r["dt_venda"] for r in rows),
        "ate": max(r["dt_venda"] for r in rows),
        "janela_dias": 365,
    },
    "grupo": grupo,
    "origens": origens,
    "meses": meses,
    "marcas": marcas,
    "lojas": lojas,
    "interesses": interesses,
}

with open(f"{BASE}/dados.json", "w", encoding="utf-8") as f:
    json.dump(saida, f, ensure_ascii=False, indent=1)

o, c = grupo["origem"], grupo["captacao"]
print(f"dados.json gravado. Vendas {grupo['vendas']:,}")
print(f"  ORIGEM   {o['pct_antes']}% -> {o['pct_depois']}% (fator {o['fator']}x), "
      f"recuperadas {o['recuperadas']:,}")
print(f"  CAPTACAO {c['pct_antes']}% -> {c['pct_depois']}% (fator {c['fator']}x), "
      f"recuperadas {c['recuperadas']:,}")
print(f"Lojas: {len(lojas)} | marcas: {len(marcas)} | meses: {len(meses)}")
