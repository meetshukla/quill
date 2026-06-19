export function parseXPostId(url: string) {
  const match = url.match(/(?:x\.com|twitter\.com)\/[^/]+\/status\/(\d+)/) ?? url.match(/\/i\/web\/status\/(\d+)/);
  return match?.[1] ?? null;
}
