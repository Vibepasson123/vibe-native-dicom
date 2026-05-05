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

// Forward declaration for mutual recursion.
jobject datasetToHashMap(JNIEnv* env, jclass mapCls, jmethodID mapCtor,
                         jmethodID putMethod, const vnd::DicomDataset& ds);

// Convert a single DicomElement to a HashMap matching the TS DicomElement
// shape: SQ -> { vr, value: null, items: ArrayList<HashMap> }; non-SQ ->
// { vr, value: string|null }.
jobject elementToHashMap(JNIEnv* env, jclass mapCls, jmethodID mapCtor,
                         jmethodID putMethod,
                         const vnd::DicomElement& elem) {
  jobject elemMap = newHashMap(env, mapCls, mapCtor);
  putString(env, elemMap, putMethod, "vr", elem.vr);

  if (elem.vr == "SQ") {
    // value is null for SQ; the items vector becomes a Java ArrayList.
    jstring valueKey = env->NewStringUTF("value");
    env->CallObjectMethod(elemMap, putMethod, valueKey, nullptr);
    env->DeleteLocalRef(valueKey);

    jclass listCls = env->FindClass("java/util/ArrayList");
    jmethodID listCtor = env->GetMethodID(listCls, "<init>", "()V");
    jmethodID listAdd =
        env->GetMethodID(listCls, "add", "(Ljava/lang/Object;)Z");
    jobject items = env->NewObject(listCls, listCtor);
    for (const auto& itemDs : elem.items) {
      jobject itemMap =
          datasetToHashMap(env, mapCls, mapCtor, putMethod, itemDs);
      env->CallBooleanMethod(items, listAdd, itemMap);
      env->DeleteLocalRef(itemMap);
    }
    jstring itemsKey = env->NewStringUTF("items");
    env->CallObjectMethod(elemMap, putMethod, itemsKey, items);
    env->DeleteLocalRef(itemsKey);
    env->DeleteLocalRef(items);
    env->DeleteLocalRef(listCls);
  } else if (elem.isEmpty) {
    jstring valueKey = env->NewStringUTF("value");
    env->CallObjectMethod(elemMap, putMethod, valueKey, nullptr);
    env->DeleteLocalRef(valueKey);
  } else {
    putString(env, elemMap, putMethod, "value", elem.value);
  }
  return elemMap;
}

