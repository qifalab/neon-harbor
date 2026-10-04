import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCityGuide } from '../src/city-guide.js';
import { METROPOLIS_BUILDINGS, METROPOLIS_DISTRICTS } from '../src/metropolis-catalog.js';
import { expansionBuilding } from '../src/expansion-programmes.js';
import { getRoomDesign } from '../src/metropolis-room-designs.js';

// The guide needs tree construction, selectors and native disclosure events,
// rather than a renderer. Parse its actual HTML so missing placeholders or
// selectors fail these tests instead of being supplied by the test itself.
class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.listeners = new Map();
    this.style = { setProperty() {} };
    this.value = '';
    this.open = false;
    this.htmlWrites = 0;
    this.ownText = '';
  }
  set innerHTML(html) {
    this._html = html;
    this.htmlWrites++;
    this.children = [];
    this.ownText = '';
    const stack = [this];
    for (const token of html.match(/<[^>]*>|[^<]+/g) || []) {
      if (token.startsWith('</')) {
        stack.pop();
      } else if (token.startsWith('<')) {
        const match = token.match(/^<([\w-]+)([^>]*)>/);
        if (!match) continue;
        const node = new FakeElement(match[1]);
        for (const attr of match[2].matchAll(/([\w-]+)="([^"]*)"/g)) {
          const [, name, value] = attr;
          node.attributes[name] = value;
          if (name === 'class') node.className = value;
          else if (name === 'id') node.id = value;
          else if (name === 'value') node.value = value;
          else if (name.startsWith('data-')) node.dataset[name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = value;
        }
        stack.at(-1).append(node);
        if (!['input', 'br', 'img', 'hr', 'meta', 'link'].includes(node.tagName)) stack.push(node);
      } else {
        stack.at(-1).ownText += token;
      }
    }
  }
  get innerHTML() { return this._html || ''; }
  set textContent(text) { this.children = []; this.ownText = text; }
  get textContent() { return this.ownText + this.children.map(child => child.textContent).join(''); }
  get childElementCount() { return this.children.length; }
  append(node) { node.parentElement = this; this.children.push(node); }
  after(node) {
    const siblings = this.parentElement.children;
    node.parentElement = this.parentElement;
    siblings.splice(siblings.indexOf(this) + 1, 0, node);
  }
  matches(selector) {
    if (selector.startsWith('.')) return (this.className || '').split(/\s+/).includes(selector.slice(1));
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    return this.tagName === selector;
  }
  querySelectorAll(selector) {
    const results = [];
    for (const child of this.children) {
      if (child.matches(selector)) results.push(child);
      results.push(...child.querySelectorAll(selector));
    }
    return results;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  dispatch(type) {
    for (const listener of this.listeners.get(type) || []) listener({ type, target: this, currentTarget: this });
  }
}

function setup(t) {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: tag => new FakeElement(tag) };
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  const north = METROPOLIS_BUILDINGS.find(building => building.id === 'camellia-court');
  const museum = METROPOLIS_BUILDINGS.find(building => building.id === 'tide-museum');
  const shell = { id: 'south-shell-092', x: 220, z: 120, width: 16, depth: 18, height: 23, name: '街坊楼', color: '#aab6ad' };
  const tea = expansionBuilding(shell, 'south', 91);
  const east = expansionBuilding({ ...shell, id: 'east-shell-001', height: 128, name: '东湾一号楼' }, 'east', 0);
  const city = {
    buildings: [north, museum, tea, east],
    districts: [...METROPOLIS_DISTRICTS, { id: 'south-expansion', name: '南岸旧城' }, { id: 'east-expansion', name: '东湾天际线' }],
    harbor: { viewpoints: [{ id: 'waterfront-view', name: '海滨长廊', x: 285, z: 42 }] },
    transit: { stops: [{ id: 'metro-quay', name: '潮光地铁站', mode: 'metro', entry: { x: 10, z: -420 } }] },
    infrastructure: { landmarks: [{ id: 'pier-ramp', name: '湾岸码头坡道', description: '从地面抵达码头', x: 220, z: -280 }] },
  };
  return { city, container: new FakeElement('section') };
}

function watchedFloors(building) {
  const reads = { enabled: false, map: 0, ids: 0, contents: 0 };
  const originals = building.floors;
  const floors = originals.map(floor => ({ ...floor, get id() { reads.ids++; return floor.id; } }));
  return {
    reads, originals,
    building: { ...building, floors: new Proxy(floors, {
      get(target, key, receiver) {
        if (key !== 'length') {
          reads.contents++;
          assert.ok(reads.enabled, `unopened guide accessed floor contents: ${building.id}/${String(key)}`);
        }
        if (key === 'map') reads.map++;
        return Reflect.get(target, key, receiver);
      },
    }) },
  };
}

