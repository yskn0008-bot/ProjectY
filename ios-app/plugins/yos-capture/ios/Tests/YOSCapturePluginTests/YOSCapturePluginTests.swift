import XCTest
@testable import YOSCapturePlugin

final class YOSCapturePluginTests: XCTestCase {
    func testRawRepositoryPersistsAcrossInstances() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let first = try YOSCaptureRepository(baseURL: directory)
        let raw = YOSRawCapture(rawText: "田中さんの件", inputMode: .voice)
        try await first.append(raw)

        let second = try YOSCaptureRepository(baseURL: directory)
        let restored = try await second.record(captureID: raw.captureID)
        XCTAssertEqual(restored.rawText, raw.rawText)
        XCTAssertEqual(restored.status, .captured)
    }

    func testAppGroupActivationMigratesLegacyRawWithoutDeletingSource() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let legacyDirectory = root.appendingPathComponent("legacy")
        let groupDirectory = root.appendingPathComponent("group")
        defer { try? FileManager.default.removeItem(at: root) }

        let legacy = try YOSCaptureRepository(baseURL: legacyDirectory)
        let raw = YOSRawCapture(rawText: "消さない原文", inputMode: .text)
        try await legacy.append(raw)

        let migrated = try YOSCaptureRepository(
            baseURL: groupDirectory,
            migrationSourceURL: legacyDirectory
        )
        XCTAssertEqual(try await migrated.record(captureID: raw.captureID).rawText, raw.rawText)

        let reopened = try YOSCaptureRepository(
            baseURL: groupDirectory,
            migrationSourceURL: legacyDirectory
        )
        XCTAssertEqual(try await reopened.recent().count, 1)
        XCTAssertEqual(try await legacy.record(captureID: raw.captureID).rawText, raw.rawText)
    }

    func testEventLedgerPersistsTypedFactsAsAppendOnlyJSONL() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }

        let first = try YOSEventLedger(baseURL: directory)
        let event = YOSEvent(
            occurredAt: Date(timeIntervalSince1970: 1_700_000_000),
            source: "test",
            type: "sample",
            facts: [
                "steps": .number(3210),
                "active": .bool(true)
            ],
            privacy: .s0,
            sourceEventID: "source-1"
        )
        try await first.append(event)

        let second = try YOSEventLedger(baseURL: directory)
        let restored = try await second.record(eventID: event.eventID)
        XCTAssertEqual(restored, event)
        XCTAssertEqual(try await second.recent(limit: 10).count, 1)
    }

    func testEventLedgerRejectsDuplicateSourceEventID() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }

        let ledger = try YOSEventLedger(baseURL: directory)
        try await ledger.append(YOSEvent(source: "arc", type: "visit", sourceEventID: "arc-123"))
        do {
            try await ledger.append(YOSEvent(source: "arc", type: "visit", sourceEventID: "arc-123"))
            XCTFail("duplicate event should not be appended")
        } catch {
            XCTAssertFalse(error.localizedDescription.isEmpty)
        }
        XCTAssertEqual(try await ledger.recent(limit: 10).count, 1)
    }

    func testCaptureAddsEvidenceEventWithoutDuplicatingSecretRawText() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }

        let repository = try YOSCaptureRepository(baseURL: root.appendingPathComponent("capture"))
        let eventLedger = try YOSEventLedger(baseURL: root.appendingPathComponent("events"))
        let service = YOSCaptureService(repository: repository, eventLedger: eventLedger)
        let capture = try await service.capture(rawText: "最高機密の原文", inputMode: .text)

        let events = try await eventLedger.recent(limit: 10)
        XCTAssertEqual(events.count, 1)
        XCTAssertEqual(events[0].source, "yos_capture")
        XCTAssertEqual(events[0].type, "user_input")
        XCTAssertEqual(events[0].facts["capture_id"], .string(capture.captureID.uuidString))
        XCTAssertEqual(events[0].facts["input_mode"], .string("text"))
        XCTAssertNil(events[0].facts["raw_text"])
        XCTAssertEqual(events[0].privacy, .s0)
    }

    func testEventFactsDecodeNestedJSON() throws {
        let facts = try YOSEventFacts.decode(#"{"count":3,"ok":true,"nested":{"kind":"test"}}"#)
        XCTAssertEqual(facts["count"], .number(3))
        XCTAssertEqual(facts["ok"], .bool(true))
        XCTAssertEqual(facts["nested"], .object(["kind": .string("test")]))
    }

    func testClassifierKeepsRawSeparate() {
        let raw = YOSRawCapture(rawText: "手洗い石鹸", inputMode: .voice)
        let result = YOSCaptureClassifier().classify(raw)
        XCTAssertEqual(result.rawText, "手洗い石鹸")
        XCTAssertEqual(result.target, .shopping)
        XCTAssertEqual(result.status, .classified)
    }

    func testAmbiguousDateNeedsReview() {
        let raw = YOSRawCapture(rawText: "来週 歯医者", inputMode: .text)
        let result = YOSCaptureClassifier().classify(raw)
        XCTAssertEqual(result.status, .needsReview)
        XCTAssertNil(result.parsedDateTime)
        XCTAssertNil(result.appliedRecordID)
    }
}
