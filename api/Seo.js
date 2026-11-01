// api/seo.js
// Sirf bots (Google, Bing, WhatsApp, Facebook...) ke liye: vercel.json me user-agent rewrite se yahan aata hai.
// Normal users ko hamesha React app milti hai. Bot ko wahi index.html milti hai, bas:
//   - <head> me sahi title / description / canonical / OG / JSON-LD
//   - <div id="root"> me page ka asli content (text + links)
// Koi bhi error ho to plain index.html wapas de dete hain, taaki page kabhi fail na ho.
const SITE_URL = 'https://www.puchhuu.com';
const API_URL = (process.env.API_URL || 'https://ghar-seva-server-5o5v.onrender.com/api/v1').replace(/\/$/, '');

const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const clip = (s = '', n = 160) => {
  const t = String(s).replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};
// JSON-LD ko <script> me safe rakhne ke liye
const ld = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');

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

async function getShell(host) {
  const res = await fetch(`https://${host}/index.html`);
  return res.text();
}

function buildHead({ title, description, url, image, jsonLd, type = 'website' }) {
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<meta name="robots" content="index, follow, max-image-preview:large" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:type" content="${type}" />`,
    `<meta property="og:site_name" content="Puchhuu" />`,
    `<meta property="og:locale" content="en_IN" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    image ? `<meta property="og:image" content="${esc(image)}" />` : '',
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    image ? `<meta name="twitter:image" content="${esc(image)}" />` : '',
    ...jsonLd.map((o) => `<script type="application/ld+json">${ld(o)}</script>`),
  ].filter(Boolean).join('\n    ');
}

// index.html me se purane SEO tags hatao, naye daalo, root me content bharo
function inject(shell, head, body) {
  let html = shell
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\s+name="description"[^>]*>/i, '')
    .replace(/<meta\s+name="robots"[^>]*>/i, '')
    .replace(/<meta\s+property="og:[^>]*>/gi, '')
    .replace(/<meta\s+name="twitter:[^>]*>/gi, '');
  html = html.replace('</head>', `    ${head}\n  </head>`);
  html = html.replace(/<div id="root">[\s\S]*?<\/div>\s*<script type="module"/i, `<div id="root">${body}</div>\n    <script type="module"`);
  return html;
}

export default async function handler(req, res) {
  const { type, slug } = req.query || {};
  const host = req.headers.host || 'www.puchhuu.com';

  try {
    const shell = await getShell(host);
    if (!slug || (type !== 'service' && type !== 'category')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(shell);
    }

    let html = shell;

    if (type === 'service') {
      const r = await getJson(`/services/${encodeURIComponent(slug)}`);
      const s = r?.data?.service;
      if (!s) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(200).send(shell);
      }
      const url = `${SITE_URL}/service/${encodeURIComponent(s.slug || slug)}`;
      const image = s.images?.[0]?.url;
      const catName = s.category?.name;
      const price = Number(s.basePrice);
      const description = clip(s.description || `Book ${s.name} online with Puchhuu. Verified professionals, transparent pricing.`);
      const title = `${s.name}${catName ? ` – ${catName}` : ''} | Puchhuu`;

      const service = {
        '@context': 'https://schema.org',
        '@type': 'Service',
        name: s.name,
        description,
        url,
        serviceType: catName || s.name,
        provider: { '@type': 'Organization', name: 'Puchhuu', url: SITE_URL },
        areaServed: { '@type': 'AdministrativeArea', name: 'Rajasthan, India' },
      };
      if (image) service.image = [image];
      if (Number.isFinite(price) && price > 0) {
        service.offers = { '@type': 'Offer', price: String(price), priceCurrency: 'INR', availability: 'https://schema.org/InStock', url };
      }
      // Rating sirf tab, jab asli reviews hon
      const avg = Number(s.rating?.average);
      const count = Number(s.rating?.count);
      if (avg > 0 && count > 0) {
        service.aggregateRating = { '@type': 'AggregateRating', ratingValue: avg.toFixed(1), reviewCount: count };
      }
      const crumbs = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
          ...(s.category?.slug ? [{ '@type': 'ListItem', position: 2, name: catName, item: `${SITE_URL}/category/${encodeURIComponent(s.category.slug)}` }] : []),
          { '@type': 'ListItem', position: s.category?.slug ? 3 : 2, name: s.name, item: url },
        ],
      };

      const includes = (s.includes || []).map((i) => `<li>${esc(i)}</li>`).join('');
      const body =
        `<main><nav><a href="/">Home</a>${s.category?.slug ? ` &gt; <a href="/category/${esc(s.category.slug)}">${esc(catName)}</a>` : ''}</nav>` +
        `<h1>${esc(s.name)}</h1>` +
        (image ? `<img src="${esc(image)}" alt="${esc(s.name)}" width="600" />` : '') +
        `<p>${esc(s.description || '')}</p>` +
        (Number.isFinite(price) && price > 0 ? `<p>Price: ₹${esc(price)}</p>` : '') +
        (includes ? `<h2>Service includes</h2><ul>${includes}</ul>` : '') +
        `</main>`;

      html = inject(shell, buildHead({ title, description, url, image, jsonLd: [service, crumbs] }), body);
    } else {
      const r = await getJson(`/services/categories/${encodeURIComponent(slug)}`);
      const c = r?.data?.category;
      if (!c) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(200).send(shell);
      }
      const url = `${SITE_URL}/category/${encodeURIComponent(c.slug || slug)}`;
      const image = c.image?.url || c.icon?.url;
      const description = clip(c.description || `Book ${c.name} services online with Puchhuu. Verified professionals, transparent pricing, on-time service.`);
      const title = `${c.name} Services – Book Online | Puchhuu`;
      const page = {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: `${c.name} services`,
        description,
        url,
        isPartOf: { '@type': 'WebSite', name: 'Puchhuu', url: SITE_URL },
      };
      const crumbs = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: c.name, item: url },
        ],
      };
      const body = `<main><nav><a href="/">Home</a></nav><h1>${esc(c.name)} services</h1><p>${esc(c.description || '')}</p></main>`;
      html = inject(shell, buildHead({ title, description, url, image, jsonLd: [page, crumbs] }), body);
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).send(html);
  } catch {
    // Kuch bhi fail ho to bot ko normal SPA do
    res.redirect(302, req.url.startsWith('/api/seo') ? '/' : req.url);
  }
}