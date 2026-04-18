"""Wrap landing.css top-level rules in @scope (.landing-root) to (.autlas-wrap),
leaving :root, @keyframes, @media, @supports, @font-face at module scope."""
import re

src = open("src/landing.css", "r", encoding="utf-8").read()

# Tokenize top-level items: :root{...}, @at-rule{...}, or selector{...}.
# CSS has nested braces (not common at top level but can happen in @media).
i = 0
items = []
n = len(src)

def skip_ws_and_comments(i):
    while i < n:
        # whitespace
        if src[i].isspace():
            i += 1
            continue
        # /* ... */
        if src[i:i+2] == "/*":
            end = src.find("*/", i + 2)
            i = (end + 2) if end != -1 else n
            continue
        break
    return i

while i < n:
    i = skip_ws_and_comments(i)
    if i >= n:
        break
    start = i
    # Find the matching brace block starting from the next "{".
    brace = src.find("{", i)
    if brace == -1:
        # Dangling text; append as-is.
        items.append(("verbatim", src[start:]))
        break
    selector = src[i:brace]
    # Walk to matching "}" respecting nesting.
    depth = 1
    j = brace + 1
    while j < n and depth > 0:
        ch = src[j]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
        elif ch == "/" and src[j:j+2] == "/*":
            end = src.find("*/", j + 2)
            j = (end + 2) if end != -1 else n
            continue
        j += 1
    block = src[start:j]
    sel = selector.strip()
    kind = "global" if (
        sel.startswith(("@keyframes", "@font-face", "@import", "@layer"))
        or sel.startswith(":root")
        or sel in ("html", "body")
    ) else "scoped"
    items.append((kind, block))
    i = j

out = []
scoped_group = []

def flush_scoped():
    if not scoped_group:
        return
    body = "\n".join(scoped_group)
    out.append("@scope (.landing-root) to (.autlas-wrap) {\n" + body + "\n}")
    scoped_group.clear()

for kind, block in items:
    if kind == "global" or kind == "verbatim":
        flush_scoped()
        out.append(block)
    else:
        scoped_group.append(block)
flush_scoped()

open("src/landing.css", "w", encoding="utf-8").write("\n\n".join(out) + "\n")
print(f"Rewrote landing.css: {len(items)} blocks, {sum(1 for k,_ in items if k=='scoped')} scoped.")
