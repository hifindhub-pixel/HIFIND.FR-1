import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('inline scripts remain valid',()=>{for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) if(m[1].trim()) new vm.Script(m[1]);});
test('comparison card shows merchant count and exact product price, without invented shipping',()=>{
 const ctx=vm.createContext({offersOf:()=>[{price:100},{price:120}],favorites:[],getImageUrl:()=>null,ICO:{heart:()=>'',box:''},fmtEur:n=>n+' €',escHtml:String,productUrl:p=>'/produit/'+p.ean});
 vm.runInContext(html.slice(html.indexOf('function cardHTML('),html.indexOf('function buildFacets(')),ctx);
 const result=ctx.cardHTML({id:'one',ean:'1234567890123',title:'Test',brand:'Brand'},0);
 assert.match(result,/2 marchands/); assert.match(result,/100 €/); assert.match(result,/Hors livraison/);assert.match(result,/Comparer les prix/);assert.doesNotMatch(result,/Livraison gratuite/);
});
test('view changes preserve selected sort',()=>{
 let sorted=0;const ctx=vm.createContext({localStorage:{setItem(){}},document:{querySelectorAll:()=>[]},sortResults(){sorted++}});
 vm.runInContext(html.slice(html.indexOf('function setView('),html.indexOf('var CURRENT_OFFERS = []')),ctx);
 ctx.setView('grid');assert.equal(sorted,1);assert.equal(ctx.VIEW,'grid');
});
test('mobile filter control reports expanded state',()=>{
 let open=false;const attrs={};const ctx=vm.createContext({document:{getElementById:()=>({classList:{toggle(){open=!open;return open}}})}});
 vm.runInContext(html.slice(html.indexOf('function toggleMobileFilters('),html.indexOf('function setView(')),ctx);
 const button={setAttribute(k,v){attrs[k]=v}};ctx.toggleMobileFilters(button);assert.equal(attrs['aria-expanded'],'true');ctx.toggleMobileFilters(button);assert.equal(attrs['aria-expanded'],'false');
});
