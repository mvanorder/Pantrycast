import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, type DimensionValue, type ViewStyle } from 'react-native';

import { useAppTheme } from '@/theme';

type Props = {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyle;
};

/**
 * Pulsing placeholder block used by the Home screen's loading state. Layout
 * glue only — colour comes from the theme's `skeleton` token.
 */
export function Skeleton({ width = '100%', height = 16, radius, style }: Props) {
  const theme = useAppTheme();
  const [pulse] = useState(() => new Animated.Value(0.5));

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulse, {
          toValue: 0.5,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width,
          height,
          borderRadius: radius ?? theme.radius.sm,
          backgroundColor: theme.colors.skeleton,
          opacity: pulse,
        },
        style,
      ]}
    />
  );
}
