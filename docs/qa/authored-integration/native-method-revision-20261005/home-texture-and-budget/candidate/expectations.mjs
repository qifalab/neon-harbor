// Exact sealed authored assets, unchanged official GLBs, and original fittings.
// Packed source/owner counts are never described as fully uploaded GPU counts.
export const MODELS=Object.freeze({
 bench_vice_01:{folder:'workshop',geometries:4,textures:3,images:3,bones:1,sha256:'4dc3378d2d63e16e18dafaa82bb16eb59d4bcd7b57c1543f450da22c18141c1e'},
 metal_tool_chest:{folder:'workshop',geometries:7,textures:3,images:3,bones:0,sha256:'e1bcd07991c2c01df17bb628c5e621a0da170db2313b025aa2d918b156e27803'},
 metal_office_desk:{folder:'workshop',geometries:9,textures:3,images:3,bones:0,sha256:'75559afa2a66f018ff2aba92e47ce169783bb54d8f9799b8ce6671954111496a'},
 wooden_bookshelf_worn:{folder:'workshop',geometries:1,textures:3,images:3,bones:0,sha256:'3d73968cc71c317f139f1f7a4cbfbaaa5155b7ff286584f799140b5dfe7c6177'},
 'workshop-fittings':{folder:'workshop',geometries:11,textures:4,images:4,bones:0,sha256:'9c548499c87b71cac2ed44b18803fdd9221359a7017da65e03420f77d816ebf0'},
 sofa_03:{folder:'home',geometries:2,textures:4,images:4,bones:0,sha256:'8bf6e226b6add7aaf31479dd824e50c8ce6024df48cb609b900976f6991b5a3b'},
 old_bed_frame:{folder:'home',geometries:1,textures:3,images:3,bones:0,sha256:'910cc9d69a03285ffa6b66fd7734be68a7f6a045f14ae5922aa4e5946fdefa9f'},
 'home-lobby-fittings':{folder:'home',geometries:14,textures:7,images:7,bones:0,sha256:'9db26832bae72c3f1f96e2b1a093a748ac0cee0ac864f6b1b8ac96d8da9d4ced'},
 'home-gallery-fittings':{folder:'home',geometries:16,textures:4,images:4,bones:0,sha256:'d0aee01ed0d4cd04080ecf1058f0e4ff699f22edc14d49b2889d6c110c936bba'},
});
export function expectedIds(mode,channel,floorId){
 if(channel==='home')return mode==='baseline'?null:floorId==='lobby'?['sofa_03','old_bed_frame','home-lobby-fittings']:['home-gallery-fittings'];
 if(channel==='workshop')return mode==='baseline'?['bench_vice_01','metal_tool_chest']:['bench_vice_01','metal_tool_chest','metal_office_desk','wooden_bookshelf_worn','workshop-fittings'];
 throw new Error('Unrecognized owner channel');
}
