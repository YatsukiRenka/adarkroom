"""List game text that has no zh_cn translation.

Three kinds of gaps:
  literal  _('...') strings without a translation
  item     item names used as object keys (loot, costs, craftables, trade goods); the game shows
           them through _(key), so they need a translation even though no _('...') names them
  raw      English text handed to .text() / .html() / Notifications.notify() without _(),
           which no translation can reach; wrap it in _() and translate it

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

literal = re.compile(r"""_\(\s*(['"])((?:\\.|(?!\1).)*?)\1""", re.S)
item_block = re.compile(r"\b(?:loot|cost|reward|Craftables|TradeGoods|MiscItems)\s*:\s*(?:\(\)\s*=>\s*\(?)?\{")
item_key = re.compile(r"""\s*(?:(['"])((?:\\.|(?!\1).)+)\1|([A-Za-z_$][\w$]*))\s*:""")
raw_sink = re.compile(r"""(?:\.text\(|\.html\(|notify\([^,()]*,)\s*(['"`])((?:\\.|(?!\1).)*?[a-z]{3,}[ .!?](?:\\.|(?!\1).)*?)\1""")


def item_keys(text):
    """Yield (offset, key) for the keys directly inside each item block."""
    for m in item_block.finditer(text):
        i, depth = m.end(), 1
        while i < len(text) and depth:
            c = text[i]
            if depth == 1 and text[i - 1] in "{,\n":
                km = item_key.match(text, i)
                if km:
                    yield i, km.group(2) or km.group(3)
            if c in "{([":
                depth += 1
            elif c in "})]":
                depth -= 1
            elif c in "'\"`":
                j = i + 1
                while j < len(text) and text[j] != c:
                    j += 2 if text[j] == "\\" else 1
                i = j
            i += 1


missing = {}
def add(kind, key, f):
    if key and key not in zh:
        missing.setdefault((kind, key), set()).add(f.relative_to(root).as_posix())

for f in sorted((root / "script").rglob("*.js")):
    if "kotoka" in f.parts or f.name == "dropbox.js":
        continue
    text = f.read_text(encoding="utf-8")
    for m in literal.finditer(text):
        add("literal", unescape(m.group(2)), f)
    for _, key in item_keys(text):
        add("item", unescape(key), f)
    for m in raw_sink.finditer(text):
        missing.setdefault(("raw", unescape(m.group(2))), set()).add(f.relative_to(root).as_posix())

out = [{"kind": k[0], "key": k[1], "files": sorted(v)}
       for k, v in sorted(missing.items(), key=lambda kv: (kv[0][0], sorted(kv[1])[0], kv[0][1]))]
pathlib.Path(sys.argv[2]).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
print("missing:", len(out), "| dictionary size:", len(zh))
print(Counter((o["kind"], o["files"][0]) for o in out).most_common())
