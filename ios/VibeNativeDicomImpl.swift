import Foundation

@objc public final class VibeNativeDicomImpl: NSObject {
  @objc public static func multiply(_ a: Double, b: Double) -> NSNumber {
    return NSNumber(value: a * b)
  }

  @objc public static func getGdcmVersion() -> NSString {
    return GdcmBridge.version() as NSString
  }

  @objc public static func writeSyntheticDicom(
    _ transferSyntaxUID: NSString,
    numberOfFrames: NSNumber
  ) throws -> NSString {
    let dir = NSTemporaryDirectory()
    let tag =
      (transferSyntaxUID as String).isEmpty
        ? "default"
        : (transferSyntaxUID as String)
    let frames = max(1, numberOfFrames.intValue)
    let fileName =
      "vnd-synthetic-\(tag)-\(frames)f-\(Int(Date().timeIntervalSince1970 * 1000)).dcm"
    let path = (dir as NSString).appendingPathComponent(fileName)
    // Obj-C `+(BOOL)…error:` is imported by Swift as a throwing function
    // returning Void; the NSError is rethrown automatically.
    try GdcmBridge.writeSyntheticDicom(
      atPath: path,
      transferSyntaxUID: transferSyntaxUID as String,
      numberOfFrames: frames
    )
    return path as NSString
  }

  @objc public static func isSupportedTransferSyntax(
    _ transferSyntaxUID: NSString
  ) -> NSNumber {
    return NSNumber(
      value: GdcmBridge.isSupportedTransferSyntax(transferSyntaxUID as String)
    )
  }

  @objc public static func readDicom(_ path: NSString) throws -> NSDictionary {
    // Obj-C `+(nullable NSDictionary*)…error:` is imported as a throwing
    // function returning a non-optional NSDictionary.
    let dict = try GdcmBridge.readDicom(atPath: path as String)
    return dict as NSDictionary
  }

  @objc public static func extractPixelDataToFile(
    _ dicomPath: NSString,
    outPath: NSString
  ) throws -> NSDictionary {
    let dict = try GdcmBridge.extractPixelData(
      atPath: dicomPath as String,
      toPath: outPath as String
    )
    return dict as NSDictionary
  }

  @objc public static func readBinaryFile(
    _ path: NSString,
    maxBytes: NSNumber
  ) throws -> NSString {
    let s = try GdcmBridge.readBinaryFile(
      atPath: path as String,
      maxBytes: maxBytes.doubleValue
    )
    return s as NSString
  }

  @objc public static func buildVolumeFromDicoms(
    _ dicomPathsJson: NSString,
    resampleNonUniformZ: NSNumber
  ) throws -> NSDictionary {
    let dict = try GdcmBridge.buildVolume(
      fromDicomPathsJson: dicomPathsJson as String,
      resampleNonUniformZ: resampleNonUniformZ.boolValue
    )
    return dict as NSDictionary
  }

  @objc public static func extractMprSlice(
    _ handle: NSNumber,
    plane: NSNumber,
    index: NSNumber,
    outPath: NSString
  ) throws -> NSDictionary {
    let dict = try GdcmBridge.extractMprSlice(
      fromHandle: handle.doubleValue,
      plane: plane.intValue,
      index: index.intValue,
      toPath: outPath as String
    )
    return dict as NSDictionary
  }

  @objc public static func releaseVolume(_ handle: NSNumber) {
    GdcmBridge.releaseVolume(withHandle: handle.doubleValue)
  }

  @objc public static func extractObliqueSlice(
    _ handle: NSNumber,
    specJson: NSString,
    outPath: NSString
  ) throws -> NSDictionary {
    let dict = try GdcmBridge.extractObliqueSlice(
      fromHandle: handle.doubleValue,
      specJson: specJson as String,
      toPath: outPath as String
    )
    return dict as NSDictionary
  }

  @objc public static func writeSyntheticVolumeSeries(
    _ outDir: NSString,
    numberOfSlices: NSNumber,
    sliceSpacingMm: NSNumber,
    transferSyntaxUID: NSString,
    gappedZ: NSNumber
  ) throws -> NSString {
    let json = try GdcmBridge.writeSyntheticVolumeSeries(
      atDir: outDir as String,
      numberOfSlices: numberOfSlices.intValue,
      sliceSpacingMm: sliceSpacingMm.doubleValue,
      transferSyntaxUID: transferSyntaxUID as String,
      gappedZ: gappedZ.boolValue
    )
    return json as NSString
  }

  @objc public static func exportBasicTextSr(
    _ outPath: NSString,
    linesJson: NSString,
    sourceStudyInstanceUID: NSString,
    sourceSeriesInstanceUID: NSString,
    sourceSopInstanceUID: NSString,
    sourceSopClassUID: NSString
  ) throws -> NSString {
    let written = try GdcmBridge.writeBasicTextSr(
      atPath: outPath as String,
      linesJson: linesJson as String,
      sourceStudyInstanceUID: sourceStudyInstanceUID as String,
      sourceSeriesInstanceUID: sourceSeriesInstanceUID as String,
      sourceSopInstanceUID: sourceSopInstanceUID as String,
      sourceSopClassUID: sourceSopClassUID as String
    )
    return written as NSString
  }
}
