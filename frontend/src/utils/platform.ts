/** Detect iOS (iPhone, iPad, iPod). */
export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
}

/** Detect if the app is running in standalone (installed PWA) mode. */
export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export const platform = {
  get isIOS() { return isIOS(); },
  get supportsMP4Recording() { return MediaRecorder.isTypeSupported('audio/mp4'); },
  get supportsWebM() { return MediaRecorder.isTypeSupported('audio/webm'); },
  get supportsWakeLock() { return 'wakeLock' in navigator; },
  get supportsShare() { return 'share' in navigator; },
  get supportsClipboard() {
    return 'clipboard' in navigator && 'writeText' in (navigator.clipboard ?? {});
  },
};
