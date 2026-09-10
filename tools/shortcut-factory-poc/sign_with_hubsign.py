#!/usr/bin/env python3
"""PoC-only fallback signer using RoutineHub HubSign.

This sends the shortcut plist to RoutineHub's community signing service and
expects an Apple signed AEA1 shortcut back. Do not embed secrets or personal
values in shortcuts sent through this path.
"""

from __future__ import annotations

import argparse
import json
import plistlib
import sys
import urllib.error
import urllib.request
from pathlib import Path

HUBSIGN_URL = "https://hubsign.routinehub.services/sign"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--name", default="YOS PoC - Safari")
    args = parser.parse_args()

    try:
        workflow = plistlib.loads(args.input.read_bytes())
        xml = plistlib.dumps(workflow, fmt=plistlib.FMT_XML, sort_keys=False).decode("utf-8")
        payload = json.dumps(
            {"shortcutName": args.name, "shortcut": xml},
            ensure_ascii=False,
        ).encode("utf-8")

        request = urllib.request.Request(
            HUBSIGN_URL,
            data=payload,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "User-Agent": "ProjectY-YOS-Shortcut-Factory-PoC/1.0",
            },
        )

        with urllib.request.urlopen(request, timeout=30) as response:
            content_type = response.headers.get("Content-Type", "")
            signed = response.read()
            if response.status != 200:
                raise RuntimeError(f"HubSign HTTP {response.status}")
            if not signed.startswith(b"AEA1"):
                raise RuntimeError(
                    f"HubSign response is not AEA1 signed data; content-type={content_type!r}, bytes={len(signed)}"
                )

        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_bytes(signed)
        print(f"OK: HubSign returned AEA1 signed shortcut ({len(signed)} bytes)")
        return 0
    except urllib.error.HTTPError as exc:
        body = exc.read(512).decode("utf-8", errors="replace")
        print(f"ERROR: HubSign HTTP {exc.code}: {body}", file=sys.stderr)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
