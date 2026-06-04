"""
generate_report.py — Convert a Markdown report to a self-contained HTML slide deck.

Reads Markdown from a file or stdin and produces a styled HTML file using
full-viewport slides with CSS scroll-snap, keyboard navigation, and a slide
counter. No external dependencies — pure Python stdlib only.

Usage:
    python generate_report.py --input research_agent.md --output report.html
    python generate_report.py --input research_agent.md          # auto-names output
    cat research_agent.md | python generate_report.py            # stdin

Markdown format:
    # Report Title

    Executive summary paragraph(s).

    ---

    ## Section Name

    ### Slide Title

    #### Subheading

    Body paragraphs and bullet lists.

    ---

    ### Next Slide
    ...
"""

import argparse
import re
import sys
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_OUTPUT_DIR = SCRIPT_DIR / "reports"


def parse_markdown(md_text: str) -> list:
    """Parse markdown into structured blocks for HTML rendering."""
    blocks = []
    lines = md_text.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            i += 1
            continue

        # Headings — longest-prefix-first to avoid #### matching as ###
        if stripped.startswith("#### "):
            blocks.append(("h4", stripped[5:]))
        elif stripped.startswith("### "):
            blocks.append(("h3", stripped[4:]))
        elif stripped.startswith("## "):
            blocks.append(("h2", stripped[3:]))
        elif stripped.startswith("# "):
            blocks.append(("h1", stripped[2:]))
        # Horizontal rule / separator
        elif stripped in ("---", "===", "***") or (
            len(stripped) > 3 and all(c in "=-─*_ " for c in stripped)
        ):
            blocks.append(("hr", ""))
        # Bullet items
        elif stripped.startswith("- ") or stripped.startswith("* ") or stripped.startswith("+ "):
            blocks.append(("bullet", stripped[2:]))
        # Numbered items
        elif re.match(r'^\d+\.\s', stripped):
            text = re.sub(r'^\d+\.\s', '', stripped)
            blocks.append(("bullet", text))
        # Everything else is a paragraph
        else:
            para_lines = [stripped]
            while i + 1 < len(lines):
                next_line = lines[i + 1].strip()
                if (not next_line or next_line.startswith("#") or
                    next_line.startswith("- ") or next_line.startswith("* ") or
                    next_line.startswith("```") or
                    re.match(r'^\d+\.\s', next_line) or
                    next_line in ("---", "===", "***")):
                    break
                para_lines.append(next_line)
                i += 1
            blocks.append(("para", " ".join(para_lines)))

        i += 1

    return blocks


