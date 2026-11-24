#!/usr/bin/env bash
# Reuse existing Factory compiler, validation and signer. No new distribution path.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
HERE="$ROOT/tools/shortcut-factory/discovery"
OUT="${1:?usage: bash build_preflight.sh OUTPUT_DIRECTORY [--sign]}"
MODE="${2:---unsigned-only}"
[[ "$MODE" == "--unsigned-only" || "$MODE" == "--sign" ]] || exit 2
mkdir -p "$OUT"; OUT="$(cd "$OUT" && pwd)"
[[ ! -e "$OUT/YOS-DISCOVERY-PREFLIGHT-unsigned.shortcut" && ! -e "$OUT/YOS-DISCOVERY-PREFLIGHT-signed.shortcut" ]] || { echo "Existing output protected"; exit 1; }
cd "$ROOT"
command -v cherri >/dev/null
cherri --version | grep -E '(^|[^0-9])2\.3\.0([^0-9]|$)'
for f in discovery-core.test.mjs discovery-adapters.test.mjs preflight.test.mjs; do node "$HERE/$f"; done
python3 tools/shortcut-factory/validate_secret_free.py "$HERE/YOS DISCOVERY 実行検証 TEST.cherri" "$HERE/discovery-core.mjs" "$HERE/discovery-adapters.mjs" "$HERE/preflight-public.js" "$HERE/preflight-receipt.js"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp "$HERE/YOS DISCOVERY 実行検証 TEST.cherri" "$TMP/"
(cd "$TMP"; cherri 'YOS DISCOVERY 実行検証 TEST.cherri' --skip-sign --debug)
UNSIGNED="$TMP/YOS DISCOVERY 実行検証 TEST_unsigned.shortcut"
test -f "$UNSIGNED"
python3 "$HERE/patch_preflight.py" "$UNSIGNED"
python3 tools/shortcut-factory/validate_secret_free.py "$UNSIGNED"
cp -n "$UNSIGNED" "$OUT/YOS-DISCOVERY-PREFLIGHT-unsigned.shortcut"
if [[ "$MODE" == "--sign" ]]; then
  python3 tools/clarity-factory/sign_with_hubsign.py --input "$UNSIGNED" --output "$TMP/signed.shortcut" --name 'YOS DISCOVERY 実行検証 TEST'
  python3 -c 'import pathlib,sys; p=pathlib.Path(sys.argv[1]); b=p.read_bytes(); assert b.startswith(b"AEA1") and len(b)>1024' "$TMP/signed.shortcut"
  cp -n "$TMP/signed.shortcut" "$OUT/YOS-DISCOVERY-PREFLIGHT-signed.shortcut"
fi
