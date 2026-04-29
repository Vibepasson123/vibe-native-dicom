import { describe, it, expect } from '@jest/globals';
import {
  encodeQueryString,
  framesUrl,
  instanceUrl,
  joinUrl,
  metadataUrl,
  seriesUrl,
  studiesUrl,
  studyUrl,
} from '../url';

describe('joinUrl', () => {
  it('strips trailing slash on base and joins segments with single slashes', () => {
    expect(joinUrl('https://example.com/dicomweb/', 'studies', 'abc')).toBe(
      'https://example.com/dicomweb/studies/abc'
    );
    expect(joinUrl('https://example.com/dicomweb', 'studies')).toBe(
      'https://example.com/dicomweb/studies'
    );
  });

  it('skips empty segments', () => {
    expect(joinUrl('https://x', 'a', '', 'b')).toBe('https://x/a/b');
  });

  it('strips leading and trailing slashes from segments', () => {
    expect(joinUrl('https://x', '/a/', '/b/')).toBe('https://x/a/b');
  });
});

describe('encodeQueryString', () => {
  it('URL-encodes keys and values', () => {
    expect(encodeQueryString({ PatientID: 'A B' })).toBe('PatientID=A%20B');
  });

  it('skips undefined values', () => {
    expect(encodeQueryString({ a: '1', b: undefined, c: 2 })).toBe('a=1&c=2');
  });

  it('handles boolean values', () => {
    expect(encodeQueryString({ fuzzymatching: true })).toBe(
      'fuzzymatching=true'
    );
  });
});

describe('PS3.18 endpoint builders', () => {
  const base = 'https://pacs.example/dicomweb';

  it('studies + study URL', () => {
    expect(studiesUrl(base)).toBe(`${base}/studies`);
    expect(studyUrl(base, '1.2.3')).toBe(`${base}/studies/1.2.3`);
  });

  it('series URL collection vs single', () => {
    expect(seriesUrl(base, '1.2.3')).toBe(`${base}/studies/1.2.3/series`);
    expect(seriesUrl(base, '1.2.3', '4.5.6')).toBe(
      `${base}/studies/1.2.3/series/4.5.6`
    );
  });

  it('instances URL collection vs single', () => {
    expect(instanceUrl(base, '1.2.3', '4.5.6')).toBe(
      `${base}/studies/1.2.3/series/4.5.6/instances`
    );
    expect(instanceUrl(base, '1.2.3', '4.5.6', '7.8.9')).toBe(
      `${base}/studies/1.2.3/series/4.5.6/instances/7.8.9`
    );
  });

  it('metadata suffix', () => {
    expect(metadataUrl(studyUrl(base, '1.2.3'))).toBe(
      `${base}/studies/1.2.3/metadata`
    );
  });

  it('frames URL with comma-joined 1-based indices', () => {
    expect(framesUrl(base, '1.2.3', '4.5.6', '7.8.9', [1, 3, 7])).toBe(
      `${base}/studies/1.2.3/series/4.5.6/instances/7.8.9/frames/1,3,7`
    );
  });

  it('framesUrl rejects empty frame list', () => {
    expect(() => framesUrl(base, '1.2.3', '4.5.6', '7.8.9', [])).toThrow(
      /at least one frame/
    );
  });
});
