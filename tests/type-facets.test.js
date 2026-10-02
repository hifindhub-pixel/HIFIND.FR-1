import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function extract(name){
 const start=html.indexOf('function '+name+'(');
 const end=html.indexOf('\n}',start)+2;
 return html.slice(start,end);
}
test('type chips and sidebar filter by the same canonical type',()=>{
 const context=vm.createContext({allResults:[
  {product_type:'power_tool',price:100,brand:'Makita'},
  {product_type:'clothing',product_type_label:'Vêtements et accessoires',price:30}
 ],FACETS:{types:new Set(['power_tool']),brands:new Set(),merchants:new Set(),minOffers:0},
 offersOf:()=>[],renderChips(){},sortResults(){},TYPE_LABELS:{power_tool:'Outillage',other:'Autres types'}});
 vm.runInContext(extract('applyFacets')+'\n'+extract('productTypeLabel'),context);
 vm.runInContext('applyFacets()',context);
 assert.equal(context.currentResults.length,1);
 assert.equal(context.currentResults[0].brand,'Makita');
 assert.equal(vm.runInContext("productTypeLabel('clothing')",context),'Vêtements et accessoires');
});
