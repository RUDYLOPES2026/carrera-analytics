#!/usr/bin/env python3
"""Conversoes Reais: reconstroi a origem de cada venda cruzando com a base de leads.

Problema: 77% das vendas 2026 chegam no Sales sem midia rastreavel (52% "Lead Avulso"),
porque o vendedor abre a Opportunity no balcao em vez de converter o lead que ja existia.
Do lado do lead, 97% tem origem.

Metodo (mesmo do cruzamento Webmotors, generalizado para todas as midias):
telefone normalizado em DDD + 8 digitos e email em minusculo; o lead tem que ser anterior
ou do mesmo dia da venda; entre varios, vale o mais recente (last touch).

Alem do last touch, guardamos a ULTIMA MIDIA RASTREAVEL, porque o lead mais recente
costuma ser o proprio registro de balcao e esconderia a midia que trouxe o cliente.
"""
import json
import os
import re
import sys
from collections import defaultdict
from datetime import datetime, timedelta
from glob import glob

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dados")

# Classificacao das midias. Chave = valor em minusculo (Lead e Opp divergem na
# capitalizacao: "Whatsapp" x "WhatsApp", "Ura" x "URA").
#
# Regra definida pelo Rudy em 26/07/2026: ORIGEM e qualquer porta de entrada real,
# inclusive o telefone (URA), a oficina e a revenda. Nao contam como origem apenas
# os dois registros que nao dizem nada sobre de onde o cliente veio: "Lead Avulso"
# (aberto no balcao) e "AutoAtendimento".
#
# Dentro da origem separamos CAPTACAO (midia paga e portais), que e o recorte que
# responde por verba. Sem essa separacao o numero de midia seria canibalizado por
# URA e revenda, e a conversa de investimento se perderia.
CAPTACAO = {
    "facebook": "Facebook",
    "whatsapp": "WhatsApp",
    "webmotors": "Webmotors",
    "mercado livre": "Mercado Livre",
    "olx": "OLX",
    "mobiauto": "MobiAuto",
    "site carrera": "Site Carrera",
    "lead montadora": "Lead Montadora",
    "opv montadora": "OPV Montadora",
}
OUTRAS_ORIGENS = {
    "ura": "URA",
    "passagem oficina": "Passagem Oficina",
    "eventodealer": "Evento Dealer",
    "indicacao portal carrera": "Indicação Portal",
    "vd corporate": "VD Corporate",
    "lead revenda": "Lead Revenda",
    "lm mobilidade": "LM Mobilidade",
    "seguro": "Seguro",
}
SEM_ORIGEM = {
    "lead avulso": "Lead Avulso",
    "autoatendimento": "AutoAtendimento",
    "outros": "Outros",
}

# Fases que contam como venda (decisao Rudy 26/07/2026: fora Início, Perdido,
# Negociacao, Atendimento e OPV em espera, que nao sao venda).
FASES_VENDA = {"Entregue", "Faturado", "Vendido", "Pronto para Faturar", "Aguardando Pagamento"}

JANELA_DIAS = 365  # 12 meses moveis antes de cada venda


def classe(midia):
    """captacao | outra_origem | sem_origem"""
    k = (midia or "").strip().lower()
    if k in CAPTACAO:
        return "captacao"
    if k in OUTRAS_ORIGENS:
        return "outra_origem"
    return "sem_origem"


def tem_origem(midia):
    return classe(midia) != "sem_origem"


def rotulo(midia):
    k = (midia or "").strip().lower()
    return (CAPTACAO.get(k) or OUTRAS_ORIGENS.get(k) or SEM_ORIGEM.get(k)
            or (midia or "Sem informacao"))


def norm_phone(raw):
    if not raw:
        return None
    d = re.sub(r"\D", "", str(raw))
    if d.startswith("55") and len(d) >= 12:
        d = d[2:]
    d = d.lstrip("0")
    if len(d) < 10:
        return None
    return d[:2] + d[-8:]


def norm_email(raw):
    if not raw:
        return None
    e = str(raw).strip().lower()
    if "@" not in e or "." not in e:
        return None
    # emails de placeholder que a operacao repete em varios leads
    if e.startswith(("naotem", "nao@", "sememail", "semmail", "x@x", "a@a")):
        return None
    return e


# ---------------------------------------------------------------- leads
lead_phone = defaultdict(list)
lead_email = defaultdict(list)
n_leads = 0
email_freq = defaultdict(int)

