from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Optional

SCHEMA_VERSION = "money-capture-v1"

CATEGORY_RULES = [
    ("食費", 0.92, ["弁当", "ご飯", "ごはん", "ランチ", "夕食", "朝食", "カフェ", "コーヒー", "ラーメン", "牛丼", "マック", "マクド", "飲み物", "飲料", "食料品", "スーパー"]),
    ("日用品", 0.90, ["洗剤", "ティッシュ", "トイレットペーパー", "電池", "石鹸", "せっけん", "シャンプー", "歯磨き", "ダイソー", "100均"]),
    ("交通・車", 0.95, ["ガソリン", "給油", "駐車", "駐車場", "高速", "etc", "洗車", "タイヤ"]),
    ("住居・光熱", 0.95, ["家賃", "電気代", "水道代", "ガス代"]),
    ("通信", 0.90, ["携帯代", "スマホ代", "通信費", "回線"]),
    ("医療", 0.95, ["病院", "歯医者", "薬局", "薬代", "診察"]),
    ("衣服", 0.90, ["シャツ", "服", "靴", "パンツ", "ジャケット"]),
    ("娯楽", 0.88, ["映画", "ゲーム", "カラオケ", "漫画", "本"]),
]

MERCHANT_HINTS = [
    "セブン", "ローソン", "ファミマ", "ファミリーマート", "コンビニ",
    "ダイソー", "スーパー", "イオン", "サンエー", "ユニオン", "ドラッグストア",
    "マック", "マクド", "スタバ", "Amazon", "アマゾン",
]

INCOME_HINTS = ["給料", "給与", "入金", "収入", "売上", "返金", "振込"]

_AMOUNT_PATTERNS = [
    re.compile(r"(?P<amount>\d{1,3}(?:,\d{3})+|\d+)\s*(?:円|えん|yen)\b", re.IGNORECASE),
    re.compile(r"[¥￥]\s*(?P<amount>\d{1,3}(?:,\d{3})+|\d+)", re.IGNORECASE),
]


def _extract_amount(text: str) -> tuple[Optional[int], Optional[re.Match[str]]]:
    for pattern in _AMOUNT_PATTERNS:
        match = pattern.search(text)
        if match:
            return int(match.group("amount").replace(",", "")), match
    return None, None


def _category(text: str) -> tuple[str, float, list[str]]:
    lowered = text.lower()
    for name, confidence, keywords in CATEGORY_RULES:
        hits = [keyword for keyword in keywords if keyword.lower() in lowered]
        if hits:
            return name, confidence, hits
    return "未分類", 0.0, []


def _merchant(text_before_amount: str) -> Optional[str]:
    cleaned = re.sub(r"[、,。.!！?？\s]+$", "", text_before_amount.strip())
    for hint in MERCHANT_HINTS:
        if hint.lower() in cleaned.lower():
            return hint
    cleaned = re.sub(r"(?:で|に|から)$", "", cleaned).strip()
    if 1 <= len(cleaned) <= 24 and not any(keyword in cleaned for keyword in INCOME_HINTS):
        return cleaned or None
    return None


def parse_money_capture(raw_text: str, captured_at: Optional[str] = None) -> dict:
    raw = (raw_text or "").strip()
    captured_at = captured_at or datetime.now(timezone.utc).isoformat()

    candidate = {
        "schema_version": SCHEMA_VERSION,
        "raw_text": raw,
        "captured_at": captured_at,
        "domain": "money",
        "intent": "create",
        "target": "money_capture_candidate",
        "currency": "JPY",
        "kind": "expense_candidate",
        "status": "candidate",
        "amount": None,
        "merchant_text": None,
        "category_candidate": "未分類",
        "category_confidence": 0.0,
        "category_evidence": [],
        "occurred_date_candidate": captured_at[:10] if len(captured_at) >= 10 else None,
        "occurred_date_source": "capture_time_default",
        "requires_confirmation": False,
        "needs_review": False,
        "review_reason": None,
        "destination": "MY_WAY_Money",
        "applied": False,
    }

    if not raw:
        candidate.update(status="needs_review", needs_review=True, review_reason="empty_input")
        return candidate

    if any(keyword in raw for keyword in INCOME_HINTS):
        candidate.update(status="needs_review", needs_review=True, review_reason="expense_only_v1")
        return candidate

    amount, match = _extract_amount(raw)
    if amount is None:
        candidate.update(status="needs_review", needs_review=True, review_reason="amount_missing")
        return candidate

    category, confidence, evidence = _category(raw)
    before_amount = raw[:match.start()] if match else raw
    merchant = _merchant(before_amount)

    candidate.update(
        amount=amount,
        merchant_text=merchant,
        category_candidate=category,
        category_confidence=confidence,
        category_evidence=evidence,
    )
    return candidate
