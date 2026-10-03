const { test } = require('node:test');
const assert = require('node:assert/strict');
const { enrich } = require('./enrich_item_merchants');

test('joins by identity despite reused API IDs and reassigned catalog IDs', () => {
  const items = [
    { id: 10, name: 'Lädermössa', is_armor: true, type_name: 'head' },
    { id: 323, name: 'Ulvsnittare', is_weapon: true, type_name: 'spear' },
    { id: 10, name: 'Klarblått vatten', is_consumable: true },
  ];
  enrich(items, [{ id: 1, name: 'Durin', items: [
    { id: 10, name: 'Ulvsnittare', is_weapon: true, type_name: 'spear', price: 650, tokens: 0 },
    { id: 10, name: 'Klarblått vatten', is_consumable: true, price: 0, tokens: 20 },
  ] }]);
  assert.deepEqual(items[0].merchants, []);
  assert.equal(items[1].merchants[0].price, 650);
  assert.equal(items[2].merchants[0].tokens, 20);
  assert.equal(items[2].merchants[0].price, 0);
});

test('refreshes captured merchants, preserves others and is idempotent', () => {
  const items = [{ id: 1, name: 'Item', merchants: [{ id: 1, name: 'Stale' }, { id: 9, name: 'Other' }] },
    { id: 2, name: 'Removed', merchants: [{ id: 1, name: 'Stale' }] }];
  const merchants = [{ id: 1, name: 'Durin', items: [{ id: 7, name: 'Item', price: 0, tokens: 0 }] }];
  enrich(items, merchants);
  const first = JSON.stringify(items);
  enrich(items, merchants);
  assert.equal(JSON.stringify(items), first);
  assert.equal(items[0].merchants[0].id, 9);
  assert.equal(items[0].merchants[1].price, 0);
  assert.deepEqual(items[1].merchants, []);
});

test('does not confuse same-name items of different kinds', () => {
  const items = [{ name: 'Gem', is_material: true }, { name: 'Gem', is_enchant: true }];
  const result = enrich(items, [{ id: 1, name: 'Durin', items: [
    { name: 'Gem', is_enchant: true, price: 10 }, { name: 'Missing', price: 5 },
  ] }]);
  assert.deepEqual(items[0].merchants, []);
  assert.equal(items[1].merchants[0].price, 10);
  assert.deepEqual(result.missing, ['Durin: Missing']);
});

test('rejects ambiguous matches before modifying the catalog', () => {
  const items = [{ name: 'Duplicate' }, { name: 'Duplicate' }];
  assert.throws(() => enrich(items, [{ id: 1, name: 'Durin', items: [{ name: 'Duplicate', price: 5 }] }]), /Ambiguous/);
  assert.equal(items[0].merchants, undefined);
});