for path in sorted(glob(f"{BASE}/leads_*.ndjson")):
    for line in open(path, encoding="utf-8"):
        r = json.loads(line)
        n_leads += 1
        # data interned tambem: sao ~700 valores distintos para ~2 milhoes de leads
        info = (
            sys.intern(r["CreatedDate"][:10]),
            sys.intern(str(r.get("Midias__c") or "")),
            sys.intern(str((r.get("Empresa_da_venda__r") or {}).get("Name") or "")),
            r["Id"],
        )
        seen = set()
        for fld in ("Phone", "MobilePhone"):
            k = norm_phone(r.get(fld))
            if k and k not in seen:
                seen.add(k)
                lead_phone[k].append(info)
        ke = norm_email(r.get("Email"))
        if ke:
            email_freq[ke] += 1
            lead_email[ke].append(info)

# email compartilhado por muita gente (email da loja, do vendedor) nao identifica ninguem
LIXO_EMAIL = {e for e, n in email_freq.items() if n > 30}
for e in LIXO_EMAIL:
    lead_email.pop(e, None)

for d in (lead_phone, lead_email):
    for k in d:
        d[k].sort()

print(f"Leads carregados: {n_leads:,}")
print(f"  chaves telefone: {len(lead_phone):,} | chaves email: {len(lead_email):,}"
      f" | emails descartados por repeticao: {len(LIXO_EMAIL)}")

# ---------------------------------------------------------------- vendas
# vendas_20*.ndjson, nao vendas_*: o segundo casaria com vendas_cruzadas.ndjson,
# que e a SAIDA deste script, e o cruzamento passaria a comer o proprio rabo.
arquivos_venda = sorted(glob(f"{BASE}/vendas_20*.ndjson"))
brutas = [json.loads(l) for f in arquivos_venda for l in open(f, encoding="utf-8")]
vendas = [v for v in brutas if v.get("StageName") in FASES_VENDA]
print(f"Vendas carregadas: {len(vendas):,} "
      f"(descartadas {len(brutas) - len(vendas)} fora das fases de venda)")


def candidatos(v, dt_venda, dt_limite):
    """Leads do mesmo cliente criados na janela [dt_limite, dt_venda], sem repetir."""
    out, vistos = [], set()
    for fld in ("Telefone__c", "Telefone_lead__c", "TelefoneFormula__c"):
        k = norm_phone(v.get(fld))
        if not k:
            continue
        for info in lead_phone.get(k, []):
            if dt_limite <= info[0] <= dt_venda and info[3] not in vistos:
                vistos.add(info[3])
                out.append((info, "fone"))
    for fld in ("Email__c", "email_lead__c"):
        k = norm_email(v.get(fld))
        if not k:
            continue
        for info in lead_email.get(k, []):
            if dt_limite <= info[0] <= dt_venda and info[3] not in vistos:
                vistos.add(info[3])
                out.append((info, "email"))
    return out


def dias(a, b):
    return (datetime.strptime(a, "%Y-%m-%d") - datetime.strptime(b, "%Y-%m-%d")).days


