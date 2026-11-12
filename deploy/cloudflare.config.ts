import { defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    "name": "amritsar-junction",
    "compatibilityDate": "2026-11-04",
    "observability": {
      "enabled": true
    }
  }
});
