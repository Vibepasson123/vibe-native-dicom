import Foundation

@objc public final class VibeNativeDicomImpl: NSObject {
  @objc public static func multiply(_ a: Double, b: Double) -> NSNumber {
    return NSNumber(value: a * b)
  }

  @objc public static func getGdcmVersion() -> NSString {
    return GdcmBridge.version() as NSString
  }

  @objc public static func writeSyntheticDicom() throws -> NSString {
    let dir = NSTemporaryDirectory()
    let fileName = "vnd-synthetic-\(Int(Date().timeIntervalSince1970 * 1000)).dcm"
    let path = (dir as NSString).appendingPathComponent(fileName)
    // Obj-C `+(BOOL)…error:` is imported by Swift as a throwing function
    // returning Void; the NSError is rethrown automatically.
    try GdcmBridge.writeSyntheticDicom(atPath: path)
    return path as NSString
  }

  @objc public static func readDicom(_ path: NSString) throws -> NSDictionary {
    // Obj-C `+(nullable NSDictionary*)…error:` is imported as a throwing
    // function returning a non-optional NSDictionary.
    let dict = try GdcmBridge.readDicom(atPath: path as String)
    return dict as NSDictionary
  }
}
