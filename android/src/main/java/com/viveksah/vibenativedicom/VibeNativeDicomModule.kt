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

  override fun writeSyntheticDicom(transferSyntaxUID: String): String {
    // The example app cleans this up; we don't auto-delete in case the
    // caller wants to inspect the file. Filename includes the transfer
    // syntax UID so per-syntax round trips don't overwrite each other.
    val dir = reactApplicationContext.cacheDir
    val tag = if (transferSyntaxUID.isEmpty()) "default" else transferSyntaxUID
    val file = java.io.File(
      dir,
      "vnd-synthetic-${tag}-${System.currentTimeMillis()}.dcm"
    )
    return nativeWriteSyntheticDicom(file.absolutePath, transferSyntaxUID)
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

  // Implemented in libVibeNativeDicom.so (Android NDK build of
  // android/src/main/cpp/VibeNativeDicom-jni.cpp). Loaded by the static
  // initializer below.
  private external fun nativeGetGdcmVersion(): String
  private external fun nativeWriteSyntheticDicom(
    path: String,
    transferSyntaxUID: String
  ): String
  private external fun nativeIsSupportedTransferSyntax(
    transferSyntaxUID: String
  ): Boolean
  private external fun nativeReadDicom(path: String): Any
  private external fun nativeExtractPixelDataToFile(
    dicomPath: String,
    outPath: String
  ): Any

  companion object {
    const val NAME: String = NativeVibeNativeDicomSpec.NAME

    init {
      System.loadLibrary("VibeNativeDicom")
    }
  }
}
