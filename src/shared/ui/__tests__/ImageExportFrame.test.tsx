import { render } from '@testing-library/react-native';
import { PixelRatio, StyleSheet, Text } from 'react-native';

import { ImageExportFrame } from '../ImageExportFrame';

const LAYOUT = { width: 360, height: 640 };
const HIDDEN = { includeHiddenElements: true };

describe('ImageExportFrame', () => {
  afterEach(() => jest.restoreAllMocks());

  // The composition of an exported image never depends on the screen it is captured on.
  it.each([1, 2, 3, 3.5])('is the same frame on a %s× screen: the layout size, no transform', async (ratio) => {
    jest.spyOn(PixelRatio, 'get').mockReturnValue(ratio);
    const view = await render(
      <ImageExportFrame backgroundColor="#FEFBF7" layoutSize={LAYOUT} testID="frame">
        <Text testID="content">card</Text>
      </ImageExportFrame>,
    );

    const frame = view.getByTestId('frame', HIDDEN);
    expect(StyleSheet.flatten(frame.props.style)).toEqual({
      backgroundColor: '#FEFBF7',
      height: 640,
      overflow: 'hidden',
      width: 360,
    });
    // The content sits directly in the frame: nothing between them scales or moves it.
    const content = view.getByTestId('content', HIDDEN);
    expect(content.parent).toBe(frame);
    expect(frame.queryAll((node) => StyleSheet.flatten(node.props.style)?.transform !== undefined)).toEqual([]);
  });

  it('is a bitmap source: never announced, never touched, never flattened away', async () => {
    const view = await render(
      <ImageExportFrame backgroundColor="#FEFBF7" layoutSize={LAYOUT} testID="frame">
        <Text>card</Text>
      </ImageExportFrame>,
    );
    const frame = view.getByTestId('frame', HIDDEN);
    expect(frame.props.accessibilityElementsHidden).toBe(true);
    expect(frame.props.pointerEvents).toBe('none');
    expect(frame.props.collapsable).toBe(false);
  });
});
