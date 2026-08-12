import { FocusButton, FocusSection } from "@/lib/tv-focus";
import { AlertTriangle, Cpu, LogOut, RotateCw, Replace } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { PlayerEngine, PlayerSnapshot } from "@/lib/player/bridge";

/**
 * What the viewer sees when a stream will not play.
 *
 * The player used to answer this by leaving: it reopened the source list, or
 * after enough attempts closed altogether, and from the sofa that looks like the
 * app falling over. Nothing here navigates on its own. It says what went wrong,
 * in the terms the failure actually came back in, and every way out is a button.
 */
export function PlaybackFailedPanel({
  errorCode,
  reason,
  alternateEngine,
  onRetry,
  onSwitchEngine,
  onPickAnother,
  onLeave,
}: {
  errorCode: PlayerSnapshot["errorCode"];
  /** The engine's own message, shown small — useful when reporting a problem. */
  reason: string | null;
  alternateEngine: PlayerEngine | null;
  onRetry: () => void;
  onSwitchEngine: () => void;
  onPickAnother: () => void;
  onLeave: () => void;
}) {
  const t = useT();

  const headline = (() => {
    switch (errorCode) {
      case "network":
        return t("This source could not be reached");
      case "source":
        return t("This source is gone");
      case "codec":
      case "decode":
        return t("This file will not play on this engine");
      default:
        return t("This source did not start");
    }
  })();

  const detail = (() => {
    switch (errorCode) {
      case "network":
        return t("The server did not answer, or the link has expired. Another source usually works.");
      case "source":
        return t("The link no longer points at a file. It was probably removed after the list was built.");
      case "codec":
      case "decode":
        return alternateEngine
          ? t("The other engine brings its own decoders and often plays exactly these files.")
          : t("Nothing on this device can decode this file. Try a different source.");
      default:
        return t("Playback did not begin. You can try again, change engine, or pick a different source.");
    }
  })();

  const engineLabel = alternateEngine === "mpv" ? "mpv" : t("the native player");

  return (
    <FocusSection
      isFocusBoundary
      className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm"
    >
      <div className="mx-6 flex w-full max-w-xl flex-col items-center gap-5 rounded-3xl border border-white/12 bg-[#101014]/95 px-8 py-8 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
          <AlertTriangle size={26} strokeWidth={2.1} />
        </span>

        <div className="flex flex-col gap-2">
          <h2 className="text-[22px] font-semibold leading-tight text-white">{headline}</h2>
          <p className="text-[14px] leading-relaxed text-white/65">{detail}</p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <FocusButton
            type="button"
            onClick={onPickAnother}
            className="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-[14px] font-semibold text-canvas transition-colors hover:bg-accent/90"
          >
            <Replace size={17} strokeWidth={2.1} />
            {t("Another source")}
          </FocusButton>

          {alternateEngine && (
            <FocusButton
              type="button"
              onClick={onSwitchEngine}
              className="flex items-center gap-2 rounded-full border border-white/18 px-5 py-2.5 text-[14px] font-medium text-white/90 transition-colors hover:bg-white/10"
            >
              <Cpu size={17} strokeWidth={2.1} />
              {t("Try {engine}", { engine: engineLabel })}
            </FocusButton>
          )}

          <FocusButton
            type="button"
            onClick={onRetry}
            className="flex items-center gap-2 rounded-full border border-white/18 px-5 py-2.5 text-[14px] font-medium text-white/90 transition-colors hover:bg-white/10"
          >
            <RotateCw size={17} strokeWidth={2.1} />
            {t("Try again")}
          </FocusButton>

          <FocusButton
            type="button"
            onClick={onLeave}
            className="flex items-center gap-2 rounded-full border border-white/18 px-5 py-2.5 text-[14px] font-medium text-white/70 transition-colors hover:bg-white/10"
          >
            <LogOut size={17} strokeWidth={2.1} />
            {t("Leave")}
          </FocusButton>
        </div>

        {reason && (
          <p className="max-w-full truncate font-mono text-[11px] text-white/35" title={reason}>
            {reason}
          </p>
        )}
      </div>
    </FocusSection>
  );
}
