import { useState, useMemo } from 'preact/hooks';
import type { Recording, TextIndex, TranscriptSegment } from '../api/types';
import { formatDateSearchable } from '../utils/format';

export type SearchMatchField = 'title' | 'location' | 'date' | 'transcript' | 'transcript-context';

export interface SearchMatch {
  field: SearchMatchField;
  text: string;
}

export interface SearchResult {
  recording: Recording;
  matches: SearchMatch[];
}

export function filterRecordings(
  recordings: Recording[],
  textIndex: TextIndex,
  query: string,
): SearchResult[] {
  if (!query.trim()) {
    return recordings.map((r) => ({ recording: r, matches: [] }));
  }

  const q = query.toLowerCase().trim();

  return recordings
    .map((rec) => {
      const matches: SearchMatch[] = [];

      // Match title
      if (rec.title?.toLowerCase().includes(q)) {
        matches.push({ field: 'title', text: rec.title });
      }

      // Match location
      if (rec.location?.label.toLowerCase().includes(q)) {
        matches.push({ field: 'location', text: rec.location.label });
      }

      // Match date
      const dateStr = formatDateSearchable(rec.date).toLowerCase();
      if (dateStr.includes(q)) {
        matches.push({ field: 'date', text: formatDateSearchable(rec.date) });
      }

      // Match transcript text
      const entry = textIndex[rec.id];
      if (entry) {
        const textLower = entry.text.toLowerCase();
        const idx = textLower.indexOf(q);
        if (idx !== -1) {
          matches.push({
            field: 'transcript',
            text: getSnippet(entry.text, idx, q.length),
          });

          const additional = findAdditionalSnippets(entry.text, q, idx, 3);
          for (const snippet of additional) {
            matches.push({ field: 'transcript-context', text: snippet });
          }
        }
      }

      if (matches.length === 0) return null;
      return { recording: rec, matches };
    })
    .filter((r): r is SearchResult => r !== null);
}

export function getSnippet(
  text: string,
  matchIndex: number,
  matchLength: number,
  contextChars = 80,
): string {
  const start = Math.max(0, matchIndex - contextChars);
  const end = Math.min(text.length, matchIndex + matchLength + contextChars);
  let snippet = text.substring(start, end);
  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';
  return snippet;
}

export function findAdditionalSnippets(
  text: string,
  query: string,
  firstMatchIndex: number,
  maxSnippets: number,
): string[] {
  const snippets: string[] = [];
  const q = query.toLowerCase();
  const textLower = text.toLowerCase();
  let searchFrom = firstMatchIndex + query.length;

  while (snippets.length < maxSnippets) {
    const idx = textLower.indexOf(q, searchFrom);
    if (idx === -1) break;
    snippets.push(getSnippet(text, idx, query.length));
    searchFrom = idx + query.length;
  }

  return snippets;
}

export function findMatchingSegmentTime(
  segments: TranscriptSegment[],
  query: string,
): number {
  const q = query.toLowerCase();
  for (const seg of segments) {
    if (seg.text.toLowerCase().includes(q)) return seg.start;
  }
  return 0;
}

export function useSearch(recordings: Recording[], textIndex: TextIndex) {
  const [query, setQuery] = useState('');

  const results = useMemo(
    () => filterRecordings(recordings, textIndex, query),
    [query, recordings, textIndex],
  );

  return { query, setQuery, results };
}