function address(container, id) {
  return container.querySelectorAll('.address-card').find(card => card.dataset.buildingId === id);
}

test('collapsed city guide lists addresses without reading floor contents or constructing room rows', t => {
  const { city, container } = setup(t);
  const watched = city.buildings.map(watchedFloors);
  city.buildings = watched.map(record => record.building);
  renderCityGuide(container, city, () => {});
  assert.equal(container.querySelectorAll('.address-card').length, city.buildings.length);
  for (const record of watched) {
    assert.equal(record.reads.contents, 0);
    assert.equal(record.reads.ids, 0);
    const card = address(container, record.building.id);
    assert.ok(card.textContent.includes(`${record.originals.length} 个开放楼层`));
    assert.equal(card.querySelector('.room-programmes').childElementCount, 0);
    assert.equal(card.querySelector('.room-programmes').innerHTML, '');
    // A close toggle may occur before the user's first open.
    card.querySelector('details').dispatch('toggle');
    assert.equal(record.reads.contents, 0);
  }
});

test('first disclosure resolves its current floor and room records once, including both compact rooms', t => {
  const { city, container } = setup(t);
  const watched = city.buildings.map(watchedFloors);
  city.buildings = watched.map(record => record.building);
  renderCityGuide(container, city, () => {});
  for (const record of watched) {
    const card = address(container, record.building.id);
    const details = card.querySelector('details'), programmes = card.querySelector('.room-programmes');
    record.reads.enabled = true;
    details.open = true;
    details.dispatch('toggle');
    assert.equal(record.reads.map, 1);
    assert.equal(record.reads.ids, record.originals.length);
    assert.equal(programmes.children.length, record.originals.length);
    record.originals.forEach((floor, index) => {
      const design = getRoomDesign(record.building.id, floor.id);
      const row = programmes.children[index];
      assert.equal(row.querySelector('strong').textContent, design.name);
      assert.equal(row.querySelector('p').textContent, design.rooms.map(room => room.name).join(' · '));
      if (record.building.compact) assert.equal(design.rooms.length, 2);
    });
    const rows = [...programmes.children], writes = programmes.htmlWrites;
    // Closing, reopening or repeated native toggle events must retain rows,
    // even when access to floor records is no longer allowed by the fixture.
    record.reads.enabled = false;
    details.open = false;
    details.dispatch('toggle');
    details.open = true;
    details.dispatch('toggle');
    details.dispatch('toggle');
    assert.equal(record.reads.map, 1);
    assert.equal(programmes.htmlWrites, writes);
    assert.deepEqual(programmes.children, rows);
  }
});

test('search and district filtering preserve visit targets without resolving hidden floor programmes', t => {
  const { city, container } = setup(t);
  const watched = city.buildings.map(watchedFloors);
  city.buildings = watched.map(record => record.building);
  const trips = [];
  renderCityGuide(container, city, place => trips.push(place));
  const search = container.querySelector('#atlas-search'), district = container.querySelector('#atlas-district');
  search.value = '  静潮茶室  ';
  search.dispatch('input');
  assert.deepEqual(container.querySelectorAll('.address-card').map(card => card.dataset.buildingId), ['south-092']);
  address(container, 'south-092').querySelector('button').dispatch('click');
  assert.strictEqual(trips.at(-1), city.buildings.find(building => building.id === 'south-092'));
  search.value = 'CAMELLIA';
  search.dispatch('input');
  assert.deepEqual(container.querySelectorAll('.address-card').map(card => card.dataset.buildingId), ['camellia-court']);
  search.value = '';
  district.value = 'east-expansion';
  district.dispatch('change');
  assert.deepEqual(container.querySelectorAll('.address-card').map(card => card.dataset.buildingId), ['east-001']);
  address(container, 'east-001').querySelector('button').dispatch('click');
  assert.strictEqual(trips.at(-1), city.buildings.find(building => building.id === 'east-001'));
  search.value = '不存在的街道';
  search.dispatch('input');
  assert.equal(container.querySelectorAll('.address-card').length, 0);
  assert.ok(container.querySelector('#atlas-results').textContent.includes('没有找到这个地址'));
  district.value = '';
  search.value = '南岸旧城';
  district.dispatch('change');
  assert.deepEqual(container.querySelectorAll('.address-card').map(card => card.dataset.buildingId), ['south-092']);
  const stopButton = container.querySelector('#transit-stops').querySelector('button');
  assert.equal(stopButton.dataset.visitStop, 'metro-quay');
  stopButton.dispatch('click');
  assert.deepEqual(trips.at(-1), { ...city.transit.stops[0], entrance: city.transit.stops[0].entry });
  for (const record of watched) assert.equal(record.reads.contents, 0);
});
