import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSimulation } from '../src/simulation.js';
import { FixedStepClock } from '../src/frame-clock.js';

function walker(colliders = []) {
  const game = new GameSimulation({ colliders, bounds: 1800, groundHeightAt: () => 0 });
  game.cars = [];
  Object.assign(game.player, { x: .35, z: 0, y: 0, groundY: 0 });
  const clock = new FixedStepClock(); let time = 0;
  clock.advance(time, true);
  return { game, frame(input) {
    const next = clock.advance(time += 250, true);
    for (let i = 0; i < next.steps; i++) game.update(1 / 60, input);
  } };
}

test('precision input crosses a 1.6 metre doorway at four rendered frames per second', () => {
  const { game, frame } = walker([
    { x: -4.4, z: 2, hx: 3.6, hz: .2, minY: 0, maxY: 3 },
    { x: 4.4, z: 2, hx: 3.6, hz: .2, minY: 0, maxY: 3 },
  ]);
  const start = game.player.x;
  frame({ strafe: 1, slow: true, cameraYaw: 0 });
  frame({ strafe: 1, slow: true, cameraYaw: 0 });
  assert.ok(Math.abs(game.player.x) < .15, 'the real avatar fits inside the opening');
  assert.ok(Math.abs(start - game.player.x - .4) < 1e-8);
  for (let i = 0; i < 20; i++) frame({ forward: 1, slow: true, cameraYaw: 0 });
  assert.ok(game.player.z > 3.9, 'collision permits walking all the way through');
});

test('normal and sprint speeds stay intact; precision overrides sprint without draining stamina', () => {
  for (const [input, distance] of [[{}, 1.4], [{ sprint: true }, 2.625], [{ slow: true, sprint: true }, .2]]) {
    const { game, frame } = walker();
    frame({ ...input, forward: 1, cameraYaw: 0 });
    assert.ok(Math.abs(game.player.z - distance) < 1e-8);
    if (input.slow) assert.equal(game.player.stamina, 100);
  }
});
