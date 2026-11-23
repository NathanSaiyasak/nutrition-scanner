// config.js — settings for the shared product database (Supabase, free plan).
// Both values are PUBLIC by design: Supabase's "publishable" / "anon" key only allows what the
// database rules allow (read products, and add products through the passcode-checked function).
// Leave them empty and the app keeps working with products saved on this phone only.
// The contributor passcode is NOT stored here (this repository is public): testers type it on the
// Audit log screen, and it stays on their phone.
export const SHARED_DB_URL = '';  // e.g. 'https://abcdefghijkl.supabase.co'
export const SHARED_DB_KEY = '';  // the project's publishable key (sb_publishable_…) or legacy anon key (eyJ…)
