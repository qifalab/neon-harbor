import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SCENE_CONFIG,
  createSceneDirector,
  normalizeSceneConfig,
  validateSceneConfig,
  validateScenePlan,
} from '../src/llm-scene-adapter.js';

const validPlan = {
  version: 1,
  styleId: 'quay-workshop',
  socialModelId: 'maker-collaborator',
  mood: 'late afternoon task light',
  socialIntent: 'deliver-order',
  dialogue: 'The east quay route is clear.',
  props: [{ id: 'lamp-1', kind: 'work-lamp', anchor: 'counter', variation: 1 }],
};

function response(body, ok = true, status = 200) {
  return { ok, status, async json() { return body; } };
}

test('default config is valid and normalized without mutable references', () => {
  assert.deepEqual(validateSceneConfig(DEFAULT_SCENE_CONFIG), { valid: true, errors: [] });
  const copy = normalizeSceneConfig(DEFAULT_SCENE_CONFIG);
  assert.notEqual(copy, DEFAULT_SCENE_CONFIG);
  assert.equal(Object.isFrozen(copy.styles[0]), true);
  assert.throws(() => normalizeSceneConfig({ version: 1, styles: [], socialModels: [] }), /styles must contain/);
});

test('deterministic plan selects data-driven style and social model', () => {
  const director = createSceneDirector();
  const plan = director.plan({ buildingKind: 'workshop', role: 'courier', place: '东湾工坊' });
  assert.equal(plan.source, 'deterministic');
  assert.equal(plan.styleId, 'quay-workshop');
  assert.equal(plan.socialModelId, 'maker-collaborator');
  assert.ok(plan.props.length > 0);
  assert.equal(director.getSettings().enabled, false);
});

test('explicit presets override kind and role deterministically', () => {
  const director = createSceneDirector({ stylePreset: 'civic-art-deco', socialPreset: 'shopkeeper-host' });
  const plan = director.plan({ buildingKind: 'workshop', role: 'courier' });
  assert.equal(plan.styleId, 'civic-art-deco');
  assert.equal(plan.socialModelId, 'shopkeeper-host');
  assert.throws(() => director.configure({ stylePreset: 'missing-style' }), /Unknown stylePreset/);
});

test('disabled adapter never calls fetch and returns fallback', async () => {
  let calls = 0;
  const director = createSceneDirector({ enabled: false, fetchImpl: async () => { calls++; throw new Error('must not call'); } });
  const plan = await director.request({ role: 'resident' });
  assert.equal(calls, 0);
  assert.equal(plan.source, 'deterministic');
  assert.equal(plan.fallbackReason, 'disabled');
});

test('OpenAI-compatible response is schema checked and accepted', async () => {
  const calls = [];
  const director = createSceneDirector({
    enabled: true,
    provider: 'openai-compatible',
    endpoint: 'http://127.0.0.1:1234/v1/chat/completions',
    model: 'local-test',
    fetchImpl: async (url, init) => { calls.push({ url, init }); return response({ choices: [{ message: { content: JSON.stringify(validPlan) } }] }); },
  });
  const plan = await director.request({ buildingKind: 'workshop', role: 'courier' });
  assert.equal(plan.source, 'llm');
  assert.equal(plan.styleId, 'quay-workshop');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://127.0.0.1:1234/v1/chat/completions');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, 'local-test');
  assert.equal(body.response_format.type, 'json_object');
  assert.equal(calls[0].init.headers.Authorization, undefined);
});

test('Ollama response accepts fenced JSON and uses local endpoint', async () => {
  let body;
  const director = createSceneDirector({
    enabled: true,
    provider: 'ollama',
    model: 'llama-test',
    fetchImpl: async (url, init) => { body = JSON.parse(init.body); assert.equal(url, 'http://127.0.0.1:11434/api/chat'); return response({ message: { content: '```json\n' + JSON.stringify(validPlan) + '\n```' } }); },
  });
  const plan = await director.request({ role: 'worker' });
  assert.equal(plan.source, 'llm');
  assert.equal(body.format, 'json');
  assert.equal(body.stream, false);
});

test('invalid model output falls back and rejects unknown IDs or oversized props', async () => {
  const director = createSceneDirector({
    enabled: true,
    provider: 'openai-compatible',
    endpoint: 'http://localhost:9999/v1/chat/completions',
    fetchImpl: async () => response({ choices: [{ message: { content: JSON.stringify({ ...validPlan, styleId: 'inject-me' }) } }] }),
  });
  const plan = await director.request({ buildingKind: 'office' });
  assert.equal(plan.source, 'deterministic');
  assert.equal(plan.fallbackReason, 'request-failed');
  const bad = validateScenePlan({ ...validPlan, props: Array.from({ length: 25 }, (_, i) => ({ id: `p-${i}`, kind: 'box', anchor: 'room' })) });
  assert.equal(bad.valid, false);
  assert.match(bad.errors[0], /props/);
});

test('external endpoint is blocked unless explicitly opted in', async () => {
  let calls = 0;
  const director = createSceneDirector({ enabled: true, endpoint: 'https://example.invalid/v1/chat/completions', fetchImpl: async () => { calls++; return response({}); } });
  const plan = await director.request();
  assert.equal(calls, 0);
  assert.equal(plan.fallbackReason, 'external-endpoint-blocked');
});

test('timeout returns deterministic fallback', async () => {
  const director = createSceneDirector({
    enabled: true,
    endpoint: 'http://127.0.0.1:9911/v1/chat/completions',
    timeoutMs: 250,
    fetchImpl: (_url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }),
  });
  const plan = await director.request();
  assert.equal(plan.source, 'deterministic');
  assert.equal(plan.fallbackReason, 'timeout');
});
