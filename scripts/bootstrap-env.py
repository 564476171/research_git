#!/usr/bin/env python3
import base64
import secrets
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env"
EXAMPLE_PATH = ROOT / ".env.example"
PLACEHOLDERS = {
    "changeme",
    "replace-with-random-256bit-secret",
    "replace-with-fernet-key",
    "admin@example.com",
}


def parse_env(path: Path) -> tuple[list[str], dict[str, str]]:
    lines = path.read_text().splitlines() if path.exists() else []
    values: dict[str, str] = {}
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return lines, values


def random_secret() -> str:
    return secrets.token_urlsafe(48)


def fernet_key() -> str:
    return base64.urlsafe_b64encode(secrets.token_bytes(32)).decode()


def is_missing(value: str | None) -> bool:
    return value is None or value.strip() == "" or value.strip() in PLACEHOLDERS


def render(lines: list[str], values: dict[str, str]) -> str:
    seen: set[str] = set()
    output: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in line:
            output.append(line)
            continue
        key = line.split("=", 1)[0].strip()
        if key in values:
            output.append(f"{key}={values[key]}")
            seen.add(key)
        else:
            output.append(line)
    for key, value in values.items():
        if key not in seen:
            output.append(f"{key}={value}")
    return "\n".join(output).rstrip() + "\n"


def main() -> None:
    template_lines, template_values = parse_env(EXAMPLE_PATH)
    current_lines, current_values = parse_env(ENV_PATH)
    lines = current_lines if ENV_PATH.exists() else template_lines
    values = {**template_values, **current_values}

    values.setdefault("POSTGRES_USER", "research")
    values.setdefault("POSTGRES_DB", "research_git")
    values.setdefault("REDIS_URL", "redis://redis:6379/0")
    values.setdefault("MEDIA_ROOT", "/app/media")
    values.setdefault("MEDIA_URL", "/media")
    values.setdefault("AVATAR_MAX_BYTES", "2000000")
    values.setdefault("CORS_ORIGINS", "http://localhost:3000")
    values.setdefault("PUBLIC_FRONTEND_URL", "http://localhost:3000")
    values.setdefault("ADMIN_BOOTSTRAP_EMAILS", "")

    if is_missing(values.get("POSTGRES_PASSWORD")):
        values["POSTGRES_PASSWORD"] = random_secret()
    if is_missing(values.get("JWT_SECRET")):
        values["JWT_SECRET"] = random_secret()
    if is_missing(values.get("MASTER_KEY")):
        values["MASTER_KEY"] = fernet_key()

    user = quote(values["POSTGRES_USER"])
    password = quote(values["POSTGRES_PASSWORD"])
    database = quote(values["POSTGRES_DB"])
    values["DATABASE_URL"] = f"postgresql+asyncpg://{user}:{password}@db:5432/{database}"

    ENV_PATH.write_text(render(lines, values))

    print(f"Wrote {ENV_PATH}")
    if is_missing(values.get("ADMIN_BOOTSTRAP_EMAILS")):
        print("Next: edit .env and set ADMIN_BOOTSTRAP_EMAILS=your-admin@example.com")
    print("Then run: docker compose up -d --build")


if __name__ == "__main__":
    main()
