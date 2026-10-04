/** Local contact shading from the scene depth buffer. This is deliberately a
 * short-range effect: distant silhouettes and sky do not acquire dark halos.
 * The scene stays full resolution and multisampled; only AO is half resolution.
 */
export function createContactOcclusion(THREE, renderer) {
  const gl = renderer.getContext();
  const supported = renderer.extensions.has('EXT_color_buffer_float');
  const sampleCounts = supported
    ? [...gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA16F, gl.SAMPLES)] : [];
  const depthSampleCounts = supported
    ? [...gl.getInternalformatParameter(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, gl.SAMPLES)] : [];
  const samples = sampleCounts.filter(n => n <= 4 && depthSampleCounts.includes(n))
    .sort((a, b) => b - a)[0] || 0;
  const drawingSize = new THREE.Vector2();
  let quality = 'high', sceneTarget = null, aoTarget = null, disposed = false;
  let width = 1, height = 1;
  const stats = { passes: 1, cpuSubmitMs: 0 };
  const vertexShader = `varying vec2 vUv;
    void main() { vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`;
  const depthFunctions = `
    uniform sampler2D sceneDepth;
    uniform mat4 inverseProjection;
    uniform vec2 fullTexel;
    vec3 viewPosition(vec2 uv, float depth) {
      uv=(floor(uv/fullTexel)+0.5)*fullTexel;
      vec4 p=inverseProjection*vec4(uv*2.0-1.0,depth*2.0-1.0,1.0);
      return p.xyz/p.w;
    }
    float depthAt(vec2 uv) { return texture2D(sceneDepth,(floor(uv/fullTexel)+0.5)*fullTexel).x; }
  `;
  const aoMaterial = new THREE.ShaderMaterial({
    name: 'Near-surface contact occlusion',
    depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false,
    uniforms: {
      sceneDepth: { value: null }, inverseProjection: { value: new THREE.Matrix4() },
      fullTexel: { value: new THREE.Vector2() }, projectionScale: { value: 1 },
      radius: { value: 1.15 },
    },
    vertexShader,
    fragmentShader: `precision highp float;
      varying vec2 vUv;
      uniform float projectionScale, radius;
      ${depthFunctions}
      void main() {
        // Half-resolution fragments lie on full-resolution texel borders.
        // Start on a texel CENTER before taking derivatives: border rounding
        // otherwise makes alternating zero-length tangents and visible stripes.
        vec2 centerUv=(floor(gl_FragCoord.xy)*2.0+0.5)*fullTexel;
        float depth=depthAt(centerUv);
        if(depth>=0.999999) { gl_FragColor=vec4(1.0,0.0,0.0,1.0); return; }
        vec3 center=viewPosition(centerUv,depth);
        float distanceToCamera=-center.z;
        if(distanceToCamera>110.0) {
          gl_FragColor=vec4(1.0,distanceToCamera,0.0,1.0); return;
        }
        // Choose the less discontinuous side of each depth derivative. Using
        // dFdx across silhouettes creates false normals and wide dirty edges.
        vec2 dx=vec2(fullTexel.x,0.0),dy=vec2(0.0,fullTexel.y);
        vec3 left=viewPosition(centerUv-dx,depthAt(centerUv-dx));
        vec3 right=viewPosition(centerUv+dx,depthAt(centerUv+dx));
        vec3 down=viewPosition(centerUv-dy,depthAt(centerUv-dy));
        vec3 up=viewPosition(centerUv+dy,depthAt(centerUv+dy));
        vec3 tangentX=abs(left.z-center.z)<abs(right.z-center.z)?center-left:right-center;
        vec3 tangentY=abs(down.z-center.z)<abs(up.z-center.z)?center-down:up-center;
        vec3 normal=normalize(cross(tangentX,tangentY));
        if(dot(normal,-center)<0.0) normal=-normal;
        float screenRadius=min(72.0,radius*projectionScale/max(distanceToCamera,0.1));
        // A fixed interleaved rotation breaks bands without frame jitter.
        float rotation=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(0.06711056,0.00583715))))*6.283185307;
        float occlusion=0.0;
        for(int i=0;i<16;i++) {
          float fi=float(i)+0.5;
          float angle=fi*2.39996323+rotation;
          vec2 uv=centerUv+vec2(cos(angle),sin(angle))*sqrt(fi/16.0)*screenRadius*fullTexel;
          if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0) continue;
          float otherDepth=depthAt(uv);
          if(otherDepth>=0.999999) continue;
          vec3 delta=viewPosition(uv,otherDepth)-center;
          float lengthSquared=dot(delta,delta);
          float lengthToSample=sqrt(max(lengthSquared,0.00001));
          float horizon=max(dot(normal,delta)/lengthToSample-0.055,0.0);
          float range=1.0-smoothstep(radius*0.2,radius,lengthToSample);
          occlusion+=horizon*range;
        }
        float fade=1.0-smoothstep(65.0,110.0,distanceToCamera);
        float visibility=1.0-min(0.42,occlusion*(2.0/16.0)*fade);
        gl_FragColor=vec4(visibility,distanceToCamera,0.0,1.0);
      }`,
  });
  const compositeMaterial = new THREE.ShaderMaterial({
    name: 'Depth-aware contact composite and display output',
    depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    uniforms: {
      sceneColor: { value: null }, sceneDepth: { value: null }, occlusion: { value: null },
      inverseProjection: { value: new THREE.Matrix4() }, fullTexel: { value: new THREE.Vector2() }, aoSize: { value: new THREE.Vector2() },
      fogColor: { value: new THREE.Color() }, fogParams: { value: new THREE.Vector3() }, fogMode: { value: 0 },
    },
    vertexShader,
    fragmentShader: `precision highp float;
      varying vec2 vUv;
      uniform sampler2D sceneColor,occlusion;
      uniform vec2 aoSize;
      uniform vec3 fogColor,fogParams;
      uniform float fogMode;
      ${depthFunctions}
      void main() {
        vec4 color=texture2D(sceneColor,vUv);
        float depth=depthAt(vUv),visibility=1.0,fogAmount=0.0;
        if(depth<0.999999) {
          float viewDepth=-viewPosition(vUv,depth).z;
          if(fogMode>1.5) fogAmount=1.0-exp(-fogParams.x*fogParams.x*viewDepth*viewDepth);
          else if(fogMode>0.5) fogAmount=smoothstep(fogParams.y,fogParams.z,viewDepth);
          // Three's direct pipeline mixes fog AFTER tone mapping and display
          // conversion. Undo the linear target's fog, then reproduce that
          // ordering below so switching quality does not wash out the skyline.
          color.rgb=max((color.rgb-fogColor*fogAmount)/max(1.0-fogAmount,0.001),vec3(0.0));
          vec2 pixel=vUv*aoSize-0.5,base=floor(pixel+0.5);
          float total=0.0,weighted=0.0;
          for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++) {
            vec2 offset=vec2(float(x),float(y));
            vec2 sampleValue=texture2D(occlusion,(base+offset+0.5)/aoSize).rg;
            vec2 delta=base+offset-pixel;
            float spatialWeight=exp(-dot(delta,delta)*0.8);
            float depthWeight=exp(-abs(sampleValue.y-viewDepth)/max(0.045,viewDepth*0.012));
            float w=spatialWeight*depthWeight;
            weighted+=sampleValue.x*w; total+=w;
          }
          if(total>0.0001) visibility=weighted/total;
        }
        gl_FragColor=vec4(color.rgb*visibility,color.a);
        // Three r185 leaves non-XR render targets in linear HDR with no tone
        // mapping. Apply exposure, ACES and the output transfer exactly here.
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor.rgb=mix(gl_FragColor.rgb,linearToOutputTexel(vec4(fogColor,1.0)).rgb,fogAmount);
      }`,
  });
  const passScene = new THREE.Scene();
  const passCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const triangle = new THREE.Mesh(geometry, aoMaterial);
  triangle.frustumCulled = false;
  passScene.add(triangle);

  function releaseTargets() {
    sceneTarget?.dispose(); aoTarget?.dispose();
    sceneTarget = null; aoTarget = null;
    aoMaterial.uniforms.sceneDepth.value = null;
    compositeMaterial.uniforms.sceneColor.value = null;
    compositeMaterial.uniforms.sceneDepth.value = null;
    compositeMaterial.uniforms.occlusion.value = null;
  }
  function enabled() { return supported && quality !== 'low' && !disposed; }
  function resize() {
    if (disposed) return;
    renderer.getDrawingBufferSize(drawingSize);
    width = Math.max(1, Math.floor(drawingSize.x)); height = Math.max(1, Math.floor(drawingSize.y));
    if (!enabled()) return;
    const aoWidth = Math.max(1, Math.ceil(width / 2)), aoHeight = Math.max(1, Math.ceil(height / 2));
    if (!sceneTarget) {
      sceneTarget = new THREE.WebGLRenderTarget(width, height, {
        type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        depthBuffer: true, stencilBuffer: false, samples,
      });
      sceneTarget.texture.name = 'Contact shading · linear HDR scene';
      sceneTarget.depthTexture = new THREE.DepthTexture(width, height, THREE.UnsignedIntType);
      aoTarget = new THREE.WebGLRenderTarget(aoWidth, aoHeight, {
        type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
        depthBuffer: false, stencilBuffer: false,
      });
      aoTarget.texture.name = 'Contact shading · half-resolution visibility and view depth';
      aoMaterial.uniforms.sceneDepth.value = sceneTarget.depthTexture;
      compositeMaterial.uniforms.sceneColor.value = sceneTarget.texture;
      compositeMaterial.uniforms.sceneDepth.value = sceneTarget.depthTexture;
      compositeMaterial.uniforms.occlusion.value = aoTarget.texture;
    } else {
      sceneTarget.setSize(width, height); aoTarget.setSize(aoWidth, aoHeight);
    }
    aoMaterial.uniforms.fullTexel.value.set(1 / width, 1 / height);
    compositeMaterial.uniforms.fullTexel.value.set(1 / width, 1 / height);
    compositeMaterial.uniforms.aoSize.value.set(aoWidth, aoHeight);
  }
  return {
    setQuality(next) {
      quality = ['high', 'balanced', 'low'].includes(next) ? next : 'high';
      if (!enabled()) releaseTargets();
      resize();
    },
    resize,
    render(scene, camera) {
      if (disposed) return;
      const begin = performance.now(), autoReset = renderer.info.autoReset;
      const previousTarget = renderer.getRenderTarget();
      renderer.info.autoReset = false; renderer.info.reset();
      try {
        if (!enabled()) {
          stats.passes = 1;
          renderer.render(scene, camera);
          return;
        }
        if (!sceneTarget) resize();
        stats.passes = 3;
        aoMaterial.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
        compositeMaterial.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
        aoMaterial.uniforms.projectionScale.value = camera.projectionMatrix.elements[5] * height * 0.5;
        const fog = scene.fog;
        compositeMaterial.uniforms.fogMode.value = fog ? (fog.isFogExp2 ? 2 : 1) : 0;
        if (fog) {
          compositeMaterial.uniforms.fogColor.value.copy(fog.color);
          compositeMaterial.uniforms.fogParams.value.set(fog.density || 0, fog.near || 0, fog.far || 1);
        }
        renderer.setRenderTarget(sceneTarget);
        renderer.render(scene, camera);
        triangle.material = aoMaterial;
        renderer.setRenderTarget(aoTarget);
        renderer.render(passScene, passCamera);
        triangle.material = compositeMaterial;
        renderer.setRenderTarget(previousTarget);
        renderer.render(passScene, passCamera);
      } finally {
        renderer.setRenderTarget(previousTarget);
        renderer.info.autoReset = autoReset;
        stats.cpuSubmitMs = Math.round((performance.now() - begin) * 100) / 100;
      }
    },
    snapshot() {
      return { enabled: enabled(), supported, quality, technique: 'depth-reconstructed short-range SSAO',
        sceneSize: [width, height], occlusionSize: aoTarget ? [aoTarget.width, aoTarget.height] : null,
        samples: enabled() ? samples : 0, ...stats,
        fallback: supported ? null : 'HDR render targets unavailable',
      };
    },
    dispose() {
      if (disposed) return;
      releaseTargets(); geometry.dispose(); aoMaterial.dispose(); compositeMaterial.dispose();
      disposed = true;
    },
  };
}
