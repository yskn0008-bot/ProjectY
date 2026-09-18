#!/usr/bin/env python3
"""Sign a secret-free Clarity Shortcut with RoutineHub HubSign.

This reuses the signing boundary proven in ProjectY PR #307. The unsigned
shortcut is converted to XML plist and sent to the community HubSign service.
Never use this path for shortcuts that embed credentials, tokens, personal
runtime data, financial data, or other secrets.
"""

from __future__ import annotations

import argparse
import json
import plistlib
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HUBSIGN_URL = "https://hubsign.routinehub.services/sign"
MAX_ATTEMPTS = 3
TIMEOUT_SECONDS = 60


def sign_once(payload: bytes) -> bytes:
    request = urllib.request.Request(
        HUBSIGN_URL,
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "User-Agent": "cherri/1.0",
            "Origin": "https://routinehub.co",
            "Referer": "https://routinehub.co/",
        },
    )
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        content_type = response.headers.get("Content-Type", "")
        signed = response.read()
        if response.status != 200:
            raise RuntimeError(f"HubSign HTTP {response.status}")
        if not signed.startswith(b"AEA1"):
            preview = signed[:160].decode("utf-8", errors="replace").replace("\n", " ")
            raise RuntimeError(
                "HubSign response is not AEA1 signed data; "
                f"content-type={content_type!r}, bytes={len(signed)}, preview={preview!r}"
            )
        return signed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--name", default="Clarity")
    args = parser.parse_args()

    try:
        workflow = plistlib.loads(args.input.read_bytes())
        xml = plistlib.dumps(workflow, fmt=plistlib.FMT_XML, sort_keys=False).decode("utf-8")
        payload = json.dumps(
            {"shortcutName": args.name, "shortcut": xml},
            ensure_ascii=False,
        ).encode("utf-8")
    except Exception as exc:
        print(f"ERROR: could not prepare HubSign payload: {exc}", file=sys.stderr)
        return 1

    last_error: Exception | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            signed = sign_once(payload)
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_bytes(signed)
            print(f"OK: HubSign returned AEA1 signed shortcut ({len(signed)} bytes) on attempt {attempt}")
            return 0
        except urllib.error.HTTPError as exc:
            body = exc.read(512).decode("utf-8", errors="replace")
            last_error = RuntimeError(f"HubSign HTTP {exc.code}: {body}")
        except Exception as exc:
            last_error = exc

        print(f"WARN: HubSign attempt {attempt}/{MAX_ATTEMPTS} failed: {last_error}", file=sys.stderr)
        if attempt < MAX_ATTEMPTS:
            time.sleep(2)

    print(f"ERROR: HubSign failed after {MAX_ATTEMPTS} attempts: {last_error}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
