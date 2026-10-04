/** Depth-based contact occlusion: beauty/depth once, half-resolution AO,
 * depth-aware composite. No shadow/physics mutations and no per-frame allocation.
 * The final pass alone applies tone mapping and output colour conversion.
 */
export function createContactOcclusion(THREE, renderer) {
  const depth = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  const beauty = new THREE.WebGLRenderTarget(1, 1, { depthTexture: depth, type: THREE.HalfFloatType });
  beauty.samples=4;
  const occlusion = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new THREE.PlaneGeometry(2, 2);
  const vertexShader = 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
  const uniforms = { beauty: { value: beauty.texture }, depth: { value: depth }, ao: { value: occlusion.texture },
    inverseProjection: { value: new THREE.Matrix4() }, projection: { value: new THREE.Matrix4() },
    texel: { value: new THREE.Vector2() }, strength: { value: .70 } };
  const reconstruction = `
    uniform sampler2D depth; uniform mat4 inverseProjection;
    vec3 viewAt(vec2 uv){vec4 p=inverseProjection*vec4(uv*2.-1.,texture2D(depth,uv).x*2.-1.,1.);return p.xyz/p.w;}
  `;
  const aoMaterial = new THREE.ShaderMaterial({ uniforms, vertexShader, depthTest: false, depthWrite: false,
    fragmentShader: `varying vec2 vUv; uniform mat4 projection; uniform vec2 texel; ${reconstruction}
      void main(){
        float d=texture2D(depth,vUv).x;
        if(d>=.999999){gl_FragColor=vec4(1.);return;}
        vec3 p=viewAt(vUv);vec3 n=normalize(cross(dFdx(p),dFdy(p)));
        if(dot(n,-p)<0.)n=-n;
        float radius=.85;float total=0.;
        float angle=fract(sin(dot(floor(vUv/texel),vec2(12.9898,78.233)))*43758.5453)*6.283185;
        vec2 projected=vec2(projection[0][0],projection[1][1])*radius/max(-p.z,.3)*.5;
        for(int i=0;i<12;i++){
          float f=float(i);float a=angle+f*2.399963;float r=sqrt((f+.5)/12.);
          vec2 uv=vUv+vec2(cos(a),sin(a))*projected*r;
          if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))continue;
          vec3 delta=viewAt(uv)-p;float distance=length(delta);
          float horizon=max(dot(n,delta)/max(distance,.001)-.07,0.);
          total+=horizon*(1.-smoothstep(.12,radius*1.5,distance));
        }
        gl_FragColor=vec4(vec3(clamp(1.-total*.23,.42,1.)),1.);
      }` });
  const composite = new THREE.ShaderMaterial({ uniforms, vertexShader, depthTest: false, depthWrite: false,
    fragmentShader: `varying vec2 vUv; uniform sampler2D beauty,ao; uniform vec2 texel; uniform float strength; ${reconstruction}
      void main(){
        vec3 p=viewAt(vUv);float sum=0.;float weight=0.;
        for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){
          vec2 uv=vUv+vec2(float(x),float(y))*texel*2.;
          float w=exp(-abs(viewAt(uv).z-p.z)*6.);
          sum+=texture2D(ao,uv).x*w;weight+=w;
        }
        float contact=mix(1.,sum/max(weight,.0001),strength);
        gl_FragColor=vec4(texture2D(beauty,vUv).rgb*contact,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
  const quad = new THREE.Mesh(geometry, composite); quad.frustumCulled = false; scene.add(quad);
  const size = new THREE.Vector2(); let width = 0, height = 0;
  return {
    render(world, viewCamera, quality) {
      renderer.info.reset();
      if (quality === 'low') { renderer.setRenderTarget(null); renderer.render(world, viewCamera); return; }
      renderer.getDrawingBufferSize(size);
      if (width !== size.x || height !== size.y) {
        width = size.x; height = size.y; beauty.setSize(width, height);
        occlusion.setSize(Math.max(1,Math.ceil(width/2)),Math.max(1,Math.ceil(height/2)));
        uniforms.texel.value.set(1/width,1/height);
      }
      uniforms.inverseProjection.value.copy(viewCamera.projectionMatrixInverse);
      uniforms.projection.value.copy(viewCamera.projectionMatrix);
      uniforms.strength.value = quality === 'high' ? .70 : .55;
      renderer.setRenderTarget(beauty); renderer.render(world, viewCamera);
      quad.material=aoMaterial; renderer.setRenderTarget(occlusion); renderer.render(scene,camera);
      quad.material=composite; renderer.setRenderTarget(null); renderer.render(scene,camera);
    },
    get metadata() { return { enabled: true, technique: 'depth-contact-occlusion', samples: 12, resolution: .5, width, height }; },
    dispose() { beauty.dispose(); depth.dispose(); occlusion.dispose(); geometry.dispose(); aoMaterial.dispose(); composite.dispose(); },
  };
}
