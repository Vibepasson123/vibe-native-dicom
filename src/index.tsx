export { multiply } from './multiply';
export { getGdcmVersion } from './getGdcmVersion';
export {
  readDicom,
  writeSyntheticDicom,
  isSupportedTransferSyntax,
  extractPixelDataToFile,
} from './readDicom';
// Phase 3.1 — viewer surface (pure JS PNG path)
// Phase 3.2 — Skia GPU path (optional peer dep)
// Phase 3.3 — pan/zoom/rotate gestures (optional peer dep)
export {
  DicomImageView,
  type DicomImageViewProps,
  DicomImageViewSkia,
  type DicomImageViewSkiaProps,
  useViewerGestures,
  type ViewerTransform,
  type UseViewerGesturesResult,
  useFrameSequence,
  type FrameSequenceOptions,
  type FrameSequenceState,
  applyWindowLevel,
  type WindowLevelInput,
  bytesFromLatin1,
  encodeRgbaPng,
  pngBytesToDataUri,
} from './viewer';
export type {
  DicomElement,
  DicomDataset,
  DicomImage,
  DicomFile,
  PixelDataInfo,
} from './types';
export {
  TransferSyntaxUID,
  LOSSLESS_TRANSFER_SYNTAXES,
  LOSSY_TRANSFER_SYNTAXES,
  type TransferSyntaxUIDValue,
} from './transferSyntax';
// Phase 2.4 — DicomWeb client (QIDO-RS / WADO-RS / STOW-RS)
export {
  DicomWebClient,
  DicomWebError,
  DicomWebAuthError,
  DicomWebNotFoundError,
  DicomWebServerError,
  DicomWebNetworkError,
  DicomWebTimeoutError,
  DicomWebResponseError,
} from './dicomweb';
export type {
  AuthProvider,
  DicomJsonElement,
  DicomJsonInstance,
  DicomWebConfig,
  InstanceRef,
  QidoQueryParams,
  QueryLevel,
  SeriesRef,
  StowResult,
  StudyRef,
} from './dicomweb';
export {
  // Patient
  getPatientName,
  getPatientID,
  getPatientBirthDate,
  getPatientSex,
  // Study
  getStudyInstanceUID,
  getStudyDate,
  getStudyTime,
  getStudyDescription,
  getAccessionNumber,
  // Series
  getSeriesInstanceUID,
  getSeriesNumber,
  getSeriesDescription,
  getModality,
  // SOP / Image
  getSOPInstanceUID,
  getInstanceNumber,
  // Pixel geometry
  getPixelSpacing,
  // VOI / rescale
  getWindowCenter,
  getWindowWidth,
  getRescaleIntercept,
  getRescaleSlope,
} from './helpers';
