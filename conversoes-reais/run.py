#!/usr/bin/env python3
"""Pipeline completo das Conversoes Reais: extrai, cruza, agrega, gera e publica.

Roda igual no Mac e no GitHub Actions. As credenciais do Salesforce vem do .env
local (Mac) ou das variaveis de ambiente/secrets (Actions), ver extract_sf.py.

  python3 run.py                 # pipeline completo
  python3 run.py --sem-extrair   # reaproveita o NDJSON ja baixado
  python3 run.py --repo <path>   # tambem copia o HTML pro checkout do site
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
from datetime import date, timedelta

BASE = os.path.dirname(os.path.abspath(__file__))
DADOS = os.path.join(BASE, "dados")

CAMPOS_LEAD = ("Id, CreatedDate, Phone, MobilePhone, Email, Midias__c, "
               "Empresa_da_venda__r.Name, Interesse__c, Status, UTM_Campaign__c, Familia__c")
CAMPOS_VENDA = ("Id, DataAprovacaoVenda__c, Midias_Opp__c, Midia_LeadOPP__c, Interesse__c, "
                "Tipo_de_Estoque__c, StageName, Empresa_da_venda__r.Name, Marca_Emp_Venda__c, "
                "Telefone__c, Telefone_lead__c, TelefoneFormula__c, Email__c, email_lead__c, "
                "Valor_negociado__c")


def monta_jobs(hoje):
    """Um job de vendas do ano + um job de leads por mes ja iniciado.

    Mes a mes porque uma unica query de 740 mil linhas fica exposta demais a
    timeout: se um mes falhar, so ele precisa ser refeito.
    """
    ano = hoje.year
    # limite superior = amanha as 00h BRT, para incluir o dia de hoje inteiro
    fim = f"{hoje + timedelta(days=1)}T03:00:00Z"
    jobs = [{
        "out": f"{DADOS}/vendas_{ano}.ndjson",
        "query": (f"SELECT {CAMPOS_VENDA} FROM Opportunity "
                  f"WHERE DataAprovacaoVenda__c >= {ano}-01-01T03:00:00Z "
                  f"AND DataAprovacaoVenda__c < {fim}"),
    }]
    for m in range(1, hoje.month + 1):
        ini = f"{ano}-{m:02d}-01T03:00:00Z"
        prox = (f"{ano + 1}-01-01T03:00:00Z" if m == 12 else f"{ano}-{m + 1:02d}-01T03:00:00Z")
        jobs.append({
            "out": f"{DADOS}/leads_{ano}_{m:02d}.ndjson",
            "query": (f"SELECT {CAMPOS_LEAD} FROM Lead "
                      f"WHERE CreatedDate >= {ini} AND CreatedDate < {min(prox, fim)}"),
        })
    return jobs


def passo(titulo, *cmd):
    print(f"\n=== {titulo} ===", flush=True)
    r = subprocess.run([sys.executable, *cmd], cwd=BASE)
    if r.returncode:
        sys.exit(f"falhou: {titulo}")


ap = argparse.ArgumentParser()
ap.add_argument("--sem-extrair", action="store_true")
ap.add_argument("--repo", help="checkout do carrera-analytics para receber o HTML")
a = ap.parse_args()

os.makedirs(DADOS, exist_ok=True)

if not a.sem_extrair:
    hoje = date.today()
    with open(f"{DADOS}/jobs.json", "w", encoding="utf-8") as f:
        json.dump(monta_jobs(hoje), f, ensure_ascii=False, indent=1)
    passo("extracao do Salesforce", "extract_sf.py", f"{DADOS}/jobs.json")

passo("cruzamento lead x venda", "cruzamento.py")
passo("agregacao", "agrega.py")
passo("geracao do HTML", "gera_dash.py")

if a.repo:
    destino = os.path.join(a.repo, "client", "public", "conversoes-reais")
    os.makedirs(os.path.join(destino, "resumo"), exist_ok=True)
    shutil.copy(f"{BASE}/conversoes-reais.html", os.path.join(destino, "index.html"))
    shutil.copy(f"{BASE}/conversoes-reais-resumo.html",
                os.path.join(destino, "resumo", "index.html"))
    # o JSON vai junto: e o cofre que permite refazer o dash sem reextrair
    shutil.copy(f"{BASE}/dados.json", os.path.join(destino, "dados.json"))
    print(f"\npublicado em {destino}")

print("\nOK")
