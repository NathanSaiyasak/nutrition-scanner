// favorites.js — the Favorite tab: products this person saved with the heart on the result screen.
// Saved on this phone only (browser localStorage), keyed by barcode. No accounts, nothing sent anywhere.
// Like History, each item keeps the product details as they were when saved, so a favorite opens
// instantly, even without internet. Newest first; the same barcode appears once.

const STORAGE_KEY = 'bettr-favorites-v1';
const MAX_ITEMS = 200;

export function loadFavorites() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((i) => i && i.product && i.product.barcode) : [];
  } catch {
    return [];
  }
}

function saveFavorites(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
    return true;
  } catch {
    return false;
  }
}

export function isFavorite(barcode) {
  return loadFavorites().some((i) => i.product.barcode === barcode);
}

/** Save a product at the top of the list. Returns false if the phone wouldn't save it. */
export function addFavorite(product, savedAt = new Date().toISOString()) {
  const items = loadFavorites().filter((i) => i.product.barcode !== product.barcode);
  items.unshift({ savedAt, product });
  return saveFavorites(items);
}

/** Take a product off the list. Returns the removed item and where it was (for Undo), or null. */
export function removeFavorite(barcode) {
  const items = loadFavorites();
  const index = items.findIndex((i) => i.product.barcode === barcode);
  if (index < 0) return null;
  const [item] = items.splice(index, 1);
  saveFavorites(items);
  return { item, index };
}

/** Put a removed favorite back where it was (Undo). */
export function restoreFavorite({ item, index }) {
  const items = loadFavorites().filter((i) => i.product.barcode !== item.product.barcode);
  items.splice(Math.min(index, items.length), 0, item);
  return saveFavorites(items);
}

/** After a new scan, keep a saved favorite's details up to date (same place in the list). */
export function refreshFavorite(product) {
  const items = loadFavorites();
  const found = items.find((i) => i.product.barcode === product.barcode);
  if (!found) return;
  found.product = product;
  saveFavorites(items);
}
