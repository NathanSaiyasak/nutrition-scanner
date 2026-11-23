// config.js — settings for the shared product database (Supabase, free plan).
// Both values are PUBLIC by design: Supabase's "publishable" / "anon" key only allows what the
// database rules allow (read products, and add products through the passcode-checked function).
// Leave them empty and the app keeps working with products saved on this phone only.
// The contributor passcode is NOT stored here (this repository is public): testers type it on the
// Audit log screen, and it stays on their phone.
export const SHARED_DB_URL = 'https://pzkbnlnefyxsdsrognix.supabase.co';
export const SHARED_DB_KEY = 'sb_publishable_AqIqA2zn369jV3Kx0aKKiA_M-aprO3E'; // publishable key (public)
