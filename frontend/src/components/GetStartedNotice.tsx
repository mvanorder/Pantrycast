import { createContext, useContext } from 'react';

/**
 * Every "Get started" affordance in the app - the header CTA and the landing
 * page's hero / closing-band buttons - routes through one handler. Sign-up does
 * not exist yet, so that handler surfaces the single Snackbar {@link AppShell}
 * owns rather than each screen carrying its own copy of the "not built yet"
 * message. Swap the provider's implementation for the real sign-up navigation
 * once that route exists.
 *
 * Outside an {@link AppShell} (isolated component tests, previews) the default
 * is a no-op.
 */
export const GetStartedNoticeContext = createContext<() => void>(() => {});

/** Trigger the shared "sign-up isn't wired up yet" acknowledgement. */
export function useGetStartedNotice(): () => void {
  return useContext(GetStartedNoticeContext);
}
