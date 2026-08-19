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
