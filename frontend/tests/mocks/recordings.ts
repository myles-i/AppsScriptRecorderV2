import type { Recording, Transcript, TextIndex } from '../../src/api/types';

export const MOCK_RECORDINGS: Recording[] = [
  {
    id: 'rec_1712345678901',
    date: '2026-04-05T10:30:00Z',
    duration: 312,
    mimeType: 'audio/mp4',
    fileSize: 1048576,
    location: { lat: 37.7749, lng: -122.4194, label: 'San Francisco, CA, US' },
    title: 'Morning Standup Notes',
    preview: "Good morning everyone, let's start with the sprint updates...",
    transcriptionSource: 'openai',
    transcriptionModel: 'whisper-1',
    hasTranscript: true,
  },
  {
    id: 'rec_1712432078902',
    date: '2026-04-06T08:15:00Z',
    duration: 185,
    mimeType: 'audio/mp4',
    fileSize: 614400,
    location: { lat: 40.7128, lng: -74.006, label: 'New York, NY, US' },
    title: 'Grocery Run Plans',
    preview: 'Need to pick up milk, eggs, and bread from the store...',
    transcriptionSource: 'local',
    transcriptionModel: 'whisper-tiny',
    hasTranscript: true,
  },
  {
    id: 'rec_1712518478903',
    date: '2026-04-07T14:45:00Z',
    duration: 92,
    mimeType: 'audio/webm',
    fileSize: 307200,
    location: null,
    title: null,
    preview: null,
    transcriptionSource: null,
    transcriptionModel: null,
    hasTranscript: false,
  },
];

export const MOCK_TRANSCRIPTS: Record<string, Transcript> = {
  rec_1712345678901: {
    text: "Good morning everyone, let's start with the sprint updates. Alice, can you go first?",
    segments: [
      { start: 0.0, end: 3.2, text: 'Good morning everyone,' },
      { start: 3.2, end: 6.1, text: "let's start with the sprint updates." },
      { start: 6.1, end: 9.5, text: 'Alice, can you go first?' },
    ],
    source: 'openai',
    model: 'whisper-1',
  },
  rec_1712432078902: {
    text: 'Need to pick up milk, eggs, and bread from the store. Also get some coffee and maybe some fruit.',
    segments: [
      { start: 0.0, end: 4.1, text: 'Need to pick up milk, eggs, and bread from the store.' },
      { start: 4.1, end: 8.3, text: 'Also get some coffee and maybe some fruit.' },
    ],
    source: 'local',
    model: 'whisper-tiny',
  },
};

export const MOCK_TEXT_INDEX: TextIndex = {
  rec_1712345678901: {
    text: "Good morning everyone, let's start with the sprint updates. Alice, can you go first?",
    segments: MOCK_TRANSCRIPTS.rec_1712345678901.segments,
  },
  rec_1712432078902: {
    text: 'Need to pick up milk, eggs, and bread from the store. Also get some coffee and maybe some fruit.',
    segments: MOCK_TRANSCRIPTS.rec_1712432078902.segments,
  },
};
