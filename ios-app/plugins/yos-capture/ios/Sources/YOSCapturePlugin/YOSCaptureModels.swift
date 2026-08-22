import Foundation

public enum YOSCaptureInputMode: String, Codable, Sendable {
    case voice
    case text
}

public enum YOSCaptureStatus: String, Codable, Sendable {
    case captured
    case classified
    case applying
    case applied
    case needsReview = "needs_review"
    case failed
}

public enum YOSCaptureTarget: String, Codable, Sendable {
    case calendar
    case reminders
    case shopping
    case life
    case myway
    case idea
    case memo
}

public struct YOSClassificationCandidate: Codable, Equatable, Sendable {
    public let target: YOSCaptureTarget
    public let label: String
    public let confidence: Double

    public init(target: YOSCaptureTarget, label: String, confidence: Double) {
        self.target = target
        self.label = label
        self.confidence = confidence
    }
}

public struct YOSParsedDateTime: Codable, Equatable, Sendable {
    public let start: Date
    public let end: Date?
    public let timeZone: String
    public let allDay: Bool

    public init(start: Date, end: Date? = nil, timeZone: String, allDay: Bool = false) {
        self.start = start
        self.end = end
        self.timeZone = timeZone
        self.allDay = allDay
    }
}

public struct YOSRawCapture: Codable, Equatable, Identifiable, Sendable {
    public let captureID: UUID
    public let schemaVersion: Int
    public let rawText: String
    public let capturedAt: Date
    public let inputMode: YOSCaptureInputMode
    public var status: YOSCaptureStatus
    public var classificationCandidate: YOSClassificationCandidate?
    public var parsedDateTime: YOSParsedDateTime?
    public var target: YOSCaptureTarget?
    public var confidence: Double?
    public var appliedRecordID: String?
    public var applyAttemptID: UUID?
    public var lastErrorCode: String?

    public var id: UUID { captureID }

    public init(
        captureID: UUID = UUID(),
        schemaVersion: Int = 1,
        rawText: String,
        capturedAt: Date = Date(),
        inputMode: YOSCaptureInputMode,
        status: YOSCaptureStatus = .captured,
        classificationCandidate: YOSClassificationCandidate? = nil,
        parsedDateTime: YOSParsedDateTime? = nil,
        target: YOSCaptureTarget? = nil,
        confidence: Double? = nil,
        appliedRecordID: String? = nil,
        applyAttemptID: UUID? = nil,
        lastErrorCode: String? = nil
    ) {
        self.captureID = captureID
        self.schemaVersion = schemaVersion
        self.rawText = rawText
        self.capturedAt = capturedAt
        self.inputMode = inputMode
        self.status = status
        self.classificationCandidate = classificationCandidate
        self.parsedDateTime = parsedDateTime
        self.target = target
        self.confidence = confidence
        self.appliedRecordID = appliedRecordID
        self.applyAttemptID = applyAttemptID
        self.lastErrorCode = lastErrorCode
    }
}

enum YOSCaptureError: LocalizedError {
    case emptyInput
    case inputTooLong
    case duplicateCapture
    case captureNotFound
    case invalidTarget
    case missingPermissionDescription
    case permissionDenied
    case targetContainerUnavailable

    var errorDescription: String? {
        switch self {
        case .emptyInput: return "入力内容が必要です。"
        case .inputTooLong: return "一度に保存できる長さを超えています。"
        case .duplicateCapture: return "同じ記録はすでに保存されています。"
        case .captureNotFound: return "保存した原文が見つかりません。"
        case .invalidTarget: return "安全に反映できる情報が不足しています。"
        case .missingPermissionDescription: return "Calendar / Remindersの利用目的が設定されていません。"
        case .permissionDenied: return "Calendar / Remindersへのアクセスが許可されていません。"
        case .targetContainerUnavailable: return "端末内の保存先を利用できません。"
        }
    }
}
