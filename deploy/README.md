# Deploying to Cloudflare

The site is fully static. This folder deploys the built `dist/` as a static-assets Worker, kept apart from the
Astro project so Cloudflare's setup does not add a server adapter to the site.

From the project root:

```bash
npm run deploy
```

That builds the site, copies `dist/` into `deploy/public/` and runs `cf deploy` here. You need to be signed in
with `cf auth login`. Test URL: https://amritsar-junction.anzunited.workers.dev

## Automatic deploys from GitHub

The same Worker is connected to https://github.com/ANZ-unitedtelecom/amritsar-junction-sydney through Cloudflare
Workers Builds. Every push to `main` runs `npm run build` and then `npx wrangler deploy`, which reads
`wrangler.jsonc` at the project root. Keep that file's name, compatibility date and observability setting in step
with `cloudflare.config.ts` here.

The menu is fetched from the POS API during the build, so you can also re-run the latest build from the
Cloudflare dashboard to pick up POS menu changes without pushing code.
