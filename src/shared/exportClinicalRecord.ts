import type { Patient, TimelineEntry } from '../types/clinical';

export interface PrintableTimelineEntry {
  date: string;
  type: string;
  content: string;
}

/**
 * Utility to trigger a professional print view of the clinical record.
 * Uses CSS @media print to format the output as a medical report.
 */
export const exportToPdf = (patient: Patient | null, timeline: TimelineEntry[]): void => {
  if (!patient) return;
  void timeline;

  // We use the native window.print() but first we ensure the UI is ready
  // and we could potentially open a new window or use a specific print component.
  // For cost-zero, the best approach is an optimized CSS @media print.
  window.print();
};

export const formatTimelineForPrint = (timeline: TimelineEntry[]): PrintableTimelineEntry[] => {
  return timeline.map((item) => {
    const payload = item.payload;
    const rawText =
      payload &&
      typeof payload === 'object' &&
      'raw_text' in payload &&
      typeof (payload as { raw_text: unknown }).raw_text === 'string'
        ? (payload as { raw_text: string }).raw_text
        : null;
    return {
      date: new Date(item.date).toLocaleDateString(),
      type: item.label,
      content: rawText || item.description
    };
  });
};
