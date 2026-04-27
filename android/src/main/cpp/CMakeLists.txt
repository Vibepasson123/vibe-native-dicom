# CMakeLists for libVibeNativeDicom.so on Android.
#
# Invoked manually by android/scripts/build-vibenative-jni.sh per ABI; NOT
# auto-discovered by AGP's externalNativeBuild (see
# docs/architecture/native-build.md §6 for the duplicate-target reasoning).
#
# Inputs (passed via -D): GDCM_PREFIX = path to a per-ABI install of GDCM
# produced by android/scripts/build-gdcm.sh.

cmake_minimum_required(VERSION 3.22)
project(VibeNativeDicomNative LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

if(NOT DEFINED GDCM_PREFIX)
  message(FATAL_ERROR
    "GDCM_PREFIX not set. Pass -DGDCM_PREFIX=<path-to-per-abi-install>")
endif()

if(NOT EXISTS "${GDCM_PREFIX}/include/gdcm-3.2/gdcmVersion.h")
  message(FATAL_ERROR
    "GDCM headers not found at ${GDCM_PREFIX}/include/gdcm-3.2.\n"
    "Did android/scripts/build-gdcm.sh complete successfully?")
endif()

include_directories("${GDCM_PREFIX}/include/gdcm-3.2")
link_directories("${GDCM_PREFIX}/lib")

add_library(VibeNativeDicom SHARED VibeNativeDicom-jni.cpp)

# Static libs have to be ordered such that consumers come before providers,
# but GDCM has internal cycles. --start-group / --end-group lets the linker
# resolve symbols across the group regardless of order.
target_link_libraries(VibeNativeDicom PRIVATE
  -Wl,--start-group
  gdcmMSFF
  gdcmMEXD
  gdcmIOD
  gdcmDSED
  gdcmDICT
  gdcmCommon
  gdcmcharls
  gdcmopenjp2
  gdcmjpeg16
  gdcmjpeg12
  gdcmjpeg8
  gdcmexpat
  gdcmzlib
  gdcmuuid
  socketxx
  -Wl,--end-group
  log
)
