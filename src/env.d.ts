/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Neon Auth URL for this branch, injected from NEON_AUTH_BASE_URL by vite.config.ts. */
  readonly VITE_NEON_AUTH_URL: string
}
