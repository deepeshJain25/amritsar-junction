import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { defineConfig, envField } from 'astro/config';

// The live domain is still to be confirmed. Canonical links, Open Graph URLs and the sitemap all build from `site`.
export default defineConfig({
  site: 'https://www.amritsarjunction.com.au',
  // Test pages stay out of the sitemap; they also carry a noindex tag.
  integrations: [react(), sitemap({ filter: (page) => !page.includes('/order-test') })],
  // The menu is fetched from the POS storefront API when the site is built.
  // Override either value with an environment variable or a .env file.
  env: {
    schema: {
      STOREFRONT_API_URL: envField.string({ context: 'server', access: 'public', default: 'https://dev.chaseintel.com.au/api' }),
      RESTAURANT_ID: envField.string({ context: 'server', access: 'public', default: 'da070da6-42ad-4722-be8d-30a32a80bd41' }),
    },
  },
});
