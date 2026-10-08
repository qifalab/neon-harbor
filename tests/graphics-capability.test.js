import test from 'node:test';
import assert from 'node:assert/strict';
import { createRendererWithFallback, graphicsDiagnosticText, inspectGraphics } from '../src/graphics-capability.js';

function fakeCanvas(contexts = {}) {
  return { getContext(kind) { return contexts[kind] || null; } };
}

test('graphics probe recognises a WebGL 2 context without touching WebGL 1', () => {
  const calls = [];
  const context = { VERSION: 1, RENDERER: 2, VENDOR: 3, getParameter(parameter) { return ({ 1: 'WebGL 2.0', 2: 'Test GPU', 3: 'Test Vendor' })[parameter]; } };
  const result = inspectGraphics({ getContext(kind) { calls.push(kind); return kind === 'webgl2' ? context : null; } });
  assert.equal(result.webgl2, true);
  assert.equal(result.webgl1, false);
  assert.equal(result.mode, 'webgl2');
  assert.equal(result.version, 'WebGL 2.0');
  assert.equal(result.renderer, 'Test GPU');
  assert.equal(result.vendor, 'Test Vendor');
  assert.equal(result.profile, 'antialias/high-performance');
  assert.deepEqual(calls, ['webgl2']);
});

test('graphics probe distinguishes WebGL 1-only and unavailable contexts', () => {
  const old = inspectGraphics(fakeCanvas({ webgl: { VERSION: 1, RENDERER: 2, VENDOR: 3, getParameter: p => ({ 1: 'WebGL 1.0', 2: 'Old GPU', 3: 'Old Vendor' })[p] } }));
  assert.equal(old.mode, 'webgl1-only');
  assert.equal(old.webgl1, true);
  assert.equal(old.webgl2, false);
  assert.equal(inspectGraphics(fakeCanvas()).mode, 'unavailable');
});

test('renderer construction retries conservative profiles and returns the first working profile', () => {
  const attempts = [];
  const context = { VERSION: 1, RENDERER: 2, VENDOR: 3, getParameter: p => ({ 1: 'WebGL 2.0', 2: 'GPU', 3: 'Vendor' })[p] };
  const canvas = fakeCanvas({ webgl2: context });
  class FakeRenderer {
    constructor(options) {
      attempts.push(options);
      this.options = options;
    }
  }
  const result = createRendererWithFallback(FakeRenderer, canvas);
  assert.equal(result.profile, 'antialias/high-performance');
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].antialias, true);
  assert.equal(attempts[0].powerPreference, 'high-performance');
  assert.equal(attempts[0].context, context);
  assert.equal(result.attempts.length, 0);
});

test('renderer diagnostics preserve every failed profile', () => {
  const context = { VERSION: 1, RENDERER: 2, VENDOR: 3, getParameter: p => ({ 1: 'WebGL 2.0', 2: 'GPU', 3: 'Vendor' })[p] };
  class AlwaysFail {
    constructor() { throw new Error('no adapter'); }
  }
  assert.throws(() => createRendererWithFallback(AlwaysFail, fakeCanvas({ webgl2: context })), error => {
    assert.equal(error.name, 'RendererInitializationError');
    assert.equal(error.rendererAttempts.length, 1);
    assert.match(graphicsDiagnosticText({ mode: 'webgl2', webgl2: true, webgl1: false }, error), /antialias\/high-performance/);
    return true;
  });
});
