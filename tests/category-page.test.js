import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageHtml, CATEGORY_META } from '../api/categorie.js';
const product={id:'1',ean:'1234567890123',title:'Téléviseur <script>alert(1)</script>',brand:'ACME',price:100,image_url:'https://example.invalid/x.jpg',product_type_label:'Téléviseurs',offers_count:2,ean_offers:[{price:100},{price:129.9}]};
test('category page is indexable and escapes catalogue data',()=>{
 const html=pageHtml({category:'high-tech',products:[product],total:8149,page:1,pages:272});
 assert.match(html,/<link rel="canonical" href="https:\/\/hifind.fr\/categorie\/high-tech">/);
 assert.match(html,/8[\s\S]*149/);assert.match(html,/100,00 €/);assert.match(html,/129,90 €/);
 assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
 assert.match(html,/Téléviseur &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.match(html,/application\/ld\+json/);assert.match(html,/rel="next"/);
 assert.match(html,/<link rel="next" href="https:\/\/hifind.fr\/categorie\/high-tech\?page=2">/);
 assert.match(html,/Prix marchands réels/);
 assert.match(html,/Aucun produit sponsorisé/);
 assert.match(html,/id="catalogueSearch"/);
 assert.match(html,/data-type="Téléviseurs"/);
 assert.match(html,/Les produits qui attirent le plus d’intérêt/);
});
test('paginated category pages expose canonical previous and next URLs',()=>{
 const html=pageHtml({category:'high-tech',products:[product],total:8149,page:2,pages:272});
 assert.match(html,/<link rel="canonical" href="https:\/\/hifind.fr\/categorie\/high-tech\?page=2">/);
 assert.match(html,/<link rel="prev" href="https:\/\/hifind.fr\/categorie\/high-tech">/);
 assert.match(html,/<link rel="next" href="https:\/\/hifind.fr\/categorie\/high-tech\?page=3">/);
});
test('all supported categories have unique titles',()=>{
 const titles=Object.values(CATEGORY_META).map(x=>x.title);
 assert.equal(new Set(titles).size,titles.length);
});
