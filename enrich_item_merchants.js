#!/usr/bin/env node
// Join saved GET /api/merchants/<id> responses to an existing item catalog.
const fs = require('node:fs');
const path = require('node:path');

function identity(item) {
  // Catalog IDs may have been reassigned, and API IDs overlap across item types.
  const flags = ['is_weapon', 'is_shield', 'is_armor', 'is_trinket',
    'is_consumable', 'is_material', 'is_enchant'];
  return JSON.stringify([item.name, item.type_name || null, ...flags.map(key => Boolean(item[key]))]);
}

function enrich(items, merchants) {
  if (!Array.isArray(items)) throw new Error('Expected a top-level item array');
  const index = new Map();
  for (const item of items) {
    const key = identity(item);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(item);
  }
  const seen = new Set();
  const matches = [];
  const missing = [];
  for (const merchant of merchants) {
    if (!Number.isInteger(merchant.id) || !merchant.name || !Array.isArray(merchant.items)) {
      throw new Error('Expected a merchant with id, name and items');
    }
    if (seen.has(merchant.id)) throw new Error(`Duplicate merchant ${merchant.id}`);
    seen.add(merchant.id);
    for (const offer of merchant.items) {
      const candidates = index.get(identity(offer)) || [];
      if (candidates.length > 1) throw new Error(`Ambiguous item: ${offer.name}`);
      if (!candidates.length) {
        missing.push(`${merchant.name}: ${offer.name}`);
        continue;
      }
      for (const field of ['price', 'tokens']) {
        if (offer[field] != null && (!Number.isFinite(offer[field]) || offer[field] < 0)) {
          throw new Error(`Invalid ${field} for ${offer.name}`);
        }
      }
      matches.push({ item: candidates[0], merchant: {
        id: merchant.id, name: merchant.name,
        merchant_item_id: offer.merchant_item_id,
        item_id: offer.id,
        price: offer.price ?? null, tokens: offer.tokens ?? null,
        original_price: offer.original_price ?? null,
      } });
    }
  }
  // Refresh only the supplied merchants, preserving any merchants not captured.
  // Repeated runs replace stale offers rather than appending duplicates.
  for (const item of items) {
    item.merchants = (item.merchants || []).filter(m => !seen.has(Number(m.id)));
  }
  for (const match of matches) match.item.merchants.push(match.merchant);
  return { offers: matches.length, items: new Set(matches.map(m => m.item)).size, missing };
}

if (require.main === module) {
  try {
    const input = path.resolve(process.argv[2] || path.join(__dirname, 'docs/lanista_items_detailed.json'));
    const directory = path.resolve(process.argv[3] || path.join(__dirname, 'docs'));
    const output = path.resolve(process.argv[4] || input);
    const files = fs.readdirSync(directory).filter(name => /^m_\d+\.json$/.test(name))
      .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
    if (!files.length) throw new Error(`No m_<id>.json responses found in ${directory}`);
    const merchants = files.map(file => {
      const merchant = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
      if (merchant.id !== Number(file.match(/\d+/)[0])) throw new Error(`Merchant ID mismatch in ${file}`);
      return merchant;
    });
    const source = fs.readFileSync(input, 'utf8');
    const items = JSON.parse(source);
    const report = enrich(items, merchants);
    const indent = source.match(/\n([ \t]+)\{/)?.[1];
    fs.writeFileSync(output, JSON.stringify(items, null, indent) + '\n');
    console.log(`Updated ${report.offers} offers across ${report.items} items from ${files.length} merchants: ${output}`);
    if (report.missing.length) console.warn(`Offers missing from catalog (${report.missing.length}):\n${report.missing.join('\n')}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { enrich };
