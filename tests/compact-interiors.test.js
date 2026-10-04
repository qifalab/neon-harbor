import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createWorld } from '../src/world.js';
import { HARBOR_TOWERS } from '../src/harbor-skyline.js';
import { expansionBuilding } from '../src/expansion-programmes.js';
import { createInteriorSystem, createInteriorLayout } from '../src/metropolis-interiors.js';
import { SpatialIndex, moveCircle, CHARACTER_RADIUS, circleContacts } from '../src/collision.js';

function walker(system, entry, buildingId) {
  const player = { ...entry.position, groundY: entry.groundY, y: 0 };
  let version, physics;
  const refresh = () => {
    const context = system.collisionContext();
    if (context.version !== version) {
      version = context.version;
      physics = { index: new SpatialIndex(context.colliders), groundHeightAt: context.groundHeightAt, bounds: 1800 };
    }
    return context;
  };
  const walk = target => {
    let frames = 0;
    while (Math.hypot(player.x - target.x, player.z - target.z) > 0.05 && frames++ < 3500) {
      const context = refresh(), dx = target.x - player.x, dz = target.z - player.z, distance = Math.hypot(dx, dz);
      moveCircle(player, dx / distance * Math.min(distance, 0.1), dz / distance * Math.min(distance, 0.1), CHARACTER_RADIUS, physics);
      player.groundY = context.groundHeightAt(player.x, player.z, player.groundY);
      const change = system.update(1 / 60, player);
      assert.ok(!change?.position, 'ordinary walking cannot teleport between floors');
    }
    assert.ok(Math.hypot(player.x - target.x, player.z - target.z) <= 0.05,
      `${buildingId}/${system.state.floor.id} blocked at ${JSON.stringify(player)} before ${JSON.stringify(target)}`);
    refresh();
    assert.equal(circleContacts(player, CHARACTER_RADIUS, physics).length, 0, 'arrival must be clear of physical solids');
  };
  const ride = floor => {
    assert.equal(system.interact(player).elevator?.buildingId, buildingId);
    assert.ok(system.selectFloor(floor.id));
    let frames = 0;
    while (system.state.moving && frames++ < 5000) {
      const change = system.update(1 / 60, player);
      if (change?.position) player.groundY = change.groundY;
    }
    assert.equal(system.state.moving, false);
    assert.equal(system.state.floor.id, floor.id);
    assert.equal(player.groundY, floor.y);
    refresh();
    assert.equal(circleContacts(player, CHARACTER_RADIUS, physics).length, 0);
  };
  return { player, walk, ride };
}

test('every compact building supports all-floor stair walks, furnished-room entries, lift return and street exit', () => {
  const source = createWorld(THREE, new THREE.Scene(), { streaming: true });
  const buildings = source.buildings.map((building, index) => expansionBuilding(building, 'south', index));
  assert.equal(buildings.length, 96);
  const system = createInteriorSystem(THREE, new THREE.Scene(), { buildings });
  let floorsVisited = 0, roomsVisited = 0;
  for (const building of buildings) {
    const entry = system.enter(building.id), { walk, ride, player } = walker(system, entry, building.id);
    const visitRooms = () => {
      const rooms = system.snapshot().rooms;
      assert.equal(rooms.length, 2);
      for (const room of rooms) {
        assert.equal(room.enclosed, true);
        walk({ x: building.x, z: room.entrance.z }); walk(room.arrival);
        system.update(1 / 60, player);
        assert.equal(system.snapshot().currentRoomId, room.id);
        walk({ x: building.x, z: room.entrance.z }); roomsVisited++;
      }
      floorsVisited++;
      assert.equal(system.snapshot().activeFloors, Math.min(building.floors.length, 3));
    };
    visitRooms();
    const stairs = system.snapshot().stairs;
    assert.equal(stairs.length, building.floors.length - 1);
    for (const flight of stairs) {
      walk({ x: building.x, z: flight.bottom.z }); walk(flight.bottom); walk(flight.top);
      assert.equal(system.state.floor.id, flight.toFloorId);
      assert.ok(Math.abs(player.groundY - flight.toY) < 1e-8);
      walk({ x: building.x, z: flight.top.z }); visitRooms();
    }
    for (const flight of [...stairs].reverse()) {
      walk({ x: building.x, z: flight.top.z }); walk(flight.top); walk(flight.bottom);
      assert.equal(system.state.floor.id, flight.fromFloorId);
      assert.ok(Math.abs(player.groundY - flight.fromY) < 1e-8);
      walk({ x: building.x, z: flight.bottom.z });
    }
    const cabin = system.snapshot().cabin;
    walk({ x: building.x, z: cabin.doorZ + 1.05 });
    walk({ x: cabin.x, z: cabin.doorZ + 1.05 }); walk(cabin);
    ride(building.floors.at(-1)); ride(building.floors[0]);
    walk({ x: cabin.x, z: cabin.doorZ + 1.05 });
    walk({ x: building.x, z: cabin.doorZ + 1.05 }); walk(entry.position);
    assert.equal(system.getPrompt(player)?.kind, 'exit');
    assert.equal(system.exit()?.outside, true);
    assert.equal(system.collisionContext(), null);
  }
  assert.equal(floorsVisited, buildings.reduce((sum, building) => sum + building.floors.length, 0));
  assert.equal(roomsVisited, floorsVisited * 2);
  system.dispose();
});

