import assert from 'node:assert/strict';

/** Validate a real public download against the exact frozen scene's writer and
 * restore implementations. All replay objects are private CPU-only instances;
 * no browser state, fleet, NPC, clock, storage or player position is written. */
export function createPublicSaveValidator({ city, sourceHashes }) {
  assert.ok(city?.sample?.life && city?.sample?.transit, 'actual frozen source scene supplies the save implementations');
  const initialLife = city.sample.life.snapshot();
  const initialTransit = city.sample.transit.exportState();
  assert.equal(initialLife.schema, 'neon-harbor/daily-life');
  assert.ok([1, 2].includes(initialLife.version), 'explicit supported writer schema, then exact-match this source version');
  assert.equal(initialTransit.version, 1);
  for (const path of ['src/harbor-life.js', 'src/harbor-transit.js'])
    assert.match(sourceHashes[path], /^[a-f0-9]{64}$/, 'writer and restore source are already matched to frozen build bytes');
  if (initialLife.version === 2)
    assert.match(sourceHashes['src/harbor-resident-loop.js'], /^[a-f0-9]{64}$/, 'version 2 wage and transit restore guards are source-bound');
  const expected = Object.freeze({ progressVersion: 1, lifeSchema: initialLife.schema,
    lifeVersion: initialLife.version, transitVersion: initialTransit.version,
    lifeSourceSha256: sourceHashes['src/harbor-life.js'], transitSourceSha256: sourceHashes['src/harbor-transit.js'],
    residentLoopSourceSha256: sourceHashes['src/harbor-resident-loop.js'] || null,
    seed: initialLife.seed, secondsPerHour: initialLife.secondsPerHour });
  function validate(saved) {
    assert.equal(saved.version, expected.progressVersion);
    assert.ok(Number.isSafeInteger(saved.cash) && saved.cash >= 0);
    assert.ok([saved.player?.x, saved.player?.z, saved.player?.yaw].every(Number.isFinite));
    assert.equal(saved.harborLife?.schema, expected.lifeSchema);
    assert.equal(saved.harborLife.version, expected.lifeVersion, 'save exactly matches the frozen source writer, never accept v2 as v1');
    assert.equal(saved.harborTransit?.version, expected.transitVersion);
    assert.equal(saved.harborLife.seed, expected.seed);
    assert.equal(saved.harborLife.secondsPerHour, expected.secondsPerHour);
    const transport = new city.sample.transit.constructor({ groundHeightAt: city.groundHeightAt });
    assert.equal(transport.restoreState(saved.harborTransit), true, 'actual frozen fleet restore accepts the public save');
    assert.deepEqual(transport.exportState(), saved.harborTransit, 'all fleet clocks, vehicle service, junctions and citizen ticket fields round-trip exactly');
    const life = new city.sample.life.constructor({ buildings: city.buildings, colliders: city.colliders, transport,
      seed: expected.seed, secondsPerHour: expected.secondsPerHour, hour: saved.harborLife.startHour,
      save: saved.harborLife });
    assert.equal(life.restored, true, 'actual frozen life restore validates wages, jobs, stock, money, homes, transit and clock atomically');
    assert.deepEqual(life.snapshot(), saved.harborLife, 'all life fields preserve the exact writer schema and original data');
    assert.equal(life.totalMoney, saved.harborLife.initialMoney, 'finite money remains conserved');
    assert.equal(life.totalGoods, saved.harborLife.initialGoods, 'finite goods remain conserved');
    return { expected, restoreAccepted: true, allLifeFieldsRoundTripped: true, allFleetFieldsRoundTripped: true,
      totalMoney: life.totalMoney, totalGoods: life.totalGoods, browserWrites: false, privateCpuReplayOnly: true };
  }
  return Object.freeze({ expected, validate });
}
