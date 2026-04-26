package com.viveksah.vibenativedicom

import com.facebook.react.bridge.ReactApplicationContext

class VibeNativeDicomModule(reactContext: ReactApplicationContext) :
  NativeVibeNativeDicomSpec(reactContext) {

  override fun multiply(a: Double, b: Double): Double {
    return a * b
  }

  companion object {
    const val NAME = NativeVibeNativeDicomSpec.NAME
  }
}
