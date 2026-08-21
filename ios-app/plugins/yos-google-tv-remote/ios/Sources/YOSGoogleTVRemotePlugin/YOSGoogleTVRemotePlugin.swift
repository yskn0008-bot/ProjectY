import Capacitor
import Foundation
import Security
import AndroidTVRemoteControl

@objc(YOSGoogleTVRemotePlugin)
public final class YOSGoogleTVRemotePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "YOSGoogleTVRemotePlugin"
    public let jsName = "YOSGoogleTVRemote"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startPairing", returnType: CAPPluginReturnPromise)!,
        CAPPluginMethod(name: "finishPairing", returnType: CAPPluginReturnPromise)!,
        CAPPluginMethod(name: "sendText", returnType: CAPPluginReturnPromise)!,
        CAPPluginMethod(name: "unpair", returnType: CAPPluginReturnPromise)!
    ]

    private let queue = DispatchQueue(label: "jp.yos.onlysystem.google-tv-remote")
    private let identityStore = GoogleTVIdentityStore()
    private var pairingManager: PairingManager?
    private var remoteManager: RemoteManager?
    private var startPairingCall: CAPPluginCall?
    private var finishPairingCall: CAPPluginCall?
    private var sendTextCall: CAPPluginCall?
    private var pendingText: String?
    private var imeCounters: (ime: Int32, field: Int32)?
    private var remoteReady = false
    private var frameDecoder = RemoteFrameDecoder()
    private var operationGeneration = 0

    @objc public func startPairing(_ call: CAPPluginCall) {
        guard let rawHost = call.getString("host"), let host = Self.validHost(rawHost) else {
            call.reject("Invalid TV host")
            return
        }
        queue.async { [weak self] in
            guard let self else { return }
            self.cancelCurrentOperations(reason: "Pairing restarted")
            do {
                let session = try self.makeSessionMaterial()
                let manager = PairingManager(session.tls, session.crypto)
                self.pairingManager = manager
                self.startPairingCall = call
                self.operationGeneration += 1
                let generation = self.operationGeneration
                manager.stateChanged = { [weak self, weak manager] state in
                    guard let self, manager != nil else { return }
                    self.queue.async { self.handlePairingState(state) }
                }
                manager.connect(host, "YOS", "jp.yos.onlysystem", timeout: 15)
                self.queue.asyncAfter(deadline: .now() + 20) { [weak self] in
                    guard let self, self.operationGeneration == generation, self.startPairingCall != nil else { return }
                    self.startPairingCall?.reject("Google TV pairing timed out")
                    self.startPairingCall = nil
                    self.pairingManager?.disconnect()
                    self.pairingManager = nil
                }
            } catch {
                call.reject("Google TV identity setup failed")
            }
        }
    }

    @objc public func finishPairing(_ call: CAPPluginCall) {
        guard let rawCode = call.getString("code") else {
            call.reject("Pairing code is required")
            return
        }
        let code = rawCode.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard code.range(of: "^[0-9A-F]{6}$", options: .regularExpression) != nil else {
            call.reject("Pairing code must be 6 hexadecimal characters")
            return
        }
        queue.async { [weak self] in
            guard let self else { return }
            guard let manager = self.pairingManager else {
                call.reject("Start pairing first")
                return
            }
            self.finishPairingCall?.reject("Pairing replaced by a newer request")
            self.finishPairingCall = call
            manager.sendSecret(code)
        }
    }

    @objc public func sendText(_ call: CAPPluginCall) {
        guard let rawHost = call.getString("host"), let host = Self.validHost(rawHost),
              let text = call.getString("text"), !text.isEmpty else {
            call.reject("TV host and text are required")
            return
        }
        queue.async { [weak self] in
            guard let self else { return }
            self.endRemoteSession(rejecting: "Text request replaced by a newer request")
            do {
                let session = try self.makeSessionMaterial()
                let deviceInfo = CommandNetwork.DeviceInfo("iPhone", "YOS", "1", "YOS", "1")
                let remote = RemoteManager(session.tls, deviceInfo)
                self.remoteManager = remote
                self.sendTextCall = call
                self.pendingText = text
                self.imeCounters = nil
                self.remoteReady = false
                self.frameDecoder = RemoteFrameDecoder()
                self.operationGeneration += 1
                let generation = self.operationGeneration

                remote.receiveData = { [weak self, weak remote] data, error in
                    guard let self, remote != nil else { return }
                    self.queue.async {
                        if let error {
                            self.finishTextWithError("Google TV receive failed: \(error.localizedDescription)")
                            return
                        }
                        guard let data else { return }
                        for counters in self.frameDecoder.append(data) {
                            self.imeCounters = counters
                            self.flushPendingTextIfReady()
                        }
                    }
                }
                remote.stateChanged = { [weak self, weak remote] state in
                    guard let self, remote != nil else { return }
                    self.queue.async { self.handleRemoteState(state) }
                }
                remote.connect(host, timeout: 12)

                self.queue.asyncAfter(deadline: .now() + 12) { [weak self] in
                    guard let self, self.operationGeneration == generation, self.sendTextCall != nil else { return }
                    self.finishTextWithError("TVの入力欄を開いてから、もう一度文字を送ってください。")
                }
            } catch {
                call.reject("Google TV identity setup failed")
            }
        }
    }

    @objc public func unpair(_ call: CAPPluginCall) {
        queue.async { [weak self] in
            guard let self else { return }
            self.cancelCurrentOperations(reason: "Unpaired")
            do {
                try self.identityStore.removeIdentity()
                call.resolve()
            } catch {
                call.reject("Pairing identity could not be removed")
            }
        }
    }

    private func handlePairingState(_ state: PairingManager.PairingState) {
        switch state {
        case .waitingCode:
            startPairingCall?.resolve(["state": "waitingCode"])
            startPairingCall = nil
        case .successPaired:
            finishPairingCall?.resolve(["state": "paired"])
            finishPairingCall = nil
            pairingManager = nil
        case .error(let error):
            let message = Self.safeMessage(error.localizedDescription, fallback: "Google TV pairing failed")
            if let call = finishPairingCall {
                call.reject(message)
                finishPairingCall = nil
            } else {
                startPairingCall?.reject(message)
                startPairingCall = nil
            }
            pairingManager?.disconnect()
            pairingManager = nil
        default:
            break
        }
    }

    private func handleRemoteState(_ state: RemoteManager.RemoteState) {
        switch state {
        case .paired(runningApp: _):
            remoteReady = true
            flushPendingTextIfReady()
        case .error(let error):
            finishTextWithError(Self.safeMessage(error.localizedDescription, fallback: "Google TV connection failed"))
        default:
            break
        }
    }

    private func flushPendingTextIfReady() {
        guard remoteReady, let remoteManager, let text = pendingText, let counters = imeCounters,
              counters.ime >= 0, counters.field >= 0 else { return }
        remoteManager.send(RemoteImeBatchEditRequest(imeCounter: counters.ime, fieldCounter: counters.field, text: text))
        pendingText = nil
        let generation = operationGeneration
        queue.asyncAfter(deadline: .now() + 0.45) { [weak self] in
            guard let self, self.operationGeneration == generation, let call = self.sendTextCall else { return }
            call.resolve(["sent": true])
            self.sendTextCall = nil
            self.remoteManager?.disconnect()
            self.remoteManager = nil
            self.remoteReady = false
            self.imeCounters = nil
        }
    }

    private func finishTextWithError(_ message: String) {
        guard sendTextCall != nil || remoteManager != nil else { return }
        sendTextCall?.reject(message)
        sendTextCall = nil
        pendingText = nil
        remoteManager?.disconnect()
        remoteManager = nil
        remoteReady = false
        imeCounters = nil
        operationGeneration += 1
    }

    private func endRemoteSession(rejecting message: String) {
        if sendTextCall != nil { finishTextWithError(message) }
        remoteManager?.disconnect()
        remoteManager = nil
        remoteReady = false
        imeCounters = nil
    }

    private func cancelCurrentOperations(reason: String) {
        startPairingCall?.reject(reason)
        finishPairingCall?.reject(reason)
        startPairingCall = nil
        finishPairingCall = nil
        pairingManager?.disconnect()
        pairingManager = nil
        endRemoteSession(rejecting: reason)
        operationGeneration += 1
    }

    private func makeSessionMaterial() throws -> (tls: TLSManager, crypto: CryptoManager) {
        let identity = try identityStore.identity()
        var certificate: SecCertificate?
        guard SecIdentityCopyCertificate(identity, &certificate) == errSecSuccess,
              let certificate,
              let clientPublicKey = SecCertificateCopyKey(certificate) else {
            throw GoogleTVIdentityError.identityUnavailable
        }

        var serverPublicKey: SecKey?
        let crypto = CryptoManager()
        crypto.clientPublicCertificate = { .Result(clientPublicKey) }
        crypto.serverPublicCertificate = {
            guard let key = serverPublicKey else { return .Error(.noServerPublicCertificate) }
            return .Result(key)
        }

        let tls = TLSManager {
            let item: [String: Any] = [kSecImportItemIdentity as String: identity]
            return .Result([item] as CFArray)
        }
        tls.secTrustClosure = { trust in
            guard let serverCertificate = SecTrustGetCertificateAtIndex(trust, 0),
                  let key = SecCertificateCopyKey(serverCertificate) else { return }
            serverPublicKey = key
        }
        return (tls, crypto)
    }

    private static func validHost(_ value: String) -> String? {
        let host = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !host.isEmpty, host.rangeOfCharacter(from: .whitespacesAndNewlines) == nil,
              !host.contains("/"), !host.contains("?"), !host.contains("#"),
              !host.lowercased().hasPrefix("http://"), !host.lowercased().hasPrefix("https://") else { return nil }
        return host
    }

    private static func safeMessage(_ value: String, fallback: String) -> String {
        let lower = value.lowercased()
        if lower.contains("code:") || lower.contains("secret") || lower.contains("certificate") {
            return fallback
        }
        return value.isEmpty ? fallback : value
    }
}

