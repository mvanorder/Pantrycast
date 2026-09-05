import type { ReactNode, RefObject } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppFooter } from './AppFooter';

type ScreenScrollViewProps = ScrollViewProps & {
  children: ReactNode;
  /**
   * Style for the growing body wrapper that sits above the footer. Put a
   * screen's page padding and any centring here rather than on
   * `contentContainerStyle`, so the footer stays full-bleed and flush to the
   * bottom edge.
   */
  bodyStyle?: StyleProp<ViewStyle>;
  /** Forwarded to the underlying `ScrollView` (e.g. for `scrollTo`). */
  scrollRef?: RefObject<ScrollView | null>;
};

/**
 * The standard scrolling body for a screen, with the global {@link AppFooter}
 * as a sticky footer: `flexGrow` on the content container plus `flex: 1` on the
 * body wrapper keeps the footer pinned to the bottom of the viewport while the
 * content is short, and lets it drop below the fold - revealed only on scroll -
 * once the content is taller than the viewport.
 *
 * The header is fixed chrome in {@link AppShell}; the footer rides the scroll
 * here so it never covers content on a long page.
 */
export function ScreenScrollView({
  children,
  bodyStyle,
  scrollRef,
  contentContainerStyle,
  ...props
}: ScreenScrollViewProps) {
  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={[styles.content, contentContainerStyle]}
      {...props}
    >
      <View style={[styles.body, bodyStyle]}>{children}</View>
      <AppFooter />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    // Without an explicit width the web scroll container shrink-wraps to its
    // widest child, which breaks percentage widths inside it.
    width: '100%',
  },
  body: {
    flex: 1,
  },
});