jobject datasetToHashMap(JNIEnv* env, jclass mapCls, jmethodID mapCtor,
                         jmethodID putMethod, const vnd::DicomDataset& ds) {
  jobject map = newHashMap(env, mapCls, mapCtor);
  for (const auto& kv : ds) {
    jobject elemMap =
        elementToHashMap(env, mapCls, mapCtor, putMethod, kv.second);
    jstring jKey = env->NewStringUTF(kv.first.c_str());
    env->CallObjectMethod(map, putMethod, jKey, elemMap);
    env->DeleteLocalRef(jKey);
    env->DeleteLocalRef(elemMap);
  }
  return map;
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
    JNIEnv* env, jobject /* this */, jstring jPath, jstring jTsUID,
    jint jNumFrames) {
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
    vnd::writeSyntheticDicomFile(path, tsUID, static_cast<int>(jNumFrames));
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

extern "C" JNIEXPORT jstring JNICALL
Java_com_viveksah_vibenativedicom_VibeNativeDicomModule_nativeReadBinaryFile(
    JNIEnv* env, jobject /* this */, jstring jPath, jdouble jMaxBytes) {
  if (jPath == nullptr) {
    throwJavaRuntime(env, "readBinaryFile: null path");
    return nullptr;
  }
  const char* cPath = env->GetStringUTFChars(jPath, nullptr);
  if (cPath == nullptr) {
    throwJavaRuntime(env, "readBinaryFile: bad path encoding");
    return nullptr;
  }
  std::string path(cPath);
  env->ReleaseStringUTFChars(jPath, cPath);

  std::string bytes;
  try {
    bytes = vnd::readBinaryFileAsLatin1(
        path, static_cast<long long>(jMaxBytes));
  } catch (const std::exception& e) {
    throwJavaRuntime(env, e.what());
    return nullptr;
  }

  // Pass bytes to JVM as a Latin-1 String. We CAN'T use NewStringUTF
  // because high bytes would be interpreted as multibyte UTF-8 sequences.
  // Instead build a byte[] then construct String(bytes, "ISO-8859-1").
  jbyteArray byteArr = env->NewByteArray(static_cast<jsize>(bytes.size()));
  env->SetByteArrayRegion(
      byteArr, 0, static_cast<jsize>(bytes.size()),
      reinterpret_cast<const jbyte*>(bytes.data()));
  jclass strCls = env->FindClass("java/lang/String");
  jmethodID strCtor =
      env->GetMethodID(strCls, "<init>", "([BLjava/lang/String;)V");
  jstring charset = env->NewStringUTF("ISO-8859-1");
  jstring result = static_cast<jstring>(
      env->NewObject(strCls, strCtor, byteArr, charset));
  env->DeleteLocalRef(byteArr);
  env->DeleteLocalRef(charset);
  env->DeleteLocalRef(strCls);
  return result;
}

extern "C" JNIEXPORT jobject JNICALL
Java_com_viveksah_vibenativedicom_VibeNativeDicomModule_nativeExtractPixelDataToFile(
    JNIEnv* env, jobject /* this */, jstring jDicomPath, jstring jOutPath) {
  if (jDicomPath == nullptr || jOutPath == nullptr) {
    throwJavaRuntime(env, "extractPixelDataToFile: null path");
    return nullptr;
  }
  const char* cDicom = env->GetStringUTFChars(jDicomPath, nullptr);
  const char* cOut = env->GetStringUTFChars(jOutPath, nullptr);
  if (cDicom == nullptr || cOut == nullptr) {
    if (cDicom) env->ReleaseStringUTFChars(jDicomPath, cDicom);
    if (cOut) env->ReleaseStringUTFChars(jOutPath, cOut);
    throwJavaRuntime(env, "extractPixelDataToFile: bad path encoding");
    return nullptr;
  }
  std::string dicomPath(cDicom);
  std::string outPath(cOut);
  env->ReleaseStringUTFChars(jDicomPath, cDicom);
  env->ReleaseStringUTFChars(jOutPath, cOut);

  vnd::PixelDataInfo info;
  try {
    vnd::extractPixelDataToFile(dicomPath, outPath, info);
  } catch (const std::exception& e) {
    throwJavaRuntime(env, e.what());
    return nullptr;
  }

  jclass mapCls = env->FindClass("java/util/HashMap");
  jmethodID mapCtor = env->GetMethodID(mapCls, "<init>", "()V");
  jmethodID putMethod = env->GetMethodID(
      mapCls, "put",
      "(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;");

  jobject root = newHashMap(env, mapCls, mapCtor);
  putString(env, root, putMethod, "filePath", info.filePath);
  // byteLength is a long long (DICOMs can exceed 2 GB on whole-slide
  // pathology). We marshal it as a Java Double to survive the WritableMap
  // round trip — JS Number is f64 so precision is fine up to 2^53.
  {
    jstring k = env->NewStringUTF("byteLength");
    jclass dblCls = env->FindClass("java/lang/Double");
    jmethodID dblCtor = env->GetMethodID(dblCls, "<init>", "(D)V");
    jobject jVal = env->NewObject(dblCls, dblCtor,
                                  static_cast<jdouble>(info.byteLength));
    env->CallObjectMethod(root, putMethod, k, jVal);
    env->DeleteLocalRef(k);
    env->DeleteLocalRef(jVal);
    env->DeleteLocalRef(dblCls);
  }
  putInt(env, root, putMethod, "rows", info.rows);
  putInt(env, root, putMethod, "columns", info.columns);
  putInt(env, root, putMethod, "bitsAllocated", info.bitsAllocated);
  putInt(env, root, putMethod, "samplesPerPixel", info.samplesPerPixel);
  putString(env, root, putMethod, "photometricInterpretation",
            info.photometricInterpretation);
  putInt(env, root, putMethod, "numberOfFrames", info.numberOfFrames);
  putBool(env, root, putMethod, "hasPixelData", info.hasPixelData);
  env->DeleteLocalRef(mapCls);
  return root;
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

  // dataset: { "GGGG,EEEE": { vr, value, items? } } — recursive for SQ.
  jobject datasetMap =
      datasetToHashMap(env, mapCls, mapCtor, putMethod, parsed.dataset);
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
