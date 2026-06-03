import type { MetadataRoute } from 'next';

/**
 * Crawler policy: la landing (`/`) è indicizzabile (è marketing pubblico),
 * tutto il resto NO. Le aree applicative redirigono comunque al login, ma
 * così non finiscono nemmeno negli indici dei motori → meno superficie
 * "spulciabile" da fuori.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/office',
          '/admin',
          '/portal',
          '/mobile',
          '/api',
          '/login',
          '/accetta-invito',
          '/monitoring',
        ],
      },
    ],
  };
}