test('minimum compact shell keeps real stair openings, clear cabin approach and height-filtered exterior prompts', () => {
  const building = expansionBuilding({ id: 'tiny-shell', x: 0, z: 0, width: 13, depth: 15, height: 9, baseY: 0.18 }, 'south', 0);
  const system = createInteriorSystem(THREE, new THREE.Scene(), { buildings: [building] });
  assert.equal(building.floors.length, 2);
  assert.equal(system.getPrompt({ ...building.entrance, groundY: building.entrance.y + 8 }), null);
  assert.equal(system.getPrompt({ ...building.entrance, groundY: building.entrance.y })?.buildingId, building.id);
  const { walk } = walker(system, system.enter(building.id), building.id);
  for (const floor of building.floors) {
    const layout = createInteriorLayout(building, floor);
    for (const part of layout.parts) assert.ok([part.x, part.y, part.z, part.sx, part.sy, part.sz].every(Number.isFinite));
    const flight = layout.stairs[0], slabs = layout.parts.filter(part => part.kind === (floor.id === 'lobby' ? 'ceiling' : 'floor'));
    assert.ok(slabs.length >= 4, 'stair void must use cut slab pieces');
    const mid = { x: flight.x, z: (flight.startZ + flight.endZ) / 2 };
    assert.equal(slabs.some(part => Math.abs(part.x - mid.x) < part.sx / 2 && Math.abs(part.z - mid.z) < part.sz / 2), false,
      'no floor or ceiling may cross the actual staircase');
  }
  const cabin = system.snapshot().cabin;
  walk({ x: building.x, z: cabin.doorZ + 1.05 }); walk({ x: cabin.x, z: cabin.doorZ + 1.05 }); walk(cabin);
  system.dispose();
});


test('east-bay room furnishings fit every shell and narrow floors preserve room, stair and lift routes', () => {
  const buildings = HARBOR_TOWERS.map((building, index) => expansionBuilding(building, 'east', index));
  const system = createInteriorSystem(THREE, new THREE.Scene(), { buildings });
  assert.equal(Math.min(...buildings.map(building => building.width)), 33);
  for (const building of buildings) {
    // Layouts repeat by programme, but each elevation still needs valid solids
    // and every furniture component must fit the actual room walls.
    for (const floor of building.floors) {
      const layout = createInteriorLayout(building, floor);
      for (const room of layout.rooms) {
        const bounds = room.bounds;
        for (const part of layout.parts.filter(part => part.roomId === room.id && !/partition|ceiling|floor|door|wall|linen/.test(part.kind))) {
          assert.ok(part.x - part.sx / 2 >= bounds.minX - 0.01 && part.x + part.sx / 2 <= bounds.maxX + 0.01 &&
            part.z - part.sz / 2 >= bounds.minZ - 0.01 && part.z + part.sz / 2 <= bounds.maxZ + 0.01,
          `${building.id}/${floor.id}/${room.type}/${part.kind}: furniture crosses room wall`);
        }
      }
    }
    const entry = system.enter(building.id), { walk, ride, player } = walker(system, entry, building.id);
    const visitRooms = () => {
      for (const room of system.snapshot().rooms) {
        walk({ x: building.x, z: room.entrance.z }); walk(room.arrival);
        assert.equal(system.snapshot().currentRoomId, room.id);
        walk({ x: building.x, z: room.entrance.z });
      }
    };
    visitRooms();
    const flight = system.snapshot().stairs[0];
    walk({ x: building.x, z: flight.bottom.z }); walk(flight.bottom); walk(flight.top);
    assert.equal(system.state.floor.id, flight.toFloorId);
    walk({ x: building.x, z: flight.top.z }); visitRooms();
    const cabin = system.snapshot().cabin;
    walk({ x: building.x, z: cabin.z });
    if (system.state.floor.id !== building.floors.at(-1).id) ride(building.floors.at(-1));
    walk({ x: building.x, z: cabin.doorZ + 1.05 }); visitRooms();
    walk({ x: building.x, z: cabin.z }); ride(building.floors[0]);
    walk(entry.position);
    assert.equal(system.getPrompt(player)?.kind, 'exit'); system.exit();
  }
  system.dispose();
});
