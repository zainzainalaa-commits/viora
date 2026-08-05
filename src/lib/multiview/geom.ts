export type ScreenRect = {
  cssLeft: number;
  cssTop: number;
  cssWidth: number;
  cssHeight: number;
  cssViewW: number;
  cssViewH: number;
};

export function screenRectForEl(el: HTMLElement): ScreenRect | null {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  return {
    cssLeft: r.left,
    cssTop: r.top,
    cssWidth: r.width,
    cssHeight: r.height,
    cssViewW: document.documentElement.clientWidth,
    cssViewH: document.documentElement.clientHeight,
  };
}
