// =============================================
// Reflect — utils.js
// Shared pure utility functions
// =============================================

export function formatDate(ts) {
  const d = new Date(Number(ts));
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

export function formatTime(ts) {
  const d = new Date(Number(ts));
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(ts) {
  const date = formatDate(ts);
  const time = formatTime(ts);
  return date && time ? `${date} · ${time}` : '';
}

export function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function pageCharCount(entries) {
  return entries.reduce((sum, e) => sum + (e.text || '').length, 0);
}

// Total entries across all pages
export function totalEntryCount(pages) {
  return pages.reduce((sum, p) => sum + p.length, 0);
}