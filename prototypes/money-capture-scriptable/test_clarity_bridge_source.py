from pathlib import Path

SRC = (Path(__file__).parent / "YOS Money Clarity Bridge.js").read_text(encoding="utf-8")

required = [
    "importModule('YOS Money Capture')",
    "source: 'clarity'",
    "missing_required_info",
    "x-success",
    "status",
    "verified",
    "result",
    "error_code",
    "transactions.json",
    "transactions.csv",
    "_backups",
]

for marker in required:
    assert marker in SRC, f"missing bridge marker: {marker}"

for forbidden in [
    "api.openai.com",
    "project-y-yos-ai.vercel.app",
    "Apps Script",
    "192.168.",
    "sk-",
]:
    assert forbidden not in SRC, f"forbidden dependency/secret marker: {forbidden}"

assert "Alert()" not in SRC, "Clarity bridge must not introduce a second interactive entry UI"
assert "promptInput" not in SRC, "Clarity bridge must fail closed rather than prompt outside Clarity"

print("PASS: Clarity Money bridge source contract")
