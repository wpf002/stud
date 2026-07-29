'use client';

import * as React from 'react';
import { API_URL } from '@/lib/api';

/**
 * The funnel beacon.
 *
 * First-party, fire-and-forget, and deliberately dumb: one POST per event,
 * nothing read back, nothing stored on the client. The channel is bucketed
 * from the referrer HERE so the full URL never leaves the browser.
 */
function bucketChannel(): string {
  try {
    const ref = document.referrer;
    if (!ref) return 'direct';
    const host = new URL(ref).hostname;
    if (host === window.location.hostname) return 'direct';
    if (/google\.|bing\.|duckduckgo\.|ecosia\./.test(host)) return 'organic';
    if (/facebook\.|instagram\.|t\.co|twitter\.|x\.com|reddit\.|tiktok\./.test(host)) return 'social';
    if (/mail\.|outlook\./.test(host)) return 'email';
    return 'referral';
  } catch {
    return 'direct';
  }
}

export function track(step: string, slug?: string) {
  try {
    // sendBeacon survives navigation, which is exactly when APPLY_STARTED fires.
    const payload = JSON.stringify({ step, slug, channel: bucketChannel() });
    const url = `${API_URL}/v1/funnel`;
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
    } else {
      void fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
        keepalive: true,
      });
    }
  } catch {
    // Analytics must never break a page. Silence is correct here.
  }
}

/** Fires once when the page mounts. */
export function FunnelBeacon({ step, slug }: { step: string; slug?: string }) {
  const fired = React.useRef(false);
  React.useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    track(step, slug);
  }, [step, slug]);
  return null;
}
