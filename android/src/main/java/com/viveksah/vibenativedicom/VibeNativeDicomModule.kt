package com.viveksah.vibenativedicom

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap

class VibeNativeDicomModule(reactContext: ReactApplicationContext) :
  NativeVibeNativeDicomSpec(reactContext) {

  override fun multiply(a: Double, b: Double): Double {
    return a * b
  }

  override fun getGdcmVersion(): String {
    return nativeGetGdcmVersion()
  }

  override fun writeSyntheticDicom(
    transferSyntaxUID: String,
    numberOfFrames: Double
  ): String {
    // The example app cleans this up; we don't auto-delete in case the
    // caller wants to inspect the file. Filename includes the transfer
    // syntax UID + frame count so per-syntax round trips don't overwrite
    // each other.
    val dir = reactApplicationContext.cacheDir
    val tag = if (transferSyntaxUID.isEmpty()) "default" else transferSyntaxUID
    val frames = numberOfFrames.toInt().coerceAtLeast(1)
    val file = java.io.File(
      dir,
      "vnd-synthetic-${tag}-${frames}f-${System.currentTimeMillis()}.dcm"
    )
    return nativeWriteSyntheticDicom(
      file.absolutePath,
      transferSyntaxUID,
      frames
    )
  }

  override fun isSupportedTransferSyntax(transferSyntaxUID: String): Boolean {
    return nativeIsSupportedTransferSyntax(transferSyntaxUID)
  }

  override fun readDicom(path: String): WritableMap {
    @Suppress("UNCHECKED_CAST")
    val raw = nativeReadDicom(path) as java.util.HashMap<String, Any?>
    return Arguments.makeNativeMap(raw)
  }

  override fun extractPixelDataToFile(
    dicomPath: String,
    outPath: String
  ): WritableMap {
    @Suppress("UNCHECKED_CAST")
    val raw =
      nativeExtractPixelDataToFile(dicomPath, outPath)
        as java.util.HashMap<String, Any?>
    return Arguments.makeNativeMap(raw)
  }

  override fun readBinaryFile(path: String, maxBytes: Double): String {
    return nativeReadBinaryFile(path, maxBytes)
  }

  override fun buildVolumeFromDicoms(
    dicomPathsJson: String,
    resampleNonUniformZ: Boolean
  ): WritableMap {
    @Suppress("UNCHECKED_CAST")
    val raw =
      nativeBuildVolumeFromDicoms(dicomPathsJson, resampleNonUniformZ)
        as java.util.HashMap<String, Any?>
    return Arguments.makeNativeMap(raw)
  }

  override fun extractMprSlice(
    handle: Double,
    plane: Double,
    index: Double,
    outPath: String
  ): WritableMap {
    @Suppress("UNCHECKED_CAST")
    val raw =
      nativeExtractMprSlice(
        handle,
        plane.toInt(),
        index.toInt(),
        outPath
      ) as java.util.HashMap<String, Any?>
    return Arguments.makeNativeMap(raw)
  }

  override fun releaseVolume(handle: Double) {
    nativeReleaseVolume(handle)
  }

  override fun writeSyntheticVolumeSeries(
    outDir: String,
    numberOfSlices: Double,
    sliceSpacingMm: Double,
    transferSyntaxUID: String,
    gappedZ: Boolean
  ): String {
    return nativeWriteSyntheticVolumeSeries(
      outDir,
      numberOfSlices.toInt(),
      sliceSpacingMm,
      transferSyntaxUID,
      gappedZ
    )
  }

  override fun exportBasicTextSr(
    outPath: String,
    measurementLinesJson: String,
    sourceStudyInstanceUID: String,
    sourceSeriesInstanceUID: String,
    sourceSopInstanceUID: String,
    sourceSopClassUID: String
  ): String {
    return nativeExportBasicTextSr(
      outPath,
      measurementLinesJson,
      sourceStudyInstanceUID,
      sourceSeriesInstanceUID,
      sourceSopInstanceUID,
      sourceSopClassUID
    )
  }

  // Implemented in libVibeNativeDicom.so (Android NDK build of
  // android/src/main/cpp/VibeNativeDicom-jni.cpp). Loaded by the static
  // initializer below.
  private external fun nativeGetGdcmVersion(): String
  private external fun nativeWriteSyntheticDicom(
    path: String,
    transferSyntaxUID: String,
    numberOfFrames: Int
  ): String
  private external fun nativeIsSupportedTransferSyntax(
    transferSyntaxUID: String
  ): Boolean
  private external fun nativeReadDicom(path: String): Any
  private external fun nativeExtractPixelDataToFile(
    dicomPath: String,
    outPath: String
  ): Any
  private external fun nativeReadBinaryFile(
    path: String,
    maxBytes: Double
  ): String
  private external fun nativeExportBasicTextSr(
    outPath: String,
    measurementLinesJson: String,
    sourceStudyInstanceUID: String,
    sourceSeriesInstanceUID: String,
    sourceSopInstanceUID: String,
    sourceSopClassUID: String
  ): String
  private external fun nativeBuildVolumeFromDicoms(
    dicomPathsJson: String,
    resampleNonUniformZ: Boolean
  ): Any
  private external fun nativeExtractMprSlice(
    handle: Double,
    plane: Int,
    index: Int,
    outPath: String
  ): Any
  private external fun nativeReleaseVolume(handle: Double)
  private external fun nativeWriteSyntheticVolumeSeries(
    outDir: String,
    numberOfSlices: Int,
    sliceSpacingMm: Double,
    transferSyntaxUID: String,
    gappedZ: Boolean
  ): String

  companion object {
    const val NAME: String = NativeVibeNativeDicomSpec.NAME

    init {
      System.loadLibrary("VibeNativeDicom")
    }
  }
}
