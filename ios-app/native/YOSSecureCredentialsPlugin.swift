import Capacitor
import Security

@objc(YOSSecureCredentialsPlugin)
public final class YOSSecureCredentialsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "YOSSecureCredentialsPlugin"
    public let jsName = "YOSSecureCredentials"
    public let pluginMethods = [CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise), CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise)]
    private var base: [String: Any] { [kSecClass as String:kSecClassGenericPassword, kSecAttrService as String:"jp.yos.onlysystem.bravia", kSecAttrAccount as String:"bravia-psk"] }
    @objc func set(_ call: CAPPluginCall) {
        guard let value=call.getString("value"), !value.isEmpty, let data=value.data(using:.utf8) else { call.reject("PSK is required"); return }
        SecItemDelete(base as CFDictionary); var query=base; query[kSecValueData as String]=data; query[kSecAttrAccessible as String]=kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(query as CFDictionary,nil)==errSecSuccess ? call.resolve() : call.reject("Keychain write failed")
    }
    @objc func get(_ call: CAPPluginCall) {
        var query=base; query[kSecReturnData as String]=true; query[kSecMatchLimit as String]=kSecMatchLimitOne; var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary,&item)==errSecSuccess, let data=item as? Data, let value=String(data:data,encoding:.utf8) else { call.reject("PSK is not stored"); return }; call.resolve(["value":value])
    }
}
