#!/usr/bin/env python3
"""One-time Garmin login, run on YOUR computer (not in GitHub).

1. Prompts for your Garmin email, password and MFA code (nothing is echoed or saved in plain text).
2. Encrypts the resulting Garmin session token into state/garmin_tokens.enc.
3. Prints a new encryption key. Paste it into the GitHub secret GARMIN_TOKEN_KEY.

Your password is used only for this login and is never written anywhere.
"""
import getpass
import sys
from pathlib import Path

try:
    from cryptography.fernet import Fernet
    from garminconnect import Garmin
except ImportError:
    sys.exit("Run first:  python3 -m pip install --upgrade garminconnect curl_cffi cryptography")

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "state" / "garmin_tokens.enc"


def main() -> None:
    email = input("Garmin email: ").strip()
    password = getpass.getpass("Garmin password (hidden): ")
    g = Garmin(email=email, password=password,
               prompt_mfa=lambda: input("Garmin MFA code (if asked): ").strip())
    g.login()
    token_json = g.client.dumps()
    name = g.get_full_name() or "your account"

    key = Fernet.generate_key()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_bytes(Fernet(key).encrypt(token_json.encode()))

    print(f"\nLogged in as {name}. Encrypted token written to {OUT.relative_to(ROOT)}")
    print("\nCopy this key into the GitHub secret named GARMIN_TOKEN_KEY:\n")
    print(key.decode())
    print("\nThen commit and push state/garmin_tokens.enc. Do not commit the key.")


if __name__ == "__main__":
    main()
