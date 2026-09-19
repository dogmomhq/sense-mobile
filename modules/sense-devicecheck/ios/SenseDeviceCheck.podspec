Pod::Spec.new do |s|
  s.name           = 'SenseDeviceCheck'
  s.version        = '1.0.0'
  s.summary        = 'Apple DeviceCheck token for Sense (durable per-device bits that survive reinstall)'
  s.author         = 'Sense'
  s.homepage       = 'https://dogmom.com'
  s.license        = 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = "**/*.{h,m,swift}"
end
