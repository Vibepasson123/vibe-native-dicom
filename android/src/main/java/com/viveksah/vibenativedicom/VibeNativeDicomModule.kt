package com.viveksah.vibenativedicom

import com.facebook.react.bridge.ReactApplicationContext

class VibeNativeDicomModule(reactContext: ReactApplicationContext) :
  NativeVibeNativeDicomSpec(reactContext) {

  override fun multiply(a: Double, b: Double): Double {
    return a * b
  }

  override fun getGdcmVersion(): String {
    return nativeGetGdcmVersion()
  }

  // Implemented in libVibeNativeDicom.so (Android NDK build of
  // android/src/main/cpp/VibeNativeDicom-jni.cpp). Loaded by the static
  // initializer below.
  private external fun nativeGetGdcmVersion(): String

  companion object {
    const val NAME: String = NativeVibeNativeDicomSpec.NAME

    init {
      System.loadLibrary("VibeNativeDicom")
    }
  }
}
