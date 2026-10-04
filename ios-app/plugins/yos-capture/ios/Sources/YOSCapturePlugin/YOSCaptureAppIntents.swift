import AppIntents
import Foundation

private func yosParseISO8601(_ value: String) -> Date? {
    let text = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty else { return nil }
    let standard = ISO8601DateFormatter()
    if let date = standard.date(from: text) { return date }
    standard.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return standard.date(from: text)
}

@available(iOS 16.0, *)
public struct SaveYOSCaptureIntent: AppIntent {
    public static let title: LocalizedStringResource = "YOSに残す"
    public static let description = IntentDescription("話した内容を分類より先に端末へ保存します。")
    public static var openAppWhenRun: Bool = false

    @Parameter(title: "残す内容")
    public var rawText: String

    public init() {}

    public init(rawText: String) {
        self.rawText = rawText
    }

    public func perform() async throws -> some IntentResult & ProvidesDialog {
        let repository = try YOSCaptureRepository()
        let eventLedger = try? YOSEventLedger()
        let service = YOSCaptureService(repository: repository, eventLedger: eventLedger)
        _ = try await service.capture(rawText: rawText, inputMode: .voice)
        return .result(dialog: "保存しました")
    }
}

@available(iOS 16.0, *)
public struct RecordYOSEventIntent: AppIntent {
    public static let title: LocalizedStringResource = "YOS Event"
    public static let description = IntentDescription("iPhone上で起きた事実をYOSの端末内Event Ledgerへ保存します。")
    public static var openAppWhenRun: Bool = false

    @Parameter(title: "取得元")
    public var source: String

    @Parameter(title: "イベント種別")
    public var type: String

    @Parameter(title: "詳細JSON")
    public var factsJSON: String

    @Parameter(title: "発生日時 ISO8601")
    public var occurredAtISO: String

    @Parameter(title: "信頼度 0〜1")
    public var confidence: Double

    @Parameter(title: "機密区分 S0/S1/S2")
    public var privacy: String

    @Parameter(title: "取得元イベントID")
    public var sourceEventID: String

    public init() {
        source = "shortcuts"
        type = "automation"
        factsJSON = "{}"
        occurredAtISO = ""
        confidence = 1
        privacy = "S0"
        sourceEventID = ""
    }

    public init(
        source: String,
        type: String,
        factsJSON: String = "{}",
        occurredAtISO: String = "",
        confidence: Double = 1,
        privacy: String = "S0",
        sourceEventID: String = ""
    ) {
        self.source = source
        self.type = type
        self.factsJSON = factsJSON
        self.occurredAtISO = occurredAtISO
        self.confidence = confidence
        self.privacy = privacy
        self.sourceEventID = sourceEventID
    }

    public func perform() async throws -> some IntentResult & ProvidesDialog {
        let ledger = try YOSEventLedger()
        let service = YOSEventService(ledger: ledger)
        let facts = try YOSEventFacts.decode(factsJSON)
        let privacyClass = YOSEventPrivacy(rawValue: privacy.uppercased()) ?? .s0
        _ = try await service.record(
            source: source,
            type: type,
            facts: facts,
            occurredAt: yosParseISO8601(occurredAtISO) ?? Date(),
            confidence: confidence,
            privacy: privacyClass,
            sourceEventID: sourceEventID
        )
        return .result(dialog: "イベントを保存しました")
    }
}

@available(iOS 16.0, *)
public struct YOSCaptureShortcuts: AppShortcutsProvider {
    public static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: SaveYOSCaptureIntent(),
            phrases: ["\(.applicationName)に残す"],
            shortTitle: "YOSに残す",
            systemImageName: "tray.and.arrow.down.fill"
        )
        AppShortcut(
            intent: RecordYOSEventIntent(),
            phrases: ["\(.applicationName)にイベントを残す"],
            shortTitle: "YOS Event",
            systemImageName: "waveform.path.ecg"
        )
    }
}

@available(iOS 16.0, *)
public struct YOSCaptureIntentsPackage: AppIntentsPackage {
    public init() {}
}
