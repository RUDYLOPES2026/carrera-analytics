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
from datetime import datetime
from glob import glob

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dados")

# Classificacao das midias. Chave = valor em minusculo (Lead e Opp divergem na
# capitalizacao: "Whatsapp" x "WhatsApp", "Ura" x "URA").
RASTREAVEL = {
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
IDENTIFICADO = {  # canal conhecido, mas nao e midia de captacao
    "ura": "URA",
    "autoatendimento": "AutoAtendimento",
    "passagem oficina": "Passagem Oficina",
    "eventodealer": "Evento Dealer",
    "indicacao portal carrera": "Indicacao Portal",
    "vd corporate": "VD Corporate",
    "lead revenda": "Lead Revenda",
    "lm mobilidade": "LM Mobilidade",
}
SEM_ORIGEM = {"lead avulso": "Lead Avulso", "outros": "Outros"}


def classe(midia):
    """rastreavel | identificado | sem_origem"""
    k = (midia or "").strip().lower()
    if k in RASTREAVEL:
        return "rastreavel"
    if k in IDENTIFICADO:
        return "identificado"
    return "sem_origem"


def rotulo(midia):
    k = (midia or "").strip().lower()
    return RASTREAVEL.get(k) or IDENTIFICADO.get(k) or SEM_ORIGEM.get(k) or (midia or "Sem informacao")


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

for path in sorted(glob(f"{BASE}/leads_2026_*.ndjson")):
    for line in open(path, encoding="utf-8"):
        r = json.loads(line)
        n_leads += 1
        info = (
            r["CreatedDate"][:10],
            sys.intern(str(r.get("Midias__c") or "")),
            sys.intern(str((r.get("Empresa_da_venda__r") or {}).get("Name") or "")),
            sys.intern(str(r.get("Interesse__c") or "")),
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
vendas = [json.loads(l) for l in open(f"{BASE}/vendas_2026.ndjson", encoding="utf-8")]
print(f"Vendas carregadas: {len(vendas):,}")


def candidatos(v, dt_venda):
    """Todos os leads do mesmo cliente criados ate a data da venda, sem repetir."""
    out, vistos = [], set()
    for fld in ("Telefone__c", "Telefone_lead__c", "TelefoneFormula__c"):
        k = norm_phone(v.get(fld))
        if not k:
            continue
        for info in lead_phone.get(k, []):
            if info[0] <= dt_venda and info[4] not in vistos:
                vistos.add(info[4])
                out.append((info, "fone"))
    for fld in ("Email__c", "email_lead__c"):
        k = norm_email(v.get(fld))
        if not k:
            continue
        for info in lead_email.get(k, []):
            if info[0] <= dt_venda and info[4] not in vistos:
                vistos.add(info[4])
                out.append((info, "email"))
    return out


out = []
for v in vendas:
    dt_venda = v["DataAprovacaoVenda__c"][:10]
    cands = candidatos(v, dt_venda)

    ultimo = max(cands, key=lambda c: c[0][0]) if cands else None
    rastr = [c for c in cands if classe(c[0][1]) == "rastreavel"]
    ultimo_rastr = max(rastr, key=lambda c: c[0][0]) if rastr else None

    decl = v.get("Midias_Opp__c")
    cls_decl = classe(decl)

    # midia real: prioriza a ultima midia rastreavel; sem ela, o ultimo lead;
    # sem lead nenhum, fica o que a Opp declarou.
    if ultimo_rastr:
        fonte_real, real = "lead_rastreavel", ultimo_rastr[0][1]
    elif ultimo:
        fonte_real, real = "lead_ultimo", ultimo[0][1]
    else:
        fonte_real, real = "opp", decl

    lag = None
    if ultimo_rastr or ultimo:
        base = (ultimo_rastr or ultimo)[0][0]
        lag = (datetime.strptime(dt_venda, "%Y-%m-%d") - datetime.strptime(base, "%Y-%m-%d")).days

    out.append({
        "opp": v["Id"],
        "dt_venda": dt_venda,
        "mes": dt_venda[:7],
        "midia_declarada": rotulo(decl),
        "classe_declarada": cls_decl,
        "midia_real": rotulo(real),
        "classe_real": classe(real),
        "fonte_real": fonte_real,
        # a venda "recuperada": o Sales nao sabia a midia, o cruzamento achou
        "recuperada": cls_decl != "rastreavel" and classe(real) == "rastreavel",
        "n_leads": len(cands),
        "lag_dias": lag,
        "lead_id": (ultimo_rastr or ultimo)[0][4] if cands else None,
        "lead_dt": (ultimo_rastr or ultimo)[0][0] if cands else None,
        "lead_empresa": (ultimo_rastr or ultimo)[0][2] if cands else None,
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
rec = sum(1 for r in out if r["recuperada"])
antes = sum(1 for r in out if r["classe_declarada"] == "rastreavel")
depois = sum(1 for r in out if r["classe_real"] == "rastreavel")

print(f"\n{'='*62}\nRESULTADO")
print(f"Vendas 2026: {tot:,}  (ate {max(r['dt_venda'] for r in out)})")
print(f"Com lead encontrado: {com_lead:,} ({100*com_lead/tot:.1f}%)")
print(f"\nMidia rastreavel ANTES (o que o Sales diz): {antes:,} ({100*antes/tot:.1f}%)")
print(f"Midia rastreavel DEPOIS (real):            {depois:,} ({100*depois/tot:.1f}%)")
print(f"Vendas recuperadas pelo cruzamento:        {rec:,}"
      f"  =  {depois/antes:.2f}x o que era visivel" if antes else "")

lags = sorted(r["lag_dias"] for r in out if r["lag_dias"] is not None)
if lags:
    print(f"\nLag lead->venda: mediana {lags[len(lags)//2]}d | "
          f"<=30d {100*sum(1 for l in lags if l <= 30)/len(lags):.0f}% | "
          f"<=90d {100*sum(1 for l in lags if l <= 90)/len(lags):.0f}%")

print(f"\n{'-'*62}\nDE-PARA POR MIDIA (vendas)")
decl_c, real_c = defaultdict(int), defaultdict(int)
for r in out:
    decl_c[r["midia_declarada"]] += 1
    real_c[r["midia_real"]] += 1
todas = sorted(set(decl_c) | set(real_c), key=lambda m: -real_c[m])
print(f"{'midia':<22}{'declarado':>11}{'real':>9}{'delta':>10}")
for m in todas:
    d, rr = decl_c[m], real_c[m]
    print(f"{m:<22}{d:>11,}{rr:>9,}{rr-d:>+10,}")
