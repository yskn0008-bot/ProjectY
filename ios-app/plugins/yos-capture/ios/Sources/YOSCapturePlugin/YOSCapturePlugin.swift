import Capacitor
import Foundation

@objc(YOSCapturePlugin)
public final class YOSCapturePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "YOSCapturePlugin"
    public let jsName = "YOSCapture"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "capture", returnType: CAPPluginReturnPromise)!,
        CAPPluginMethod(name: "list", returnType: CAPPluginReturnPromise)!,
        CAPPluginMethod(name: "recordEvent", returnType: CAPPluginReturnPromise)!,
        CAPPluginMethod(name: "listEvents", returnType: CAPPluginReturnPromise)!,
        CAPPluginMethod(name: "applyCalendar", returnType: CAPPluginReturnPromise)!,
        CAPPluginMethod(name: "applyReminder", returnType: CAPPluginReturnPromise)!
    ]

    private lazy var repositoryResult = Result { try YOSCaptureRepository() }
    private lazy var eventLedgerResult = Result { try YOSEventLedger() }

    @objc public func capture(_ call: CAPPluginCall) {
        guard let rawText = call.getString("rawText"),
              let modeValue = call.getString("inputMode"),
              let inputMode = YOSCaptureInputMode(rawValue: modeValue) else {
            call.reject("入力内容を確認してください。")
            return
        }
        Task {
            do {
                let repository = try repositoryResult.get()
                let eventLedger = try? eventLedgerResult.get()
                let service = YOSCaptureService(repository: repository, eventLedger: eventLedger)
                let record = try await service.capture(rawText: rawText, inputMode: inputMode)
                call.resolve(["record": try dictionary(record)])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc public func list(_ call: CAPPluginCall) {
        Task {
            do {
                let repository = try repositoryResult.get()
                let records = try await repository.recent(limit: call.getInt("limit") ?? 20)
                call.resolve([
                    "records": try records.map { try dictionary($0) },
                    "storageScope": await repository.storageScope
                ])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc public func recordEvent(_ call: CAPPluginCall) {
        guard let source = call.getString("source"),
              let type = call.getString("type") else {
            call.reject("イベントの取得元と種別が必要です。")
            return
        }

        Task {
            do {
                let facts = try YOSEventFacts.decode(call.getString("factsJSON") ?? "{}")
                let privacy = YOSEventPrivacy(rawValue: call.getString("privacy") ?? "S0") ?? .s0
                let occurredAt = try eventDate(call.getString("occurredAtISO"))
                let ledger = try eventLedgerResult.get()
                let service = YOSEventService(ledger: ledger)
                let event = try await service.record(
                    source: source,
                    type: type,
                    facts: facts,
                    occurredAt: occurredAt,
                    confidence: call.getDouble("confidence") ?? 1,
                    privacy: privacy,
                    evidenceRefs: call.getString("evidenceRef").map { [$0] } ?? [],
                    sourceEventID: call.getString("sourceEventID")
                )
                call.resolve(["event": try dictionary(event)])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc public func listEvents(_ call: CAPPluginCall) {
        Task {
            do {
                let ledger = try eventLedgerResult.get()
                let events = try await ledger.recent(limit: call.getInt("limit") ?? 100)
                call.resolve([
                    "events": try events.map { try dictionary($0) },
                    "storageScope": await ledger.storageScope
                ])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc public func applyCalendar(_ call: CAPPluginCall) {
        apply(call, targetKey: "calendarIdentifier") { applier, captureID, identifier in
            try await applier.applyCalendar(captureID: captureID, calendarIdentifier: identifier)
        }
    }

    @objc public func applyReminder(_ call: CAPPluginCall) {
        apply(call, targetKey: "listIdentifier") { applier, captureID, identifier in
            try await applier.applyReminder(captureID: captureID, listIdentifier: identifier)
        }
    }

    private func apply(
        _ call: CAPPluginCall,
        targetKey: String,
        operation: @escaping (YOSCaptureEventApplier, UUID, String) async throws -> YOSRawCapture
    ) {
        guard let captureIDValue = call.getString("captureID"),
              let captureID = UUID(uuidString: captureIDValue),
              let identifier = call.getString(targetKey),
              !identifier.isEmpty else {
            call.reject("反映先を確認してください。")
            return
        }
        Task {
            do {
                let repository = try repositoryResult.get()
                let record = try await operation(YOSCaptureEventApplier(repository: repository), captureID, identifier)
                call.resolve(["record": try dictionary(record)])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    private func eventDate(_ value: String?) throws -> Date {
        guard let value, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return Date() }
        let standard = ISO8601DateFormatter()
        if let date = standard.date(from: value) { return date }
        standard.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = standard.date(from: value) { return date }
        throw YOSEventError.invalidFacts
    }

    private func dictionary<T: Encodable>(_ value: T) throws -> JSObject {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(value)
        guard let object = try JSONSerialization.jsonObject(with: data) as? JSObject else {
            throw YOSCaptureError.captureNotFound
        }
        return object
    }
}
