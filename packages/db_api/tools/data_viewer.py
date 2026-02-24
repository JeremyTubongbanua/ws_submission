from __future__ import annotations

import json
import sys
from html import escape
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

DB_API_DIR = Path(__file__).resolve().parents[1]
DB_API_SRC = DB_API_DIR / "src"
if str(DB_API_SRC) not in sys.path:
    sys.path.insert(0, str(DB_API_SRC))

from utils.dotenv_utils import load_dotenv
from utils.supabase_reader import discover_tables, get_env_var, read_rows, require_project_url

FK_MAP: dict[tuple[str, str], tuple[str, str]] = {
    ("content_state", "content_id"): ("content", "id"),
    ("generated_comments", "content_id"): ("content", "id"),
    ("transactions", "content_id"): ("content", "id"),
    ("posting_events", "content_id"): ("content", "id"),
    ("posting_events", "generated_comment_id"): ("generated_comments", "id"),
}


def _read_env() -> dict[str, str]:
    db_api_dir = Path(__file__).resolve().parents[1]
    candidates = [db_api_dir / ".env"]
    merged: dict[str, str] = {}
    for path in candidates:
        merged.update(load_dotenv(path))
    return merged


def _load_connection() -> tuple[str, str]:
    env = _read_env()
    api_key = get_env_var(env, "SUPABASE_SECRET_API_KEY")
    if not api_key:
        raise RuntimeError("Missing SUPABASE_SECRET_API_KEY in db_api/.env")
    project_url = require_project_url(env)
    return project_url, api_key


def _table_link(table: str) -> str:
    return f"/table/{table}"


def _record_link(table: str, column: str, value: object) -> str:
    return f"/table/{table}?id_column={column}&id_value={value}"


def _render_cell(table: str, column: str, value: object) -> str:
    if value is None:
        return '<span class="null">null</span>'

    fk = FK_MAP.get((table, column))
    text = escape(str(value))
    if fk:
        target_table, target_column = fk
        href = escape(_record_link(target_table, target_column, value))
        return f'<a class="fk" href="{href}" title="{target_table}.{target_column}">{text}</a>'
    return text


def _render_home(project_url: str, api_key: str) -> str:
    tables = discover_tables(project_url, api_key)
    cards: list[str] = []
    for table in tables:
        rows = read_rows(project_url, api_key, table, limit=5)
        link = escape(_table_link(table))
        cards.append(
            "<li class='card'>"
            f"<a href='{link}'>{escape(table)}</a>"
            f"<div class='meta'>sample rows: {len(rows)}</div>"
            "</li>"
        )
    return (
        "<h1>Data Viewer</h1>"
        "<p>Click a table to inspect rows and foreign-key links.</p>"
        f"<ul class='grid'>{''.join(cards)}</ul>"
    )


def _render_table(project_url: str, api_key: str, table: str, params: dict[str, list[str]]) -> str:
    rows = read_rows(project_url, api_key, table, limit=200)
    focus_column = params.get("id_column", ["id"])[0]
    focus_value = params.get("id_value", [""])[0]

    all_columns: list[str] = []
    for row in rows:
        for key in row.keys():
            if key not in all_columns:
                all_columns.append(key)

    headers = "".join(f"<th>{escape(col)}</th>" for col in all_columns) or "<th>empty</th>"

    body_rows: list[str] = []
    for row in rows:
        rid = row.get(focus_column)
        highlight = " highlight" if focus_value and str(rid) == focus_value else ""
        row_id_attr = f"row-{escape(str(rid))}" if rid is not None else ""
        cells = []
        for col in all_columns:
            cells.append(f"<td>{_render_cell(table, col, row.get(col))}</td>")
        body_rows.append(
            f"<tr id='{row_id_attr}' class='{highlight.strip()}'>{''.join(cells)}</tr>"
        )

    if not body_rows:
        body_rows.append("<tr><td class='null'>No rows found.</td></tr>")

    return (
        f"<h1>{escape(table)}</h1>"
        "<div class='nav'><a href='/'>Back to tables</a></div>"
        "<div class='hint'>Foreign-key IDs are clickable links.</div>"
        "<div class='table-wrap'>"
        "<table>"
        f"<thead><tr>{headers}</tr></thead>"
        f"<tbody>{''.join(body_rows)}</tbody>"
        "</table>"
        "</div>"
    )


def _page(content: str) -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Supabase Data Viewer</title>
  <style>
    :root {{
      --bg: #f7f4eb;
      --ink: #1d2b2a;
      --accent: #0d6d62;
      --muted: #6d7a79;
      --card: #ffffff;
      --line: #cfdad9;
    }}
    body {{
      margin: 0;
      font-family: "IBM Plex Sans", "Avenir Next", sans-serif;
      background: radial-gradient(circle at 10% 10%, #e9f4f2, var(--bg) 40%);
      color: var(--ink);
    }}
    main {{
      max-width: 1200px;
      margin: 2rem auto;
      padding: 0 1rem 2rem;
    }}
    h1 {{ margin: 0 0 0.5rem; }}
    .grid {{
      list-style: none;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 1rem;
    }}
    .card {{
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 1rem;
    }}
    .card a {{ font-weight: 700; color: var(--accent); text-decoration: none; }}
    .meta {{ margin-top: 0.4rem; color: var(--muted); font-size: 0.9rem; }}
    .nav a {{ color: var(--accent); }}
    .hint {{ margin: 0.5rem 0 1rem; color: var(--muted); }}
    .table-wrap {{
      overflow-x: auto;
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 12px;
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
      min-width: 900px;
    }}
    th, td {{
      text-align: left;
      padding: 0.6rem;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
      font-size: 0.92rem;
    }}
    th {{
      position: sticky;
      top: 0;
      background: #f0f7f6;
      z-index: 1;
    }}
    a.fk {{ color: #1f5fd6; font-weight: 600; text-decoration: none; }}
    .null {{ color: var(--muted); font-style: italic; }}
    tr.highlight {{ background: #fff9d6; }}
  </style>
</head>
<body>
  <main>{content}</main>
</body>
</html>"""


class ViewerHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_qs(parsed.query)
        try:
            project_url, api_key = _load_connection()
            if path == "/":
                html = _page(_render_home(project_url, api_key))
            elif path.startswith("/table/"):
                table = path.removeprefix("/table/").strip()
                if not table:
                    raise RuntimeError("Missing table name.")
                html = _page(_render_table(project_url, api_key, table, params))
            else:
                self.send_response(404)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.end_headers()
                self.wfile.write(b"Not found")
                return
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(html.encode("utf-8"))
        except Exception as exc:
            self.send_response(500)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            content = _page(
                "<h1>Configuration/Error</h1>"
                f"<pre>{escape(str(exc))}</pre>"
                "<p>Set SUPABASE_SECRET_API_KEY and SUPABASE_URL in db_api/.env.</p>"
            )
            self.wfile.write(content.encode("utf-8"))


def main() -> int:
    host = "127.0.0.1"
    port = 8080
    server = ThreadingHTTPServer((host, port), ViewerHandler)
    print(f"Data Viewer running on http://{host}:{port}")
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
