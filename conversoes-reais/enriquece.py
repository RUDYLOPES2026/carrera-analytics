#!/usr/bin/env python3
"""Busca campanha, adset, anuncio e UTM dos leads que atribuiram cada venda.

So dos leads atribuidores (uns 23 mil), nao dos 1,9 milhao: o campo de campanha
so interessa no lead que levou o credito da venda.
"""
import json
import os
import sys
import urllib.parse
import urllib.request

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)
from extract_sf import get_token, load_env, ENV_PATH  # noqa: E402

CAMPOS = ("Id, CampaignId__c, CampaignName__c, AdGroupName__c, AdName__c, "
          "UTM_Campaign__c, UTM_Source__c, UTM_Medium__c, Familia__c")
LOTE = 350  # cabe no limite de tamanho da URL do GET


def main():
    env = load_env(ENV_PATH)
    token, inst = get_token(env)
    api = env.get("SF_API_VERSION", "v60.0")
    # os ids saem do proprio cruzamento: sao os leads que levaram o credito
    ids = set()
    for line in open(f"{BASE}/dados/vendas_cruzadas.ndjson", encoding="utf-8"):
        r = json.loads(line)
        for k in ("lead_id", "lead_id_capt", "lead_id_trouxe"):
            if r.get(k):
                ids.add(r[k])
    ids = sorted(ids)
    print(f"{len(ids):,} leads a buscar em lotes de {LOTE}")

    n = 0
    with open(f"{BASE}/dados/leads_enriq.ndjson", "w", encoding="utf-8") as out:
        for i in range(0, len(ids), LOTE):
            lote = ids[i:i + LOTE]
            lista = ",".join(f"'{x}'" for x in lote)
            q = f"SELECT {CAMPOS} FROM Lead WHERE Id IN ({lista})"
            url = f"{inst}/services/data/{api}/query?q=" + urllib.parse.quote(q)
            while url:
                req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
                with urllib.request.urlopen(req, timeout=120) as r:
                    res = json.load(r)
                for rec in res.get("records", []):
                    rec.pop("attributes", None)
                    out.write(json.dumps(rec, ensure_ascii=False) + "\n")
                    n += 1
                nxt = res.get("nextRecordsUrl")
                url = inst + nxt if nxt else None
            print(f"  {n:,}/{len(ids):,}", end="\r", flush=True)
    print(f"\nOK: {n:,} leads enriquecidos")


if __name__ == "__main__":
    main()
