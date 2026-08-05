import { downloadText } from "@/lib/download-text";

export async function saveSubtitleToDisk(
  url: string,
  opts: { title?: string; lang?: string; format?: string; label: string },
): Promise<boolean> {
  const res = await fetch(url);
  const text = await res.text();
  const ext = (opts.format || "srt").toLowerCase().replace(/[^a-z0-9]/g, "") || "srt";
  const base = (opts.title || opts.lang || "subtitle").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
  return downloadText(`${base}.${ext}`, text, [ext], opts.label);
}
