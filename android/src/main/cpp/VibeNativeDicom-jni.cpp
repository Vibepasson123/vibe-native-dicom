// JNI bridge from Kotlin to GDCM C++.
//
// Built per-ABI by android/scripts/build-vibenative-jni.sh into
// libVibeNativeDicom.so under android/src/main/jniLibs/<abi>/. Gradle's
// standard AAR build packages those .so files alongside the Kotlin classes;
// no AGP externalNativeBuild integration is needed (see
// docs/architecture/native-build.md §6 for the duplicate-target rationale).
//
// Refs SR-0002 (GDCM Android integration), SR-0004 (getGdcmVersion JS API),
//      SR-0006 (load-time symbol resolution), SR-0011 (readDicom).

#include <jni.h>

#include <stdexcept>
#include <string>

#include <gdcmVersion.h>

#include "dicom_read.h"

namespace {

// Throw a Java RuntimeException with `msg`. Caller must return immediately.
void throwJavaRuntime(JNIEnv* env, const char* msg) {
  jclass cls = env->FindClass("java/lang/RuntimeException");
  if (cls != nullptr) {
    env->ThrowNew(cls, msg);
  }
}

// Helper to add a String entry to a HashMap.
void putString(JNIEnv* env, jobject map, jmethodID putMethod, const char* key,
               const std::string& value) {
  jstring jKey = env->NewStringUTF(key);
  jstring jVal = env->NewStringUTF(value.c_str());
  env->CallObjectMethod(map, putMethod, jKey, jVal);
  env->DeleteLocalRef(jKey);
  env->DeleteLocalRef(jVal);
}

void putInt(JNIEnv* env, jobject map, jmethodID putMethod, const char* key,
            int value) {
  jstring jKey = env->NewStringUTF(key);
  jclass intCls = env->FindClass("java/lang/Integer");
  jmethodID intCtor = env->GetMethodID(intCls, "<init>", "(I)V");
  jobject jVal = env->NewObject(intCls, intCtor, static_cast<jint>(value));
  env->CallObjectMethod(map, putMethod, jKey, jVal);
  env->DeleteLocalRef(jKey);
  env->DeleteLocalRef(jVal);
  env->DeleteLocalRef(intCls);
}

void putBool(JNIEnv* env, jobject map, jmethodID putMethod, const char* key,
             bool value) {
  jstring jKey = env->NewStringUTF(key);
  jclass cls = env->FindClass("java/lang/Boolean");
  jmethodID ctor = env->GetMethodID(cls, "<init>", "(Z)V");
  jobject jVal = env->NewObject(cls, ctor, static_cast<jboolean>(value));
  env->CallObjectMethod(map, putMethod, jKey, jVal);
  env->DeleteLocalRef(jKey);
  env->DeleteLocalRef(jVal);
  env->DeleteLocalRef(cls);
}

jobject newHashMap(JNIEnv* env, jclass mapCls, jmethodID mapCtor) {
  return env->NewObject(mapCls, mapCtor);
}

}  // namespace

