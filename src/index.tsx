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
