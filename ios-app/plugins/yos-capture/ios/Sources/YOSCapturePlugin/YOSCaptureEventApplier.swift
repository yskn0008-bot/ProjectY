import EventKit
import Foundation

public actor YOSCaptureEventApplier {
    private let repository: YOSCaptureRepository
    private let eventStore: EKEventStore
    private let classifier: YOSCaptureClassifier

    public init(repository: YOSCaptureRepository, eventStore: EKEventStore = .init(), classifier: YOSCaptureClassifier = .init()) {
        self.repository = repository
        self.eventStore = eventStore
        self.classifier = classifier
    }

    public func applyCalendar(captureID: UUID, calendarIdentifier: String) async throws -> YOSRawCapture {
        var capture = try await repository.record(captureID: captureID)
        if capture.status == .applied, let identifier = capture.appliedRecordID,
           eventStore.event(withIdentifier: identifier) != nil { return capture }
        guard capture.target == .calendar,
              let parsed = capture.parsedDateTime,
              let parsedTitle = classifier.parseExplicitDateTime(capture.rawText)?.title,
              let calendar = eventStore.calendar(withIdentifier: calendarIdentifier),
              calendar.allowsContentModifications else { throw YOSCaptureError.invalidTarget }

        capture.applyAttemptID = capture.applyAttemptID ?? UUID()
        capture.status = .applying
        capture.lastErrorCode = nil
        try await repository.replace(capture)

        do {
            try requireUsageDescription(for: .event)
            guard try await requestAccess(to: .event) else { throw YOSCaptureError.permissionDenied }
            let marker = captureMarker(capture.captureID)
            let rangeStart = Calendar.current.date(byAdding: .day, value: -1, to: parsed.start) ?? parsed.start
            let rangeEnd = Calendar.current.date(byAdding: .day, value: 2, to: parsed.start) ?? parsed.start.addingTimeInterval(172_800)
            let predicate = eventStore.predicateForEvents(withStart: rangeStart, end: rangeEnd, calendars: [calendar])
            if let existing = eventStore.events(matching: predicate).first(where: { $0.notes?.contains(marker) == true }) {
                return try await finish(capture, appliedRecordID: existing.eventIdentifier)
            }

            let event = EKEvent(eventStore: eventStore)
            event.title = parsedTitle
            event.startDate = parsed.start
            event.endDate = parsed.end ?? parsed.start.addingTimeInterval(3_600)
            event.isAllDay = parsed.allDay
            event.calendar = calendar
            event.notes = marker
            try eventStore.save(event, span: .thisEvent, commit: true)
            return try await finish(capture, appliedRecordID: event.eventIdentifier)
        } catch {
            capture.status = .needsReview
            capture.lastErrorCode = stableErrorCode(error)
            try? await repository.replace(capture)
            throw error
        }
    }

    public func applyReminder(captureID: UUID, listIdentifier: String) async throws -> YOSRawCapture {
        var capture = try await repository.record(captureID: captureID)
        if capture.status == .applied, let identifier = capture.appliedRecordID,
           eventStore.calendarItem(withIdentifier: identifier) != nil { return capture }
        guard capture.target == .shopping || capture.target == .reminders,
              let list = eventStore.calendar(withIdentifier: listIdentifier),
              list.type != .birthday,
              list.allowsContentModifications else { throw YOSCaptureError.invalidTarget }

        capture.applyAttemptID = capture.applyAttemptID ?? UUID()
        capture.status = .applying
        capture.lastErrorCode = nil
        try await repository.replace(capture)

        do {
            try requireUsageDescription(for: .reminder)
            guard try await requestAccess(to: .reminder) else { throw YOSCaptureError.permissionDenied }
            let marker = captureMarker(capture.captureID)
            if let existing = try await reminders(in: list).first(where: { $0.notes?.contains(marker) == true }) {
                return try await finish(capture, appliedRecordID: existing.calendarItemIdentifier)
            }

            let reminder = EKReminder(eventStore: eventStore)
            reminder.title = capture.rawText
            reminder.calendar = list
            reminder.notes = marker
            try eventStore.save(reminder, commit: true)
            return try await finish(capture, appliedRecordID: reminder.calendarItemIdentifier)
        } catch {
            capture.status = .needsReview
            capture.lastErrorCode = stableErrorCode(error)
            try? await repository.replace(capture)
            throw error
        }
    }

    private func finish(_ source: YOSRawCapture, appliedRecordID: String?) async throws -> YOSRawCapture {
        var capture = source
        capture.status = .applied
        capture.appliedRecordID = appliedRecordID
        capture.lastErrorCode = nil
        try await repository.replace(capture)
        return capture
    }

    private func captureMarker(_ captureID: UUID) -> String {
        "YOS-CAPTURE-ID:\(captureID.uuidString.lowercased())"
    }

    private func reminders(in list: EKCalendar) async throws -> [EKReminder] {
        let predicate = eventStore.predicateForReminders(in: [list])
        return try await withCheckedThrowingContinuation { continuation in
            eventStore.fetchReminders(matching: predicate) { reminders in
                continuation.resume(returning: reminders ?? [])
            }
        }
    }

    private func requireUsageDescription(for entityType: EKEntityType) throws {
        let key: String
        if #available(iOS 17.0, *) {
            key = entityType == .event ? "NSCalendarsFullAccessUsageDescription" : "NSRemindersFullAccessUsageDescription"
        } else {
            key = entityType == .event ? "NSCalendarsUsageDescription" : "NSRemindersUsageDescription"
        }
        guard let value = Bundle.main.object(forInfoDictionaryKey: key) as? String,
              !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw YOSCaptureError.missingPermissionDescription
        }
    }

    private func requestAccess(to entityType: EKEntityType) async throws -> Bool {
        try await withCheckedThrowingContinuation { continuation in
            if #available(iOS 17.0, *) {
                let completion: EKEventStoreRequestAccessCompletionHandler = { granted, error in
                    if let error { continuation.resume(throwing: error) }
                    else { continuation.resume(returning: granted) }
                }
                if entityType == .event {
                    eventStore.requestFullAccessToEvents(completion: completion)
                } else {
                    eventStore.requestFullAccessToReminders(completion: completion)
                }
            } else {
                eventStore.requestAccess(to: entityType) { granted, error in
                    if let error { continuation.resume(throwing: error) }
                    else { continuation.resume(returning: granted) }
                }
            }
        }
    }

    private func stableErrorCode(_ error: Error) -> String {
        if let captureError = error as? YOSCaptureError {
            return String(describing: captureError)
        }
        let value = error as NSError
        return "\(value.domain):\(value.code)"
    }
}