private enum GoogleTVIdentityError: Error {
    case keyGeneration
    case certificateGeneration
    case keychain(OSStatus)
    case identityUnavailable
}

private final class GoogleTVIdentityStore {
    private let keyTag = Data("jp.yos.onlysystem.google-tv.client-key".utf8)
    private let certificateLabel = "jp.yos.onlysystem.google-tv.client-identity"
    private let lock = NSLock()

    func identity() throws -> SecIdentity {
        lock.lock()
        defer { lock.unlock() }
        if let existing = try loadIdentity() { return existing }
        try createIdentity()
        guard let created = try loadIdentity() else { throw GoogleTVIdentityError.identityUnavailable }
        return created
    }

    func removeIdentity() throws {
        lock.lock()
        defer { lock.unlock() }
        try removeIdentityUnlocked()
    }

    private func removeIdentityUnlocked() throws {
        let identityStatus = SecItemDelete([
            kSecClass as String: kSecClassIdentity,
            kSecAttrLabel as String: certificateLabel
        ] as CFDictionary)
        let keyStatus = SecItemDelete([
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: keyTag,
            kSecAttrKeyType as String: kSecAttrKeyTypeRSA,
            kSecAttrKeyClass as String: kSecAttrKeyClassPrivate
        ] as CFDictionary)
        let certStatus = SecItemDelete([
            kSecClass as String: kSecClassCertificate,
            kSecAttrLabel as String: certificateLabel
        ] as CFDictionary)
        for status in [identityStatus, keyStatus, certStatus] where status != errSecSuccess && status != errSecItemNotFound {
            throw GoogleTVIdentityError.keychain(status)
        }
    }

