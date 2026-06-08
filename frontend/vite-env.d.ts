/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string
  readonly VITE_FEATURE_SCHEDULING?: string
  readonly VITE_FEATURE_POST_SETTINGS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
