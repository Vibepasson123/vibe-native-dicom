// JNI bridge from Kotlin to GDCM C++.
//
// Built per-ABI by android/scripts/build-vibenative-jni.sh into
// libVibeNativeDicom.so under android/src/main/jniLibs/<abi>/. Gradle's
// standard AAR build packages those .so files alongside the Kotlin classes;
// no AGP externalNativeBuild integration is needed (see
// docs/architecture/native-build.md §6 for the duplicate-target rationale).
//
// Refs SR-0002 (GDCM Android integration), SR-0004 (getGdcmVersion JS API),
//      SR-0006 (load-time symbol resolution).

#include <jni.h>

#include <gdcmVersion.h>

extern "C" JNIEXPORT jstring JNICALL
Java_com_viveksah_vibenativedicom_VibeNativeDicomModule_nativeGetGdcmVersion(
    JNIEnv *env, jobject /* this */) {
  const char *v = gdcm::Version::GetVersion();
  return env->NewStringUTF(v);
}
