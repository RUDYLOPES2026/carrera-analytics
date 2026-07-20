#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""publish_site.py , publica os 9 dashboards do dia no repo RUDYLOPES2026/carrera-analytics
(GitHub Pages, deploy via Actions/Vite que copia client/public/ pro site).

Convencao do repo (briefing do Rudy):
  - Mexer SOMENTE em client/public/. Cada dash em client/public/<slug>/index.html, self-contained.
  - URL final: https://rudylopes2026.github.io/carrera-analytics/<slug>/
  - Hub das 9 marcas em client/public/dashboards/  ->  .../carrera-analytics/dashboards/
  - noindex em toda pagina (dado interno). Actions builda sozinho em 1-2 min.

Uso:
  python3 publish_site.py --repo <path>   # so escreve client/public no checkout dado (sem git)
  python3 publish_site.py --push          # clona em temp, escreve, commit, push (rotina diaria)

O token vem de ../.publish_token (fora de qualquer repo; nunca vai pro git nem pra memoria).
Como a pasta montada nao aceita locks de .git, o --push clona num diretorio nativo temporario.
"""
import os, re, sys, glob, datetime, subprocess, shutil, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))          # .../DASHS_CAR/motor
ROOT = os.path.dirname(HERE)                                # .../DASHS_CAR
DIST = os.path.join(HERE, "dist")
TOKEN_FILE = os.path.join(ROOT, ".publish_token")
TODAY = datetime.date.today().isoformat()

REPO = "RUDYLOPES2026/carrera-analytics"
PAGES_BASE = "https://rudylopes2026.github.io/carrera-analytics"

# slug publico (kebab) -> (prefixo em dist/, nome de exibicao)
BRANDS = [
    ("nissan",        "nissan",                        "Nissan"),
    ("bajaj",         "bajaj",                         "Bajaj"),
    ("chevrolet-sp",  "chevrolet_sp",                  "Chevrolet SP"),
    ("chevrolet-bsb", "chevrolet_bsb",                 "Chevrolet Brasília"),
    ("omoda",         "omoda",                         "Omoda & Jaecoo"),
    ("seminovos",     "carrera_ve_culos_seminovos_sp", "Carrera Seminovos"),
    ("gac",           "gac",                           "GAC"),
    ("gwm",           "gwm",                           "GWM"),
    ("vw",            "vw",                            "Volkswagen"),
]

NOINDEX = '<meta name="robots" content="noindex,nofollow">'

def latest_dist(prefix):
    pat = os.path.join(DIST, f"{prefix}_20*.html")
    cands = [p for p in glob.glob(pat) if "_resumo_" not in os.path.basename(p)]
    if not cands:
        return None, None
    def dk(p):
        m = re.search(r"_(\d{4}-\d{2}-\d{2})\.html$", p); return m.group(1) if m else ""
    cands.sort(key=dk); p = cands[-1]; return p, dk(p)

def latest_resumo(prefix):
    """One-page executiva (arquivos <prefix>_resumo_AAAA-MM-DD.html)."""
    pat = os.path.join(DIST, f"{prefix}_resumo_20*.html")
    cands = glob.glob(pat)
    if not cands:
        return None, None
    def dk(p):
        m = re.search(r"_(\d{4}-\d{2}-\d{2})\.html$", p); return m.group(1) if m else ""
    cands.sort(key=dk); p = cands[-1]; return p, dk(p)

def inject_noindex(html):
    if "noindex" in html:
        return html
    m = re.search(r"<head[^>]*>", html, re.IGNORECASE)
    if m:
        i = m.end(); return html[:i] + "\n" + NOINDEX + html[i:]
    return NOINDEX + html

def build_into(public_dir):
    """Escreve os 9 dashs + central + hub em <public_dir>/. Retorna lista (slug,nome,data)."""
    published = []
    for slug, prefix, nome in BRANDS:
        src, dt = latest_dist(prefix)
        if not src:
            print(f"[!] {slug}: nenhum dist, pulando"); published.append((slug, nome, None)); continue
        html = inject_noindex(open(src, encoding="utf-8").read())
        d = os.path.join(public_dir, slug); os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(html)
        published.append((slug, nome, dt))
        print(f"[OK] {slug}/ <- {os.path.basename(src)} ({dt})")
        # one-page executiva na rota <slug>/resumo/ (dash completo continua em <slug>/)
        rsrc, rdt = latest_resumo(prefix)
        if rsrc:
            rhtml = inject_noindex(open(rsrc, encoding="utf-8").read())
            rd = os.path.join(d, "resumo"); os.makedirs(rd, exist_ok=True)
            open(os.path.join(rd, "index.html"), "w", encoding="utf-8").write(rhtml)
            print(f"[OK] {slug}/resumo/ <- {os.path.basename(rsrc)} ({rdt})")
        else:
            print(f"[!] {slug}/resumo/: nenhuma one-page em dist, pulando")
    # central executiva do grupo
    csrc, cdt = latest_dist("central")
    if csrc:
        chtml = inject_noindex(open(csrc, encoding="utf-8").read())
        cd = os.path.join(public_dir, "central"); os.makedirs(cd, exist_ok=True)
        open(os.path.join(cd, "index.html"), "w", encoding="utf-8").write(chtml)
        print(f"[OK] central/ <- {os.path.basename(csrc)} ({cdt})")
    else:
        print("[!] central: nenhum dist, pulando")
    write_hub(public_dir, published, has_central=bool(csrc))
    return published

def write_hub(public_dir, published, has_central=False):
    dias = [dt for _, _, dt in published if dt]
    asof = max(dias) if dias else TODAY
    asof_br = datetime.date.fromisoformat(asof).strftime("%d/%m/%Y")
    try:
        from zoneinfo import ZoneInfo
        asof_br += " às " + datetime.datetime.now(ZoneInfo("America/Sao_Paulo")).strftime("%H:%M")
    except Exception:
        asof_br += " às " + (datetime.datetime.utcnow() - datetime.timedelta(hours=3)).strftime("%H:%M")
    central_banner = ('''    <a class="central" href="../central/">
      <span class="ct">Central de Mídia , visão do grupo</span>
      <span class="cs">investimento, orçamento/atingimento, evolução diária e mês a mês das 9 marcas →</span>
    </a>''' if has_central else "")
    cards = []
    for slug, nome, dt in published:
        if dt:
            sub = "atualizado " + datetime.date.fromisoformat(dt).strftime("%d/%m")
            href, cls = f"../{slug}/", ""
        else:
            sub, href, cls = "indisponível", "#", " off"
        cards.append(f'''      <a class="card{cls}" href="{href}">
        <span class="nome">{nome}</span>
        <span class="sub">{sub}</span>
      </a>''')
    cards_html = "\n".join(cards)
    html = f'''<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
{NOINDEX}
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Carrera · Dashboards de Mídia</title>
<style>
  :root {{ --bg:#0b0f14; --card:#141b24; --line:#1f2a36; --tx:#e6edf3; --mut:#8b98a5; --acc:#f59e0b; }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; background:var(--bg); color:var(--tx);
         font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }}
  .wrap {{ max-width:960px; margin:0 auto; padding:48px 20px 64px; }}
  h1 {{ font-size:26px; margin:0 0 6px; letter-spacing:.3px; }}
  h1 .b {{ color:var(--acc); }}
  .meta {{ color:var(--mut); font-size:14px; margin-bottom:26px; }}
  .grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:14px; }}
  .card {{ display:flex; flex-direction:column; gap:6px; text-decoration:none;
          background:var(--card); border:1px solid var(--line); border-radius:14px;
          padding:18px; color:var(--tx); transition:.15s border-color,.15s transform; }}
  .card:hover {{ border-color:var(--acc); transform:translateY(-2px); }}
  .card .nome {{ font-size:17px; font-weight:600; }}
  .card .sub {{ font-size:12.5px; color:var(--mut); }}
  .card.off {{ opacity:.45; pointer-events:none; }}
  .central {{ display:block; text-decoration:none; margin:0 0 18px; padding:18px 20px;
             background:linear-gradient(135deg,#1a2330,#141b24); border:1px solid var(--acc);
             border-radius:14px; transition:.15s transform; }}
  .central:hover {{ transform:translateY(-2px); }}
  .central .ct {{ display:block; color:var(--acc); font-size:17px; font-weight:700; }}
  .central .cs {{ display:block; color:var(--mut); font-size:13px; margin-top:4px; }}
  footer {{ margin-top:36px; color:var(--mut); font-size:12.5px; line-height:1.6; }}
</style>
</head>
<body>
  <div class="wrap">
    <h1>Grupo <span class="b">Carrera</span> , Acompanhamento de Mídia</h1>
    <div class="meta">9 marcas · Meta Ads · atualizado em {asof_br}</div>
{central_banner}
    <div class="grid">
{cards_html}
    </div>
    <footer>
      Documento interno. Investimento em bruto (líquido ×1,1215), praça e loja no nível de conjunto,
      pós-venda fora do total comercial. Janela: mês corrente (MTD) e últimos 30 dias.
    </footer>
  </div>
</body>
</html>'''
    d = os.path.join(public_dir, "dashboards"); os.makedirs(d, exist_ok=True)
    open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(html)
    print(f"[OK] dashboards/ (hub, asof {asof_br})")

def read_token():
    if not os.path.exists(TOKEN_FILE):
        print("[X] token nao encontrado em", TOKEN_FILE); sys.exit(1)
    return open(TOKEN_FILE).read().strip()

def scrub(s):
    return re.sub(r"github_pat_[A-Za-z0-9_]+", "***", s or "")

def push():
    token = read_token()
    tmp = tempfile.mkdtemp(prefix="carrera_pub_")
    url = f"https://x-access-token:{token}@github.com/{REPO}.git"
    def run(*a, **k):
        r = subprocess.run(a, capture_output=True, text=True, **k)
        print("$", scrub(" ".join(a)), "->", r.returncode)
        if r.stdout.strip(): print(scrub(r.stdout.strip()))
        if r.stderr.strip(): print(scrub(r.stderr.strip()))
        return r
    if run("git", "clone", "--depth", "1", url, tmp).returncode != 0:
        print("[X] clone falhou"); shutil.rmtree(tmp, ignore_errors=True); sys.exit(1)
    pub = os.path.join(tmp, "client", "public")
    build_into(pub)
    run("git", "-C", tmp, "add", "client/public")
    run("git", "-C", tmp, "-c", "user.email=dashs@carrera.local",
        "-c", "user.name=Carrera Dashs", "commit", "-m", f"dashboards {TODAY}")
    r = run("git", "-C", tmp, "push", "origin", "main")
    if r.returncode != 0:  # tenta rebase se rejeitado
        run("git", "-C", tmp, "pull", "--rebase", "origin", "main")
        r = run("git", "-C", tmp, "push", "origin", "main")
    shutil.rmtree(tmp, ignore_errors=True)
    if r.returncode == 0:
        print(f"\n[OK] publicado. Hub: {PAGES_BASE}/dashboards/  (Actions builda em 1-2 min)")
    else:
        print("[X] push falhou"); sys.exit(1)

if __name__ == "__main__":
    if "--push" in sys.argv:
        push()
    elif "--repo" in sys.argv:
        rp = sys.argv[sys.argv.index("--repo") + 1]
        build_into(os.path.join(rp, "client", "public"))
    else:
        print("uso: --push  |  --repo <checkout>")
