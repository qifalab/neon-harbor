/** Original ceramic pigment and relief recipe, CC0-1.0.
 * Generated only for Copper Reed's resident objects. These are authored maps,
 * not scans, and their owner releases all six textures with the storefront.
 */
const SIZE=256;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hash=(x,y,seed)=>{
 let n=Math.imul(x+seed*17,374761393)^Math.imul(y+seed*29,668265263);
 n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967295;
};
const noise=(x,y,seed,period=8)=>{
 const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
 const sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
 const h=(dx,dy)=>hash((ix+dx+period*4)%period,iy+dy,seed);
 return(h(0,0)*(1-sx)+h(1,0)*sx)*(1-sy)+(h(0,1)*(1-sx)+h(1,1)*sx)*sy;
};

export function createCraftCeramicMaps(THREE,kind='glaze') {
 if(!['glaze','clay'].includes(kind))throw new RangeError('Unknown original ceramic finish');
 const glazed=kind==='glaze',color=new Uint8Array(SIZE*SIZE*4),relief=new Uint8Array(color.length),rough=new Uint8Array(color.length);
 for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
  const u=x/SIZE,v=y/SIZE,i=(y*SIZE+x)*4;
  const cloud=noise(u*8,v*6,glazed?13:31),grain=hash(x,y,glazed?29:43),firing=noise(u*24,v*18,7,24);
  // The thrown rings are irregular, shallow relief; the map does not displace
  // the conserved object envelope or draw a separate decorative stripe.
  const rings=Math.sin(v*2*Math.PI*36+noise(u*8,v*4,17)*.7);
  const speck=Math.pow(Math.max(0,(grain-.965)/.035),2);
  const mottling=(cloud-.5)*(glazed?21:27)+(firing-.5)*(glazed?5:11);
  const base=glazed?[222,210,187]:[177,126,91];
  const tint=glazed?mottling-speck*28:mottling+(grain-.5)*8-speck*20;
  const height=clamp(.50+(grain-.5)*(glazed?.12:.31)+(rings)*(glazed?.027:.06)-speck*(glazed?.07:.18),0,1);
  const r=glazed?clamp(.255+(cloud-.5)*.15+(firing-.5)*.04+speck*.10,.17,.39):clamp(.855+(cloud-.5)*.12+(grain-.5)*.06+speck*.05,.74,.97);
  for(let k=0;k<3;k++){color[i+k]=Math.round(clamp(base[k]+tint,0,255));relief[i+k]=Math.round(height*255);rough[i+k]=Math.round(r*255);}
  color[i+3]=relief[i+3]=rough[i+3]=255;
 }
 const texture=(data,srgb)=>{
  const t=new THREE.DataTexture(data,SIZE,SIZE,THREE.RGBAFormat);
  t.name=`Copper Reed · original ${kind} ${srgb?'pigment':'physical map'}`;
  t.wrapS=THREE.RepeatWrapping;t.wrapT=THREE.ClampToEdgeWrapping;
  t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;
  t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;t.anisotropy=4;t.needsUpdate=true;return t;
 };
 return{map:texture(color,true),bumpMap:texture(relief,false),roughnessMap:texture(rough,false),bumpScale:glazed?.00045:.0010};
}

export function createCraftCeramicOwner(THREE) {
 const maps={glaze:createCraftCeramicMaps(THREE,'glaze'),clay:createCraftCeramicMaps(THREE,'clay')};
 const material=kind=>{
  const m=new THREE.MeshStandardMaterial({color:0xffffff,metalness:0,roughness:1,...maps[kind]});
  m.name=kind==='glaze'?'Copper Reed · ivory fired glaze':'Copper Reed · porous unglazed stoneware';
  m.userData.harborArt=true;m.userData.originalCeramic=kind;return m;
 };
 const glaze=material('glaze'),clay=material('clay');let disposed=false;
 return{glaze,clay,maps,dispose(){if(disposed)return;disposed=true;for(const set of Object.values(maps))for(const texture of Object.values(set))if(texture?.isTexture)texture.dispose();glaze.dispose();clay.dispose();}};
}
