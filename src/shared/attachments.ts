/** Pure helpers for chat attachments (shared by the server and the chat panel). */

const IMAGE_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };

/** The image content type for a file name (by extension), or null when it is not a previewable image. */
export function imageType(name: string): string | null {
  return IMAGE_TYPES[name.split(".").pop()?.toLowerCase() ?? ""] ?? null;
}

/** Upload ids of previewable images listed in a message by `withAttachments` ("- <home>/uploads/<uuid>/<name>" lines). */
export function attachedImageIds(text: string, max = 8): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  for (const m of text.matchAll(/^- .*\/uploads\/([0-9a-f-]{36})\/([^/\n]+)$/gm)) if (imageType(m[2]!)) out.push({ id: m[1]!, name: m[2]! });
  return out.slice(0, max);
}

/** The text of a message without the "Attached files" list that `withAttachments` appended (shown as previews/chips instead). */
export function stripAttachmentList(text: string): string {
  return text.replace(/\n*Attached files \(read them when needed\):\n(?:- .*(?:\n|$))+$/, "").trimEnd();
}
