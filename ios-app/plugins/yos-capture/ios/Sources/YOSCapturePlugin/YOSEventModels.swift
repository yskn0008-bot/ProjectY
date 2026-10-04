import Foundation

public enum YOSEventPrivacy: String, Codable, Sendable {
    case s0 = "S0"
    case s1 = "S1"
    case s2 = "S2"
}

public indirect enum YOSEventValue: Codable, Equatable, Sendable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: YOSEventValue])
    case array([YOSEventValue])
    case null

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([String: YOSEventValue].self) {
            self = .object(value)
        } else if let value = try? container.decode([YOSEventValue].self) {
            self = .array(value)
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported YOS event value.")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }
}

public struct YOSEvent: Codable, Equatable, Identifiable, Sendable {
    public let eventID: UUID
    public let schemaVersion: Int
    public let occurredAt: Date
    public let recordedAt: Date
    public let source: String
    public let type: String
    public let facts: [String: YOSEventValue]
    public let confidence: Double
    public let privacy: YOSEventPrivacy
    public let evidenceRefs: [String]
    public let sourceEventID: String?

    public var id: UUID { eventID }

    public init(
        eventID: UUID = UUID(),
        schemaVersion: Int = 1,
        occurredAt: Date = Date(),
        recordedAt: Date = Date(),
        source: String,
        type: String,
        facts: [String: YOSEventValue] = [:],
        confidence: Double = 1,
        privacy: YOSEventPrivacy = .s0,
        evidenceRefs: [String] = [],
        sourceEventID: String? = nil
    ) {
        self.eventID = eventID
        self.schemaVersion = schemaVersion
        self.occurredAt = occurredAt
        self.recordedAt = recordedAt
        self.source = source
        self.type = type
        self.facts = facts
        self.confidence = confidence
        self.privacy = privacy
        self.evidenceRefs = evidenceRefs
        self.sourceEventID = sourceEventID
    }
}

public enum YOSEventFacts {
    public static func decode(_ raw: String) throws -> [String: YOSEventValue] {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return [:] }
        guard let data = text.data(using: .utf8) else { throw YOSEventError.invalidFacts }
        do {
            return try JSONDecoder().decode([String: YOSEventValue].self, from: data)
        } catch {
            throw YOSEventError.invalidFacts
        }
    }
}

enum YOSEventError: LocalizedError {
    case emptySource
    case emptyType
    case sourceTooLong
    case typeTooLong
    case invalidConfidence
    case invalidFacts
    case duplicateEvent
    case eventNotFound
    case targetContainerUnavailable

    var errorDescription: String? {
        switch self {
        case .emptySource: return "イベントの取得元が必要です。"
        case .emptyType: return "イベント種別が必要です。"
        case .sourceTooLong: return "イベントの取得元が長すぎます。"
        case .typeTooLong: return "イベント種別が長すぎます。"
        case .invalidConfidence: return "イベントの信頼度を確認してください。"
        case .invalidFacts: return "イベント詳細のJSONを確認してください。"
        case .duplicateEvent: return "同じイベントはすでに保存されています。"
        case .eventNotFound: return "イベントが見つかりません。"
        case .targetContainerUnavailable: return "端末内のイベント保存先を利用できません。"
        }
    }
}
