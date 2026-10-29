#!/usr/bin/env python3
"""Assemble CoasterLab into a single HTML file.

    python3 tools/build.py              -> index.html (standalone page, open in any browser)
    python3 tools/build.py --fragment   -> dist/coasterlab-artifact.html (body fragment for a Claude artifact)

Edit the files in src/ and rebuild; index.html is generated.
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
# Scripts in load order: plain data and physics first, then rendering, then the app.
SCRIPTS = ["core.js", "elements.js", "designs.js", "trackgfx.js", "tunnels.js", "trains.js", "world.js", "audio.js", "share.js", "ui.js"]


def fragment() -> str:
    html = (SRC / "template.html").read_text(encoding="utf-8")
    for marker in ("/*{{CSS}}*/", "/*{{SCRIPTS}}*/"):
        if marker not in html:
            sys.exit(f"template.html is missing the {marker} placeholder")
    html = html.replace("/*{{CSS}}*/", (SRC / "style.css").read_text(encoding="utf-8"))
    scripts = "\n".join("<script>\n%s\n</script>" % (SRC / name).read_text(encoding="utf-8") for name in SCRIPTS)
    return html.replace("/*{{SCRIPTS}}*/", scripts)


def standalone(frag: str) -> str:
    # Everything before the app container (title, metas, fonts, styles) belongs in <head>.
    split = frag.index('<div id="app">')
    head, body = frag[:split].strip(), frag[split:]
    return (
        "<!doctype html>\n<html lang=\"en\">\n<head>\n"
        "<meta charset=\"utf-8\">\n"
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n"
        "<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);box-sizing:border-box}"
        "body{margin:0}img{max-width:100%}</style>\n"
        f"{head}\n</head>\n<body>\n{body}\n</body>\n</html>\n"
    )


def main() -> None:
    frag = fragment()
    if "--fragment" in sys.argv:
        out = ROOT / "dist" / "coasterlab-artifact.html"
        out.parent.mkdir(exist_ok=True)
        out.write_text(frag, encoding="utf-8")
    else:
        out = ROOT / "index.html"
        out.write_text(standalone(frag), encoding="utf-8")
    print(f"wrote {out.relative_to(ROOT)} ({out.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
