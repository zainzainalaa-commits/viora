/**
 * TV focus system.
 *
 * The previous engine discovered focus targets by scanning the DOM for anything
 * that looked interactive. That cannot work: a runtime badge and a Play button
 * are both `<button>` with an `onClick`, so no amount of scoring tells them
 * apart, and every screen produced a new special case to exclude.
 *
 * Here nothing is focusable until it is registered. A control opts in, and the
 * tree of containers around it decides where the D-pad goes next. Text,
 * wrappers and decoration are simply absent from the model rather than filtered
 * out of it.
 */

export { TVFocusProvider } from "./provider";
export { useFocusableControl } from "./use-focusable-control";
export { FocusSection } from "./focus-section";
export { FocusRow } from "./focus-row";
export { FocusCell } from "./focus-cell";
export { FocusButton } from "./focus-button";
export { FocusModal } from "./focus-modal";
export { useFocusRow } from "./use-focus-row";
export { ScrollProvider, useFocusScroll, revealWithin, revealInNearestScroller } from "./scroll-context";
export { focusKeys, setFocusSafely, hasLiveFocus } from "./keys";
export { useBackHandler } from "./use-back-handler";
export type { FocusableControlOptions } from "./use-focusable-control";
export { FocusLayer } from "./focus-layer";
