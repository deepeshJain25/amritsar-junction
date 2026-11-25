// Ordering analytics events (cart_item_added, checkout_started, …). No analytics provider is chosen yet,
// so each event is pushed to window.dataLayer (read by GA4 or Tag Manager) and dispatched as an "aj:track"
// DOM event that a Plausible or PostHog snippet can forward. Nothing is sent anywhere until one is added.
type Props = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    dataLayer?: object[];
  }
}

export function track(event: string, props: Props = {}) {
  if (typeof window === 'undefined') return;
  (window.dataLayer ??= []).push({ event, ...props });
  window.dispatchEvent(new CustomEvent('aj:track', { detail: { event, ...props } }));
}