    private func loadIdentity() throws -> SecIdentity? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassIdentity,
            kSecAttrLabel as String: certificateLabel,
            kSecReturnRef as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let item, CFGetTypeID(item) == SecIdentityGetTypeID() else {
            throw GoogleTVIdentityError.keychain(status)
        }
        return (item as! SecIdentity)
    }

    private func loadPrivateKey() throws -> SecKey? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: keyTag,
            kSecAttrKeyType as String: kSecAttrKeyTypeRSA,
            kSecAttrKeyClass as String: kSecAttrKeyClassPrivate,
            kSecReturnRef as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let item, CFGetTypeID(item) == SecKeyGetTypeID() else {
            throw GoogleTVIdentityError.keychain(status)
        }
        return (item as! SecKey)
    }

    private func loadCertificate() throws -> SecCertificate? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassCertificate,
            kSecAttrLabel as String: certificateLabel,
            kSecReturnRef as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let item, CFGetTypeID(item) == SecCertificateGetTypeID() else {
            throw GoogleTVIdentityError.keychain(status)
        }
        return (item as! SecCertificate)
    }

    private func createIdentity() throws {
        if (try loadPrivateKey()) != nil || (try loadCertificate()) != nil {
            try removeIdentityUnlocked()
        }
        let attributes: [String: Any] = [
            kSecAttrKeyType as String: kSecAttrKeyTypeRSA,
            kSecAttrKeySizeInBits as String: 2048,
            kSecPrivateKeyAttrs as String: [
                kSecAttrIsPermanent as String: true,
                kSecAttrApplicationTag as String: keyTag,
                kSecAttrLabel as String: certificateLabel,
                kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            ]
        ]
        var keyError: Unmanaged<CFError>?
        guard let privateKey = SecKeyCreateRandomKey(attributes as CFDictionary, &keyError),
              let publicKey = SecKeyCopyPublicKey(privateKey) else {
            throw GoogleTVIdentityError.keyGeneration
        }
        let now = Date()
        let certificateData = try SelfSignedCertificate.make(
            commonName: "YOS Google TV Remote",
            publicKey: publicKey,
            privateKey: privateKey,
            notBefore: now.addingTimeInterval(-86_400),
            notAfter: now.addingTimeInterval(10 * 365 * 86_400)
        )
        guard let certificate = SecCertificateCreateWithData(nil, certificateData as CFData) else {
            throw GoogleTVIdentityError.certificateGeneration
        }
        let add: [String: Any] = [
            kSecClass as String: kSecClassCertificate,
            kSecAttrLabel as String: certificateLabel,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
            kSecValueRef as String: certificate
        ]
        let status = SecItemAdd(add as CFDictionary, nil)
        guard status == errSecSuccess else { throw GoogleTVIdentityError.keychain(status) }
    }
}

