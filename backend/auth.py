"""Optionaler Passwortschutz pro Datenbank — siehe models.AppAuth für das
Datenmodell und die Backward-Compatibility-Garantie (kein Passwort gesetzt =
alles wie bisher frei zugänglich).

Bewusst nur Python-Standardbibliothek (``hashlib``, ``hmac``, ``secrets``) —
keine neue Abhängigkeit, kein zu kompilierendes C-Extension-Paket, das die
PyInstaller-Builds für macOS/Windows verkomplizieren würde. PBKDF2-HMAC-SHA256
mit 600.000 Iterationen folgt der aktuellen OWASP-Empfehlung (Stand 2023er
Cheat Sheet) für passwortbasiertes Hashing ohne dedizierte KDF-Bibliothek wie
Argon2/bcrypt.

Session-Modell: kein serverseitiger Session-Speicher nötig (Ein-Nutzer-App,
läuft lokal). Nach erfolgreichem Login wird ein HMAC-signiertes Token
ausgestellt (Nutzlast: Ablaufzeit), signiert mit einem pro Datenbank
zufällig erzeugten Secret (``AppAuth.token_secret``, nie übertragen, bleibt
in der DB) — das Frontend schickt es als Bearer-Token, ``require_auth()``
prüft Signatur + Ablauf bei jedem geschützten Aufruf. Läuft die Web-App im
Browser oder die Desktop-App über pywebview, ist der Mechanismus identisch
(beide sprechen dieselbe REST-API)."""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import time
from datetime import datetime, timezone

PBKDF2_ITERATIONS = 600_000
TOKEN_TTL_SECONDS = 12 * 60 * 60  # 12 Stunden


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_secret(secret: str) -> str:
    """Salted PBKDF2-Hash, Format ``pbkdf2$<iterationen>$<salt_hex>$<hash_hex>``."""
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", secret.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_secret(secret: str, stored_hash: str) -> bool:
    try:
        scheme, iterations_s, salt_hex, digest_hex = stored_hash.split("$")
        if scheme != "pbkdf2":
            return False
        iterations = int(iterations_s)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(digest_hex)
    except (ValueError, AttributeError):
        return False
    actual = hashlib.pbkdf2_hmac("sha256", secret.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(actual, expected)


def generate_recovery_code() -> str:
    """12-stelliger Code in 4er-Gruppen (z. B. ``ABCD-EFGH-2345``) — einmalig
    beim Setup angezeigt, danach nur als Hash gespeichert, nirgends im
    Klartext wiederherstellbar."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # ohne verwechselbare Zeichen (0/O, 1/I/l)
    raw = "".join(secrets.choice(alphabet) for _ in range(12))
    return f"{raw[0:4]}-{raw[4:8]}-{raw[8:12]}"


def generate_token_secret() -> str:
    return secrets.token_hex(32)


_SIG_LEN = 32  # hashlib.sha256().digest_size — HMAC-SHA256 output is always exactly this long


def create_token(token_secret: str, ttl_seconds: int = TOKEN_TTL_SECONDS) -> str:
    expires_at = int(time.time()) + ttl_seconds
    payload = str(expires_at).encode("utf-8")
    sig = hmac.new(token_secret.encode("utf-8"), payload, hashlib.sha256).digest()
    # Feste Signaturlänge statt Trennzeichen: eine rohe HMAC-Signatur ist
    # zufällige Binärdaten und kann selbst ein "."-Byte enthalten — ein
    # rsplit(b".", 1) auf payload+"."+sig würde dann an der falschen Stelle
    # trennen (real aufgetreten, ~1 von 10 Token betroffen). Payload steht
    # vorn, Signatur hat garantiert immer _SIG_LEN Bytes am Ende.
    return base64.urlsafe_b64encode(payload + sig).decode("ascii")


def verify_token(token: str, token_secret: str) -> bool:
    try:
        raw = base64.urlsafe_b64decode(token.encode("ascii"))
        if len(raw) <= _SIG_LEN:
            return False
        payload, sig = raw[:-_SIG_LEN], raw[-_SIG_LEN:]
        expires_at = int(payload.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return False
    expected_sig = hmac.new(token_secret.encode("utf-8"), payload, hashlib.sha256).digest()
    if not hmac.compare_digest(sig, expected_sig):
        return False
    return time.time() < expires_at
