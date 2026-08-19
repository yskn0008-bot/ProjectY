import Foundation

public actor YOSCaptureService {
    private let repository: YOSCaptureRepository
    private let classifier: YOSCaptureClassifier

    public init(repository: YOSCaptureRepository, classifier: YOSCaptureClassifier = .init()) {
        self.repository = repository
        self.classifier = classifier
    }

    public func capture(rawText input: String, inputMode: YOSCaptureInputMode, now: Date = Date()) async throws -> YOSRawCapture {
        let rawText = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !rawText.isEmpty else { throw YOSCaptureError.emptyInput }
        guard rawText.count <= 10_000 else { throw YOSCaptureError.inputTooLong }

        let raw = YOSRawCapture(rawText: rawText, capturedAt: now, inputMode: inputMode)
        try await repository.append(raw)

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
