#!/usr/bin/env python3
"""
Builds the static guide site in docs/ from USER_GUIDE.md and DEVELOPER_SETUP.md:
  docs/index.html, docs/user-guide.html, docs/developer-setup.html (screenshots stay in docs/guide/).
Run from the repo root after editing either guide:  python3 scripts/build-guides.py
Also copies the user guide into web/public/help/ (served by the app at /help).
Needs:  pip install markdown
Deploy: Vercel project with Root Directory "docs", framework "Other", no build command.
"""
import re
import markdown

CSS = """
:root {
  --bg: #fbfaf9; --surface: #ffffff; --fg: #1d1a1b; --muted: #6b6466; --line: #e8e3e3;
  --accent: #922d36; --accent-soft: #f6e9ea; --code-bg: #f3efef; --term-bg: #1f1b1c; --term-fg: #f1ecec;
  --font: "Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) { :root {
  --bg: #161415; --surface: #1e1b1c; --fg: #efeaeb; --muted: #a59d9f; --line: #2f2a2b;
  --accent: #f08c95; --accent-soft: #3a2326; --code-bg: #262223; --term-bg: #0f0d0e; --term-fg: #f1ecec; color-scheme: dark; } }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--fg); font-family: var(--font); font-size: 16px; line-height: 1.65; }
img { max-width: 100%; }
.page { display: grid; grid-template-columns: 15rem minmax(0, 46rem); gap: 3.5rem; justify-content: center;
  padding-block: 3rem 5rem; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
header.intro { grid-column: 2; display: flex; flex-direction: column; gap: .5rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--line); }
.brand { display: flex; align-items: center; gap: .6rem; color: var(--accent); font-weight: 600; font-size: .85rem; letter-spacing: .06em; text-transform: uppercase; text-decoration: none; }
.brand span { width: .7rem; height: .7rem; border-radius: 2px; background: var(--accent); }
h1 { margin: 0; font-size: clamp(2rem, 5vw, 2.75rem); line-height: 1.15; font-weight: 600; letter-spacing: -.02em; text-wrap: balance; }
.lede { margin: 0; color: var(--muted); max-width: 40rem; }
.tags { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: .5rem; }
.tags span { padding: .2rem .7rem; border: 1px solid var(--line); border-radius: 999px; font-size: .85rem; color: var(--muted); background: var(--surface); }
nav.toc { grid-column: 1; grid-row: 1 / span 2; position: sticky; top: 2rem; align-self: start; font-size: .9rem; }
nav.toc p { margin: 0 0 .5rem; font-weight: 600; color: var(--muted); font-size: .75rem; letter-spacing: .06em; text-transform: uppercase; }
nav.toc ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .15rem; }
nav.toc a { display: block; padding: .35rem .6rem; border-radius: 6px; color: var(--fg); text-decoration: none; }
nav.toc a:hover { background: var(--accent-soft); color: var(--accent); }
a:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
main { grid-column: 2; min-width: 0; }
main h2 { margin: 3.5rem 0 1rem; padding-top: .5rem; font-size: 1.6rem; line-height: 1.25; font-weight: 600; letter-spacing: -.01em; text-wrap: balance; scroll-margin-top: 1.5rem; }
main h3 { margin: 2.25rem 0 .6rem; font-size: 1.15rem; font-weight: 600; text-wrap: balance; }
main p, main li { max-width: 68ch; overflow-wrap: anywhere; }
main ul, main ol { padding-left: 1.3rem; display: flex; flex-direction: column; gap: .3rem; }
main a { color: var(--accent); overflow-wrap: anywhere; }
strong { font-weight: 600; }
code { font-family: var(--mono); font-size: .86em; background: var(--code-bg); padding: .1em .35em; border-radius: 4px; overflow-wrap: anywhere; }
.code { position: relative; margin: 1rem 0 1.25rem; }
.code pre { margin: 0; padding: 1rem 1.1rem; padding-right: 5rem; overflow-x: auto; background: var(--term-bg); color: var(--term-fg); border-radius: 10px; font-size: .88rem; line-height: 1.6; }
.code pre code { background: none; padding: 0; color: inherit; font-size: inherit; overflow-wrap: normal; white-space: pre; }
.copy { position: absolute; top: .55rem; right: .55rem; font: 500 .78rem var(--font); color: var(--term-fg); background: rgb(255 255 255 / .1); border: 1px solid rgb(255 255 255 / .18); border-radius: 6px; padding: .25rem .6rem; cursor: pointer; }
.copy:hover { background: rgb(255 255 255 / .18); }
hr { border: 0; border-top: 1px solid var(--line); margin: 3rem 0 0; }
.table-wrap { overflow-x: auto; margin: 1rem 0; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
table { border-collapse: collapse; width: 100%; font-size: .93rem; }
th, td { text-align: left; padding: .65rem .9rem; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-weight: 600; color: var(--muted); font-size: .8rem; letter-spacing: .04em; text-transform: uppercase; }
tr:last-child td { border-bottom: 0; }
figure { margin: 1.5rem 0 2rem; }
figure img { display: block; width: 100%; height: auto; border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 6px 24px rgb(0 0 0 / .06); }
figcaption { margin-top: .55rem; color: var(--muted); font-size: .85rem; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(18rem, 100%), 1fr)); gap: 1rem; }
.cards a { display: flex; flex-direction: column; gap: .4rem; padding: 1.4rem; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); color: var(--fg); text-decoration: none; }
.cards a:hover { border-color: var(--accent); }
.cards strong { font-size: 1.15rem; color: var(--accent); }
.cards span { color: var(--muted); }
.single { grid-template-columns: minmax(0, 46rem); row-gap: 2rem; }
.single header.intro, .single main { grid-column: 1; }
@media (max-width: 960px) {
  .page { grid-template-columns: minmax(0, 1fr); gap: 2rem; padding-block: 2rem 4rem; }
  header.intro, main { grid-column: 1; }
  nav.toc { grid-column: 1; grid-row: auto; position: static; padding: 1rem; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
}
@media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
"""

