import { View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { useAppTheme } from '@/theme';

type Props = {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  /** Screen readers get the summary sentence instead of the shape. */
  accessibilityLabel?: string;
};

/**
 * Tiny decorative trend line (react-native-svg renders identically on iOS,
 * Android and web). Purely illustrative, so it is hidden from screen readers
 * unless the caller supplies a label.
 */
export function Sparkline({ data, width = 56, height = 22, color, accessibilityLabel }: Props) {
  const theme = useAppTheme();
  const stroke = color ?? theme.colors.brandBright;

  const padding = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const stepX = data.length > 1 ? (width - padding * 2) / (data.length - 1) : 0;

  const points = data.map((value, index) => {
    const x = padding + index * stepX;
    const y = padding + (1 - (value - min) / span) * (height - padding * 2);
    return { x, y };
  });
  const last = points[points.length - 1];

  return (
    <View
      accessible={!!accessibilityLabel}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? 'yes' : 'no-hide-descendants'}
      style={{ width, height }}>
      <Svg width={width} height={height}>
        <Polyline
          points={points.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke={stroke}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Circle cx={last.x} cy={last.y} r={2.5} fill={stroke} />
      </Svg>
    </View>
  );
}
