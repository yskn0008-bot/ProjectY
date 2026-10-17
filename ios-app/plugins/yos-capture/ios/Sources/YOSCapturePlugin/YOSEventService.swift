import Foundation

public actor YOSEventService {
    private let ledger: YOSEventLedger

    public init(ledger: YOSEventLedger) {
        self.ledger = ledger
    }

    public func record(
        source inputSource: String,
        type inputType: String,
        facts: [String: YOSEventValue] = [:],
        occurredAt: Date = Date(),
        confidence: Double = 1,
        privacy: YOSEventPrivacy = .s0,
        evidenceRefs: [String] = [],
        sourceEventID: String? = nil,
        eventID: UUID = UUID(),
        recordedAt: Date = Date()
    ) async throws -> YOSEvent {
        let source = inputSource.trimmingCharacters(in: .whitespacesAndNewlines)
        let type = inputType.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !source.isEmpty else { throw YOSEventError.emptySource }
        guard !type.isEmpty else { throw YOSEventError.emptyType }
        guard source.count <= 100 else { throw YOSEventError.sourceTooLong }
        guard type.count <= 100 else { throw YOSEventError.typeTooLong }
        guard confidence.isFinite, (0...1).contains(confidence) else { throw YOSEventError.invalidConfidence }

        let normalizedSourceEventID = sourceEventID?.trimmingCharacters(in: .whitespacesAndNewlines)
        let event = YOSEvent(
            eventID: eventID,
            occurredAt: occurredAt,
            recordedAt: recordedAt,
            source: source,
            type: type,
            facts: facts,
            confidence: confidence,
            privacy: privacy,
            evidenceRefs: evidenceRefs.filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty },
            sourceEventID: normalizedSourceEventID?.isEmpty == false ? normalizedSourceEventID : nil
        )
        try await ledger.append(event)
        return event
    }

    public func recent(limit: Int = 100) async throws -> [YOSEvent] {
        try await ledger.recent(limit: limit)
    }
}