COPY_JS = """<script>
document.querySelectorAll('.code .copy').forEach((btn) => {
  btn.addEventListener('click', () => {
    const pre = btn.nextElementSibling;
    const done = (label) => { btn.textContent = label; setTimeout(() => (btn.textContent = 'Copy'), 1600); };
    const select = () => { const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); done('Press Ctrl+C'); };
    try { navigator.clipboard.writeText(pre.innerText.replace(/\\n$/, '')).then(() => done('Copied'), select); } catch (e) { select(); }
  });
});
</script>"""

REPO_FILE_LINK = re.compile(r'<a href="(?!https?:|#|user-guide|developer-setup)[^"]*">([^<]*)</a>')


def document(title, description, inner, page_class="page", script=""):
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{description}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">
<style>{CSS}</style>
</head>
<body>
<div class="{page_class}">
{inner}
</div>
{script}
</body>
</html>
"""


def guide(src, out, title, heading, lede, tags=()):
    md = open(src, encoding="utf-8").read()
    md = re.sub(r"^# .*\n", "", md, count=1)
    # Bare web addresses become links (outside fenced code blocks, which must stay copyable as typed).
    parts = md.split("```")
    for i in range(0, len(parts), 2):
        parts[i] = re.sub(r"(?<![(<`/])(https?://[^\s)`|]+?)([.,;:]?)(?=\s|$)", r"<\1>\2", parts[i])
    md = "```".join(parts)
    md = md.replace("](USER_GUIDE.md)", "](user-guide.html)").replace("](DEVELOPER_SETUP.md)", "](developer-setup.html)")
    cfg = {"toc": {"toc_depth": "2-2"}}
    conv = markdown.Markdown(extensions=["tables", "toc", "sane_lists", "fenced_code"], extension_configs=cfg)
    body = conv.convert(md)
    body = re.sub(r'<p><img alt="([^"]*)" src="docs/([^"]*)" /></p>',
                  r'<figure><img src="\2" alt="\1" loading="lazy" width="1280" height="800"><figcaption>\1</figcaption></figure>', body)
    body = body.replace("<table>", '<div class="table-wrap"><table>').replace("</table>", "</table></div>")
    body = re.sub(r'<pre><code( class="[^"]*")?>', r'<div class="code"><button type="button" class="copy" aria-label="Copy command">Copy</button><pre><code\1>', body)
    body = body.replace("</code></pre>", "</code></pre></div>")
    body = REPO_FILE_LINK.sub(r"<code>\1</code>", body)  # repo files aren't on the site
    tag_html = f'<div class="tags">{"".join(f"<span>{t}</span>" for t in tags)}</div>' if tags else ""
    inner = f"""  <header class="intro">
    <a class="brand" href="./"><span aria-hidden="true"></span>CCP Time</a>
    <h1>{heading}</h1>
    <p class="lede">{lede}</p>
    {tag_html}
  </header>
  <nav class="toc" aria-label="Contents">
    <p>Contents</p>
    {conv.toc}
  </nav>
  <main>
{body}
  </main>"""
    has_code = '<div class="code">' in body
    open(out, "w", encoding="utf-8").write(document(title, lede, inner, script=COPY_JS if has_code else ""))


guide("USER_GUIDE.md", "docs/user-guide.html", "CCP Time User Guide", "User guide",
      "How employees record their time, how project managers run their projects, and how the CEO manages staff, pay rates and payroll.")
# The same user guide inside the web app, at /help (screenshots alongside it).
import os, shutil
os.makedirs("web/public/help/guide", exist_ok=True)
# Served at /help (no trailing slash), so relative paths would resolve from "/": make them absolute.
help_html = open("docs/user-guide.html", encoding="utf-8").read()
help_html = help_html.replace('src="guide/', 'src="/help/guide/').replace('class="brand" href="./"', 'class="brand" href="/"')
open("web/public/help/index.html", "w", encoding="utf-8").write(help_html)
for f in os.listdir("docs/guide"):
    shutil.copyfile(os.path.join("docs/guide", f), os.path.join("web/public/help/guide", f))

guide("DEVELOPER_SETUP.md", "docs/developer-setup.html", "CCP Time Developer Setup", "Developer setup",
      "Get the web app, the API and the database running on your own computer in about 20 minutes.", ("Windows", "macOS", "Linux"))

index = """  <header class="intro">
    <span class="brand"><span aria-hidden="true"></span>CCP Time</span>
    <h1>Guides</h1>
    <p class="lede">Everything you need to use CCP Time day to day, or to run it on your own computer.</p>
  </header>
  <main>
    <div class="cards">
      <a href="user-guide.html"><strong>User guide</strong><span>For employees, project managers and the CEO: recording time, corrections, projects, payroll and settings.</span></a>
      <a href="developer-setup.html"><strong>Developer setup</strong><span>Install and run the web app, API and database on Windows, macOS or Linux.</span></a>
    </div>
  </main>"""
open("docs/index.html", "w", encoding="utf-8").write(document("CCP Time Guides", "User and developer guides for CCP Time.", index, page_class="page single"))
print("Built docs/index.html, docs/user-guide.html, docs/developer-setup.html")