out = []
for v in vendas:
    dt_venda = v["DataAprovacaoVenda__c"][:10]
    dt_limite = (datetime.strptime(dt_venda, "%Y-%m-%d")
                 - timedelta(days=JANELA_DIAS)).strftime("%Y-%m-%d")
    cands = candidatos(v, dt_venda, dt_limite)

    ultimo = max(cands, key=lambda c: c[0][0]) if cands else None
    com_orig = [c for c in cands if tem_origem(c[0][1])]
    ultimo_orig = max(com_orig, key=lambda c: c[0][0]) if com_orig else None
    capt = [c for c in cands if classe(c[0][1]) == "captacao"]
    ultima_capt = max(capt, key=lambda c: c[0][0]) if capt else None

    decl = v.get("Midias_Opp__c")

    # ORIGEM real: ultimo lead que diz de onde o cliente veio. Sem nenhum, cai
    # pro ultimo lead qualquer; sem lead nenhum, fica o que a Opp declarou.
    if ultimo_orig:
        fonte_real, real = "lead_com_origem", ultimo_orig[0][1]
    elif ultimo:
        fonte_real, real = "lead_ultimo", ultimo[0][1]
    else:
        fonte_real, real = "opp", decl

    # CAPTACAO real: calculada em separado, para que URA e revenda nao
    # canibalizem o numero que responde por verba de midia.
    capt_real = ultima_capt[0][1] if ultima_capt else (decl if classe(decl) == "captacao" else None)

    venc = ultimo_orig or ultimo
    out.append({
        "opp": v["Id"],
        "dt_venda": dt_venda,
        "mes": dt_venda[:7],
        "midia_declarada": rotulo(decl),
        "classe_declarada": classe(decl),
        "midia_real": rotulo(real),
        "classe_real": classe(real),
        "fonte_real": fonte_real,
        "captacao_declarada": rotulo(decl) if classe(decl) == "captacao" else None,
        "captacao_real": rotulo(capt_real) if capt_real else None,
        # recuperada = o Sales nao sabia a origem e o cruzamento achou
        "recuperada": not tem_origem(decl) and tem_origem(real),
        # idem, no recorte de midia paga
        "recuperada_capt": classe(decl) != "captacao" and capt_real is not None,
        "n_leads": len(cands),
        "lag_dias": dias(dt_venda, venc[0][0]) if venc else None,
        "lag_capt": dias(dt_venda, ultima_capt[0][0]) if ultima_capt else None,
        "lead_id": venc[0][3] if venc else None,
        "lead_dt": venc[0][0] if venc else None,
        "lead_empresa": venc[0][2] if venc else None,
        "interesse": v.get("Interesse__c"),
        "tipo_estoque": v.get("Tipo_de_Estoque__c"),
        "stage": v.get("StageName"),
        "empresa": (v.get("Empresa_da_venda__r") or {}).get("Name"),
        "marca": v.get("Marca_Emp_Venda__c"),
        "valor": v.get("Valor_negociado__c"),
    })

with open(f"{BASE}/vendas_cruzadas.ndjson", "w", encoding="utf-8") as f:
    for r in out:
        f.write(json.dumps(r, ensure_ascii=False) + "\n")

# ---------------------------------------------------------------- resumo
tot = len(out)
com_lead = sum(1 for r in out if r["n_leads"])

print(f"\n{'='*62}\nRESULTADO")
print(f"Vendas: {tot:,}  (ate {max(r['dt_venda'] for r in out)})")
print(f"Com lead encontrado: {com_lead:,} ({100*com_lead/tot:.1f}%)")

for titulo, fdecl, freal, fkrec in (
    ("ORIGEM (de onde o cliente veio)",
     lambda r: r["classe_declarada"] != "sem_origem",
     lambda r: r["classe_real"] != "sem_origem", "recuperada"),
    ("CAPTACAO (midia paga e portais)",
     lambda r: r["captacao_declarada"] is not None,
     lambda r: r["captacao_real"] is not None, "recuperada_capt"),
):
    a = sum(1 for r in out if fdecl(r))
    d = sum(1 for r in out if freal(r))
    rec = sum(1 for r in out if r[fkrec])
    print(f"\n{titulo}")
    print(f"  o Sales diz : {a:>6,} ({100*a/tot:4.1f}%)")
    print(f"  real        : {d:>6,} ({100*d/tot:4.1f}%)"
          + (f"   fator {d/a:.2f}x" if a else ""))
    print(f"  recuperadas : {rec:>6,}")

lags = sorted(r["lag_dias"] for r in out if r["recuperada"] and r["lag_dias"] is not None)
if lags:
    print(f"\nLag lead->venda nas recuperadas: mediana {lags[len(lags)//2]}d | "
          f"<=30d {100*sum(1 for l in lags if l <= 30)/len(lags):.0f}% | "
          f"<=90d {100*sum(1 for l in lags if l <= 90)/len(lags):.0f}%")

print(f"\n{'-'*62}\nDE-PARA POR ORIGEM (vendas)")
decl_c, real_c, cls_de = defaultdict(int), defaultdict(int), {}
for r in out:
    decl_c[r["midia_declarada"]] += 1
    real_c[r["midia_real"]] += 1
    # a classe vem da linha, nao de classe(rotulo): o rotulo e a versao bonita
    # ("Evento Dealer") e nao bate com a chave crua ("eventodealer")
    cls_de[r["midia_real"]] = r["classe_real"]
    cls_de.setdefault(r["midia_declarada"], r["classe_declarada"])
todas = sorted(set(decl_c) | set(real_c), key=lambda m: -real_c[m])
print(f"{'origem':<22}{'declarado':>11}{'real':>9}{'delta':>10}  classe")
for m in todas:
    d, rr = decl_c[m], real_c[m]
    print(f"{m:<22}{d:>11,}{rr:>9,}{rr-d:>+10,}  {cls_de.get(m, '?')}")
