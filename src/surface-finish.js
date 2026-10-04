/** Shared, metre-scale microdetail. This is original analytic art, not a scan.
 * Object-space coordinates keep clothes/paint attached to moving models.
 * Derivative filtering removes unresolved grain rather than making it sparkle.
 */
export const SURFACE_FINISHES = Object.freeze({
  paint: { scale: 2100, relief: .000018, roughness: .055, patina: .035 },
  skin: { scale: 850, relief: .000025, roughness: .10, patina: .05 },
  fabric: { scale: 1250, relief: .00016, roughness: .075, patina: .04 },
  leather: { scale: 650, relief: .00008, roughness: .17, patina: .06 },
  metal: { scale: 1500, relief: .000014, roughness: .10, patina: .025 },
  mineral: { scale: 95, relief: .0011, roughness: .11, patina: .10 },
});

export function applySurfaceFinish(material, kind, { world = false } = {}) {
  const finish = SURFACE_FINISHES[kind];
  if (!finish) throw new Error(`Unknown surface finish: ${kind}`);
  const previous = material.onBeforeCompile.bind(material);
  const previousKey = material.customProgramCacheKey.bind(material)();
  material.userData.surfaceFinish = { kind, world, ...finish };
  material.onBeforeCompile = shader => {
    previous(shader);
    shader.vertexShader = `varying vec3 vFinishPosition;\n${shader.vertexShader}`.replace('#include <project_vertex>', `
      vec4 finishPosition = vec4(transformed, 1.0);
      ${world ? `#ifdef USE_INSTANCING
        finishPosition = instanceMatrix * finishPosition;
      #endif
      finishPosition = modelMatrix * finishPosition;` : ''}
      vFinishPosition = finishPosition.xyz;
      #include <project_vertex>`);
    shader.fragmentShader = `varying vec3 vFinishPosition;
      float finishHash(vec3 p) { p=fract(p*.1031); p+=dot(p,p.yzx+33.33); return fract((p.x+p.y)*p.z); }
      float finishNoise(vec3 p) {
        vec3 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(finishHash(i),finishHash(i+vec3(1,0,0)),f.x),
          mix(finishHash(i+vec3(0,1,0)),finishHash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(finishHash(i+vec3(0,0,1)),finishHash(i+vec3(1,0,1)),f.x),
          mix(finishHash(i+vec3(0,1,1)),finishHash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
      ${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 finishQ = vFinishPosition * ${finish.scale.toFixed(1)};
      float finishResolved = 1.0-smoothstep(.6,2.0,length(fwidth(finishQ)));
      float finishGrain = (finishNoise(finishQ)-.5)*finishResolved;
      ${kind === 'fabric' ? 'finishGrain += sin(finishQ.x)*sin(finishQ.y)*.16*finishResolved;' : ''}
      ${kind === 'metal' ? 'finishGrain += sin(finishQ.y)*.23*finishResolved;' : ''}
      float finishBroad = finishNoise(vFinishPosition*${kind === 'mineral' ? '1.2' : '11.0'})-.5;
      diffuseColor.rgb *= 1.0+finishBroad*${finish.patina.toFixed(4)};
    `).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor=clamp(roughnessFactor+finishGrain*${finish.roughness.toFixed(4)}+finishBroad*.035,.12,1.0);
    `).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      float finishHeight=finishGrain*${finish.relief.toFixed(7)};
      vec3 finishDx=dFdx(-vViewPosition),finishDy=dFdy(-vViewPosition);
      vec3 finishR1=cross(finishDy,normal),finishR2=cross(normal,finishDx);
      float finishDet=dot(finishDx,finishR1);
      if(abs(finishDet)>.00000001) normal=normalize(abs(finishDet)*normal-sign(finishDet)*
        (dFdx(finishHeight)*finishR1+dFdy(finishHeight)*finishR2));
    `);
  };
  material.customProgramCacheKey = () => `${previousKey}:finish-v08:${kind}:${world}`;
  material.needsUpdate = true;
  return material;
}
