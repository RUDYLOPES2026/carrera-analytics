#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Montagem generica de <slug>_D.json a partir de data/_<slug>_{core,daily,ads,geo_raw}.json + junho inline.
Uso: python3 _assemble_brand.py <slug>   (slug in gac/gwm/vw). Sem arg = todas."""
import json,collections,sys,os,datetime,calendar
TAX=1.1215
TODAY=datetime.date.today()
TODAY_ISO=TODAY.isoformat()
DIM=calendar.monthrange(TODAY.year,TODAY.month)[1]
ASOF="%02d/%02d"%(TODAY.day,TODAY.month)
def b(x): return round(x*TAX,2)

# nome do mes corrente e do anterior: nada chumbado, senao o dash vira o mes e continua
# escrito "Julho" (foi o que aconteceu em 01-03/08/2026 nas 3 marcas deste assemble).
MESES=["","Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro",
       "Outubro","Novembro","Dezembro"]
MES_CURTO=["","jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"]
_PM=(TODAY.replace(day=1)-datetime.timedelta(days=1)).month
MES_NOME,MOM_NOME=MESES[TODAY.month],MESES[_PM]

# orcamento aprovado do mes corrente (mesma fonte dos dashs: o central manda, o valor ja e BRUTO)
_ORC_KEY={'gac':'GAC','gwm':'GWM','vw':'VW','zeekr':'ZEEKR'}
def budget_central(slug,fallback):
    p=os.path.join(os.path.dirname(os.path.abspath(__file__)),"ORCAMENTO_MIDIA_CENTRAL.json")
    try:
        v=json.load(open(p,encoding='utf-8'))['meta'][_ORC_KEY[slug]][MES_CURTO[TODAY.month]]
        return float(v) if v not in (None,0) else fallback
    except Exception:
        return fallback
SEGN={'NV':'Novos','SN':'Seminovos','VD':'Venda Direta','PV':'Pós-venda'}

CFG={
 'gac':{'conta':'GAC','acc':'act_1174941344352331','COMM':['NV','SN','VD'],'PV':True,'budget':55000,
   'lojanome':{'MOR':'Morumbi','VLO':'Villa Lobos','COT':'Cotia'},'lojacodes':['MOR','VLO','COT'],
   'june':{'NV':{'liq':43837.71,'leads':1281,'conv':3847},'SN':{'liq':7763.79,'leads':603,'conv':5},'VD':{'liq':0,'leads':0,'conv':0}},
   'citycoord':{'Cotia':(-23.6039,-46.9192),'São Paulo':(-23.5505,-46.6333),'Sao Paulo':(-23.5505,-46.6333)}},
 'gwm':{'conta':'GWM','acc':'act_1615350695589358','COMM':['NV','VD'],'PV':False,'budget':105000,
   'lojanome':{'VLO':'Villa Lobos','FMO':'Francisco Morato','EUR':'Europa','ALP':'Alphaville','ELD':'Shopping Eldorado','MOR':'Morumbi'},
   'lojacodes':['VLO','FMO','EUR','ALP','ELD','MOR'],
   'june':{'NV':{'liq':86139.26,'leads':1679,'conv':3378},'VD':{'liq':4719.90,'leads':0,'conv':534}},
   'citycoord':{'Barueri':(-23.5107,-46.8761),'São Paulo':(-23.5505,-46.6333),'Sao Paulo':(-23.5505,-46.6333)}},
 'vw':{'conta':'VW','acc':'act_1579684322929898','COMM':['NV','SN'],'PV':False,'budget':70000,
   'lojanome':{'ALP':'Alphaville','OSA':'Osasco','SUM':'Sumaré','VLO':'Villa Lobos'},'lojacodes':['ALP','OSA','SUM','VLO'],
   'june':{'NV':{'liq':58143.36,'leads':1850,'conv':3001},'SN':{'liq':5390.45,'leads':845,'conv':2}},
   'citycoord':{'São Paulo':(-23.5505,-46.6333),'Sao Paulo':(-23.5505,-46.6333)}},
 'zeekr':{'conta':'ZEEKR','acc':'act_8702053599855731','COMM':['NV'],'PV':False,'budget':30000,
   'lojanome':{},'lojacodes':[],
   'june':{'NV':{'liq':34304.94,'leads':1575,'conv':681}},
   'citycoord':{'São Paulo':(-23.5505,-46.6333),'Sao Paulo':(-23.5505,-46.6333),'Sorocaba':(-23.5015,-47.4526),'Campinas':(-22.9099,-47.0626)}},
}

# ===== MES FECHADO (meses.py) ==============================================
# gac/gwm/vw nao montam o D dentro do brands/<slug>.py: quem monta e o build() aqui
# embaixo, a partir das linhas "core" (com 'spend' LIQUIDO). Entao o mes fechado das
# tres tambem sai daqui, repetindo EXATAMENTE as mesmas contas do build(), so que
# sobre as linhas de um mes fechado em vez das duas janelas do ciclo.
def month_ads_generic(ad_ins, classify, linkmap):
    """Linhas ad-level de um mes fechado, no formato que o fixads()/rank do build() usa."""
    import common
    lst = []
    for i in ad_ins:
        sp = float(i.get("spend", 0) or 0)
        if sp <= 0:
            continue
        seg, canal, loja = classify(i.get("campaign_name"), i.get("adset_name"))
        leads, conv = common.leads_conv(i, canal)
        bruto = b(sp)
        res = leads if canal == "Form" else (conv if canal == "WhatsApp" else 0)
        aid = i.get("ad_id")
        lk = (linkmap or {}).get(aid, "")
        if isinstance(lk, dict):
            lk = lk.get("link", "")
        lst.append({"ad": aid, "nome": i.get("ad_name"), "seg": seg, "canal": canal,
                    "loja": loja, "reg": "",
                    "tipo": "WA" if canal == "WhatsApp" else ("FORM" if canal == "Form" else "IMAGEM"),
                    "bruto": bruto, "leads": leads, "conv": conv, "res": res,
                    "cpr": round(bruto / res, 2) if res else 0,
                    "link": lk or "", "st": "", "dt": "", "off": None})
    lst.sort(key=lambda x: -x["bruto"])
    return lst


def month_blocks_generic(slug, rows, ad_ins, day_ins, classify, rowsfn, linkmap):
    """Blocos de um mes fechado pras marcas genericas. `rows` = saida do _rows() da
    marca sobre o adset-level do mes (com 'spend' liquido)."""
    import common
    c = CFG[slug]; COMM = c['COMM']; hasPV = c['PV']
    SEGS = COMM + (['PV'] if hasPV else [])
    kpi = {}; chan = {}
    for seg in SEGS:
        rs = [r for r in rows if r['seg'] == seg]; bru = b(sum(r['spend'] for r in rs))
        kpi[seg] = {'liq': round(bru / TAX, 2), 'bruto': bru,
                    'leads': sum(r['leads'] for r in rs), 'conv': sum(r['conv'] for r in rs)}
    comm = [r for r in rows if r['seg'] in COMM]; bru = b(sum(r['spend'] for r in comm))
    kpi['ALL'] = {'liq': round(bru / TAX, 2), 'bruto': bru,
                  'leads': sum(r['leads'] for r in comm), 'conv': sum(r['conv'] for r in comm)}
    agg = [{'seg': r['seg'], 'reg': '', 'canal': r['canal'], 'bruto': b(r['spend']),
            'leads': r['leads'], 'conv': r['conv'],
            'res': (r['leads'] if r['canal'] == 'Form' else (r['conv'] if r['canal'] == 'WhatsApp' else 0))}
           for r in comm]
    kpifilter = {}
    for seg in ['ALL'] + SEGS:
        sub = comm if seg == 'ALL' else [r for r in rows if r['seg'] == seg]
        kpifilter[seg] = {'ALL': {'bruto': round(b(sum(r['spend'] for r in sub))),
                                  'leads': sum(r['leads'] for r in sub),
                                  'conv': sum(r['conv'] for r in sub),
                                  'ads': len(sub), 'on': len(sub)}}
    for seg in SEGS:
        chan[seg] = {}
        for canal in ('Form', 'WhatsApp', 'Engaj'):
            rs = [r for r in rows if r['seg'] == seg and r['canal'] == canal]
            if rs:
                chan[seg][canal] = {'bruto': b(sum(r['spend'] for r in rs)),
                                    'leads': sum(r['leads'] for r in rs),
                                    'conv': sum(r['conv'] for r in rs)}
    ads = month_ads_generic(ad_ins, classify, linkmap)
    rank = {}
    for seg in SEGS:
        sa = [a for a in ads if a['seg'] == seg]
        rank[seg] = {'top': sorted([a for a in sa if a['res'] > 0], key=lambda x: -x['res'])[:10],
                     'pior': sorted([a for a in sa if a['res'] == 0], key=lambda x: -x['bruto'])[:5]}
    daily = common.month_daily(
        day_ins,
        lambda rw, d: common.day_entry(rw, classify, d, seg_filter=tuple(COMM)),
        rowsfn)
    return {'kpi': kpi, 'chan': chan, 'kpifilter': kpifilter, 'agg': agg, 'ads': ads,
            'rank': rank, 'cells': common.cells_from_rows(agg),
            'total': common.month_total(agg, COMM),
            'seg': common.month_seg(agg, COMM), 'daily': daily}


def build(slug):
    c=CFG[slug];COMM=c['COMM'];hasPV=c['PV'];LN=c['lojanome']
    BUD=budget_central(slug,c['budget'])
    core=json.load(open(f'data/_{slug}_core.json',encoding='utf-8'))
    daily=json.load(open(f'data/_{slug}_daily.json',encoding='utf-8'))
    adsf=json.load(open(f'data/_{slug}_ads.json',encoding='utf-8'))
    geraw=json.load(open(f'data/_{slug}_geo_raw.json',encoding='utf-8'))
    D={'conta':c['conta'],'account_id':c['acc'],'gerado':TODAY_ISO,'mes_nome':MES_NOME,'mom_nome':MOM_NOME,'parcial':True,'orcamento_bruto':BUD}
    WINMAP={'jun':core['jul'],'30d':core['30d']}
    SEGS=COMM+(['PV'] if hasPV else [])
    kpi={};agg={};kpifilter={};chan={}
    for win,rows in WINMAP.items():
        kpi[win]={};chan[win]={}
        for seg in SEGS:
            rs=[r for r in rows if r['seg']==seg];bru=b(sum(r['spend'] for r in rs))
            kpi[win][seg]={'liq':round(bru/TAX,2),'bruto':bru,'leads':sum(r['leads'] for r in rs),'conv':sum(r['conv'] for r in rs)}
        comm=[r for r in rows if r['seg'] in COMM];bru=b(sum(r['spend'] for r in comm))
        kpi[win]['ALL']={'liq':round(bru/TAX,2),'bruto':bru,'leads':sum(r['leads'] for r in comm),'conv':sum(r['conv'] for r in comm)}
        agg[win]=[{'seg':r['seg'],'reg':'','canal':r['canal'],'bruto':b(r['spend']),'leads':r['leads'],'conv':r['conv'],
                   'res':(r['leads'] if r['canal']=='Form' else (r['conv'] if r['canal']=='WhatsApp' else 0))} for r in comm]
        kpifilter[win]={}
        for seg in ['ALL']+SEGS:
            sub=comm if seg=='ALL' else [r for r in rows if r['seg']==seg]
            kpifilter[win][seg]={'ALL':{'bruto':round(b(sum(r['spend'] for r in sub))),'leads':sum(r['leads'] for r in sub),'conv':sum(r['conv'] for r in sub),'ads':len(sub),'on':len(sub)}}
        for seg in SEGS:
            chan[win][seg]={}
            for canal in ('Form','WhatsApp','Engaj'):
                rs=[r for r in rows if r['seg']==seg and r['canal']==canal]
                if rs: chan[win][seg][canal]={'bruto':b(sum(r['spend'] for r in rs)),'leads':sum(r['leads'] for r in rs),'conv':sum(r['conv'] for r in rs)}
    D['kpi']=kpi;D['agg']=agg;D['kpifilter']=kpifilter;D['chan']=chan
    def fixads(arr):
        out=[]
        for a in arr:
            a=dict(a);a.setdefault('reg','')
            a['res']=a.get('res') or (a.get('leads',0) if a.get('canal')=='Form' else a.get('conv',0))
            a['cpr']=round(a['bruto']/a['res'],2) if a.get('res') else 0
            for k,dv in (('st',''),('dt',''),('off',None),('link','')): a.setdefault(k,dv)
            out.append(a)
        return out
    D['ads']={'jun':fixads(adsf['jul']),'30d':fixads(adsf['30d'])}
    rank={}
    for win in ('jun','30d'):
        rank[win]={}
        for seg in SEGS:
            sa=[a for a in D['ads'][win] if a['seg']==seg]
            rank[win][seg]={'top':sorted([a for a in sa if a['res']>0],key=lambda x:-x['res'])[:10],
                            'pior':sorted([a for a in sa if a['res']==0],key=lambda x:-x['bruto'])[:5]}
    D['rank']=rank
    for r in daily:
        r.setdefault('c',[])   # celulas seg x canal do dia (filtros do topo no grafico diario)
        for k in ('form','wa','aux','pv'):
            r.setdefault(k,{'spend':0,'leads':0,'conv':0})
            for f in ('spend','leads','conv'): r[k].setdefault(f,0)
    D['n_daily']=daily
    jul=core['jul'];comm_jul=[r for r in jul if r['seg'] in COMM]
    tb=b(sum(r['spend'] for r in comm_jul));tl=sum(r['leads'] for r in comm_jul);tc=sum(r['conv'] for r in comm_jul);tr=tl+tc
    pv_jul=[r for r in jul if r['seg']=='PV'];pvb=b(sum(r['spend'] for r in pv_jul));pvc=sum(r['conv'] for r in pv_jul)
    byl=collections.defaultdict(lambda:[0,0,0])
    for r in jul:
        if r['seg'] in COMM and r['loja'] in c['lojacodes']:
            byl[r['loja']][0]+=r['spend'];byl[r['loja']][1]+=r['leads'];byl[r['loja']][2]+=r['conv']
    lojas=[]
    for lj,v in byl.items():
        res=v[1]+v[2];lojas.append({'reg':'','nome':LN.get(lj,lj),'sub':lj,'bruto':b(v[0]),'res':res,'cpl':round(b(v[0])/res,2) if res else 0})
    lojas.sort(key=lambda x:-x['bruto'])
    bycamp=collections.defaultdict(lambda:[0,0,0])
    for r in jul:
        bycamp[(r['seg'],r['canal'],r['loja'])][0]+=r['spend'];bycamp[(r['seg'],r['canal'],r['loja'])][1]+=r['leads'];bycamp[(r['seg'],r['canal'],r['loja'])][2]+=r['conv']
    camps=[]
    for (seg,canal,lj),v in bycamp.items():
        res=(v[1] if canal=='Form' else v[2]);nome=f"{SEGN.get(seg,seg)} · {canal}"+(f" · {LN.get(lj,lj)}" if lj in c['lojacodes'] else "")
        camps.append({'nome':nome,'reg':'','can':canal,'bruto':b(v[0]),'res':res,'cpl':round(b(v[0])/res,2) if res else 0})
    camps.sort(key=lambda x:-x['bruto'])
    D['nd_jun']={'total':{'bruto':tb,'leads':tl,'conv':tc,'res':tr,'cpl':round(tb/tr,2) if tr else 0},'lojas':lojas,'campanhas':camps,
                 'pv':({'bruto':pvb,'conv':pvc,'cpr':round(pvb/pvc,2) if pvc else 0} if hasPV else {'bruto':0,'conv':0,'cpr':0})}
    # comparativo MoM = mes ANTERIOR fechado. Prioridade pro mom_full do harvest, que vira
    # sozinho todo mes; o dict 'june' inline so vale enquanto o harvest nao tiver mom_full
    # (era o unico caminho ate 03/08/2026, e por isso o dash comparava agosto com junho).
    mf=core.get('mom_full')
    if mf and mf.get('total',{}).get('res'):
        D['nd_maio']={'total':mf['total'],'seg':mf.get('seg',{})}
    else:
        sm={};tlq=tll=tcc=0
        for s,v in c['june'].items():
            br=b(v['liq']);res=v['leads']+v['conv'];sm[s]={'bruto':br,'leads':v['leads'],'conv':v['conv'],'res':res,'cpl':round(br/res,2) if res else 0}
            tlq+=v['liq'];tll+=v['leads'];tcc+=v['conv']
        tbm=b(tlq);trm=tll+tcc
        D['nd_maio']={'total':{'bruto':tbm,'leads':tll,'conv':tcc,'res':trm,'cpl':round(tbm/trm,2) if trm else 0},'seg':sm}
    # MoM de MESMO PERIODO (01 -> mesmo dia do mes anterior), vindo do refresh
    if core.get('mom_sp'): D['nd_mom_sp']=core['mom_sp']
    if core.get('mom_full'): D['nd_mom_full']=core['mom_full']
    ag={}
    def gadd(key,lat,lng,r,nome,loja):
        e=ag.setdefault((key,round(r)),{'lat':lat,'lng':lng,'r':round(r),'nome':nome,'lojas':set()});e['lojas'].add(loja)
    for aid,info in geraw.get('adsets',{}).items():
        loja=info.get('loja') or 'REGIONAL'
        for cc in info.get('cities',[]):
            nm=cc.get('name');rad=cc.get('radius') or 20;unit=cc.get('distance_unit','kilometer')
            if unit and 'mile' in unit: rad=round(rad*1.609)
            if nm in c['citycoord']:
                lat,lng=c['citycoord'][nm];gadd(nm,lat,lng,rad,nm,loja)
        for cl in info.get('custom_locations',[]):
            lat=cl.get('latitude');lng=cl.get('longitude');rad=cl.get('radius') or 3;unit=cl.get('distance_unit','kilometer')
            if unit and 'mile' in unit: rad=round(rad*1.609)
            if lat is None: continue
            key=f"{round(lat,3)},{round(lng,3)}";nm=cl.get('name') or f"Ponto {loja}";gadd(key,lat,lng,rad,nm,loja)
    geo=[]
    for (key,r),e in ag.items():
        ll=sorted(x for x in e['lojas'] if x and x!='REGIONAL')
        geo.append({'reg':'','n':e['nome'],'lat':e['lat'],'lng':e['lng'],'r':e['r'],'c':'#f59e0b',
                    'adsets':[{'name':'lojas: '+(', '.join(ll) if ll else 'regional'),'id':''}],'lojas':ll})
    geo.sort(key=lambda g:-g['r'])
    D['geo']=geo;D['geo_adsets']=[];D['geo_alerts']=[]
    D['note_geo']="Cada círculo é uma cidade/ponto mirado na Meta, no raio configurado. Operação toda em São Paulo (capital + região). Conjuntos excluem os demais estados."
    import os as _os
    _vf=f'data/_{slug}_verba.json'
    D['nd_verba']=json.load(open(_vf,encoding='utf-8')) if _os.path.exists(_vf) else []
    D['note_verba']=''
    D['edits']=[{'quando':e.get('quando',''),'quem':e.get('quem',''),'o_que':e.get('o_que','')} for e in core.get('edits',[])]
    D['nd_changes']=[];D['note_edits']=''
    D['pacing']={'budget':BUD,'days':DIM,'elapsed':TODAY.day,'asof':ASOF}
    s=json.dumps(D,ensure_ascii=False).replace("—",", ").replace("–","-")
    open(f'data/{slug}_D.json','w',encoding='utf-8').write(s)
    comm_liq=kpi['30d']['ALL']['liq'];pv_liq=kpi['30d'].get('PV',{}).get('liq',0)
    print(f"[{slug}] kpi30d comercial+PV liq={comm_liq+pv_liq:.0f} | lojas={[l['sub'] for l in lojas]} | geo={len(geo)} | ads30d={len(D['ads']['30d'])}")

if __name__=='__main__':
    for sl in (sys.argv[1:] or ['gac','gwm','vw']): build(sl)
