import Foundation

public actor YOSEventLedger {
    public static let appGroupIdentifier = YOSCaptureRepository.appGroupIdentifier

    private let directoryURL: URL
    public let storageScope: String
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    private let calendar: Calendar

    public init(baseURL: URL? = nil, fileManager: FileManager = .default) throws {
        if let baseURL {
            directoryURL = baseURL
            storageScope = "injected"
        } else if let groupURL = fileManager.containerURL(forSecurityApplicationGroupIdentifier: Self.appGroupIdentifier) {
            directoryURL = groupURL.appendingPathComponent("YOSEvents", isDirectory: true)
            storageScope = "app_group"
        } else if let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first {
            directoryURL = appSupport.appendingPathComponent("YOSEvents", isDirectory: true)
            storageScope = "application_support"
        } else {
            throw YOSEventError.targetContainerUnavailable
        }

        encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        var partitionCalendar = Calendar(identifier: .gregorian)
        partitionCalendar.timeZone = TimeZone(secondsFromGMT: 0)!
        calendar = partitionCalendar

        try fileManager.createDirectory(at: directoryURL, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var mutableDirectory = directoryURL
        try? mutableDirectory.setResourceValues(values)
    }

    public func append(_ event: YOSEvent) throws {
        let fileURL = fileURL(for: event.occurredAt)
        let coordinator = NSFileCoordinator(filePresenter: nil)
        var coordinationError: NSError?
        var operationError: Error?

        coordinator.coordinate(writingItemAt: directoryURL, options: .forMerging, error: &coordinationError) { _ in
            do {
                let existing = try readEvents(from: fileURL)
                if existing.contains(where: { candidate in
                    if candidate.eventID == event.eventID { return true }
                    guard let sourceEventID = event.sourceEventID, !sourceEventID.isEmpty else { return false }
                    return candidate.source == event.source && candidate.sourceEventID == sourceEventID
                }) {
                    throw YOSEventError.duplicateEvent
                }

                var line = try encoder.encode(event)
                line.append(0x0A)

                if FileManager.default.fileExists(atPath: fileURL.path) {
                    let handle = try FileHandle(forWritingTo: fileURL)
                    defer { try? handle.close() }
                    try handle.seekToEnd()
                    try handle.write(contentsOf: line)
                } else {
                    try line.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
                }
            } catch {
                operationError = error
            }
        }

        if let operationError { throw operationError }
        if let coordinationError { throw coordinationError }
    }

    public func recent(limit: Int = 100) throws -> [YOSEvent] {
        let safeLimit = max(0, min(limit, 500))
        guard safeLimit > 0 else { return [] }

        var events: [YOSEvent] = []
        for fileURL in try eventFiles().sorted(by: { $0.lastPathComponent > $1.lastPathComponent }) {
            events.append(contentsOf: try readEvents(from: fileURL))
            if events.count >= safeLimit * 2 { break }
        }

        return Array(events.sorted(by: {
            if $0.recordedAt == $1.recordedAt { return $0.eventID.uuidString > $1.eventID.uuidString }
            return $0.recordedAt > $1.recordedAt
        }).prefix(safeLimit))
    }

    public func record(eventID: UUID) throws -> YOSEvent {
        for fileURL in try eventFiles().sorted(by: { $0.lastPathComponent > $1.lastPathComponent }) {
            if let event = try readEvents(from: fileURL).first(where: { $0.eventID == eventID }) {
                return event
            }
        }
        throw YOSEventError.eventNotFound
    }

    private func fileURL(for date: Date) -> URL {
        let parts = calendar.dateComponents([.year, .month], from: date)
        let year = parts.year ?? 1970
        let month = parts.month ?? 1
        return directoryURL.appendingPathComponent(
            String(format: "events-%04d-%02d.jsonl", year, month),
            isDirectory: false
        )
    }

    private func eventFiles() throws -> [URL] {
        try FileManager.default.contentsOfDirectory(
            at: directoryURL,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        ).filter {
            $0.lastPathComponent.hasPrefix("events-") && $0.pathExtension == "jsonl"
        }
    }

    private func readEvents(from fileURL: URL) throws -> [YOSEvent] {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return [] }
        let data = try Data(contentsOf: fileURL)
        guard !data.isEmpty else { return [] }

        return try data.split(separator: 0x0A).map { line in
            try decoder.decode(YOSEvent.self, from: Data(line))
        }
    }
}
