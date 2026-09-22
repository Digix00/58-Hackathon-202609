/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_LINE_LIFF_ID?: string;
  readonly VITE_DEV_LIFF_MODE?: string;
  readonly VITE_DEV_AUTH_MODE?: string;
}
