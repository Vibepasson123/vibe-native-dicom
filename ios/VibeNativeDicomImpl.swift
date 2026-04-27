import Foundation

@objc public final class VibeNativeDicomImpl: NSObject {
  @objc public static func multiply(_ a: Double, b: Double) -> NSNumber {
    return NSNumber(value: a * b)
  }

  @objc public static func getGdcmVersion() -> NSString {
    return GdcmBridge.version() as NSString
  }
}
