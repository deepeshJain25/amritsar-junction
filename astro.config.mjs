import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

// The live domain is still to be confirmed. Canonical links, Open Graph URLs and the sitemap all build from `site`.
export default defineConfig({
  site: 'https://www.amritsarjunction.com.au',
  integrations: [react(), sitemap()],
});
