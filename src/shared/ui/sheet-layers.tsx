// Souris — sheet layers
//
// Only the TOP sheet reacts to the keyboard. Keyboard events are global: a
// sheet presented from inside another one (the checkout drawer over
// « Nouvelle vente », the Client picker over an Appointment form) would
// otherwise lift and shrink the covered sheet too, and its fixed actions
// would surface behind the active sheet.
//
// Every sheet shell (SheetPresentation, the native SheetScreen shell) is a
// layer: while open, it registers with the layer it is rendered inside —
// React context crosses the Modal of a drawer — and a covered layer lets
// the keyboard pass it by.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

/** Marks the host layer as covered; the returned function uncovers it. */
type CoverHost = () => () => void;

const SheetLayerContext = createContext<CoverHost | null>(null);

/**
 * Registers this sheet as covering its host while `open`, and tells whether
 * another sheet currently covers THIS one. Render `children` inside
 * `<SheetLayer cover={layer.cover}>`.
 */
export function useSheetLayer(open: boolean): { readonly covered: boolean; readonly cover: CoverHost } {
  const coverHost = useContext(SheetLayerContext);
  const [coveringCount, setCoveringCount] = useState(0);

  useEffect(() => {
    if (!open || !coverHost) return;
    return coverHost();
  }, [open, coverHost]);

  const cover = useCallback<CoverHost>(() => {
    setCoveringCount((count) => count + 1);
    return () => setCoveringCount((count) => count - 1);
  }, []);

  return { covered: coveringCount > 0, cover };
}

export function SheetLayer({ cover, children }: { readonly cover: CoverHost; readonly children: ReactNode }) {
  return <SheetLayerContext.Provider value={cover}>{children}</SheetLayerContext.Provider>;
}
