/**
 * Format a duration in seconds to "m:ss" or "h:mm:ss".
 */
export function formatDuration(seconds: number): string {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** Same as formatDuration — alias for use with elapsed time. */
export function formatElapsedTime(seconds: number): string {
  return formatDuration(seconds);
}

/**
 * Format an ISO date string to a relative label like "Today, 10:30 AM"
 * or "Monday, Apr 5 at 10:30 AM".
 */
export function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();

  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (isToday) return `Today at ${timeStr}`;
  if (isYesterday) return `Yesterday at ${timeStr}`;

  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 7) {
    const dayName = date.toLocaleDateString([], { weekday: 'long' });
    return `${dayName} at ${timeStr}`;
  }

  return date.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Format an ISO date string to a full human-readable string, e.g.
 * "Sunday, April 5, 2026 at 10:30 AM".
 */
export function formatDateFull(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString([], {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Format a date as a plain search-matchable string, e.g. "April 5, 2026".
 */
export function formatDateSearchable(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString([], {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
}
