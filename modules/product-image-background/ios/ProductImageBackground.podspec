Pod::Spec.new do |s|
  s.name           = 'ProductImageBackground'
  s.version        = '1.0.0'
  s.summary        = 'Local Apple Vision background removal for Product photos'
  s.description    = 'Keeps optional Product image processing on-device.'
  s.author         = 'Souris'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CoreImage', 'UIKit', 'Vision'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
