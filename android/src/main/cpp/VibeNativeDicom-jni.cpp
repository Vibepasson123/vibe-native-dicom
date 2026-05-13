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
#include "dicom_volume.h"

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
Java_com_viveksah_vibenativedicom_VibeNativeDicomModule_nativeExportBasicTextSr(
    JNIEnv* env, jobject /* this */, jstring jOutPath, jstring jLinesJson,
    jstring jStudyUID, jstring jSeriesUID, jstring jSopUID,
    jstring jSopClassUID) {
  auto fetch = [&](jstring js) -> std::string {
    if (js == nullptr) return std::string();
    const char* c = env->GetStringUTFChars(js, nullptr);
    if (c == nullptr) return std::string();
    std::string s(c);
    env->ReleaseStringUTFChars(js, c);
    return s;
  };
  std::string outPath = fetch(jOutPath);
  std::string linesJson = fetch(jLinesJson);
  vnd::SrExportRefs refs;
  refs.sourceStudyInstanceUID = fetch(jStudyUID);
  refs.sourceSeriesInstanceUID = fetch(jSeriesUID);
  refs.sourceSopInstanceUID = fetch(jSopUID);
  refs.sourceSopClassUID = fetch(jSopClassUID);

  // Tiny JSON-array-of-strings parser. We don't pull in a JSON dep —
  // the input is generated by JS-side JSON.stringify(string[]). Minimal
  // scanner: skip whitespace, expect '[', read string literals separated
  // by commas, expect ']'. Escape sequences ("\\", "\"") are honoured.
  std::vector<std::string> lines;
  size_t i = 0;
  auto skipWs = [&]() {
    while (i < linesJson.size() &&
           (linesJson[i] == ' ' || linesJson[i] == '\t' ||
            linesJson[i] == '\n' || linesJson[i] == '\r'))
      ++i;
  };
  skipWs();
  if (i < linesJson.size() && linesJson[i] == '[') {
    ++i;
    skipWs();
    while (i < linesJson.size() && linesJson[i] != ']') {
      skipWs();
      if (i >= linesJson.size() || linesJson[i] != '"') break;
      ++i;
      std::string s;
      while (i < linesJson.size() && linesJson[i] != '"') {
        if (linesJson[i] == '\\' && i + 1 < linesJson.size()) {
          char esc = linesJson[i + 1];
          if (esc == 'n') s.push_back('\n');
          else if (esc == 't') s.push_back('\t');
          else s.push_back(esc);
          i += 2;
        } else {
          s.push_back(linesJson[i++]);
        }
      }
      if (i < linesJson.size()) ++i;  // consume closing "
      lines.push_back(std::move(s));
      skipWs();
      if (i < linesJson.size() && linesJson[i] == ',') ++i;
      skipWs();
    }
  }

  try {
    vnd::writeBasicTextSr(outPath, lines, refs);
  } catch (const std::exception& e) {
    throwJavaRuntime(env, e.what());
    return nullptr;
  }
  return env->NewStringUTF(outPath.c_str());
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

// ---- Phase 5.1: volume + MPR slice ----------------------------------------

namespace {

void putDouble(JNIEnv* env, jobject map, jmethodID putMethod, const char* key,
               double value) {
  jstring jKey = env->NewStringUTF(key);
  jclass dblCls = env->FindClass("java/lang/Double");
  jmethodID dblCtor = env->GetMethodID(dblCls, "<init>", "(D)V");
  jobject jVal =
      env->NewObject(dblCls, dblCtor, static_cast<jdouble>(value));
  env->CallObjectMethod(map, putMethod, jKey, jVal);
  env->DeleteLocalRef(jKey);
  env->DeleteLocalRef(jVal);
  env->DeleteLocalRef(dblCls);
}

}  // namespace

extern "C" JNIEXPORT jobject JNICALL
Java_com_viveksah_vibenativedicom_VibeNativeDicomModule_nativeBuildVolumeFromDicoms(
    JNIEnv* env, jobject /* this */, jstring jPathsJson,
    jboolean jResample) {
  if (jPathsJson == nullptr) {
    throwJavaRuntime(env, "buildVolumeFromDicoms: null paths");
    return nullptr;
  }
  const char* cJson = env->GetStringUTFChars(jPathsJson, nullptr);
  if (cJson == nullptr) {
    throwJavaRuntime(env, "buildVolumeFromDicoms: bad paths encoding");
    return nullptr;
  }
  std::string json(cJson);
  env->ReleaseStringUTFChars(jPathsJson, cJson);

  // Same minimal JSON-array-of-strings parser as the SR exporter.
  std::vector<std::string> paths;
  size_t i = 0;
  auto skipWs = [&]() {
    while (i < json.size() && (json[i] == ' ' || json[i] == '\t' ||
                                json[i] == '\n' || json[i] == '\r'))
      ++i;
  };
  skipWs();
  if (i < json.size() && json[i] == '[') {
    ++i;
    skipWs();
    while (i < json.size() && json[i] != ']') {
      skipWs();
      if (i >= json.size() || json[i] != '"') break;
      ++i;
      std::string s;
      while (i < json.size() && json[i] != '"') {
        if (json[i] == '\\' && i + 1 < json.size()) {
          char esc = json[i + 1];
          if (esc == 'n') s.push_back('\n');
          else if (esc == 't') s.push_back('\t');
          else s.push_back(esc);
          i += 2;
        } else {
          s.push_back(json[i++]);
        }
      }
      if (i < json.size()) ++i;
      paths.push_back(std::move(s));
      skipWs();
      if (i < json.size() && json[i] == ',') ++i;
      skipWs();
    }
  }

  vnd::VolumeInfo info;
  try {
    vnd::BuildVolumeOptions opts;
    opts.resampleNonUniformZ = (jResample == JNI_TRUE);
    info = vnd::buildVolumeFromDicoms(paths, opts);
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
  putDouble(env, root, putMethod, "handle",
            static_cast<double>(info.handle));
  putInt(env, root, putMethod, "columns", info.columns);
  putInt(env, root, putMethod, "rows", info.rows);
  putInt(env, root, putMethod, "depth", info.depth);
  putInt(env, root, putMethod, "bitsAllocated", info.bitsAllocated);
  putInt(env, root, putMethod, "pixelRepresentation",
         info.pixelRepresentation);
  putDouble(env, root, putMethod, "pixelSpacingRow", info.pixelSpacingRow);
  putDouble(env, root, putMethod, "pixelSpacingCol", info.pixelSpacingCol);
  putDouble(env, root, putMethod, "sliceSpacing", info.sliceSpacing);
  putString(env, root, putMethod, "photometricInterpretation",
            info.photometricInterpretation);
  env->DeleteLocalRef(mapCls);
  return root;
}

extern "C" JNIEXPORT jobject JNICALL
Java_com_viveksah_vibenativedicom_VibeNativeDicomModule_nativeExtractMprSlice(
    JNIEnv* env, jobject /* this */, jdouble jHandle, jint jPlane,
    jint jIndex, jstring jOutPath) {
  vnd::MprPlane plane;
  switch (static_cast<int>(jPlane)) {
    case 0: plane = vnd::MprPlane::Axial; break;
    case 1: plane = vnd::MprPlane::Sagittal; break;
    case 2: plane = vnd::MprPlane::Coronal; break;
    default:
      throwJavaRuntime(env, "extractMprSlice: invalid plane");
      return nullptr;
  }
  if (jOutPath == nullptr) {
    throwJavaRuntime(env, "extractMprSlice: null outPath");
    return nullptr;
  }
  const char* cOut = env->GetStringUTFChars(jOutPath, nullptr);
  if (cOut == nullptr) {
    throwJavaRuntime(env, "extractMprSlice: bad outPath encoding");
    return nullptr;
  }
  std::string outPath(cOut);
  env->ReleaseStringUTFChars(jOutPath, cOut);

  vnd::MprSliceInfo info;
  try {
    info = vnd::extractSlice(static_cast<long long>(jHandle), plane,
                             static_cast<int>(jIndex), outPath);
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
  putDouble(env, root, putMethod, "byteLength",
            static_cast<double>(info.byteLength));
  putInt(env, root, putMethod, "rows", info.rows);
  putInt(env, root, putMethod, "columns", info.columns);
  putInt(env, root, putMethod, "bitsAllocated", info.bitsAllocated);
  putInt(env, root, putMethod, "pixelRepresentation",
         info.pixelRepresentation);
  putDouble(env, root, putMethod, "pixelSpacingRow", info.pixelSpacingRow);
  putDouble(env, root, putMethod, "pixelSpacingCol", info.pixelSpacingCol);
  env->DeleteLocalRef(mapCls);
  return root;
}

extern "C" JNIEXPORT void JNICALL
Java_com_viveksah_vibenativedicom_VibeNativeDicomModule_nativeReleaseVolume(
    JNIEnv* /* env */, jobject /* this */, jdouble jHandle) {
  vnd::releaseVolume(static_cast<long long>(jHandle));
}

// Internal helper used by both extractObliqueSlice and
// extractProjectionSlab — parses an ObliqueSpec JSON object.
namespace {
bool parseObliqueSpec(const std::string& specJson, vnd::ObliqueSpec& out) {
  auto skipWs = [](const std::string& s, size_t& i) {
    while (i < s.size() && (s[i] == ' ' || s[i] == '\t' || s[i] == '\n' ||
                             s[i] == '\r' || s[i] == '\f'))
      ++i;
  };
  auto findKey = [&](const std::string& s, const std::string& key) -> size_t {
    const std::string needle = "\"" + key + "\"";
    size_t pos = s.find(needle);
    if (pos == std::string::npos) return std::string::npos;
    pos += needle.size();
    skipWs(s, pos);
    if (pos >= s.size() || s[pos] != ':') return std::string::npos;
    ++pos;
    skipWs(s, pos);
    return pos;
  };
  auto readDouble = [&](size_t& i) -> double {
    skipWs(specJson, i);
    size_t start = i;
    while (i < specJson.size() &&
           (specJson[i] == '-' || specJson[i] == '+' || specJson[i] == '.' ||
            specJson[i] == 'e' || specJson[i] == 'E' ||
            (specJson[i] >= '0' && specJson[i] <= '9'))) {
      ++i;
    }
    if (start == i) return 0;
    try {
      return std::stod(specJson.substr(start, i - start));
    } catch (...) {
      return 0;
    }
  };
  auto readVec = [&](const std::string& key, double dst[3]) -> bool {
    size_t pos = findKey(specJson, key);
    if (pos == std::string::npos) return false;
    if (pos >= specJson.size() || specJson[pos] != '[') return false;
    ++pos;
    dst[0] = readDouble(pos);
    skipWs(specJson, pos);
    if (pos < specJson.size() && specJson[pos] == ',') ++pos;
    dst[1] = readDouble(pos);
    skipWs(specJson, pos);
    if (pos < specJson.size() && specJson[pos] == ',') ++pos;
    dst[2] = readDouble(pos);
    return true;
  };

  if (!readVec("centerMm", out.centerMm) || !readVec("uMm", out.uMm) ||
      !readVec("vMm", out.vMm)) {
    return false;
  }
  size_t pos = findKey(specJson, "columns");
  if (pos != std::string::npos) out.columns = static_cast<int>(readDouble(pos));
  pos = findKey(specJson, "rows");
  if (pos != std::string::npos) out.rows = static_cast<int>(readDouble(pos));
  pos = findKey(specJson, "pixelSpacingMm");
  if (pos != std::string::npos) out.pixelSpacingMm = readDouble(pos);
  return true;
}

jobject sliceInfoToHashMap(JNIEnv* env, const vnd::MprSliceInfo& info) {
  jclass mapCls = env->FindClass("java/util/HashMap");
  jmethodID mapCtor = env->GetMethodID(mapCls, "<init>", "()V");
  jmethodID putMethod = env->GetMethodID(
      mapCls, "put",
      "(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;");
  jobject root = newHashMap(env, mapCls, mapCtor);
  putString(env, root, putMethod, "filePath", info.filePath);
  putDouble(env, root, putMethod, "byteLength",
            static_cast<double>(info.byteLength));
  putInt(env, root, putMethod, "rows", info.rows);
  putInt(env, root, putMethod, "columns", info.columns);
  putInt(env, root, putMethod, "bitsAllocated", info.bitsAllocated);
  putInt(env, root, putMethod, "pixelRepresentation",
         info.pixelRepresentation);
  putDouble(env, root, putMethod, "pixelSpacingRow", info.pixelSpacingRow);
  putDouble(env, root, putMethod, "pixelSpacingCol", info.pixelSpacingCol);
  env->DeleteLocalRef(mapCls);
  return root;
}
}  // namespace

extern "C" JNIEXPORT jobject JNICALL
Java_com_viveksah_vibenativedicom_VibeNativeDicomModule_nativeExtractVolumeRender(
    JNIEnv* env, jobject /* this */, jdouble jHandle, jstring jSpecJson,
    jdouble jSlabThicknessMm, jdouble jStepMm, jstring jTfJson,
    jstring jClipPlanesJson, jstring jOutPath) {
  if (jSpecJson == nullptr || jTfJson == nullptr || jOutPath == nullptr) {
    throwJavaRuntime(env, "extractVolumeRender: null arg");
    return nullptr;
  }
  const char* cSpec = env->GetStringUTFChars(jSpecJson, nullptr);
  const char* cTf = env->GetStringUTFChars(jTfJson, nullptr);
  const char* cOut = env->GetStringUTFChars(jOutPath, nullptr);
  // clipPlanesJson is allowed to be null (= no planes).
  const char* cClip =
      (jClipPlanesJson != nullptr)
          ? env->GetStringUTFChars(jClipPlanesJson, nullptr)
          : nullptr;
  if (cSpec == nullptr || cTf == nullptr || cOut == nullptr) {
    if (cSpec) env->ReleaseStringUTFChars(jSpecJson, cSpec);
    if (cTf) env->ReleaseStringUTFChars(jTfJson, cTf);
    if (cOut) env->ReleaseStringUTFChars(jOutPath, cOut);
    if (cClip) env->ReleaseStringUTFChars(jClipPlanesJson, cClip);
    throwJavaRuntime(env, "extractVolumeRender: bad string encoding");
    return nullptr;
  }
  std::string specJson(cSpec);
  std::string tfJson(cTf);
  std::string clipJson(cClip ? cClip : "");
  std::string outPath(cOut);
  env->ReleaseStringUTFChars(jSpecJson, cSpec);
  env->ReleaseStringUTFChars(jTfJson, cTf);
  env->ReleaseStringUTFChars(jOutPath, cOut);
  if (cClip) env->ReleaseStringUTFChars(jClipPlanesJson, cClip);

  vnd::ObliqueSpec spec;
  if (!parseObliqueSpec(specJson, spec)) {
    throwJavaRuntime(env, "extractVolumeRender: invalid ObliqueSpec JSON");
    return nullptr;
  }

  // Parse the TF JSON: array of objects with value/r/g/b/opacity.
  // Same minimal scanner pattern used elsewhere — no JSON dep.
  std::vector<vnd::TransferFunctionPoint> tf;
  {
    auto skipWs = [](const std::string& s, size_t& i) {
      while (i < s.size() && (s[i] == ' ' || s[i] == '\t' ||
                                s[i] == '\n' || s[i] == '\r' || s[i] == '\f'))
        ++i;
    };
    auto readNumber = [&](size_t& i) -> double {
      skipWs(tfJson, i);
      size_t start = i;
      while (i < tfJson.size() &&
             (tfJson[i] == '-' || tfJson[i] == '+' || tfJson[i] == '.' ||
              tfJson[i] == 'e' || tfJson[i] == 'E' ||
              (tfJson[i] >= '0' && tfJson[i] <= '9'))) {
        ++i;
      }
      if (start == i) return 0;
      try {
        return std::stod(tfJson.substr(start, i - start));
      } catch (...) {
        return 0;
      }
    };
    size_t i = 0;
    skipWs(tfJson, i);
    if (i >= tfJson.size() || tfJson[i] != '[') {
      throwJavaRuntime(env, "extractVolumeRender: tfJson must be a JSON array");
      return nullptr;
    }
    ++i;
    while (i < tfJson.size()) {
      skipWs(tfJson, i);
      if (i < tfJson.size() && tfJson[i] == ']') break;
      if (i >= tfJson.size() || tfJson[i] != '{') break;
      ++i;
      vnd::TransferFunctionPoint pt{};
      while (i < tfJson.size() && tfJson[i] != '}') {
        skipWs(tfJson, i);
        if (i >= tfJson.size() || tfJson[i] != '"') break;
        ++i;
        size_t keyStart = i;
        while (i < tfJson.size() && tfJson[i] != '"') ++i;
        std::string key = tfJson.substr(keyStart, i - keyStart);
        if (i < tfJson.size()) ++i;  // closing "
        skipWs(tfJson, i);
        if (i < tfJson.size() && tfJson[i] == ':') ++i;
        const double n = readNumber(i);
        if (key == "value") pt.value = n;
        else if (key == "r") pt.r = n;
        else if (key == "g") pt.g = n;
        else if (key == "b") pt.b = n;
        else if (key == "opacity") pt.opacity = n;
        skipWs(tfJson, i);
        if (i < tfJson.size() && tfJson[i] == ',') ++i;
      }
      if (i < tfJson.size() && tfJson[i] == '}') ++i;
      tf.push_back(pt);
      skipWs(tfJson, i);
      if (i < tfJson.size() && tfJson[i] == ',') ++i;
    }
  }

  // Phase 6.3: parse the clip-planes JSON. Shape:
  //   [{"pointMm":[x,y,z],"normalMm":[x,y,z]}, ...]
  // Empty / missing → no planes. Same hand-rolled scanner pattern as
  // the TF parser above. Invalid JSON is treated as "no planes" rather
  // than thrown — the worst outcome is a non-clipped render.
  std::vector<vnd::ClipPlane> clipPlanes;
  if (!clipJson.empty()) {
    auto skipWs = [](const std::string& s, size_t& i) {
      while (i < s.size() && (s[i] == ' ' || s[i] == '\t' ||
                                s[i] == '\n' || s[i] == '\r' || s[i] == '\f'))
        ++i;
    };
    auto readNumber = [&](size_t& i) -> double {
      skipWs(clipJson, i);
      size_t start = i;
      while (i < clipJson.size() &&
             (clipJson[i] == '-' || clipJson[i] == '+' || clipJson[i] == '.' ||
              clipJson[i] == 'e' || clipJson[i] == 'E' ||
              (clipJson[i] >= '0' && clipJson[i] <= '9'))) {
        ++i;
      }
      if (start == i) return 0;
      try {
        return std::stod(clipJson.substr(start, i - start));
      } catch (...) {
        return 0;
      }
    };
    auto readVec3 = [&](size_t& i, double v[3]) {
      skipWs(clipJson, i);
      if (i >= clipJson.size() || clipJson[i] != '[') return;
      ++i;
      for (int k = 0; k < 3; ++k) {
        v[k] = readNumber(i);
        skipWs(clipJson, i);
        if (i < clipJson.size() && clipJson[i] == ',') ++i;
      }
      skipWs(clipJson, i);
      if (i < clipJson.size() && clipJson[i] == ']') ++i;
    };
    size_t i = 0;
    skipWs(clipJson, i);
    if (i < clipJson.size() && clipJson[i] == '[') {
      ++i;
      while (i < clipJson.size()) {
        skipWs(clipJson, i);
        if (i < clipJson.size() && clipJson[i] == ']') break;
        if (i >= clipJson.size() || clipJson[i] != '{') break;
        ++i;
        vnd::ClipPlane cp{};
        while (i < clipJson.size() && clipJson[i] != '}') {
          skipWs(clipJson, i);
          if (i >= clipJson.size() || clipJson[i] != '"') break;
          ++i;
          size_t keyStart = i;
          while (i < clipJson.size() && clipJson[i] != '"') ++i;
          std::string key = clipJson.substr(keyStart, i - keyStart);
          if (i < clipJson.size()) ++i;
          skipWs(clipJson, i);
          if (i < clipJson.size() && clipJson[i] == ':') ++i;
          if (key == "pointMm") {
            readVec3(i, cp.pointMm);
          } else if (key == "normalMm") {
            readVec3(i, cp.normalMm);
          } else {
            // Skip unknown value (number, array, or object).
            (void)readNumber(i);
          }
          skipWs(clipJson, i);
          if (i < clipJson.size() && clipJson[i] == ',') ++i;
        }
        if (i < clipJson.size() && clipJson[i] == '}') ++i;
        clipPlanes.push_back(cp);
        skipWs(clipJson, i);
        if (i < clipJson.size() && clipJson[i] == ',') ++i;
      }
    }
  }

  vnd::MprSliceInfo info;
  try {
    info = vnd::extractVolumeRender(static_cast<long long>(jHandle), spec,
                                     jSlabThicknessMm, jStepMm, tf,
                                     clipPlanes, outPath);
  } catch (const std::exception& e) {
    throwJavaRuntime(env, e.what());
    return nullptr;
  }
  // Use the existing helper but extend with samplesPerPixel.
  jobject root = sliceInfoToHashMap(env, info);
  jclass mapCls = env->FindClass("java/util/HashMap");
  jmethodID putMethod = env->GetMethodID(
      mapCls, "put",
      "(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;");
  putInt(env, root, putMethod, "samplesPerPixel", info.samplesPerPixel);
  env->DeleteLocalRef(mapCls);
  return root;
}

extern "C" JNIEXPORT jobject JNICALL
Java_com_viveksah_vibenativedicom_VibeNativeDicomModule_nativeExtractProjectionSlab(
    JNIEnv* env, jobject /* this */, jdouble jHandle, jstring jSpecJson,
    jdouble jSlabThicknessMm, jdouble jStepMm, jint jMode,
    jstring jOutPath) {
  if (jSpecJson == nullptr || jOutPath == nullptr) {
    throwJavaRuntime(env, "extractProjectionSlab: null arg");
    return nullptr;
  }
  const char* cJson = env->GetStringUTFChars(jSpecJson, nullptr);
  const char* cOut = env->GetStringUTFChars(jOutPath, nullptr);
  if (cJson == nullptr || cOut == nullptr) {
    if (cJson) env->ReleaseStringUTFChars(jSpecJson, cJson);
    if (cOut) env->ReleaseStringUTFChars(jOutPath, cOut);
    throwJavaRuntime(env, "extractProjectionSlab: bad string encoding");
    return nullptr;
  }
  std::string specJson(cJson);
  std::string outPath(cOut);
  env->ReleaseStringUTFChars(jSpecJson, cJson);
  env->ReleaseStringUTFChars(jOutPath, cOut);

  vnd::ObliqueSpec spec;
  if (!parseObliqueSpec(specJson, spec)) {
    throwJavaRuntime(env,
                     "extractProjectionSlab: invalid ObliqueSpec JSON");
    return nullptr;
  }
  vnd::ProjectionMode mode;
  switch (static_cast<int>(jMode)) {
    case 0: mode = vnd::ProjectionMode::Mip; break;
    case 1: mode = vnd::ProjectionMode::MinIp; break;
    case 2: mode = vnd::ProjectionMode::Average; break;
    default:
      throwJavaRuntime(env, "extractProjectionSlab: invalid mode");
      return nullptr;
  }

  vnd::MprSliceInfo info;
  try {
    info = vnd::extractProjectionSlab(static_cast<long long>(jHandle), spec,
                                       jSlabThicknessMm, jStepMm, mode,
                                       outPath);
  } catch (const std::exception& e) {
    throwJavaRuntime(env, e.what());
    return nullptr;
  }
  return sliceInfoToHashMap(env, info);
}

extern "C" JNIEXPORT jobject JNICALL
Java_com_viveksah_vibenativedicom_VibeNativeDicomModule_nativeExtractObliqueSlice(
    JNIEnv* env, jobject /* this */, jdouble jHandle, jstring jSpecJson,
    jstring jOutPath) {
  if (jSpecJson == nullptr || jOutPath == nullptr) {
    throwJavaRuntime(env, "extractObliqueSlice: null arg");
    return nullptr;
  }
  const char* cJson = env->GetStringUTFChars(jSpecJson, nullptr);
  const char* cOut = env->GetStringUTFChars(jOutPath, nullptr);
  if (cJson == nullptr || cOut == nullptr) {
    if (cJson) env->ReleaseStringUTFChars(jSpecJson, cJson);
    if (cOut) env->ReleaseStringUTFChars(jOutPath, cOut);
    throwJavaRuntime(env, "extractObliqueSlice: bad string encoding");
    return nullptr;
  }
  std::string specJson(cJson);
  std::string outPath(cOut);
  env->ReleaseStringUTFChars(jSpecJson, cJson);
  env->ReleaseStringUTFChars(jOutPath, cOut);

  // Tiny JSON parser for the ObliqueSpec shape. Fields are predictable:
  // 3 number-arrays + 2 ints + 1 number. We don't pull in a JSON dep
  // for this one shape — same approach as the SR + volume builders.
  auto skipWs = [](const std::string& s, size_t& i) {
    while (i < s.size() && (s[i] == ' ' || s[i] == '\t' || s[i] == '\n' ||
                             s[i] == '\r' || s[i] == '\f'))
      ++i;
  };
  auto findKey = [&](const std::string& s, const std::string& key) -> size_t {
    const std::string needle = "\"" + key + "\"";
    size_t pos = s.find(needle);
    if (pos == std::string::npos) return std::string::npos;
    pos += needle.size();
    skipWs(s, pos);
    if (pos >= s.size() || s[pos] != ':') return std::string::npos;
    ++pos;
    skipWs(s, pos);
    return pos;
  };
  auto readDouble = [&](size_t& i) -> double {
    skipWs(specJson, i);
    size_t start = i;
    while (i < specJson.size() &&
           (specJson[i] == '-' || specJson[i] == '+' || specJson[i] == '.' ||
            specJson[i] == 'e' || specJson[i] == 'E' ||
            (specJson[i] >= '0' && specJson[i] <= '9'))) {
      ++i;
    }
    if (start == i) return 0;
    try {
      return std::stod(specJson.substr(start, i - start));
    } catch (...) {
      return 0;
    }
  };
  auto readVec = [&](const std::string& key, double out[3]) -> bool {
    size_t pos = findKey(specJson, key);
    if (pos == std::string::npos) return false;
    if (pos >= specJson.size() || specJson[pos] != '[') return false;
    ++pos;
    out[0] = readDouble(pos);
    skipWs(specJson, pos);
    if (pos < specJson.size() && specJson[pos] == ',') ++pos;
    out[1] = readDouble(pos);
    skipWs(specJson, pos);
    if (pos < specJson.size() && specJson[pos] == ',') ++pos;
    out[2] = readDouble(pos);
    return true;
  };

  vnd::ObliqueSpec spec;
  if (!readVec("centerMm", spec.centerMm) || !readVec("uMm", spec.uMm) ||
      !readVec("vMm", spec.vMm)) {
    throwJavaRuntime(env,
                     "extractObliqueSlice: missing centerMm/uMm/vMm");
    return nullptr;
  }
  size_t pos = findKey(specJson, "columns");
  if (pos != std::string::npos) spec.columns = static_cast<int>(readDouble(pos));
  pos = findKey(specJson, "rows");
  if (pos != std::string::npos) spec.rows = static_cast<int>(readDouble(pos));
  pos = findKey(specJson, "pixelSpacingMm");
  if (pos != std::string::npos) spec.pixelSpacingMm = readDouble(pos);

  vnd::MprSliceInfo info;
  try {
    info = vnd::extractObliqueSlice(static_cast<long long>(jHandle), spec,
                                     outPath);
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
  putDouble(env, root, putMethod, "byteLength",
            static_cast<double>(info.byteLength));
  putInt(env, root, putMethod, "rows", info.rows);
  putInt(env, root, putMethod, "columns", info.columns);
  putInt(env, root, putMethod, "bitsAllocated", info.bitsAllocated);
  putInt(env, root, putMethod, "pixelRepresentation",
         info.pixelRepresentation);
  putDouble(env, root, putMethod, "pixelSpacingRow", info.pixelSpacingRow);
  putDouble(env, root, putMethod, "pixelSpacingCol", info.pixelSpacingCol);
  env->DeleteLocalRef(mapCls);
  return root;
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_viveksah_vibenativedicom_VibeNativeDicomModule_nativeWriteSyntheticVolumeSeries(
    JNIEnv* env, jobject /* this */, jstring jOutDir, jint jN,
    jdouble jSpacing, jstring jTsUid, jboolean jGappedZ) {
  if (jOutDir == nullptr) {
    throwJavaRuntime(env, "writeSyntheticVolumeSeries: null outDir");
    return nullptr;
  }
  const char* cDir = env->GetStringUTFChars(jOutDir, nullptr);
  if (cDir == nullptr) {
    throwJavaRuntime(env, "writeSyntheticVolumeSeries: bad encoding");
    return nullptr;
  }
  std::string outDir(cDir);
  env->ReleaseStringUTFChars(jOutDir, cDir);

  std::string tsUid;
  if (jTsUid != nullptr) {
    const char* cTs = env->GetStringUTFChars(jTsUid, nullptr);
    if (cTs != nullptr) {
      tsUid.assign(cTs);
      env->ReleaseStringUTFChars(jTsUid, cTs);
    }
  }

  std::vector<std::string> paths;
  try {
    paths = vnd::writeSyntheticVolumeSeries(
        outDir, static_cast<int>(jN), jSpacing, tsUid,
        jGappedZ == JNI_TRUE);
  } catch (const std::exception& e) {
    throwJavaRuntime(env, e.what());
    return nullptr;
  }

  // Build a JSON array of strings inline. Escape backslashes + quotes
  // so the output round-trips through JSON.parse on the JS side.
  std::string out = "[";
  for (size_t i = 0; i < paths.size(); ++i) {
    if (i > 0) out.push_back(',');
    out.push_back('"');
    for (char c : paths[i]) {
      if (c == '\\' || c == '"') out.push_back('\\');
      out.push_back(c);
    }
    out.push_back('"');
  }
  out.push_back(']');
  return env->NewStringUTF(out.c_str());
}
