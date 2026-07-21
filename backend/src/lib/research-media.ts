type MediaEntry = Record<string, unknown>;
type RawResearch = Record<string, unknown>;

const videoThumbnailPattern = /\/(?:ext_tw_video_thumb|amplify_video_thumb|tweet_video_thumb|video_thumb)\//i;
const directVideoPattern = /(?:^|\/\/)(?:[^/]*\.)?video\.twimg\.com\//i;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function cleanUrl(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function isXVideoMediaUrl(value: unknown) {
  const url = cleanUrl(value);
  return videoThumbnailPattern.test(url) || directVideoPattern.test(url);
}

export function backfillResearchVideoMedia(rawValue: unknown, itemUrl: string) {
  const raw = asRecord(rawValue);
  if (!raw || !Array.isArray(raw.media)) return { raw: rawValue, changed: false, videoEntries: 0 };

  let changed = false;
  let videoEntries = 0;
  const media = raw.media.map((value) => {
    const entry = asRecord(value);
    if (!entry) return value;
    const url = cleanUrl(entry.url);
    const type = cleanUrl(entry.type);
    if (type !== "video" && !isXVideoMediaUrl(url)) return value;

    videoEntries += 1;
    const next: MediaEntry = {
      ...entry,
      type: "video",
      url,
      posterUrl: cleanUrl(entry.posterUrl) || (directVideoPattern.test(url) ? "" : url),
      sourceUrl: itemUrl,
      playableOnSource: directVideoPattern.test(url) ? entry.playableOnSource ?? false : true
    };
    if (JSON.stringify(next) !== JSON.stringify(entry)) changed = true;
    return next;
  });

  return { raw: changed ? { ...raw, media } : rawValue, changed, videoEntries };
}
