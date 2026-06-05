// Thin PostHog wrapper. Only initializes when VITE_POSTHOG_KEY is set.
// Privacy-first: NO patient IDs, names, clinical content, or any PHI is ever
// sent. Events carry only behavioral metadata (counts, methods, boolean flags).

import posthog from 'posthog-js';

let initialized = false;

export function initAnalytics(): void {
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  if (!key) return;
  posthog.init(key, {
    api_host: 'https://us.i.posthog.com',
    capture_pageview: true,
    capture_pageleave: true,
    // Respect Do-Not-Track and ad-blocker users — degrade gracefully.
    respect_dnt: true,
    // Avoid capturing sensitive form data accidentally.
    autocapture: false,
    // No session recording — clinical app; recordings could capture PHI.
    disable_session_recording: true
  });
  initialized = true;
}

type Properties = Record<string, string | number | boolean | undefined>;

export function trackEvent(event: string, properties?: Properties): void {
  if (!initialized) return;
  try {
    posthog.capture(event, properties);
  } catch {
    // Never let analytics errors propagate to clinical features.
  }
}

export function identifyUser(userId: string): void {
  if (!initialized) return;
  try {
    // Only set the opaque user ID — no email, no name.
    posthog.identify(userId);
  } catch {
    // silent
  }
}

export function resetAnalyticsUser(): void {
  if (!initialized) return;
  try {
    posthog.reset();
  } catch {
    // silent
  }
}
