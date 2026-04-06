/* eslint-disable @typescript-eslint/no-explicit-any */
import { pipeline, env } from '@huggingface/transformers';

// Configure ONNX to use WASM backend, single thread for iOS compatibility
(env as any).backends.onnx.wasm.numThreads = 1;

let transcriber: any = null;
let currentModel: string | null = null;

async function resampleTo16kMono(audioData: ArrayBuffer): Promise<Float32Array> {
  const offlineCtx = new OfflineAudioContext(1, 1, 16000);
  const decoded = await offlineCtx.decodeAudioData(audioData.slice(0));

  const targetCtx = new OfflineAudioContext(
    1,
    Math.ceil(decoded.duration * 16000),
    16000,
  );
  const bufferSource = targetCtx.createBufferSource();
  bufferSource.buffer = decoded;
  bufferSource.connect(targetCtx.destination);
  bufferSource.start();

  const rendered = await targetCtx.startRendering();
  return rendered.getChannelData(0);
}

self.onmessage = async (e: MessageEvent) => {
  const { type, audioData, model } = e.data as {
    type: string;
    audioData?: ArrayBuffer;
    model?: string;
  };

  if (type === 'preload' && model) {
    try {
      self.postMessage({ type: 'progress', stage: 'loading-model' });
      transcriber = await pipeline(
        'automatic-speech-recognition',
        `Xenova/whisper-${model}`,
        { dtype: 'q8' } as any,
      );
      currentModel = model;
      self.postMessage({ type: 'preload-complete' });
    } catch (err: any) {
      self.postMessage({ type: 'error', message: err.message });
    }
    return;
  }

  if (type === 'transcribe' && audioData && model) {
    try {
      if (!transcriber || currentModel !== model) {
        self.postMessage({ type: 'progress', stage: 'loading-model' });
        transcriber = await pipeline(
          'automatic-speech-recognition',
          `Xenova/whisper-${model}`,
          { dtype: 'q8' } as any,
        );
        currentModel = model;
      }

      self.postMessage({ type: 'progress', stage: 'transcribing' });

      const audio16k = await resampleTo16kMono(audioData);

      const result: any = await transcriber(audio16k, {
        return_timestamps: true,
        chunk_length_s: 30,
        stride_length_s: 5,
      });

      const segments = (result.chunks ?? []).map((c: any) => ({
        start: c.timestamp[0] ?? 0,
        end: c.timestamp[1] ?? 0,
        text: (c.text as string).trim(),
      }));

      const text = segments.map((s: any) => s.text).join(' ');

      self.postMessage({
        type: 'result',
        transcript: {
          text: text || (result.text ?? '').trim(),
          segments,
          source: 'local',
          model: `whisper-${model}`,
        },
      });
    } catch (err: any) {
      self.postMessage({ type: 'error', message: err.message });
    }
  }
};
