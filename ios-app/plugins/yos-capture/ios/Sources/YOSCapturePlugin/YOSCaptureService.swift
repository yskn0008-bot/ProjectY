import Foundation

public actor YOSCaptureService {
    private let repository: YOSCaptureRepository
    private let classifier: YOSCaptureClassifier
    private let eventLedger: YOSEventLedger?

    public init(
        repository: YOSCaptureRepository,
        classifier: YOSCaptureClassifier = .init(),
        eventLedger: YOSEventLedger? = nil
    ) {
        self.repository = repository
        self.classifier = classifier
        self.eventLedger = eventLedger
    }

    public func capture(rawText input: String, inputMode: YOSCaptureInputMode, now: Date = Date()) async throws -> YOSRawCapture {
        let rawText = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !rawText.isEmpty else { throw YOSCaptureError.emptyInput }
        guard rawText.count <= 10_000 else { throw YOSCaptureError.inputTooLong }

        let raw = YOSRawCapture(rawText: rawText, capturedAt: now, inputMode: inputMode)
        try await repository.append(raw)

        // The event ledger records that an input happened, not a second copy of the secret raw text.
        // A ledger failure must never turn a durable capture into data loss.
        if let eventLedger {
            let event = YOSEvent(
                occurredAt: now,
                source: "yos_capture",
                type: "user_input",
                facts: [
                    "capture_id": .string(raw.captureID.uuidString),
                    "input_mode": .string(inputMode.rawValue)
                ],
                confidence: 1,
                privacy: .s0,
                evidenceRefs: ["capture:\(raw.captureID.uuidString)"],
                sourceEventID: raw.captureID.uuidString
            )
            try? await eventLedger.append(event)
        }

        // Raw is already durable. Classification failure must never turn this capture into a loss.
        let classified = classifier.classify(raw, now: now)
        do {
            try await repository.replace(classified)
            return classified
        } catch {
            return raw
        }
    }

    public func recent(limit: Int = 20) async throws -> [YOSRawCapture] {
        try await repository.recent(limit: limit)
    }
}
