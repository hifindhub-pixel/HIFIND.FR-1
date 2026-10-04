import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
test('every inline script parses before deployment',()=>{
 for(const script of scripts) if(script.trim()) assert.doesNotThrow(()=>new vm.Script(script));
});
const detail=html.slice(html.indexOf('var DETAIL_REQUEST = 0;'),html.indexOf('// ══ FAVORITES'));
test('premium detail fetches real offers, preserves unknown shipping and renders prices',async()=>{
 const host={};let rendered;
 const p={id:'a',title:'Produit test',ean_offers:[
  {program_title:'A',price:'100',shipping_cost:null,url:'https://example.invalid/a'},
  {program_title:'B',price:'120',shipping_cost:0,url:'https://example.invalid/b',in_stock:true}
 ]};
 const ctx=vm.createContext({currentResults:[],favorites:[],homeProductsCache:{},document:{getElementById:()=>host},
  showPage(){},apiFetch:async()=>({data:[p]}),normalizeMerchant:s=>s,extractConditionClient:()=> 'neuf',
  fmtDeliveryTime:x=>x,escHtml:s=>String(s),getImageUrl:()=>null,fmtEur:n=>n+' €',
  ICO:{heart:()=>'',box:'',arrow:''},renderOfferRows:o=>{rendered=o;return 'REAL_OFFERS';},renderPriceIntelligence:()=>'',renderSimilar(){}});
 vm.runInContext(detail,ctx);
 await vm.runInContext("openDetail('a')",ctx);
 assert.equal(rendered.length,2);assert.equal(rendered[0].shipping,null);
 assert.equal(rendered[0].total,null);assert.equal(rendered[1].total,120);
 assert.match(host.innerHTML,/REAL_OFFERS/);assert.match(host.innerHTML,/100 €/);
 assert.equal(ctx.CURRENT_OFFERS[0].url,p.ean_offers[0].url);
});

test('offer comparison separates product price from known delivered total',()=>{
 const rendered={innerHTML:''};
 const ctx=vm.createContext({
  document:{getElementById:()=>rendered},getFavicon:()=>'',escHtml:s=>String(s),fmtEur:n=>n+' €',
  fmtRelativeDate:()=>'',CONDITION_LABELS:{new:'Neuf'},trackOfferClick(){}
 });
 const offerCode=html.slice(html.indexOf('var CURRENT_OFFERS = [];'),html.indexOf('async function renderSimilar'));
 vm.runInContext(offerCode,ctx);
 ctx.CURRENT_OFFERS=[
  {merchant:'Port inconnu',price:90,shipping:null,total:null,url:'#',condition:'new'},
  {merchant:'Livré moins cher',price:95,shipping:0,total:95,url:'#',condition:'new'},
  {merchant:'Livré plus cher',price:92,shipping:10,total:102,url:'#',condition:'new'},
 ];
 vm.runInContext("sortOffers('total')",ctx);
 assert.ok(rendered.innerHTML.indexOf('Livré moins cher') < rendered.innerHTML.indexOf('Livré plus cher'));
 assert.ok(rendered.innerHTML.indexOf('Livré plus cher') < rendered.innerHTML.indexOf('Port inconnu'));
 assert.match(rendered.innerHTML,/Meilleur prix total/);
 assert.match(rendered.innerHTML,/Prix produit le plus bas/);
});
