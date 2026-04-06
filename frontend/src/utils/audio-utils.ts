/** Encode an ArrayBuffer to a base64 string. */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Decode a base64 string to an ArrayBuffer. */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/** Convert an ArrayBuffer to a Blob (only at use time — avoid storing Blobs in IndexedDB on iOS). */
export function arrayBufferToBlob(buffer: ArrayBuffer, mimeType: string): Blob {
  return new Blob([buffer], { type: mimeType });
}

/** Produce a small base64 string for testing / mock data. */
export function makeFakeAudioBase64(byteLength = 128): string {
  const buf = new ArrayBuffer(byteLength);
  const view = new Uint8Array(buf);
  for (let i = 0; i < byteLength; i++) {
    view[i] = i % 256;
  }
  return arrayBufferToBase64(buf);
}

/** Combine multiple Blobs into one ArrayBuffer. */
export function blobsToArrayBuffer(blobs: Blob[]): Promise<ArrayBuffer> {
  if (blobs.length === 0) return Promise.resolve(new ArrayBuffer(0));
  const combined = new Blob(blobs);

  // Prefer the native Blob.arrayBuffer() when available (not in jsdom/Node < 20)
  if (typeof combined.arrayBuffer === 'function') {
    return combined.arrayBuffer();
  }

  // FileReader fallback for environments that don't support Blob.arrayBuffer()
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(combined);
  });
}
