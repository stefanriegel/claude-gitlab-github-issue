export interface ExtractedImage {
  alt: string;
  url: string;
}

/** Extract all markdown image references from a string */
export function extractImages(text: string): ExtractedImage[] {
  const results: ExtractedImage[] = [];
  const re = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    results.push({ alt: m[1] ?? '', url: m[2] ?? '' });
  }
  return results;
}

/** Strip markdown image syntax from text so it doesn't render as literal ![alt](url) */
export function stripImages(text: string): string {
  return text.replace(/!\[[^\]]*\]\(https?:\/\/[^)\s]+\)/g, '').trim();
}
