import site from '../content/site.json';

// A value still in [square brackets] is unconfirmed: it shows on the page, but never goes into structured data for Google.
export const confirmed = (value: string | undefined) => (value && !value.includes('[') ? value : undefined);

const clean = <T extends object>(obj: T): T =>
  JSON.parse(JSON.stringify(obj, (_k, v) => (v === undefined || (Array.isArray(v) && v.length === 0) ? undefined : v)));

const dayMap: Record<string, string[]> = {
  'Monday to Thursday': ['Monday', 'Tuesday', 'Wednesday', 'Thursday'],
  'Friday and Saturday': ['Friday', 'Saturday'],
  Sunday: ['Sunday'],
};

const to24 = (t: string) => {
  const m = t.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (!m) return undefined;
  let h = Number(m[1]) % 12;
  if (m[3].toLowerCase() === 'pm') h += 12;
  return `${String(h).padStart(2, '0')}:${m[2] ?? '00'}`;
};

export function restaurantSchema(siteUrl: URL, image?: string) {
  const hours = site.hours
    .filter((h) => confirmed(h.time))
    .map((h) => {
      const [opens, closes] = h.time.split(' to ').map(to24);
      return { '@type': 'OpeningHoursSpecification', dayOfWeek: dayMap[h.days], opens, closes };
    });
  return clean({
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    '@id': new URL('/#restaurant', siteUrl).href,
    name: site.name,
    description: `${site.name} is an Indian restaurant serving ${site.description}.`,
    url: siteUrl.href,
    image,
    servesCuisine: ['Indian', 'Punjabi', 'North Indian', 'Indo-Chinese'],
    telephone: confirmed(site.phone),
    email: confirmed(site.email),
    hasMenu: new URL('/menu', siteUrl).href,
    acceptsReservations: true,
    address: confirmed(site.streetAddress)
      ? {
          '@type': 'PostalAddress',
          streetAddress: site.streetAddress,
          addressLocality: confirmed(site.locality),
          postalCode: confirmed(site.postcode),
          addressRegion: 'NSW',
          addressCountry: 'AU',
        }
      : undefined,
    openingHoursSpecification: hours,
  });
}

export function breadcrumbSchema(siteUrl: URL, trail: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [{ name: 'Home', path: '/' }, ...trail].map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: new URL(crumb.path, siteUrl).href,
    })),
  };
}
