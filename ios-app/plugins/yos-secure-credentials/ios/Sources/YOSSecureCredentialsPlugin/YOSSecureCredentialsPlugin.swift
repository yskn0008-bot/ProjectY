import Capacitor
import Security

@objc(YOSSecureCredentialsPlugin)
public final class YOSSecureCredentialsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "YOSSecureCredentialsPlugin"
    public let jsName = "YOSSecureCredentials"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise)!,
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise)!
    ]

    private static let allowedKey = "braviaPSK"

    private func baseQuery(for key: String) -> [String: Any]? {
        guard key == Self.allowedKey else { return nil }
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "jp.yos.onlysystem.bravia",
            kSecAttrAccount as String: key
        ]
    }

    @objc public func set(_ call: CAPPluginCall) {
        guard let key = call.getString("key"),
              var query = baseQuery(for: key),
              let value = call.getString("value"), !value.isEmpty,
              let data = value.data(using: .utf8) else {
            call.reject("Invalid credential")
            return
        }

        SecItemDelete(query as CFDictionary)
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        guard SecItemAdd(query as CFDictionary, nil) == errSecSuccess else {
            call.reject("Keychain write failed")
            return
        }
        call.resolve()
    }

    @objc public func get(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), var query = baseQuery(for: key) else {
            call.reject("Invalid credential")
            return
        }
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data,
              let value = String(data: data, encoding: .utf8) else {
            call.reject("Credential is not stored")
            return
        }
        call.resolve(["value": value])
    }
}
