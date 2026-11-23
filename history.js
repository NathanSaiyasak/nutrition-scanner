// history.js — the History tab: products this person has looked up, saved on this phone only
// (browser localStorage). Nothing here is sent anywhere.
// Each item keeps the product details exactly as Open Food Facts gave them at the time, so tapping it
// reopens the result screen instantly, even without internet. Newest first; the same barcode appears once.

const STORAGE_KEY = 'nutrition-scanner-history-v1';
const MAX_ITEMS = 100;

export function loadHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((i) => i && i.product && i.product.barcode) : [];
  } catch {
    return [];
  }
}

function saveHistory(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

/** Put a found product at the top of the history. Returns false if the phone wouldn't save it. */
export function addToHistory(product) {
  const items = loadHistory().filter((i) => i.product.barcode !== product.barcode);
  items.unshift({ savedAt: new Date().toISOString(), product });
  return saveHistory(items.slice(0, MAX_ITEMS));
}

export function clearHistory() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* nothing to clear */ }
}
