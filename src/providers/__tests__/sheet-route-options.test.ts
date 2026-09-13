import { radii, semanticColors, sheet } from '@/shared/ui/theme';

import { contentSheet, editorSheet, workflowSheet } from '../sheet-route-options';

describe('native sheet route options', () => {
  it('shares one canonical shell: form sheet, white surface, Souris radius, Souris grabber', () => {
    for (const options of [workflowSheet, editorSheet, contentSheet]) {
      expect(options.presentation).toBe('formSheet');
      expect(options.headerShown).toBe(false);
      expect(options.contentStyle).toEqual({ backgroundColor: semanticColors.surfaceElevated });
      expect(options.sheetCornerRadius).toBe(radii.ios.sheet);
      expect(options.sheetGrabberVisible).toBe(false);
    }
  });

  it('never lets a workflow (creation, editing, sale) dismiss on a swipe', () => {
    expect(workflowSheet.gestureEnabled).toBe(false);
    expect(workflowSheet.sheetAllowedDetents).toEqual([sheet.detent]);
  });

  it('sizes read-first sheets to their content', () => {
    expect(contentSheet.sheetAllowedDetents).toBe('fitToContents');
    expect(editorSheet.sheetAllowedDetents).toBe('fitToContents');
  });
});
