// Build-time switches. Kept in their own module so pages that only need these (like the Login page)
// don't pull in the mock data bundle.
export const API_URL = import.meta.env.VITE_API_URL ?? '/api';
export const USE_MOCKS = (import.meta.env.VITE_USE_MOCKS ?? 'true') === 'true';
/** 'api' signs in against astro-api; 'mock' skips sign-in and uses the sample session in config.ts. */
export const AUTH_MODE: 'api' | 'mock' = import.meta.env.VITE_AUTH === 'mock' ? 'mock' : 'api';
