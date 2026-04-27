// Default RN autolink config — no overrides needed.
// We rely on `codegenConfig.includesGeneratedCode = true` (in package.json)
// to instruct consumer apps to skip codegen for our spec; our library's
// own gradle build emits the codegen CMakeLists at the default location
// (android/build/generated/source/codegen/jni/CMakeLists.txt), which the
// consumer app's autolink picks up via Android-autolinking.cmake.
//
// History: an earlier attempt set `cmakeListsPath: null` to suppress the
// autolink add_subdirectory() call, but @react-native-community/cli does a
// truthiness check (not a null check) and silently falls back to the
// default path. The proper fix is `includesGeneratedCode: true`.

module.exports = {
  dependency: {
    platforms: {
      ios: {},
      android: {},
    },
  },
};
