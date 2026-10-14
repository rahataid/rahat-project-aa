export interface MediaItem {
  mediaUrl: string;
  filename?: string;
}

/**
 * Normalizes media into [{ mediaUrl, filename }]. Accepts the legacy shape (a mediaUrl string
 * plus a separate fileName) and the array shape, so old callers and old stored records keep working.
 */
export function toMediaItems(
  media?: string | MediaItem[] | null,
  fileName?: string
): MediaItem[] {
  if (!media) return [];
  if (typeof media === 'string') {
    return media.trim() ? [{ mediaUrl: media, filename: fileName }] : [];
  }
  if (!Array.isArray(media)) return [];
  return media.filter((m) => typeof m?.mediaUrl === 'string' && m.mediaUrl.trim());
}

/** Reads redeem `info` media, tolerating records saved before mediaUrl became an array. */
export function getInfoMedia(info?: Record<string, any> | null): MediaItem[] {
  return toMediaItems(info?.mediaUrl, info?.fileName);
}
