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

  override fun writeSyntheticDicom(): String {
    // The example app cleans this up; we don't auto-delete in case the
    // caller wants to inspect the file.
    val dir = reactApplicationContext.cacheDir
    val file = java.io.File(dir, "vnd-synthetic-${System.currentTimeMillis()}.dcm")
    return nativeWriteSyntheticDicom(file.absolutePath)
  }

  override fun readDicom(path: String): WritableMap {
    @Suppress("UNCHECKED_CAST")
    val raw = nativeReadDicom(path) as java.util.HashMap<String, Any?>
    return Arguments.makeNativeMap(raw)
  }

  // Implemented in libVibeNativeDicom.so (Android NDK build of
  // android/src/main/cpp/VibeNativeDicom-jni.cpp). Loaded by the static
  // initializer below.
  private external fun nativeGetGdcmVersion(): String
  private external fun nativeWriteSyntheticDicom(path: String): String
  private external fun nativeReadDicom(path: String): Any

  companion object {
    const val NAME: String = NativeVibeNativeDicomSpec.NAME

    init {
      System.loadLibrary("VibeNativeDicom")
    }
  }
}
