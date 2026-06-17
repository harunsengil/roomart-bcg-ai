#!/usr/bin/env python3
"""
Firebase Auth "Custom Action URL"'yi API'den ayarlar (Console bug'ını atlar).
Identity Platform Admin API: config.notification.sendEmail.callbackUri

Parola sıfırlama / e-posta doğrulama linkleri bu URL'e yönlenir → bizim
ResetPasswordHandler (çift şifre + giriş linki) devreye girer.

Çalıştırma: GitHub Actions (FIREBASE_SERVICE_ACCOUNT secret'lı), set-action-url.yml.
"""
import json
import os
import sys

import requests
from google.oauth2 import service_account
import google.auth.transport.requests

ACTION_URL = "https://harunsengil.github.io/roomart-bcg-ai/"


def main():
    sa_raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if not sa_raw:
        print("HATA: FIREBASE_SERVICE_ACCOUNT yok.")
        sys.exit(1)
    sa = json.loads(sa_raw)
    project = sa["project_id"]

    creds = service_account.Credentials.from_service_account_info(
        sa, scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    creds.refresh(google.auth.transport.requests.Request())

    url = (
        f"https://identitytoolkit.googleapis.com/admin/v2/projects/{project}/config"
        "?updateMask=notification.sendEmail.callbackUri"
    )
    body = {"notification": {"sendEmail": {"callbackUri": ACTION_URL}}}
    r = requests.patch(
        url,
        headers={"Authorization": f"Bearer {creds.token}", "Content-Type": "application/json"},
        json=body,
        timeout=30,
    )
    print(f"Proje: {project}")
    print(f"İstenen callbackUri: {ACTION_URL}")
    print(f"HTTP {r.status_code}")
    print(r.text[:1500])
    if r.status_code == 200:
        got = r.json().get("notification", {}).get("sendEmail", {}).get("callbackUri")
        print(f"\n✓ BAŞARILI — callbackUri = {got}")
    else:
        print("\n✗ BAŞARISIZ. 403 ise SA'ya 'Firebase Authentication Admin' rolü gerekir.")
        sys.exit(1)


if __name__ == "__main__":
    main()
