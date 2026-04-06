/**
 * Decode arbitrary audio data and resample it to 16 kHz mono Float32Array,
 * which is the format required by the Whisper speech recognition model.
 */
export async function resampleTo16kMono(audioData: ArrayBuffer): Promise<Float32Array> {
  // Use OfflineAudioContext solely for decodeAudioData (works in workers)
  const decodeCtx = new OfflineAudioContext(1, 1, 16000);
  const decoded = await decodeCtx.decodeAudioData(audioData.slice(0));

  // Render into a 16 kHz mono context to resample
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
