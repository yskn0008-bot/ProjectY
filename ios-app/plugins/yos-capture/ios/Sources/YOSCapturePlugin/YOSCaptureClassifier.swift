import Foundation

public struct YOSCaptureClassifier: Sendable {
    private static let shoppingWords = ["石鹸", "せっけん", "洗剤", "牛乳", "卵", "トイレットペーパー", "ティッシュ"]
    private static let weekdayIndex: [String: Int] = ["月": 0, "火": 1, "水": 2, "木": 3, "金": 4, "土": 5, "日": 6]
    private static let explicitNextWeekPattern = #"来週\s*([月火水木金土日])曜(?:日)?\s*(\d{1,2})時(?:\s*(\d{1,2})分)?\s*(.+)"#

    public init() {}

    public func classify(_ capture: YOSRawCapture, now: Date = Date(), calendar: Calendar = .current) -> YOSRawCapture {
        if let parsed = parseExplicitDateTime(capture.rawText, now: now, calendar: calendar) {
            var result = capture
            result.status = .classified
            result.classificationCandidate = .init(target: .calendar, label: "予定", confidence: 0.96)
            result.parsedDateTime = parsed.dateTime
            result.target = .calendar
            result.confidence = 0.96
            return result
        }

        if Self.shoppingWords.contains(where: capture.rawText.contains) || capture.rawText.range(of: #"(?:買う|買って|購入)$"#, options: .regularExpression) != nil {
            var result = capture
            result.status = .classified
            result.classificationCandidate = .init(target: .shopping, label: "買い物", confidence: 0.9)
            result.target = .shopping
            result.confidence = 0.9
            return result
        }

        let dateWords = #"(?:今日|明日|来週|月曜|火曜|水曜|木曜|金曜|土曜|日曜|\d{1,2}時)"#
        let looksLikeDate = capture.rawText.range(of: dateWords, options: .regularExpression) != nil
        var result = capture
        result.status = .needsReview
        result.classificationCandidate = .init(
            target: looksLikeDate ? .calendar : .memo,
            label: looksLikeDate ? "予定かもしれません" : "未整理",
            confidence: looksLikeDate ? 0.45 : 0.25
        )
        result.target = looksLikeDate ? .calendar : .memo
        result.confidence = looksLikeDate ? 0.45 : 0.25
        return result
    }

    public func parseExplicitDateTime(
        _ rawText: String,
        now: Date = Date(),
        calendar sourceCalendar: Calendar = .current
    ) -> (title: String, dateTime: YOSParsedDateTime)? {
        guard let regex = try? NSRegularExpression(pattern: Self.explicitNextWeekPattern),
              let match = regex.firstMatch(in: rawText, range: NSRange(rawText.startIndex..., in: rawText)),
              let dayRange = Range(match.range(at: 1), in: rawText),
              let hourRange = Range(match.range(at: 2), in: rawText),
              let titleRange = Range(match.range(at: 4), in: rawText),
              let dayOffset = Self.weekdayIndex[String(rawText[dayRange])],
              let hour = Int(rawText[hourRange]),
              (0...23).contains(hour) else { return nil }

        var minute = 0
        if match.range(at: 3).location != NSNotFound,
           let minuteRange = Range(match.range(at: 3), in: rawText),
           let parsedMinute = Int(rawText[minuteRange]),
           (0...59).contains(parsedMinute) {
            minute = parsedMinute
        }

        let title = rawText[titleRange].trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return nil }
        var calendar = sourceCalendar
        calendar.timeZone = sourceCalendar.timeZone
        let startOfToday = calendar.startOfDay(for: now)
        let weekday = calendar.component(.weekday, from: startOfToday)
        let daysSinceMonday = (weekday + 5) % 7
        guard let currentMonday = calendar.date(byAdding: .day, value: -daysSinceMonday, to: startOfToday),
              let targetDay = calendar.date(byAdding: .day, value: 7 + dayOffset, to: currentMonday),
              let start = calendar.date(bySettingHour: hour, minute: minute, second: 0, of: targetDay) else { return nil }
        return (
            title,
            .init(start: start, timeZone: calendar.timeZone.identifier, allDay: false)
        )
    }
}
