import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  // Phase 0 placeholder — kept until first real DICOM API lands so codegen
  // and the example app's smoke wiring don't have to migrate twice.
  multiply(a: number, b: number): number;

  // Phase 1.4 (SR-0004): returns the version string of the linked GDCM
  // library. Same string on iOS and Android (cross-platform parity).
  getGdcmVersion(): string;
}

export default TurboModuleRegistry.getEnforcing<Spec>('VibeNativeDicom');
