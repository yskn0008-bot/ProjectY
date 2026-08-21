// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "YOSGoogleTVRemote",
    platforms: [.iOS(.v15)],
    products: [.library(name: "YosGoogleTvRemote", targets: ["YOSGoogleTVRemotePlugin"])],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0"),
        .package(url: "https://github.com/odyshewroman/AndroidTVRemoteControl.git", revision: "32393c3d672c285c4acbd1d42d6873e9b9a523e2")
    ],
    targets: [
        .target(
            name: "YOSGoogleTVRemotePlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "AndroidTVRemoteControl", package: "AndroidTVRemoteControl")
            ],
            path: "ios/Sources/YOSGoogleTVRemotePlugin"
        )
    ]
)
