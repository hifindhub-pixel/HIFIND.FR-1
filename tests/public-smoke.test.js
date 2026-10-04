import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productPath, slugify, validateProductDetail, validateTrending } from '../scripts/lib/public-smoke.js';

const product={ean:'1234567890123',title:'Téléphone Premium',offers_count:2,category:'high-tech'};

test('public smoke selects a genuinely comparable product',()=>{
  assert.equal(validateTrending({data:[{ean:'bad',offers_count:9},product]}),product);
  assert.throws(()=>validateTrending({data:[]}),/vide/);
});

test('public smoke rejects duplicated or unusable merchant offers',()=>{
  const good={data:[{...product,ean_offers:[
    {program_title:'A',price:100,url:'https://a.invalid'},
    {program_title:'B',price:110,tracking_url:'https://b.invalid'},
  ]}]};
  assert.equal(validateProductDetail(good,product.ean).merchants.size,2);
  assert.throws(()=>validateProductDetail({data:[{...product,ean_offers:[
    {program_title:'A',price:100,url:'https://a.invalid'},
    {program_title:'A',price:110,url:'https://a.invalid/2'},
  ]}]}),/deux offres/);
});

test('smoke paths use stable clean slugs',()=>{
  assert.equal(slugify('Marchand & Fils'),'marchand-fils');
  assert.equal(productPath(product),'/produit/telephone-premium-1234567890123');
});
