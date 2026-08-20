import Foundation

public actor YOSCaptureRepository {
    public static let appGroupIdentifier = "group.jp.yos.onlysystem"
    private let directoryURL: URL
    private let fileURL: URL
    public let storageScope: String
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    public init(
        baseURL: URL? = nil,
        migrationSourceURL: URL? = nil,
        fileManager: FileManager = .default
    ) throws {
        let legacyDirectoryURL: URL?
        if let baseURL {
            directoryURL = baseURL
            storageScope = "injected"
            legacyDirectoryURL = migrationSourceURL
        } else if let groupURL = fileManager.containerURL(forSecurityApplicationGroupIdentifier: Self.appGroupIdentifier) {
            directoryURL = groupURL.appendingPathComponent("YOSCapture", isDirectory: true)
            storageScope = "app_group"
            legacyDirectoryURL = migrationSourceURL ?? fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
                .appendingPathComponent("YOSCapture", isDirectory: true)
        } else if let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first {
            // App Intents bundled with the app share this container. Widgets require the App Group entitlement.
            directoryURL = appSupport.appendingPathComponent("YOSCapture", isDirectory: true)
            storageScope = "application_support"
            legacyDirectoryURL = nil
        } else {
            throw YOSCaptureError.targetContainerUnavailable
        }

        fileURL = directoryURL.appendingPathComponent("raw-captures-v1.json", isDirectory: false)
        encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        try fileManager.createDirectory(at: directoryURL, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var mutableDirectory = directoryURL
        try? mutableDirectory.setResourceValues(values)
        if let legacyDirectoryURL {
            try Self.migrateRecords(
                from: legacyDirectoryURL,
                to: directoryURL,
                targetFileURL: fileURL,
                fileManager: fileManager,
                encoder: encoder,
                decoder: decoder
            )
        }
    }

    public func append(_ capture: YOSRawCapture) throws {
        try coordinatedMutation { records in
            guard !records.contains(where: { $0.captureID == capture.captureID }) else {
                throw YOSCaptureError.duplicateCapture
            }
            records.append(capture)
        }
    }

    public func replace(_ capture: YOSRawCapture) throws {
        try coordinatedMutation { records in
            guard let index = records.firstIndex(where: { $0.captureID == capture.captureID }) else {
                throw YOSCaptureError.captureNotFound
            }
            records[index] = capture
        }
    }

    public func record(captureID: UUID) throws -> YOSRawCapture {
        guard let capture = try readRecords().first(where: { $0.captureID == captureID }) else {
            throw YOSCaptureError.captureNotFound
        }
        return capture
    }

    public func recent(limit: Int = 20) throws -> [YOSRawCapture] {
        Array(try readRecords().sorted(by: { $0.capturedAt > $1.capturedAt }).prefix(max(0, min(limit, 200))))
    }

    private func readRecords() throws -> [YOSRawCapture] {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return [] }
        let data = try Data(contentsOf: fileURL)
        return try decoder.decode([YOSRawCapture].self, from: data)
    }

    private func writeRecords(_ records: [YOSRawCapture]) throws {
        let data = try encoder.encode(records)
        try data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    private func coordinatedMutation(_ mutation: (inout [YOSRawCapture]) throws -> Void) throws {
        let coordinator = NSFileCoordinator(filePresenter: nil)
        var coordinationError: NSError?
        var operationError: Error?
        coordinator.coordinate(writingItemAt: directoryURL, options: .forMerging, error: &coordinationError) { _ in
            do {
                var records = try readRecords()
                try mutation(&records)
                try writeRecords(records)
            } catch {
                operationError = error
            }
        }
        if let operationError { throw operationError }
        if let coordinationError { throw coordinationError }
    }

    private static func migrateRecords(
        from sourceDirectoryURL: URL,
        to targetDirectoryURL: URL,
        targetFileURL: URL,
        fileManager: FileManager,
        encoder: JSONEncoder,
        decoder: JSONDecoder
    ) throws {
        let sourceFileURL = sourceDirectoryURL.appendingPathComponent("raw-captures-v1.json", isDirectory: false)
        guard sourceFileURL.standardizedFileURL != targetFileURL.standardizedFileURL,
              fileManager.fileExists(atPath: sourceFileURL.path) else { return }

        let legacyRecords = try decoder.decode([YOSRawCapture].self, from: Data(contentsOf: sourceFileURL))
        guard !legacyRecords.isEmpty else { return }

        let coordinator = NSFileCoordinator(filePresenter: nil)
        var coordinationError: NSError?
        var operationError: Error?
        coordinator.coordinate(writingItemAt: targetDirectoryURL, options: .forMerging, error: &coordinationError) { _ in
            do {
                var targetRecords: [YOSRawCapture] = []
                if fileManager.fileExists(atPath: targetFileURL.path) {
                    targetRecords = try decoder.decode([YOSRawCapture].self, from: Data(contentsOf: targetFileURL))
                }
                var knownIDs = Set(targetRecords.map(\.captureID))
                for record in legacyRecords where knownIDs.insert(record.captureID).inserted {
                    targetRecords.append(record)
                }
                let data = try encoder.encode(targetRecords)
                try data.write(to: targetFileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            } catch {
                operationError = error
            }
        }
        if let operationError { throw operationError }
        if let coordinationError { throw coordinationError }
    }
}
