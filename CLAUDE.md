# Viora — working rules

## The navigation and focus system is locked

Do not change how the remote moves around this app without the owner asking for
it, by name, in that session. This is not a style preference; it is a system that
was rebuilt against measurements on a real device, and every casual edit to it so
far has cost a day.

Locked:

- `src/lib/tv-focus/**` — the whole directory. `keys.ts`, `focus-layer.tsx`,
  `provider.tsx` and `focus-modal.tsx` in particular.
- The Back handler in `src/App.tsx` (`useBackHandler`, the sidebar/stack rules).
- Anything that calls `setFocusSafely`, declares a `focusKey`, sets
  `isFocusBoundary`, or names a `preferredChildFocusKey`.

The rules it implements, so a change can be recognised as a change:

1. **A screen is a closed region.** Every `FocusLayer` is a focus boundary. The
   D-pad cannot leave the screen it is on — up, down, left or right. The
   navigation rail sits outside every layer and is therefore unreachable by
   arrows, from anywhere, on every screen.
2. **The rail is reached deliberately.** Back, from the root of a screen, hands
   focus to the rail on the entry for that screen. Back on a pushed screen leaves
   the page instead, and the screen underneath restores the card it was opened
   from. Right, from the rail, steps back into the content.
3. **Every screen keeps its own place.** A layer remembers the last control the
   viewer stood on and returns to it. The declared entry point is for a screen
   being seen for the first time, not for a return.
4. **Recovery never leaves the screen.** When focus dies, it is replaced from
   inside the region the viewer is in — the open dialog, the player, or the top
   screen — preferring that screen's declared entry point. It never falls back to
   the rail, and never to "whatever is topmost in the document", which is how the
   highlight used to end up on the Search button.
5. **A declaration outlives the placement.** A screen still fetching settles
   somewhere temporarily; when its declared entry point appears, it is claimed,
   unless the viewer has pressed something first.

If something here looks wrong, measure it on the device and report it. Do not
"improve" it.

## Verifying a change to it

Drive the emulator with the remote and check, at minimum: focus never reaches the
rail from inside a screen; opening a title lands on its main action from every
entry path; Back from a title returns to the exact card; each screen restores its
own last position.
