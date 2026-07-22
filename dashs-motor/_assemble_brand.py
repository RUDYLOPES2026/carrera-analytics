#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Montagem generica de <slug>_D.json a partir de data/_<slug>_{core,daily,ads,geo_raw}.json + junho inline.
Uso: python3 _assemble_brand.py <slug>   (slug in gac/gwm/vw). Sem arg = todas."""
import json,collections,sys,datetime,calendar
TAX=1.1215
TODAY=datetime.date.today()
TODAY_ISO=TODAY.isoformat()
DIM=calendar.monthrange(TODAY.year,TODAY.month)[1]
ASOF="%02d/%02d"%(TODAY.day,TODAY.month)
def b(x): return round(x*TAX,2)
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

def build(slug):
    c=CFG[slug];COMM=c['COMM'];hasPV=c['PV'];LN=c['lojanome']
    core=json.load(open(f'data/_{slug}_core.json',encoding='utf-8'))
    daily=json.load(open(f'data/_{slug}_daily.json',encoding='utf-8'))
    adsf=json.load(open(f'data/_{slug}_ads.json',encoding='utf-8'))
    geraw=json.load(open(f'data/_{slug}_geo_raw.json',encoding='utf-8'))
    D={'conta':c['conta'],'account_id':c['acc'],'gerado':TODAY_ISO,'mes_nome':'Julho','mom_nome':'Junho','parcial':True,'orcamento_bruto':c['budget']}
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
    sm={};tlq=tll=tcc=0
    for s,v in c['june'].items():
        br=b(v['liq']);res=v['leads']+v['conv'];sm[s]={'bruto':br,'leads':v['leads'],'conv':v['conv'],'res':res,'cpl':round(br/res,2) if res else 0}
        tlq+=v['liq'];tll+=v['leads'];tcc+=v['conv']
    tbm=b(tlq);trm=tll+tcc
    D['nd_maio']={'total':{'bruto':tbm,'leads':tll,'conv':tcc,'res':trm,'cpl':round(tbm/trm,2) if trm else 0},'seg':sm}
    # MoM de MESMO PERIODO (01 -> mesmo dia do mes anterior), vindo do refresh
    if core.get('mom_sp'): D['nd_mom_sp']=core['mom_sp']
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
    D['pacing']={'budget':c['budget'],'days':DIM,'elapsed':TODAY.day,'asof':ASOF}
    s=json.dumps(D,ensure_ascii=False).replace("—",", ").replace("–","-")
    open(f'data/{slug}_D.json','w',encoding='utf-8').write(s)
    comm_liq=kpi['30d']['ALL']['liq'];pv_liq=kpi['30d'].get('PV',{}).get('liq',0)
    print(f"[{slug}] kpi30d comercial+PV liq={comm_liq+pv_liq:.0f} | lojas={[l['sub'] for l in lojas]} | geo={len(geo)} | ads30d={len(D['ads']['30d'])}")

if __name__=='__main__':
    for sl in (sys.argv[1:] or ['gac','gwm','vw']): build(sl)