extern "C" JNIEXPORT jstring JNICALL
Java_com_viveksah_vibenativedicom_VibeNativeDicomModule_nativeGetGdcmVersion(
    JNIEnv* env, jobject /* this */) {
  const char* v = gdcm::Version::GetVersion();
  return env->NewStringUTF(v);
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_viveksah_vibenativedicom_VibeNativeDicomModule_nativeWriteSyntheticDicom(
    JNIEnv* env, jobject /* this */, jstring jPath, jstring jTsUID) {
  const char* cPath = env->GetStringUTFChars(jPath, nullptr);
  if (cPath == nullptr) {
    throwJavaRuntime(env, "writeSyntheticDicom: null path");
    return nullptr;
  }
  std::string path(cPath);
  env->ReleaseStringUTFChars(jPath, cPath);

  std::string tsUID;
  if (jTsUID != nullptr) {
    const char* cTs = env->GetStringUTFChars(jTsUID, nullptr);
    if (cTs != nullptr) {
      tsUID.assign(cTs);
      env->ReleaseStringUTFChars(jTsUID, cTs);
    }
  }

  try {
    vnd::writeSyntheticDicomFile(path, tsUID);
  } catch (const std::exception& e) {
    throwJavaRuntime(env, e.what());
    return nullptr;
  }
  return env->NewStringUTF(path.c_str());
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_viveksah_vibenativedicom_VibeNativeDicomModule_nativeIsSupportedTransferSyntax(
    JNIEnv* env, jobject /* this */, jstring jTsUID) {
  if (jTsUID == nullptr) return JNI_FALSE;
  const char* cTs = env->GetStringUTFChars(jTsUID, nullptr);
  if (cTs == nullptr) return JNI_FALSE;
  std::string tsUID(cTs);
  env->ReleaseStringUTFChars(jTsUID, cTs);
  return vnd::isSupportedTransferSyntax(tsUID) ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jobject JNICALL
Java_com_viveksah_vibenativedicom_VibeNativeDicomModule_nativeReadDicom(
    JNIEnv* env, jobject /* this */, jstring jPath) {
  const char* cPath = env->GetStringUTFChars(jPath, nullptr);
  if (cPath == nullptr) {
    throwJavaRuntime(env, "readDicom: null path");
    return nullptr;
  }
  std::string path(cPath);
  env->ReleaseStringUTFChars(jPath, cPath);

  vnd::DicomFile parsed;
  try {
    vnd::readDicomFile(path, parsed);
  } catch (const std::exception& e) {
    throwJavaRuntime(env, e.what());
    return nullptr;
  }

  jclass mapCls = env->FindClass("java/util/HashMap");
  jmethodID mapCtor = env->GetMethodID(mapCls, "<init>", "()V");
  jmethodID putMethod =
      env->GetMethodID(mapCls, "put",
                       "(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;");

  jobject root = newHashMap(env, mapCls, mapCtor);
  putString(env, root, putMethod, "transferSyntaxUID", parsed.transferSyntaxUID);
  putString(env, root, putMethod, "sopClassUID", parsed.sopClassUID);
  putString(env, root, putMethod, "sopInstanceUID", parsed.sopInstanceUID);

  // dataset: { "GGGG,EEEE": { vr, value } }
  jobject datasetMap = newHashMap(env, mapCls, mapCtor);
  for (const auto& kv : parsed.dataset) {
    jobject elemMap = newHashMap(env, mapCls, mapCtor);
    putString(env, elemMap, putMethod, "vr", kv.second.vr);
    if (kv.second.isEmpty) {
      jstring jKey = env->NewStringUTF("value");
      env->CallObjectMethod(elemMap, putMethod, jKey, nullptr);
      env->DeleteLocalRef(jKey);
    } else {
      putString(env, elemMap, putMethod, "value", kv.second.value);
    }
    jstring jKey = env->NewStringUTF(kv.first.c_str());
    env->CallObjectMethod(datasetMap, putMethod, jKey, elemMap);
    env->DeleteLocalRef(jKey);
    env->DeleteLocalRef(elemMap);
  }
  jstring dsKey = env->NewStringUTF("dataset");
  env->CallObjectMethod(root, putMethod, dsKey, datasetMap);
  env->DeleteLocalRef(dsKey);
  env->DeleteLocalRef(datasetMap);

  // image: { rows, columns, ..., pixelDataBase64, hasPixelData }
  jobject imgMap = newHashMap(env, mapCls, mapCtor);
  putInt(env, imgMap, putMethod, "rows", parsed.image.rows);
  putInt(env, imgMap, putMethod, "columns", parsed.image.columns);
  putInt(env, imgMap, putMethod, "bitsAllocated", parsed.image.bitsAllocated);
  putInt(env, imgMap, putMethod, "bitsStored", parsed.image.bitsStored);
  putInt(env, imgMap, putMethod, "highBit", parsed.image.highBit);
  putInt(env, imgMap, putMethod, "pixelRepresentation",
         parsed.image.pixelRepresentation);
  putInt(env, imgMap, putMethod, "samplesPerPixel",
         parsed.image.samplesPerPixel);
  putString(env, imgMap, putMethod, "photometricInterpretation",
            parsed.image.photometricInterpretation);
  putInt(env, imgMap, putMethod, "numberOfFrames", parsed.image.numberOfFrames);
  putBool(env, imgMap, putMethod, "hasPixelData", parsed.image.hasPixelData);
  if (parsed.image.hasPixelData) {
    putString(env, imgMap, putMethod, "pixelDataBase64",
              parsed.image.pixelDataBase64);
  } else {
    jstring k = env->NewStringUTF("pixelDataBase64");
    env->CallObjectMethod(imgMap, putMethod, k, nullptr);
    env->DeleteLocalRef(k);
  }
  jstring imgKey = env->NewStringUTF("image");
  env->CallObjectMethod(root, putMethod, imgKey, imgMap);
  env->DeleteLocalRef(imgKey);
  env->DeleteLocalRef(imgMap);
  env->DeleteLocalRef(mapCls);
  return root;
}
