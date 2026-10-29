"""Password verification and offline credential generation for the operator account."""
import hashlib
import hmac
import re
import secrets
from pathlib import Path

HASH_PATTERN = r"scrypt-v1\$[a-f0-9]{32}\$[a-f0-9]{128}"


def password_hash(password: str, salt: bytes) -> str:
    digest = hashlib.scrypt(password.encode(), salt=salt, n=32768, r=8, p=3, maxmem=64 * 1024 * 1024, dklen=64)
    return f"scrypt-v1${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    if not re.fullmatch(HASH_PATTERN, encoded) or len(password.encode()) > 1024:
        return False
    salt = bytes.fromhex(encoded.split("$")[1])
    return hmac.compare_digest(password_hash(password, salt), encoded)


def generate_credentials():
    # No environment reads, network, database, or existing credential-file reads.
    root = Path(__file__).resolve().parents[2]
    folder = root / ".local"
    folder.mkdir(exist_ok=True)
    destination = folder / "admin-credentials.txt"
    if destination.exists():
        raise RuntimeError("Credential file already exists; move it privately before generating a rotation")
    password = secrets.token_urlsafe(32)
    ident, version = secrets.token_hex(16), secrets.token_hex(16)
    encoded = password_hash(password, secrets.token_bytes(16))
    content = (
        "PRIVATE — store in a password manager; never commit or share this file.\n"
        "These credentials work only after the matching code and settings are deployed.\n\n"
        "Admin login: /admin/login\nUsername: forum_admin\nPassword: " + password + "\n\n"
        "VERCEL — server-only environment settings:\nADMIN_LOGIN_ENABLED=1\n"
        f"ADMIN_LOGIN_ACCOUNT_ID={ident}\nADMIN_LOGIN_VERSION={version}\n\n"
        "RENDER — backend-only environment settings:\nADMIN_LOGIN_USERNAME=forum_admin\n"
        f"ADMIN_LOGIN_ACCOUNT_ID={ident}\nADMIN_LOGIN_PASSWORD_HASH={encoded}\n"
        f"Append this ID to ADMIN_ANON_IDS (preserve existing entries): {ident}\n\n"
        "Redeploy both services. On password rotation, preserve ACCOUNT_ID and username,\n"
        "replace PASSWORD_HASH, and change ADMIN_LOGIN_VERSION to revoke old sessions.\n"
        "Disable ADMIN_LOGIN_ENABLED and remove the dedicated ID from ADMIN_ANON_IDS to revoke access.\n"
    )
    import os
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as output:
        output.write(content)


if __name__ == "__main__":
    try:
        generate_credentials()
        print("Private credentials saved to .local/admin-credentials.txt. No live settings changed.")
    except Exception:
        print("Credential generation failed. An existing private file is never overwritten.")
        raise SystemExit(1) from None
