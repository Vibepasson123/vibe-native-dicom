// Tells consumer apps' React Native autolinker how this library should be
// included on each platform. See docs/architecture/native-build.md §6 for
// the underlying decision.
//
// Android: we explicitly null-out cmakeListsPath. By default the autolinker
// includes our library's auto-generated build/generated/source/codegen/jni/
// CMakeLists.txt in the consumer app's CMake configure, which defines a
// react_codegen_<Spec> target. The consumer app's own autolink-generated
// codegen CMakeLists *also* defines the same target — hence a duplicate-
// target error at app build time. We don't need our codegen CMakeLists
// to be picked up because we ship our compiled JNI as a prebuilt .so per
// ABI (built via android/scripts/build-vibenative-jni.sh, packaged via
// jniLibs/). The consumer app's codegen handles the JSI wrapper exactly
// once.

module.exports = {
  dependency: {
    platforms: {
      ios: {},
      android: {
        cmakeListsPath: null,
      },
    },
  },
};
