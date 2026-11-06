"""Pack the dashboard page files for publishing to the dashboard store (coach/DASHBOARD.md, "Changing the page").

The page is split into files/<name> documents of the dashboard store: index.html (markup only), style.css, calc.js,
app.js, forms.js, lifts.js, and any later feature file. Each document is {"text": <file>} and the store refuses any
document over 256 KB of JSON, so this script writes one JSON document per file into an output directory, checks every
file against the cap, and prints the batch to write (ArtifactData batch, one update per file, pinned to its version).

Usage: python3 coach/tools/pack_dashboard.py <out_dir> [--only name,name]
Also: python3 coach/tools/pack_dashboard.py --assemble <out.html>   builds one local HTML (styles and scripts inlined)
for the 390 px render check in coach/DASHBOARD.md; it is never published.
"""
import json
import os
import re
import sys

CAP = 262144
DIR = "coach/dashboard"
ORDER = ["index.html", "style.css", "calc.js", "app.js", "forms.js", "lifts.js"]


def page_files():
    """index.html first, then every file it references by <link href> or <script src>, in order, then any other .js/.css."""
    index = open(os.path.join(DIR, "index.html")).read()
    refs = re.findall(r'<link[^>]+href="([^"]+)"', index) + re.findall(r'<script[^>]+src="([^"]+)"', index)
    names = ["index.html"] + [r for r in refs if "/" not in r]
    for f in sorted(os.listdir(DIR)):
        if f.endswith((".js", ".css")) and f not in names:
            names.append(f)
    return names


def pack(out_dir, only=None):
    os.makedirs(out_dir, exist_ok=True)
    bad = []
    for name in page_files():
        if only and name not in only:
            continue
        text = open(os.path.join(DIR, name)).read()
        doc = json.dumps({"text": text}, ensure_ascii=False)
        size = len(doc.encode("utf-8"))
        with open(os.path.join(out_dir, name + ".json"), "w") as fh:
            fh.write(doc)
        flag = "OVER THE CAP" if size > CAP else f"{CAP - size:,} to spare"
        print(f"files/{name}: {size:,} bytes ({flag})")
        if size > CAP:
            bad.append(name)
    if bad:
        print("Refusing: split these before publishing:", ", ".join(bad))
        return 1
    print("Write each as ArtifactData update on collection files, doc_id <name>, file_path <out_dir>/<name>.json, pinned to its version.")
    return 0


def assemble(out_path):
    index = open(os.path.join(DIR, "index.html")).read()
    def inline_css(m):
        return "<style>\n" + open(os.path.join(DIR, m.group(1))).read() + "\n</style>"
    def inline_js(m):
        return "<script>\n" + open(os.path.join(DIR, m.group(1))).read() + "\n</script>"
    html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', inline_css, index)
    html = re.sub(r'<script src="([^"]+)"></script>', inline_js, html)
    with open(out_path, "w") as fh:
        fh.write(html)
    print(f"assembled {out_path}: {len(html):,} chars")
    return 0


if __name__ == "__main__":
    args = sys.argv[1:]
    if args and args[0] == "--assemble":
        sys.exit(assemble(args[1]))
    only = None
    if "--only" in args:
        only = set(args[args.index("--only") + 1].split(","))
        args = [a for a in args if a != "--only" and a != ",".join(only)]
    sys.exit(pack(args[0] if args else "/tmp/dashboard-pack", only))
