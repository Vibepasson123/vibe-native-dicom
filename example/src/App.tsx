import { useEffect, useState } from 'react';
import {
  Text,
  View,
  StyleSheet,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import {
  multiply,
  getGdcmVersion,
  writeSyntheticDicom,
  readDicom,
  type DicomFile,
} from '@viveksah/vibe-native-dicom';

const EXPECTED_GDCM_VERSION = '3.2.5';

type RoundTripState =
  | { kind: 'pending' }
  | { kind: 'pass'; path: string; parsed: DicomFile }
  | { kind: 'fail'; message: string };

export default function App() {
  const product = multiply(3, 7);

  const [version, setVersion] = useState<string | null>(null);
  const [parityPass, setParityPass] = useState<boolean | null>(null);
  const [roundTrip, setRoundTrip] = useState<RoundTripState>({
    kind: 'pending',
  });

  useEffect(() => {
    try {
      const v = getGdcmVersion();
      setVersion(v);
      setParityPass(v === EXPECTED_GDCM_VERSION);
    } catch (err) {
      setVersion(`error: ${(err as Error).message}`);
      setParityPass(false);
    }

    try {
      const path = writeSyntheticDicom();
      const parsed = readDicom(path);
      setRoundTrip({ kind: 'pass', path, parsed });
    } catch (err) {
      setRoundTrip({ kind: 'fail', message: (err as Error).message });
    }
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.heading}>vibe-native-dicom — Phase 2.1</Text>

      <Text style={styles.label}>Platform</Text>
      <Text style={styles.value}>{Platform.OS}</Text>

      <Text style={styles.label}>multiply(3, 7)</Text>
      <Text style={styles.value}>{product}</Text>

      <Text style={styles.label}>GDCM version</Text>
      <Text style={styles.value}>{version ?? '…'}</Text>

      <Text style={styles.label}>Parity vs {EXPECTED_GDCM_VERSION}</Text>
      <Text style={parityPass === false ? styles.fail : styles.pass}>
        {parityPass === null ? '…' : parityPass ? 'PASS' : 'FAIL'}
      </Text>

      <Text style={styles.section}>Read/Write Round Trip</Text>
      {roundTrip.kind === 'pending' && <ActivityIndicator />}
      {roundTrip.kind === 'fail' && (
        <Text style={styles.fail}>FAIL — {roundTrip.message}</Text>
      )}
      {roundTrip.kind === 'pass' && (
        <View style={styles.block}>
          <Text style={styles.pass}>PASS</Text>
          <Text style={styles.label}>Wrote → Read</Text>
          <Text style={styles.path} numberOfLines={2}>
            {roundTrip.path}
          </Text>

          <Text style={styles.label}>Transfer syntax</Text>
          <Text style={styles.value}>{roundTrip.parsed.transferSyntaxUID}</Text>

          <Text style={styles.label}>SOP Class UID</Text>
          <Text style={styles.value}>{roundTrip.parsed.sopClassUID}</Text>

          <Text style={styles.label}>Image</Text>
          <Text style={styles.value}>
            {roundTrip.parsed.image
              ? `${roundTrip.parsed.image.rows}×${roundTrip.parsed.image.columns}, ${roundTrip.parsed.image.bitsAllocated}-bit, ${roundTrip.parsed.image.photometricInterpretation}`
              : '(no pixel data)'}
          </Text>

          <Text style={styles.label}>Pixel data</Text>
          <Text style={styles.value}>
            {roundTrip.parsed.image?.hasPixelData
              ? `${roundTrip.parsed.image.pixelDataBase64?.length ?? 0} bytes (base64)`
              : '(none)'}
          </Text>

          <Text style={styles.label}>Patient (0010,0010)</Text>
          <Text style={styles.value}>
            {roundTrip.parsed.dataset['0010,0010']?.value ?? '(missing)'}
          </Text>

          <Text style={styles.label}>Dataset element count</Text>
          <Text style={styles.value}>
            {Object.keys(roundTrip.parsed.dataset).length}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: 24,
    paddingTop: 64,
  },
  heading: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  section: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 24,
    marginBottom: 8,
    color: '#444',
  },
  label: {
    fontSize: 12,
    color: '#666',
    marginTop: 10,
  },
  value: {
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
  pass: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a7f37',
  },
  fail: {
    fontSize: 16,
    fontWeight: '700',
    color: '#cf222e',
  },
  block: {
    marginTop: 6,
  },
  path: {
    fontSize: 11,
    color: '#888',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },
});
