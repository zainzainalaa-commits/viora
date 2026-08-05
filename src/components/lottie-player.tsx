import lottie, { type AnimationItem } from "lottie-web";
import { useEffect, useRef } from "react";

type Props = {
  data: object;
  className?: string;
  loop?: boolean;
  autoplay?: boolean;
  speed?: number;
};

export function LottiePlayer({ data, className, loop = true, autoplay = true, speed = 1 }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const animRef = useRef<AnimationItem | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const anim = lottie.loadAnimation({
      container: ref.current,
      renderer: "svg",
      loop,
      autoplay,
      animationData: data,
    });
    anim.setSpeed(speed);
    animRef.current = anim;
    return () => {
      anim.destroy();
      animRef.current = null;
    };
  }, [data, loop, autoplay, speed]);

  return <div ref={ref} className={className} aria-hidden />;
}
