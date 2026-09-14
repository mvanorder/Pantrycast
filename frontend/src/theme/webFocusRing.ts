import { useEffect } from 'react';
import { Platform } from 'react-native';

const STYLE_ID = 'pantrycast-focus-ring';

/**
 * react-native-web renders touchables as `div`s with `outline: none` applied
 * inline, so keyboard users get no visible focus indicator out of the box.
 * Inject one global `:focus-visible` rule (mouse/touch presses are unaffected
 * because `:focus-visible` only matches keyboard-driven focus).
 *
 * No-op on native, and safe during static web prerendering where `document`
 * does not exist. Re-runs when `color` changes (e.g. light <-> dark) so the
 * ring keeps contrast against the new background.
 */
export function useWebFocusRing(color: string) {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof document === 'undefined') return;

    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = `
      :focus:not(:focus-visible) { outline: none !important; }
      :focus-visible {
        outline: 3px solid ${color} !important;
        outline-offset: 2px !important;
      }
      input:not(type):focus-visible,
      input[type="text"]:focus-visible,
      textarea:focus-visible {
        outline: none !important;
      }
    `;
  }, [color]);
}
