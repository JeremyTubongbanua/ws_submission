from __future__ import annotations

from pathlib import Path

def load_dotenv(dotenv_path: Path) -> dict[str, str]:
    """Read simple KEY=VALUE entries from a .env file."""
    env: dict[str, str] = {}
    if not dotenv_path.exists():
        return env

    for raw_line in dotenv_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()

        if (value.startswith("'") and value.endswith("'")) or (
            value.startswith('"') and value.endswith('"')
        ):
            value = value[1:-1]

        env[key] = value

    return env