def render_html(md_text: str, output_path: Path) -> Path:
    """Render Markdown into a self-contained slide-deck HTML file.

    Design: full-viewport slides with CSS scroll-snap, warm ivory palette,
    serif headings, Courier New body text, clay accent. Cover is dark-inverted.
    Arrow-key / space navigation, slide counter.
    """
    blocks = parse_markdown(md_text)

    # ── Split at first hr: cover vs body ─────────────────────────────────
    cover_title = "x-squared"
    cover_paras: list[str] = []
    body_blocks: list[tuple[str, str]] = []
    cover_done = False

    for btype, text in blocks:
        if not cover_done:
            if btype == "h1":
                cover_title = text
            elif btype == "para":
                cover_paras.append(text)
            elif btype == "hr":
                cover_done = True
        else:
            body_blocks.append((btype, text))

    def _esc(s: str) -> str:
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    css = """
  :root {
    --ivory:    #FAF9F5;
    --slate:    #141413;
    --clay:     #D97757;
    --oat:      #E3DACC;
    --gray-150: #F0EEE6;
    --gray-300: #D1CFC5;
    --gray-500: #87867F;
    --gray-700: #3D3D3A;
    --mono:     'Courier New', Courier, monospace;
    --serif:    ui-serif, Georgia, 'Times New Roman', serif;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body {
    font-family: var(--mono);
    background: var(--ivory);
    color: var(--slate);
    scroll-snap-type: y mandatory;
    overflow-x: hidden;
    -webkit-font-smoothing: antialiased;
  }
  .slide {
    width: 100vw;
    min-height: 100vh;
    scroll-snap-align: start;
    scroll-snap-stop: always;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 10vh 8vw;
  }
  .slide-inner { width: 100%; max-width: 780px; }

  /* Cover — dark inverted */
  .cover-slide { background: var(--slate); color: var(--ivory); }
  .cover-slide .eyebrow { color: var(--gray-300); }

  /* Final slide — dark inverted like cover */
  .final-slide { background: var(--slate); color: var(--ivory); }
  .final-slide .eyebrow { color: var(--gray-300); }
  .final-slide h2 { color: var(--ivory); }
  .final-slide .sub-title { color: var(--gray-500); }
  .final-slide .body-para { color: var(--gray-300); }
  .final-slide .bullet-list li { color: var(--gray-300); }
  .final-slide .sub-section { border-top-color: #2a2a28; }

  /* Eyebrow */
  .eyebrow {
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--gray-500);
    margin-bottom: 20px;
  }

  /* Headings */
  h1 {
    font-family: var(--serif);
    font-weight: 500;
    font-size: clamp(28px, 5vw, 52px);
    line-height: 1.1;
    letter-spacing: -0.01em;
    margin-bottom: 28px;
    color: inherit;
  }
  h2 {
    font-family: var(--serif);
    font-weight: 500;
    font-size: clamp(24px, 4vw, 42px);
    line-height: 1.15;
    letter-spacing: -0.005em;
    margin-bottom: 0;
    color: inherit;
  }

  /* Cover content */
  .exec-lead {
    font-family: var(--mono);
    font-size: 16px;
    line-height: 1.75;
    color: var(--gray-300);
    max-width: 580px;
    margin-bottom: 16px;
  }
  .exec-rest p {
    font-family: var(--mono);
    font-size: 14px;
    line-height: 1.7;
    color: var(--gray-500);
    max-width: 580px;
    margin-bottom: 10px;
  }
  .byline {
    margin-top: 44px;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--gray-500);
    display: flex;
    gap: 24px;
    flex-wrap: wrap;
  }

  /* Section divider */
  .trend-divider {
    width: 40px;
    height: 2px;
    background: var(--clay);
    margin: 20px 0 32px;
  }

  /* Sub-section (one per H4) */
  .sub-section {
    padding-top: 24px;
    border-top: 1px solid var(--gray-150);
    margin-bottom: 4px;
  }
  .sub-section:first-child { border-top: none; padding-top: 0; }
  .sub-title {
    font-family: var(--mono);
    font-size: 10px;
    font-weight: bold;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--gray-500);
    margin-bottom: 12px;
  }

  /* Body content */
  .body-para {
    font-family: var(--mono);
    font-size: 15px;
    line-height: 1.8;
    color: var(--gray-700);
    margin-bottom: 12px;
    max-width: 680px;
  }
  .bullet-list { list-style: none; padding: 0; margin-bottom: 10px; }
  .bullet-list li {
    font-family: var(--mono);
    font-size: 15px;
    line-height: 1.75;
    color: var(--gray-700);
    padding-left: 22px;
    position: relative;
    margin-bottom: 6px;
  }
  .bullet-list li::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0.6em;
    width: 10px;
    height: 1.5px;
    background: var(--clay);
  }

  /* Slide counter */
  #counter {
    position: fixed;
    bottom: 22px;
    right: 28px;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--gray-500);
    user-select: none;
    z-index: 10;
    letter-spacing: 0.05em;
  }

  @media print {
    body { scroll-snap-type: none; }
    .slide { page-break-after: always; }
    #counter { display: none; }
  }
  @media (max-width: 640px) {
    .slide { padding: 6vh 5vw; }
    h1 { font-size: 28px; }
    h2 { font-size: 22px; }
  }
"""

    slides: list[str] = []

    # ── Slide 1: Cover ────────────────────────────────────────────────────
    exec_lead = _esc(cover_paras[0]) if cover_paras else ""
    exec_rest_html = "".join(f"<p>{_esc(p)}</p>" for p in cover_paras[1:])
    date_str = datetime.now().strftime("%Y-%m-%d")
    slides.append(
        '<section class="slide cover-slide" id="s0"><div class="slide-inner">\n'
        '  <div class="eyebrow">$ x-squared /..</div>\n'
        f"  <h1>{_esc(cover_title)}</h1>\n"
        + (f'  <p class="exec-lead">{exec_lead}</p>\n' if exec_lead else "")
        + (f'  <div class="exec-rest">{exec_rest_html}</div>\n' if exec_rest_html else "")
        + f'  <div class="byline"><span>x-squared</span><span>{date_str}</span></div>\n'
        + "</div></section>"
    )

    # ── Body slides: one slide per H3 ────────────────────────────────────
    section_h2: list[str] = ["Research Report"]
    current_h3: list[str | None] = [None]
    current_h4: list[str | None] = [None]
    sub_items: list[str] = []
    subsections: list[str] = []
    in_bullets: list[bool] = [False]

    def _close_bullets() -> None:
        if in_bullets[0]:
            sub_items.append("</ul>")
            in_bullets[0] = False

    def _flush_subsection() -> None:
        _close_bullets()
        if sub_items or current_h4[0] is not None:
            label = (
                f'<div class="sub-title">{_esc(current_h4[0])}</div>'
                if current_h4[0] else ""
            )
            subsections.append(
                f'<div class="sub-section">{label}{"".join(sub_items)}</div>'
            )
            sub_items.clear()
            current_h4[0] = None

    def _flush_section() -> None:
        _flush_subsection()
        if current_h3[0] is not None:
            is_final = "conclusion" in current_h3[0].lower() or "final" in current_h3[0].lower()
            extra = " final-slide" if is_final else ""
            idx = len(slides)
            slides.append(
                f'<section class="slide{extra}" id="s{idx}"><div class="slide-inner">\n'
                f'  <div class="eyebrow">{_esc(section_h2[0])}</div>\n'
                f"  <h2>{_esc(current_h3[0])}</h2>\n"
                f'  <div class="trend-divider"></div>\n'
                f'  <div class="trend-body">{"".join(subsections)}</div>\n'
                "</div></section>"
            )
            subsections.clear()
            current_h3[0] = None

    for btype, text in body_blocks:
        if btype == "h2":
            section_h2[0] = text
        elif btype == "h3":
            _flush_section()
            current_h3[0] = text
        elif btype == "h4":
            _flush_subsection()
            current_h4[0] = text
        elif btype == "bullet":
            if not in_bullets[0]:
                sub_items.append('<ul class="bullet-list">')
                in_bullets[0] = True
            sub_items.append(f"<li>{_esc(text)}</li>")
        elif btype == "para":
            _close_bullets()
            sub_items.append(f'<p class="body-para">{_esc(text)}</p>')

    _flush_section()

    total = len(slides)
    script = (
        "(function(){"
        "var s=Array.from(document.querySelectorAll('.slide'));"
        "var c=document.getElementById('counter');"
        "var i=0;"
        "function go(n){i=Math.max(0,Math.min(s.length-1,n));s[i].scrollIntoView({behavior:'smooth'});}"
        "document.addEventListener('keydown',function(e){"
        "if(e.key==='ArrowRight'||e.key==='ArrowDown'||e.key===' '){e.preventDefault();go(i+1);}"
        "if(e.key==='ArrowLeft'||e.key==='ArrowUp'){e.preventDefault();go(i-1);}"
        "});"
        "var o=new IntersectionObserver(function(es){"
        "es.forEach(function(e){if(e.isIntersecting){i=s.indexOf(e.target);c.textContent=(i+1)+' / '+s.length;}});"
        "},{threshold:0.5});"
        "s.forEach(function(x){o.observe(x);});"
        "})();"
    )

    html = (
        "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n"
        '<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        f"<title>{_esc(cover_title)}</title>\n"
        f"<style>{css}</style>\n"
        "</head>\n<body>\n"
        + "\n".join(slides)
        + f'\n<div id="counter">1 / {total}</div>\n'
        + f"<script>{script}</script>\n"
        + "</body>\n</html>"
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(html, encoding="utf-8")
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert Markdown report to HTML slide deck.")
    parser.add_argument("--input", "-i", type=str, default=None,
                        help="Markdown file (default: research_agent.md)")
    parser.add_argument("--output", "-o", type=str, default=None,
                        help="Output HTML path")
    args = parser.parse_args()

    if args.input:
        md_text = Path(args.input).read_text(encoding="utf-8")
        input_stem = Path(args.input).stem
    else:
        src = SCRIPT_DIR / "research_agent.md"
        if src.exists():
            md_text = src.read_text(encoding="utf-8")
            input_stem = "research_agent"
        else:
            md_text = sys.stdin.read()
            input_stem = "report"

    if not md_text.strip():
        print("ERROR: No markdown content provided.")
        sys.exit(1)

    if args.output:
        output_path = Path(args.output)
    else:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        DEFAULT_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        output_path = DEFAULT_OUTPUT_DIR / f"{input_stem}_{timestamp}.html"

    result = render_html(md_text, output_path)
    print(f"HTML report generated: {result}")


if __name__ == "__main__":
    main()
