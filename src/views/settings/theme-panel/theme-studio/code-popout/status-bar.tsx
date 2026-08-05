import { IDE, type ThemeFile } from "./files";

export function StatusBar({
  file,
  line,
  col,
  lines,
  chars,
}: {
  file: ThemeFile;
  line: number;
  col: number;
  lines: number;
  chars: number;
}) {
  return (
    <footer
      className="flex h-9 shrink-0 items-center gap-4 px-4 text-[13px]"
      style={{ background: IDE.panel, borderTop: `1px solid ${IDE.border}`, color: IDE.textDim }}
    >
      <span
        className="flex items-center rounded-md px-2 py-0.5 text-[12.5px] font-semibold"
        style={{ background: `${file.tint}22`, color: file.tint }}
      >
        {file.lang}
      </span>
      <span className="tabular-nums">
        Ln {line}, Col {col}
      </span>
      <span className="tabular-nums">{lines} lines</span>
      <span className="tabular-nums">{chars.toLocaleString()} chars</span>
      <span className="ms-auto flex items-center gap-4">
        <span>Spaces: 2</span>
        <span>UTF-8</span>
        <span className="flex items-center gap-1.5" style={{ color: "#98c379" }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#98c379" }} />
          Live
        </span>
      </span>
    </footer>
  );
}
