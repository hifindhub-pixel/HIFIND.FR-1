import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS_PER_SITEMAP, renderSitemapIndex, renderUrlSet } from '../api/sitemap.js';

test('sitemap index exposes every catalogue shard',()=>{
  const count=Math.ceil(149321/PRODUCTS_PER_SITEMAP);
  const xml=renderSitemapIndex(count,'2026-10-02');
  assert.equal(count,4);
  assert.match(xml,/<sitemapindex/);
  assert.match(xml,/https:\/\/hifind.fr\/sitemap-4.xml/);
  assert.doesNotMatch(xml,/sitemap-5\.xml/);
});

test('URL sitemap escapes catalogue content and remains standard XML',()=>{
  const xml=renderUrlSet([{loc:'https://hifind.fr/produit/a&b',lastmod:'2026-10-02',changefreq:'daily',priority:'0.6'}]);
  assert.match(xml,/<urlset/);
  assert.match(xml,/a&amp;b/);
  assert.match(xml,/<lastmod>2026-10-02<\/lastmod>/);
});
