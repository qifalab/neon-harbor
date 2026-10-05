import argparse, hashlib, json, math, struct
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).parent
args=argparse.ArgumentParser()
args.add_argument('--assets',default='/tmp/neon-harbor-street-refinement-candidate-20261005/assets/harbor/vegetation')
args.add_argument('--output',default='measurement.json')
options=args.parse_args()
ASSETS = Path(options.assets)
META = Path('/workspace/neon-evidence/5cd-resident-core-11326827515/extracted/native/authored/metadata.json')

def glb(path):
    data = path.read_bytes()
    jlen = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20+jlen])
    bin_offset = 28+jlen
    def attr(primitive, name):
        a = doc['accessors'][primitive['attributes'][name]]
        v = doc['bufferViews'][a['bufferView']]
        n = {'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
        return np.frombuffer(data, dtype='<f4', count=a['count']*n,
            offset=bin_offset+v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,n).copy()
    arrays = {mesh['name']: {k:attr(mesh['primitives'][0],k) for k in mesh['primitives'][0]['attributes']}
              for mesh in doc['meshes']}
    return data, doc, arrays

def convex_hull(points):
    p = sorted(set(map(tuple,points)))
    def cross(o,a,b):
        return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
    lower=[]
    for pt in p:
        while len(lower)>=2 and cross(lower[-2],lower[-1],pt)<=0: lower.pop()
        lower.append(pt)
    upper=[]
    for pt in reversed(p):
        while len(upper)>=2 and cross(upper[-2],upper[-1],pt)<=0: upper.pop()
        upper.append(pt)
    return np.array(lower[:-1]+upper[:-1])

def polyarea(p):
    return abs(np.dot(p[:,0],np.roll(p[:,1],1))-np.dot(p[:,1],np.roll(p[:,0],1)))/2

def projected_union(tri, resolution=200):
    xy = tri.reshape(-1,2)
    low=xy.min(0); high=xy.max(0)
    size=tuple(np.ceil((high-low)*resolution).astype(int)+5)
    image=Image.new('1',size,0); draw=ImageDraw.Draw(image)
    for t in tri:
        draw.polygon([tuple(v) for v in (t-low)*resolution+2],fill=1)
    covered=int(np.asarray(image,dtype=np.uint8).sum())/resolution**2
    hull=polyarea(convex_hull(xy))
    return {'unionM2Approx':float(covered),'convexHullM2':float(hull),'unionToConvexHullApprox':float(covered/hull),
            'samplingMetres':1/resolution,'boxMetres':(high-low).tolist()}

def photo_projection(points, camera):
    position=np.array([camera['position'][k] for k in ('x','y','z')])
    target=np.array([camera['target'][k] for k in ('x','y','z')])
    forward=target-position;forward/=np.linalg.norm(forward)
    right=np.cross(forward,[0,1,0]);right/=np.linalg.norm(right)
    up=np.cross(right,forward)
    v=points-position
    depth=v@forward
    focal=800/2/math.tan(math.radians(camera['fov']/2))
    return np.stack([640+focal*(v@right)/depth,400-focal*(v@up)/depth],-1)

meta=json.loads(META.read_text())
camera=next(c for c in meta['captures'] if c['label']=='02-commuter-player')['before']['camera']
report={'status':'READ_ONLY_MEASUREMENT_NOT_GPU_ART_ACCEPTANCE',
        'measuredAssetDirectory':str(ASSETS),
        'sourceHead':'5cd20885881c5fd9d30b405eb267a25ec7752164',
        'image':{'path':str(META.parent/'02-commuter-player.png'),
            'sha256':hashlib.sha256((META.parent/'02-commuter-player.png').read_bytes()).hexdigest(),
            'actualCamera':camera},
        'method':'Actual GLB first two outward triangles per closed leaf are its one-sided folded blade surface. Orthographic projected triangle unions sampled at 5 mm; convex hull is a geometric envelope proxy, not real botanical crown or native shaded visibility.',
        'variants':[]}
for name in ('quay-banyan-a','quay-banyan-b','quay-banyan-c'):
    data, doc, arrays=glb(ASSETS/(name+'.glb'))
    p=arrays['leaves']['POSITION'];leaf=p.reshape(-1,12,3,3)
    top=leaf[:,:2]
    area=np.linalg.norm(np.cross(top[:,:,1]-top[:,:,0],top[:,:,2]-top[:,:,0]),axis=-1)/2
    all_tri=p.reshape(-1,3,3)
    all_area=np.linalg.norm(np.cross(all_tri[:,1]-all_tri[:,0],all_tri[:,2]-all_tri[:,0]),axis=-1)/2
    record={'name':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),
            'leafCount':len(leaf),'triangles':len(p)//3+len(arrays['bark']['POSITION'])//3,
            'leafOneSideSurfaceAreaM2':float(area.sum()),
            'leafMeanOneSideAreaCm2':float(area.sum()/len(leaf)*10000),
            'leafTotalClosedSurfaceM2':float(all_area.sum()),
            'barkAttributeSha256':{k:hashlib.sha256(v.astype('<f4').tobytes()).hexdigest() for k,v in arrays['bark'].items()},
            'min':p.min(0).tolist(),'max':p.max(0).tolist(),
            'leafDegenerateTriangles':int((all_area<=1e-12).sum()),
            'orthographicProjections':{label:projected_union(top[:,:,:,axes].reshape(-1,3,2))
                 for label,axes in [('frontXY',[0,1]),('sideZY',[2,1]),('topXZ',[0,2])]}}
    if name=='quay-banyan-b':
        world=p+[-503,0,-445]
        pixels=photo_projection(world,camera).reshape(-1,12,3,2)
        leaf_pix=pixels[:,:2]
        dims=leaf_pix.reshape(-1,6,2).max(1)-leaf_pix.reshape(-1,6,2).min(1)
        xy=leaf_pix.reshape(-1,2)
        hull=convex_hull(xy)
        mask=Image.new('1',(1280,800),0);draw=ImageDraw.Draw(mask)
        for t in leaf_pix.reshape(-1,3,2):draw.polygon(list(map(tuple,t)),fill=1)
        record['actualCameraGeometricLeafProjection']={'treeWorldRoot':[-503,0,-445],
             'leafPixelBox':{'min':xy.min(0).tolist(),'max':xy.max(0).tolist()},
             'leafHullPx2':float(polyarea(hull)),
             'rasterUnionPxApprox':int(np.asarray(mask,dtype=np.uint8).sum()),
             'medianLeafBoxPx':np.median(dims,axis=0).tolist(),
             'leavesWithBoxMinDimensionUnder1Px':int((dims.min(1)<1).sum()),
             'limitations':'CPU geometry projection only; no depth/scene occlusion, texture, antialiasing, native shading or actual lit pixels; union small-polygon rasterization overestimates coverage.'}
    report['variants'].append(record)
(HERE/options.output).write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
