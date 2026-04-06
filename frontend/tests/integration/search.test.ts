import { describe, it, expect } from 'vitest';
import { filterRecordings, findMatchingSegmentTime } from '../../src/hooks/use-search';
import { MOCK_RECORDINGS, MOCK_TEXT_INDEX } from '../mocks/recordings';

describe('Search Integration', () => {
  it('finds recording by partial transcript text and returns correct seek time', () => {
    const query = 'sprint';
    const results = filterRecordings(MOCK_RECORDINGS, MOCK_TEXT_INDEX, query);

    expect(results).toHaveLength(1);
    const match = results[0];
    expect(match.recording.id).toBe('rec_1712345678901');

    // Find the segment time for playback seek
    const segments = MOCK_TEXT_INDEX[match.recording.id].segments;
    const seekTime = findMatchingSegmentTime(segments, query);
    expect(seekTime).toBe(3.2); // "let's start with the sprint updates." starts at 3.2
  });

  it('search works correctly across multiple recordings', () => {
    // "milk" is in the grocery recording transcript
    const results = filterRecordings(MOCK_RECORDINGS, MOCK_TEXT_INDEX, 'milk');
    expect(results).toHaveLength(1);
    expect(results[0].recording.id).toBe('rec_1712432078902');
  });

  it('search returns empty for a query that matches nothing', () => {
    const results = filterRecordings(MOCK_RECORDINGS, MOCK_TEXT_INDEX, 'zzznomatchzzz');
    expect(results).toHaveLength(0);
  });

  it('empty query returns all recordings including ones with no transcript', () => {
    const results = filterRecordings(MOCK_RECORDINGS, MOCK_TEXT_INDEX, '');
    expect(results).toHaveLength(MOCK_RECORDINGS.length);
  });

  it('search by location works', () => {
    const results = filterRecordings(MOCK_RECORDINGS, MOCK_TEXT_INDEX, 'new york');
    expect(results.some((r) => r.recording.id === 'rec_1712432078902')).toBe(true);
  });

  it('highlighted matches point to correct field', () => {
    const results = filterRecordings(MOCK_RECORDINGS, MOCK_TEXT_INDEX, 'morning');
    expect(results.length).toBeGreaterThan(0);
    const match = results.find((r) => r.recording.id === 'rec_1712345678901');
    expect(match).toBeDefined();
    // Could match title ("Morning Standup Notes") or transcript
    const fields = match!.matches.map((m) => m.field);
    expect(fields.some((f) => f === 'title' || f === 'transcript')).toBe(true);
  });
});
