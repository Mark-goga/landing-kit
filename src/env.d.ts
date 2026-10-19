/// <reference types="astro/client" />

interface Window {
  /** Analytics dispatcher injected by the consuming site's tracking setup (Clarity/GA). */
  fluxoTrack?: (name: string, params?: object) => void;
  turnstile?: {
    reset: (widget: Element) => void;
  };
}
