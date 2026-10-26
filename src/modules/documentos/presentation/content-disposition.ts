/** RFC 5987 `filename*`, plus an ASCII `filename` for clients that ignore it. */
export function contentDisposition(fileName: string, inline: boolean): string {
  const fallback = fileName.replace(/[^\x20-\x7e]|["\\]/gu, '_');
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  const type = inline ? 'inline' : 'attachment';
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
