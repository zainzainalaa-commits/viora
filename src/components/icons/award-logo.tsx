const BAFTA_GOLD = "#CA9200";

export function laurelColorFor(type: string): string {
  switch (type) {
    case "oscar":
      return "#D4AF37";
    case "emmy":
      return "#D4AF37";
    case "golden_globe":
      return "#D4AF37";
    case "bafta":
      return "#CA9200";
    case "critics_choice":
      return "#CE8819";
    case "sag":
      return "#B08D57";
    case "cannes":
      return "#DAA520";
    case "venice":
      return "#DAA520";
    case "berlin":
      return "#BFBFBF";
    default:
      return "#D4AF37";
  }
}

export function AwardLogo({ type, size = 22 }: { type: string; size?: number }) {
  switch (type) {
    case "bafta":
      return (
        <span
          aria-hidden
          className="inline-block"
          style={{
            width: size * 0.85,
            height: size * 1.0,
            backgroundColor: BAFTA_GOLD,
            WebkitMaskImage: "url(/awards/bafta.png)",
            maskImage: "url(/awards/bafta.png)",
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
            maskPosition: "center",
            WebkitMaskSize: "contain",
            maskSize: "contain",
          }}
        />
      );
    case "emmy":
      return (
        <img
          src="/awards/emmy.png"
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          draggable={false}
          style={{ height: size * 1.1, width: "auto" }}
        />
      );
    case "oscar":
      return (
        <img
          src="/awards/oscar.png"
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          draggable={false}
          style={{ height: size * 1.15, width: "auto" }}
        />
      );
    case "golden_globe":
      return (
        <img
          src="/awards/golden-globe.png"
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          draggable={false}
          style={{ height: size * 1.15, width: "auto" }}
        />
      );
    case "sag":
      return (
        <img
          src="/awards/sag.png"
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          draggable={false}
          style={{ height: size * 1.15, width: "auto" }}
        />
      );
    case "berlin":
      return (
        <img
          src="/awards/berlin.png"
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          draggable={false}
          style={{ height: size * 1.2, width: "auto" }}
        />
      );
    case "cannes":
      return (
        <img
          src="/awards/cannestrophy.png"
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          draggable={false}
          style={{ height: size * 1.2, width: "auto" }}
        />
      );
    case "venice":
      return (
        <img
          src="/awards/venice.webp"
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          draggable={false}
          style={{ height: size * 1.2, width: "auto" }}
        />
      );
    case "critics_choice":
      return (
        <img
          src="/awards/critics-choice.png"
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          draggable={false}
          style={{
            height: size * 1.1,
            width: "auto",
            filter: "saturate(0.4) sepia(0.85) hue-rotate(-12deg) brightness(1.05)",
          }}
        />
      );
    default:
      return (
        <img
          src="/awards/oscar.png"
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          draggable={false}
          style={{ height: size * 1.15, width: "auto" }}
        />
      );
  }
}
