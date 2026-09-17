import { overlayMaterial, radii, sheet } from '@/shared/ui/theme';

import { contentSheet, editorSheet, workflowSheet } from '../sheet-route-options';

describe('sheet route options', () => {
  it('presents workflows as a native form sheet with the Souris surface, radius and grabber', () => {
    expect(workflowSheet.presentation).toBe('formSheet');
    expect(workflowSheet.headerShown).toBe(false);
    expect(workflowSheet.contentStyle).toEqual({ backgroundColor: overlayMaterial.surface });
    expect(workflowSheet.sheetCornerRadius).toBe(radii.ios.sheet);
    expect(workflowSheet.sheetGrabberVisible).toBe(false);
  });

  it('never lets a workflow (creation, editing, sale) dismiss on a swipe', () => {
    expect(workflowSheet.gestureEnabled).toBe(false);
  });

  it('keeps workflow sheets attached to the screen edges with the large detent', () => {
    // iOS 26 floats every smaller detent as an inset card with a gap below it.
    expect(sheet.workflowDetent).toBe(1);
    expect(workflowSheet.sheetAllowedDetents).toEqual([sheet.workflowDetent]);
  });

  it('presents content-sized sheets as transparent routes drawn by SheetScreen', () => {
    // A native sheet sized to its content floats on iOS 26; SheetScreen draws
    // the shared edge-to-edge presentation and owns its transition and gestures.
    for (const options of [editorSheet, contentSheet]) {
      expect(options.presentation).toBe('transparentModal');
      expect(options.headerShown).toBe(false);
      expect(options.animation).toBe('none');
      expect(options.contentStyle).toEqual({ backgroundColor: 'transparent' });
      expect(options.gestureEnabled).toBe(false);
    }
  });
});
