"""List _('...') strings in the game scripts that have no zh_cn translation.

usage: python -I missing_zh.py <repo root> <output json>
"""
import json
import pathlib
import re
import sys
from collections import Counter

root = pathlib.Path(sys.argv[1])
s = (root / "lang/zh_cn/strings.js").read_text(encoding="utf-8")
zh = json.loads(s[s.index("{"):s.rindex("}") + 1])

def unescape(raw):
    out, i = [], 0
    while i < len(raw):
        c = raw[i]
        if c == "\\" and i + 1 < len(raw):
            n = raw[i + 1]
            out.append({"n": "\n", "t": "\t"}.get(n, n))
            i += 2
        else:
            out.append(c)
            i += 1
    return "".join(out)


# translations registered by the kotoka modules (Kotoka.addStrings)
for f in (root / "script/kotoka").glob("*.js"):
    for m in re.finditer(r"'((?:\\.|[^'\\])*)'\s*:\s*'", f.read_text(encoding="utf-8")):
        zh.setdefault(unescape(m.group(1)), "(kotoka)")

pat = re.compile(r"""_\(\s*(['"])((?:\\.|(?!\1).)*?)\1""", re.S)


missing = {}
for f in sorted((root / "script").rglob("*.js")):
    if "kotoka" in f.parts or f.name == "dropbox.js":
        continue
    for m in pat.finditer(f.read_text(encoding="utf-8")):
        key = unescape(m.group(2))
        if key and key not in zh:
            missing.setdefault(key, set()).add(f.relative_to(root).as_posix())

out = [{"key": k, "files": sorted(v)} for k, v in sorted(missing.items(), key=lambda kv: (sorted(kv[1])[0], kv[0]))]
pathlib.Path(sys.argv[2]).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
print("missing:", len(out), "| dictionary size:", len(zh))
print(Counter(o["files"][0] for o in out).most_common())
