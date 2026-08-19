import AppIntents
import Foundation

@available(iOS 16.0, *)
public struct SaveYOSCaptureIntent: AppIntent {
    public static let title: LocalizedStringResource = "YOSに残す"
    public static let description = IntentDescription("話した内容を分類より先に端末へ保存します。")

    @Parameter(title: "残す内容")
    public var rawText: String

    public init() {}

    public init(rawText: String) {
        self.rawText = rawText
    }

    public func perform() async throws -> some IntentResult & ProvidesDialog {
        let repository = try YOSCaptureRepository()
        let service = YOSCaptureService(repository: repository)
        _ = try await service.capture(rawText: rawText, inputMode: .voice)
        return .result(dialog: "保存しました")
    }
}

@available(iOS 16.0, *)
public struct YOSCaptureShortcuts: AppShortcutsProvider {
    public static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: SaveYOSCaptureIntent(),
            phrases: ["\(.applicationName)に残す"],
            shortTitle: "YOSに残す",
            systemImageName: "tray.and.arrow.down.fill"
        )
    }
}

@available(iOS 16.0, *)
public struct YOSCaptureIntentsPackage: AppIntentsPackage {
    public init() {}
}
