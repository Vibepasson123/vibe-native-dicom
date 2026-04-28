export { multiply } from './multiply';
export { getGdcmVersion } from './getGdcmVersion';
export {
  readDicom,
  writeSyntheticDicom,
  isSupportedTransferSyntax,
} from './readDicom';
export type {
  DicomElement,
  DicomDataset,
  DicomImage,
  DicomFile,
} from './types';
export {
  TransferSyntaxUID,
  LOSSLESS_TRANSFER_SYNTAXES,
  LOSSY_TRANSFER_SYNTAXES,
  type TransferSyntaxUIDValue,
} from './transferSyntax';
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
