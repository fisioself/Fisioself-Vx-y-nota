/**
 * Utility to trigger a professional print view of the clinical record.
 * Uses CSS @media print to format the output as a medical report.
 */
export const exportToPdf = (patient, timeline) => {
  if (!patient) return;

  // We use the native window.print() but first we ensure the UI is ready
  // and we could potentially open a new window or use a specific print component.
  // For cost-zero, the best approach is an optimized CSS @media print.
  window.print();
};

export const formatTimelineForPrint = (timeline) => {
  return timeline.map(item => ({
    date: new Date(item.date).toLocaleDateString(),
    type: item.label,
    content: item.payload?.raw_text || item.description
  }));
};
