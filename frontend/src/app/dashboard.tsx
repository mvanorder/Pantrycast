import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';

import { HomeScreen, type HomeViewState } from '@/features/home/HomeScreen';
import { StatePreviewBar } from '@/features/home/components/StatePreviewBar';

const VALID_STATES: HomeViewState[] = ['loaded', 'loading', 'empty', 'error'];

function parseState(value?: string | string[]): HomeViewState {
  const raw = Array.isArray(value) ? value[0] : value;
  return VALID_STATES.includes(raw as HomeViewState) ? (raw as HomeViewState) : 'loaded';
}

/**
 * User Home — the screen someone lands on once they have order data.
 *
 * Until the analysis endpoints exist there is nothing to fetch, so the view
 * state is seeded from a `?state=` query param (handy on web:
 * `/dashboard?state=empty`) and can be flipped with the dev-only preview bar.
 */
export default function Index() {
  const params = useLocalSearchParams<{ state?: string }>();
  const [state, setState] = useState<HomeViewState>(() => parseState(params.state));

  return (
    <>
      {/* The header band is dark blue regardless of scheme, so status bar
          content on this screen stays light even though the root layout
          otherwise follows the OS light/dark scheme. */}
      <StatusBar style="light" />
      <HomeScreen state={state} onRetry={() => setState('loaded')} />
      <StatePreviewBar state={state} onChange={setState} />
    </>
  );
}
