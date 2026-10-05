import { createCharacter } from './models.js';

const libraries = new WeakMap();

/** Near citizens retain the existing smooth anatomical meshes, fingers and
 * eight animated joints. Shared small props give occupations a readable outline. */
export function createCitizenCharacter(THREE, style, { characterFactory = createCharacter } = {}) {
  const person = characterFactory(THREE, { style }), library = getLibrary(THREE);
  const wear = new THREE.Group(); wear.name = 'Citizen occupational accessories'; person.add(wear);
  const glasses = library.glasses.clone(true), hat = library.hat.clone(true);
  wear.add(glasses, hat);
  const props = new Map();
  for (const [name, template] of library.props) {
    const instances = []; props.set(name, instances);
    // A prop is attached to every LOD's left hand; only the selected tier draws.
    for (const level of person.userData.lod.levels) {
      const instance = template.clone(true); instance.name = `Citizen ${name}`; instance.visible = false;
      level.object.getObjectByName('leftElbow').add(instance);
      instances.push(instance);
    }
  }
  person.userData.setCitizen = identity => {
    person.scale.set(identity.height * identity.build, identity.height, identity.height * (.94 + identity.build * .06));
    glasses.visible = identity.glasses; hat.visible = identity.hat;
    person.userData.identity = identity;
  };
  person.userData.updateCitizenProps = (state, distance) => {
    const identity = person.userData.identity;
    let active = identity.prop;
    if (state === 'reading' || state === 'working') active = 'book';
    if (state === 'waiting-transit') active = 'phone';
    if (state === 'refreshments') active = 'cup';
    if (state === 'photographing') active = 'camera';
    if (state === 'stretching') active = null;
    for (const [name, instances] of props) for (const instance of instances) instance.visible = name === active;
    wear.visible = distance < 52;
  };
  return person;
}

function getLibrary(THREE) {
  if (libraries.has(THREE)) return libraries.get(THREE);
  const palette = new Map();
  const material = (color, metal = 0) => {
    const key = color + metal;
    if (!palette.has(key)) palette.set(key, new THREE.MeshStandardMaterial({ color, roughness: metal ? .43 : .86, metalness: metal }));
    return palette.get(key);
  };
  const mesh = (parent, geometry, color, x, y, z, metal = 0) => {
    const object = new THREE.Mesh(geometry, material(color, metal)); object.position.set(x, y, z);
    object.castShadow = true; object.receiveShadow = true; parent.add(object); return object;
  };
  const round = (parent, color, x, y, z, sx, sy, sz) => {
    const geometry = new THREE.SphereGeometry(1, 12, 8); geometry.scale(sx, sy, sz);
    return mesh(parent, geometry, color, x, y, z);
  };
  const box = (parent, color, x, y, z, w, h, d) => mesh(parent, new THREE.BoxGeometry(w, h, d), color, x, y, z);
  const glasses = new THREE.Group(); glasses.name = 'Fine metal reading glasses';
  for (const side of [-1, 1]) {
    const ring = new THREE.TorusGeometry(.027, .003, 5, 14); ring.scale(1.18, .76, 1);
    mesh(glasses, ring, '#615d50', side * .042, 1.632, .108, .35);
  }
  box(glasses, '#615d50', 0, 1.634, .108, .024, .004, .004);
  const hat = new THREE.Group(); hat.name = 'Cotton work cap';
  const cap = new THREE.SphereGeometry(.127, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  cap.scale(1, .60, 1.02); mesh(hat, cap, '#c7b68f', 0, 1.723, -.009);
  round(hat, '#a89772', 0, 1.728, .11, .116, .009, .074);
  const props = new Map();
  const make = name => { const group = new THREE.Group(); group.name = name; props.set(name, group); return group; };
  const book = make('book');
  box(book, '#665c49', 0, -.275, .069, .135, .175, .024);
  box(book, '#dfd9c5', .001, -.275, .084, .118, .158, .015);
  box(book, '#73837a', 0, -.276, .095, .137, .177, .006);
  const phone = make('phone');
  box(phone, '#344047', 0, -.28, .055, .065, .13, .012);
  box(phone, '#88a7a5', 0, -.275, .063, .053, .104, .003);
  const cup = make('cup');
  mesh(cup, new THREE.CylinderGeometry(.034, .026, .084, 14), '#d6c9ac', 0, -.26, .055);
  mesh(cup, new THREE.CylinderGeometry(.035, .035, .009, 14), '#403a30', 0, -.214, .055);
  const camera = make('camera');
  box(camera, '#3c4548', 0, -.27, .074, .14, .084, .048);
  const lens = mesh(camera, new THREE.CylinderGeometry(.033, .031, .041, 14), '#202e34', 0, -.27, .115, .1); lens.rotation.x = Math.PI / 2;
  const parcel = make('parcel');
  box(parcel, '#ac9670', 0, -.18, .12, .19, .22, .17);
  box(parcel, '#d0bea0', 0, -.18, .208, .041, .224, .003);
  const toolbag = make('toolbag');
  round(toolbag, '#5a685e', 0, -.42, .02, .112, .104, .085);
  const handle = mesh(toolbag, new THREE.TorusGeometry(.056, .008, 5, 12, Math.PI), '#4c5146', 0, -.347, .02); handle.rotation.z = 0;
  const result = { glasses, hat, props }; libraries.set(THREE, result); return result;
}