private enum SelfSignedCertificate {
    static func make(commonName: String, publicKey: SecKey, privateKey: SecKey, notBefore: Date, notAfter: Date) throws -> Data {
        var exportError: Unmanaged<CFError>?
        guard let publicBytes = SecKeyCopyExternalRepresentation(publicKey, &exportError) as Data? else {
            throw GoogleTVIdentityError.certificateGeneration
        }
        let signatureAlgorithm = DER.sequence([
            DER.oid([1, 2, 840, 113549, 1, 1, 11]),
            DER.nullValue()
        ])
        let rsaAlgorithm = DER.sequence([
            DER.oid([1, 2, 840, 113549, 1, 1, 1]),
            DER.nullValue()
        ])
        let name = DER.sequence([
            DER.set([
                DER.sequence([
                    DER.oid([2, 5, 4, 3]),
                    DER.utf8String(commonName)
                ])
            ])
        ])
        var serial = UInt64.random(in: 1...UInt64.max).bigEndian
        let serialData = Data(bytes: &serial, count: MemoryLayout<UInt64>.size)
        let subjectPublicKeyInfo = DER.sequence([
            rsaAlgorithm,
            DER.bitString(publicBytes)
        ])
        let tbs = DER.sequence([
            DER.explicit0(DER.integer(Data([2]))),
            DER.integer(serialData),
            signatureAlgorithm,
            name,
            DER.sequence([DER.utcTime(notBefore), DER.utcTime(notAfter)]),
            name,
            subjectPublicKeyInfo
        ])
        guard SecKeyIsAlgorithmSupported(privateKey, .sign, .rsaSignatureMessagePKCS1v15SHA256) else {
            throw GoogleTVIdentityError.certificateGeneration
        }
        var signError: Unmanaged<CFError>?
        guard let signature = SecKeyCreateSignature(privateKey, .rsaSignatureMessagePKCS1v15SHA256, tbs as CFData, &signError) as Data? else {
            throw GoogleTVIdentityError.certificateGeneration
        }
        return DER.sequence([tbs, signatureAlgorithm, DER.bitString(signature)])
    }
}

