import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';

import { Dashboard, type DashboardViewState } from '@/features/dashboard/Dashboard';
import { StatePreviewBar } from '@/features/dashboard/components/StatePreviewBar';

const VALID_STATES: DashboardViewState[] = ['loaded', 'loading', 'empty', 'error'];

function parseState(value?: string | string[]): DashboardViewState {
  const raw = Array.isArray(value) ? value[0] : value;
  return VALID_STATES.includes(raw as DashboardViewState) ? (raw as DashboardViewState) : 'loaded';
}

/**
 * User Dashboard — the screen someone lands on once they have order data.
 *
 * Until the analysis endpoints exist there is nothing to fetch, so the view
 * state is seeded from a `?state=` query param (handy on web:
 * `/dashboard?state=empty`) and can be flipped with the dev-only preview bar.
 */
export default function DashboardRoute() {
  const params = useLocalSearchParams<{ state?: string }>();
  const [state, setState] = useState<DashboardViewState>(() => parseState(params.state));

  return (
    <>
      {/* The header band is dark blue regardless of scheme, so status bar
          content on this screen stays light even though the root layout
          otherwise follows the OS light/dark scheme. */}
      <StatusBar style="light" />
      <Dashboard state={state} onRetry={() => setState('loaded')} />
      <StatePreviewBar state={state} onChange={setState} />
    </>
  );
}
