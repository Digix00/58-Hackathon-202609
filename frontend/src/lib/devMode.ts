export const isBackendDevMode =
  import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH_MODE === 'backend'