private enum DER {
    static func sequence(_ items: [Data]) -> Data { tagged(0x30, joined(items)) }
    static func set(_ items: [Data]) -> Data { tagged(0x31, joined(items)) }
    static func explicit0(_ value: Data) -> Data { tagged(0xA0, value) }
    static func nullValue() -> Data { Data([0x05, 0x00]) }
    static func utf8String(_ value: String) -> Data { tagged(0x0C, Data(value.utf8)) }
    static func bitString(_ value: Data) -> Data { tagged(0x03, Data([0x00]) + value) }

    static func integer(_ source: Data) -> Data {
        var bytes = [UInt8](source)
        while bytes.count > 1 && bytes[0] == 0 && (bytes[1] & 0x80) == 0 { bytes.removeFirst() }
        if bytes.isEmpty { bytes = [0] }
        if (bytes[0] & 0x80) != 0 { bytes.insert(0, at: 0) }
        return tagged(0x02, Data(bytes))
    }

    static func oid(_ arcs: [UInt64]) -> Data {
        precondition(arcs.count >= 2 && arcs[0] <= 2)
        var bytes = base128(arcs[0] * 40 + arcs[1])
        for arc in arcs.dropFirst(2) { bytes += base128(arc) }
        return tagged(0x06, Data(bytes))
    }

    static func utcTime(_ date: Date) -> Data {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyMMddHHmmss'Z'"
        return tagged(0x17, Data(formatter.string(from: date).utf8))
    }

    private static func tagged(_ tag: UInt8, _ value: Data) -> Data {
        var result = Data([tag])
        result.append(length(value.count))
        result.append(value)
        return result
    }

    private static func length(_ value: Int) -> Data {
        if value < 128 { return Data([UInt8(value)]) }
        var bytes: [UInt8] = []
        var remaining = value
        while remaining > 0 {
            bytes.insert(UInt8(remaining & 0xff), at: 0)
            remaining >>= 8
        }
        return Data([0x80 | UInt8(bytes.count)] + bytes)
    }

    private static func base128(_ value: UInt64) -> [UInt8] {
        var remaining = value
        var bytes = [UInt8(remaining & 0x7f)]
        remaining >>= 7
        while remaining > 0 {
            bytes.insert(UInt8(remaining & 0x7f) | 0x80, at: 0)
            remaining >>= 7
        }
        return bytes
    }

    private static func joined(_ items: [Data]) -> Data {
        var result = Data()
        for item in items { result.append(item) }
        return result
    }
}

private struct RemoteImeBatchEditRequest: RequestDataProtocol {
    let imeCounter: Int32
    let fieldCounter: Int32
    let text: String

    var data: Data {
        let cursor = UInt64(text.utf16.count)
        let textObject = Proto.concat([
            Proto.varintField(1, cursor),
            Proto.varintField(2, cursor),
            Proto.bytesField(3, Data(text.utf8))
        ])
        let editInfo = Proto.concat([
            Proto.varintField(1, 1),
            Proto.bytesField(2, textObject)
        ])
        let batch = Proto.concat([
            Proto.varintField(1, UInt64(imeCounter)),
            Proto.varintField(2, UInt64(fieldCounter)),
            Proto.bytesField(3, editInfo)
        ])
        return Proto.bytesField(21, batch)
    }
}

