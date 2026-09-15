import { useCallback, useRef } from 'react';
import { ScrollView, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { useRouter } from 'expo-router';

import { ScreenScrollView } from '@/components/ScreenScrollView';
import { useAppTheme } from '@/theme';

import { BottomCtaSection } from './components/BottomCtaSection';
import { HeroSection } from './components/HeroSection';
import { HowItWorksSection } from './components/HowItWorksSection';
import { SeeItInActionSection } from './components/SeeItInActionSection';

/**
 * Public marketing landing page ("Problem to Preview"): hero, three steps,
 * dashboard preview, closing CTA band. The top bar is global chrome
 * ({@link AppShell}) and the footer comes from {@link ScreenScrollView}, so
 * this screen is just the sections in between.
 *
 * Every "Get started" affordance on the page routes to `/signup`.
 */
export function LandingScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const handleGetStarted = useCallback(() => router.push('/signup'), [router]);
  const scrollRef = useRef<ScrollView>(null);
  const howItWorksY = useRef(0);

  const handleHowItWorksLayout = useCallback((event: LayoutChangeEvent) => {
    howItWorksY.current = event.nativeEvent.layout.y;
  }, []);

  const handleSeeHowItWorks = useCallback(() => {
    scrollRef.current?.scrollTo({ y: howItWorksY.current, animated: true });
  }, []);

  return (
    <ScreenScrollView
      scrollRef={scrollRef}
      style={[styles.root, { backgroundColor: theme.colors.background }]}
      showsVerticalScrollIndicator={false}
    >
      <HeroSection
        onGetStarted={handleGetStarted}
        onSeeHowItWorks={handleSeeHowItWorks}
      />
      <HowItWorksSection onLayout={handleHowItWorksLayout} />
      <SeeItInActionSection onGetStarted={handleGetStarted} />
      <BottomCtaSection onGetStarted={handleGetStarted} />
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
