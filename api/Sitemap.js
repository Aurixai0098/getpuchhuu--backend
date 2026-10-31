// api/sitemap.js  ->  https://www.puchhuu.com/sitemap.xml  (vercel.json rewrite se)
// Backend se categories + services le kar sitemap banata hai. 1 ghante cache, baaki stale-while-revalidate.
const SITE_URL = 'https://www.puchhuu.com';
const API_URL = (process.env.API_URL || 'https://ghar-seva-server-5o5v.onrender.com/api/v1').replace(/\/$/, '');

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

async function getJson(path) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(`${API_URL}${path}`, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const urlTag = (loc, { lastmod, changefreq, priority } = {}) =>
  `  <url>\n    <loc>${esc(loc)}</loc>` +
  (lastmod ? `\n    <lastmod>${esc(lastmod)}</lastmod>` : '') +
  (changefreq ? `\n    <changefreq>${changefreq}</changefreq>` : '') +
  (priority ? `\n    <priority>${priority}</priority>` : '') +
  `\n  </url>`;

export default async function handler(req, res) {
  const urls = [
    urlTag(`${SITE_URL}/`, { changefreq: 'daily', priority: '1.0' }),
    urlTag(`${SITE_URL}/about`, { changefreq: 'monthly', priority: '0.4' }),
    urlTag(`${SITE_URL}/register-provider`, { changefreq: 'monthly', priority: '0.6' }),
  ];

  const catRes = await getJson('/services/categories');
  const categories = catRes?.data?.categories || [];
  categories.forEach((c) => {
    if (c.slug) urls.push(urlTag(`${SITE_URL}/category/${encodeURIComponent(c.slug)}`, { lastmod: c.updatedAt?.slice(0, 10), changefreq: 'weekly', priority: '0.8' }));
  });

  // Saari services (100-100 ke pages, max 20 page)
  for (let page = 1; page <= 20; page += 1) {
    const svcRes = await getJson(`/services?page=${page}&limit=100`);
    const services = svcRes?.data?.services || [];
    services.forEach((s) => {
      if (s.slug) urls.push(urlTag(`${SITE_URL}/service/${encodeURIComponent(s.slug)}`, { lastmod: s.updatedAt?.slice(0, 10), changefreq: 'weekly', priority: '0.7' }));
    });
    if (services.length < 100) break;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(xml);
}