private enum Proto {
    static func varint(_ value: UInt64) -> Data {
        var value = value
        var bytes: [UInt8] = []
        repeat {
            var byte = UInt8(value & 0x7f)
            value >>= 7
            if value != 0 { byte |= 0x80 }
            bytes.append(byte)
        } while value != 0
        return Data(bytes)
    }

    static func varintField(_ field: UInt64, _ value: UInt64) -> Data {
        var result = varint((field << 3) | 0)
        result.append(varint(value))
        return result
    }

    static func bytesField(_ field: UInt64, _ value: Data) -> Data {
        var result = varint((field << 3) | 2)
        result.append(varint(UInt64(value.count)))
        result.append(value)
        return result
    }

    static func concat(_ values: [Data]) -> Data {
        var result = Data()
        for value in values { result.append(value) }
        return result
    }
}

private struct RemoteFrameDecoder {
    private var buffer: [UInt8] = []

    mutating func append(_ data: Data) -> [(ime: Int32, field: Int32)] {
        buffer.append(contentsOf: data)
        var results: [(Int32, Int32)] = []
        while let prefix = Self.readVarint(buffer, from: 0) {
            let length = Int(prefix.value)
            guard length >= 0, buffer.count >= prefix.next + length else { break }
            let payload = Array(buffer[prefix.next..<(prefix.next + length)])
            buffer.removeFirst(prefix.next + length)
            if let counters = Self.imeCounters(in: payload) { results.append(counters) }
        }
        if buffer.count > 65_536 { buffer.removeAll(keepingCapacity: true) }
        return results
    }

    private static func imeCounters(in message: [UInt8]) -> (Int32, Int32)? {
        var index = 0
        while index < message.count, let key = readVarint(message, from: index) {
            index = key.next
            let field = Int(key.value >> 3)
            let wire = Int(key.value & 7)
            if field == 21 && wire == 2,
               let length = readVarint(message, from: index) {
                index = length.next
                let count = Int(length.value)
                guard count >= 0, index + count <= message.count else { return nil }
                return batchCounters(Array(message[index..<(index + count)]))
            }
            guard let next = skip(message, from: index, wire: wire) else { return nil }
            index = next
        }
        return nil
    }

    private static func batchCounters(_ message: [UInt8]) -> (Int32, Int32)? {
        var index = 0
        var ime: Int32?
        var field: Int32?
        while index < message.count, let key = readVarint(message, from: index) {
            index = key.next
            let number = Int(key.value >> 3)
            let wire = Int(key.value & 7)
            if (number == 1 || number == 2) && wire == 0,
               let value = readVarint(message, from: index), value.value <= UInt64(Int32.max) {
                if number == 1 { ime = Int32(value.value) } else { field = Int32(value.value) }
                index = value.next
            } else {
                guard let next = skip(message, from: index, wire: wire) else { return nil }
                index = next
            }
            if let ime, let field { return (ime, field) }
        }
        return nil
    }

    private static func skip(_ bytes: [UInt8], from index: Int, wire: Int) -> Int? {
        switch wire {
        case 0:
            return readVarint(bytes, from: index)?.next
        case 1:
            return index + 8 <= bytes.count ? index + 8 : nil
        case 2:
            guard let length = readVarint(bytes, from: index) else { return nil }
            let end = length.next + Int(length.value)
            return end <= bytes.count ? end : nil
        case 5:
            return index + 4 <= bytes.count ? index + 4 : nil
        default:
            return nil
        }
    }

    private static func readVarint(_ bytes: [UInt8], from start: Int) -> (value: UInt64, next: Int)? {
        guard start < bytes.count else { return nil }
        var value: UInt64 = 0
        var shift: UInt64 = 0
        var index = start
        while index < bytes.count && shift < 64 {
            let byte = bytes[index]
            value |= UInt64(byte & 0x7f) << shift
            index += 1
            if (byte & 0x80) == 0 { return (value, index) }
            shift += 7
        }
        return nil
    }
}
