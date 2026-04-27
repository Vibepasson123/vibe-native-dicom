import { useMemo } from 'react';
import { Text, View, StyleSheet, Platform } from 'react-native';
import { multiply, getGdcmVersion } from '@viveksah/vibe-native-dicom';

const EXPECTED_GDCM_VERSION = '3.2.5';

export default function App() {
  const product = multiply(3, 7);

  const { version, parity } = useMemo(() => {
    try {
      const v = getGdcmVersion();
      return {
        version: v,
        parity: v === EXPECTED_GDCM_VERSION ? 'pass' : 'fail',
      };
    } catch (err) {
      return { version: `error: ${(err as Error).message}`, parity: 'fail' };
    }
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>vibe-native-dicom — Phase 1 smoke test</Text>
      <Text style={styles.label}>Platform</Text>
      <Text style={styles.value}>{Platform.OS}</Text>
      <Text style={styles.label}>multiply(3, 7)</Text>
      <Text style={styles.value}>{product}</Text>
      <Text style={styles.label}>GDCM version (native)</Text>
      <Text style={styles.value}>{version}</Text>
      <Text style={styles.label}>Parity vs {EXPECTED_GDCM_VERSION}</Text>
      <Text style={parity === 'pass' ? styles.pass : styles.fail}>
        {parity.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  heading: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    color: '#666',
    marginTop: 12,
  },
  value: {
    fontSize: 18,
    fontVariant: ['tabular-nums'],
  },
  pass: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a7f37',
  },
  fail: {
    fontSize: 22,
    fontWeight: '700',
    color: '#cf222e',
  },
});
