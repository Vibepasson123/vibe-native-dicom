// Android NDK iconv shim — does nothing.
//
// Bionic (Android's libc) does not ship iconv, but GDCM's gdcmext/mec_mr3_io.c
// (Toshiba / Canon MEC MR3 vendor-extension parser) hard-includes <iconv.h>
// to convert Japanese encodings (shift-jis, euc-jp) to UTF-8. We provide this
// header on Android so the source compiles, and the stub functions return
// failure values that the upstream code's existing fallback path already
// handles gracefully (line 269 of mec_mr3_io.c emits "No iconv support" when
// iconv_open returns (iconv_t)-1).
//
// Effect on Android: the MEC MR3 vendor extension still parses everything
// except Japanese text fields, which are emitted as "No iconv support".
// No public API in @vibepasson/vibe-native-dicom exposes this vendor parser
// today (Phase 1) — see docs/regulatory/conformance-statement.md §4.
//
// On iOS, libiconv is part of the system SDK; this shim is not used there
// (the iOS build does not pass -I to this directory).
//
// Refs SR-0002 (GDCM Android integration), SR-0005 (reproducible from source).

#ifndef VIBENATIVEDICOM_ICONV_SHIM_H
#define VIBENATIVEDICOM_ICONV_SHIM_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef void *iconv_t;

static inline iconv_t iconv_open(const char *tocode, const char *fromcode) {
  (void)tocode;
  (void)fromcode;
  return (iconv_t)-1;
}

static inline size_t iconv(iconv_t cd, char **inbuf, size_t *inbytesleft,
                           char **outbuf, size_t *outbytesleft) {
  (void)cd;
  (void)inbuf;
  (void)inbytesleft;
  (void)outbuf;
  (void)outbytesleft;
  return (size_t)-1;
}

static inline int iconv_close(iconv_t cd) {
  (void)cd;
  return 0;
}

#ifdef __cplusplus
}
#endif

#endif /* VIBENATIVEDICOM_ICONV_SHIM_H */
