#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""probe_meta.py , teste de fumaça do cliente da Graph API (roda no GitHub Actions).
Confere que o META_TOKEN funciona e que o formato bate com o conector meta-ads-carrera.
Não escreve nada, só imprime. Uso: META_TOKEN=... python3 probe_meta.py
"""
import datetime, sys
import meta_api as M

CONTAS = {
    "bajaj": "act_595755266003929", "nissan": "act_464593798098397",
    "chevrolet_sp": "act_1397341790604853", "chevrolet_bsb": "act_214293593818859",
    "omoda": "act_9053591018103176", "seminovos_sp": "act_8320926344651440",
    "gac": "act_1174941344352331", "gwm": "act_1615350695589358",
    "vw": "act_1579684322929898",
}
TODAY = datetime.date.today()
D7 = (TODAY - datetime.timedelta(days=7)).isoformat()
YDAY = (TODAY - datetime.timedelta(days=1)).isoformat()

def main():
    print("== PROBE Graph API ==", TODAY.isoformat())
    ok = True
    # 1) gasto por conta (account-level) nos ultimos 7 dias , todas as 9
    print("\n[1] account spend (7d):")
    for slug, acc in CONTAS.items():
        try:
            s = M.account_spend(acc, D7, TODAY.isoformat())
            print(f"   {slug:14s} {acc}  R$ {s:,.2f}")
        except Exception as e:
            ok = False; print(f"   {slug:14s} ERRO: {e}")
    # 2) adset-level de ONTEM (dia fechado) numa conta , confere campos
    print("\n[2] adset-level ontem (bajaj), campos esperados:")
    try:
        r = M.get_insights(CONTAS["bajaj"], level="adset", since=YDAY, until=YDAY)
        rows = r["insights"]
        tot = sum(float(x.get("spend", 0) or 0) for x in rows)
        f = list(rows[0].keys()) if rows else []
        need = {"spend", "campaign_name", "adset_name", "actions"}
        print(f"   linhas={len(rows)}  soma_spend=R$ {tot:,.2f}")
        print(f"   campos 1a linha: {f[:10]}")
        print(f"   campos-chave presentes: {need.issubset(set(f)) if rows else 'sem linhas'}")
        if rows and not need.issubset(set(f)): ok = False
    except Exception as e:
        ok = False; print("   ERRO:", e)
    # 3) atividades da conta
    print("\n[3] atividades_conta (bajaj), ultimas 3:")
    try:
        a = M.atividades_conta(CONTAS["bajaj"], limit=3)["activities"]
        for ev in a[:3]:
            print("  ", ev.get("event_time"), ev.get("event_type"), ev.get("actor_name", ""))
    except Exception as e:
        print("   (aviso) atividades:", e)
    # 4) list_adsets , verba diaria
    print("\n[4] list_adsets (bajaj) com daily_budget:")
    try:
        ad = M.list_adsets(CONTAS["bajaj"])["adsets"]
        withb = [x for x in ad if x.get("daily_budget")]
        print(f"   adsets={len(ad)}  com daily_budget={len(withb)}  ex: "
              f"{(withb[0]['name'][:40], int(withb[0]['daily_budget'])/100) if withb else 'n/a'}")
    except Exception as e:
        print("   (aviso) list_adsets:", e)
    print("\n== RESULTADO:", "[OK] API funcionando" if ok else "[X] revisar acima", "==")
    sys.exit(0 if ok else 1)

if __name__ == "__main__":
    main()
