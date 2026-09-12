import unittest
from money_capture import parse_money_capture

NOW = "2026-09-13T01:46:00+09:00"


class MoneyCaptureTests(unittest.TestCase):
    def test_bare_convenience_store_amount(self):
        result = parse_money_capture("コンビニ850円", NOW)
        self.assertEqual(result["amount"], 850)
        self.assertEqual(result["merchant_text"], "コンビニ")
        self.assertEqual(result["category_candidate"], "未分類")
        self.assertFalse(result["needs_review"])
        self.assertFalse(result["applied"])

    def test_food_classification(self):
        result = parse_money_capture("セブンで弁当850円", NOW)
        self.assertEqual(result["amount"], 850)
        self.assertEqual(result["category_candidate"], "食費")
        self.assertGreaterEqual(result["category_confidence"], 0.9)

    def test_car_classification(self):
        result = parse_money_capture("ガソリン3,000円", NOW)
        self.assertEqual(result["amount"], 3000)
        self.assertEqual(result["category_candidate"], "交通・車")

    def test_daily_goods(self):
        result = parse_money_capture("ダイソー 電池 220円", NOW)
        self.assertEqual(result["amount"], 220)
        self.assertEqual(result["category_candidate"], "日用品")

    def test_missing_amount_fails_closed(self):
        result = parse_money_capture("コンビニで買い物", NOW)
        self.assertTrue(result["needs_review"])
        self.assertEqual(result["review_reason"], "amount_missing")

    def test_income_not_misclassified_as_expense(self):
        result = parse_money_capture("給料250000円", NOW)
        self.assertTrue(result["needs_review"])
        self.assertEqual(result["review_reason"], "expense_only_v1")

    def test_capture_date_is_candidate_not_fact(self):
        result = parse_money_capture("コーヒー180円", NOW)
        self.assertEqual(result["occurred_date_candidate"], "2026-09-13")
        self.assertEqual(result["occurred_date_source"], "capture_time_default")


if __name__ == "__main__":
    unittest.main()
