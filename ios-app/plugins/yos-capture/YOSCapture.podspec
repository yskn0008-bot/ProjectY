Pod::Spec.new do |s|
  s.name = 'YOSCapture'
  s.version = '0.1.0'
  s.summary = 'Raw-first native capture for YOS.'
  s.license = { :type => 'UNLICENSED' }
  s.author = { 'ProjectY' => 'projecty@invalid.local' }
  s.source = { :path => '.' }
  s.source_files = 'ios/Sources/YOSCapturePlugin/**/*.{swift,h,m,mm,cpp}'
  s.ios.deployment_target = '15.0'
  s.swift_version = '5.9'
  s.dependency 'Capacitor'
end
