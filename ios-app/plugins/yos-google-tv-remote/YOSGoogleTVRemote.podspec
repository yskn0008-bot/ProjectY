require 'json'
package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |spec|
  spec.name = 'YOSGoogleTVRemote'
  spec.version = package['version']
  spec.summary = package['description']
  spec.license = package['license']
  spec.homepage = 'https://github.com/yskn0008-bot/ProjectY'
  spec.author = 'YOS'
  spec.source = { git: 'https://github.com/yskn0008-bot/ProjectY.git', tag: spec.version.to_s }
  spec.source_files = 'ios/Sources/**/*.{swift,h,m,c,cc,mm,cpp}'
  spec.ios.deployment_target = '15.0'
  spec.dependency 'Capacitor'
  spec.dependency 'AndroidTVRemoteControl'
end
