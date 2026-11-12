# Deploying to Cloudflare

The site is fully static. This folder deploys the built `dist/` as a static-assets Worker, kept apart from the
Astro project so Cloudflare's setup does not add a server adapter to the site.

From the project root:

```bash
npm run deploy
```

That builds the site, copies `dist/` into `deploy/public/` and runs `cf deploy` here. You need to be signed in
with `cf auth login`. Test URL: https://amritsar-junction.anzunited.workers.dev
