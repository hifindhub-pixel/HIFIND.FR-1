import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reconcileCategories} from '../scripts/lib/category-consensus.js';
const rows=[{ean:'1234567890123',brand:'Bose'},{ean:'1234567890123',brand:'Bose'}];
test('exact barcode propagates clear evidence to opaque title',()=>assert.equal(reconcileCategories(rows,[{category:'high-tech',score:30},{category:'autres',score:0}])[1].category,'high-tech'));
test('conflicting types never propagate',()=>assert.deepEqual(reconcileCategories([...rows,rows[0]],[{category:'high-tech',score:30},{category:'maison-jardin',score:30},{category:'autres',score:0}]).map(d=>d.category),['high-tech','maison-jardin','autres']));
test('different brands block propagation',()=>assert.equal(reconcileCategories([rows[0],{...rows[1],brand:'Lego'}],[{category:'high-tech',score:30},{category:'autres',score:0}])[1].category,'autres'));
