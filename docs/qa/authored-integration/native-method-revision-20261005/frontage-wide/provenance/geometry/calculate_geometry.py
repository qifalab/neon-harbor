"""Read-only JSON/text inputs and elementary geometry, never imports product code."""
from pathlib import Path
import hashlib, json, math, subprocess

OUT = Path(__file__).parent
ROOT = Path('/workspace/scratch/neon-harbor')
METHOD = Path('/tmp/neon-native-ef92-south-094-11319503714/extracted/preparation/method-bundle-original/methods/harbor')
NATIVE = Path('/tmp/neon-native-ef92-south-094-11319503714/extracted/native/authored/metadata.json')
HISTORY = ROOT / 'docs/qa/art-pilot/vice-detail-region-native-2026-10-04/metadata.json'
IDS = ['south-090', 'south-091', 'south-092', 'south-094', 'south-095', 'south-096']
RADIUS, TOLERANCE, EAST_X = .65, .15, 234.5

def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
catalogue = json.loads((METHOD/'evidence/captured-buildings.json').read_text())['buildings']
native = json.loads(NATIVE.read_text())
history = json.loads(HISTORY.read_text())
assert native['gitHead'] == 'ef92c25980f1da12b508971170b72b9dd6230059'
assert catalogue == native['actualAddressCatalogue']
assert sha(ROOT/'src/world.js') == history['sourceHashes']['src/world.js']
assert sha(ROOT/'src/world-config.js') == history['sourceHashes']['src/world-config.js']
all_buildings = history['finalOutsideSnapshot']['city']['buildings']
south = [b for b in all_buildings if b['district'] == 'south-expansion']
assert len(south) == 96
for b in south:
    if b['id'] in catalogue:
        for key in ['x','z','width','depth','height','baseY']:
            assert b[key] == catalogue[b['id']][key]

def rect(id, kind, x, z, hx, hz, min_y, max_y, origin):
    return dict(id=id, kind=kind, x=x, z=z, hx=hx, hz=hz,
                minY=min_y, maxY=max_y, origin=origin)

# Source world.js:326-344 gives actual shell collider dimensions for all 96
# captured south buildings. This evaluates geometry formulas on evidence, not
# createWorld, renderer, model, RNG, or simulation code.
colliders = [rect(b['id']+':skin', 'south-shell', b['x'], b['z'],
                  b['width']/2+.25, b['depth']/2+.25, b['baseY'],
                  b['baseY']+b['height'], 'world.js:326-344 + historical actual catalogue')
             for b in south]

# The relevant area belongs to ordinary four-building blocks (200,120) and
# (200,200). Deterministic road furniture is independently evaluated for all
# 36 blocks. Upper lamp parts and roofs cannot overlap a nonjumping 1.8m body.
CENTERS = [-200,-120,-40,40,120,200]
for x in CENTERS:
    for z in CENTERS:
        for dx,dz in [(-25.5,-25.5),(25.5,25.5)]:
            colliders.append(rect(f'block-{x}-{z}:lamp-{dx}', 'lamp-post',
                x+dx,z+dz,.1,.1,0,8,'world.js:250-255,446-447'))
        colliders.append(rect(f'block-{x}-{z}:bin', 'street-bin',x+24,z+5,
            .42,.42,-.03,1.25,'world.js:448-450; conservative union of both cylinders'))
        colliders.append(rect(f'block-{x}-{z}:meter', 'parking-meter',x+23.5,z-6,
            .19,.125,-.03,2.30,'world.js:451-452; conservative union of pole/head'))
for x,z in [(200,120),(200,200),(120,120),(120,200)]:
    for dx,dz in [(-24,23),(24,-23)]:
        colliders.append(rect(f'block-{x}-{z}:palm-{dx}', 'palm-trunk',
            x+dx,z+dz,.28,.28,-.03,11,'world.js:219-238,443-444'))
for x in [-160,-80,0,80,160]:
    for z in [-160,-80,0,80,160]:
        colliders.append(rect(f'traffic-{x}-{z}:post','traffic-post',x+15.5,z+18,
            .1,.1,-.03,4.78,'world.js:455-464; other parts minY > body head'))
# Near sample-stop poles and all local wire poles, independently checked in the
# companion source-bounds report. These are static, unlike tram rolling bodies.
for id,x,z in [('courtyard',145.825,123.74),('market',203.74,174.175),
               ('tram-lantern',254.05,103.45)]:
    colliders.append(rect(id+':stop-pole','harbor-stop',x,z,.055,.055,-.03,3.38,
                          'harbor-transit-renderer.js:30-39; companion source review'))
for z in [-204,-124,-4,76,136]:
    colliders.append(rect('tram-wire-'+str(z),'tram-wire-pole',256.4,z,.065,.065,-.03,5.58,
                          'harbor-transit-renderer.js:66-71'))

programmes = {'south-090':'noodles','south-091':'books','south-092':'cafe',
              'south-094':'bakery','south-095':'market','south-096':'gallery'}
sites = []
for id in IDS:
    b = catalogue[id]
    side = 0 if id in ['south-090','south-094'] else 1
    angle = side*math.pi/2
    width = min(16.4,(b['depth'] if side else b['width'])-.8)
    site = dict(buildingId=id,programme=programmes[id],side=side,angle=angle,
                x=b['x']+(b['width']/2 if side else 0),
                z=b['z']+(0 if side else b['depth']/2),width=width,baseY=b['baseY'])
    sites.append(site)
    def fixture(suffix,u,y,out,sx,sy,sz):
        c,s = math.cos(angle),math.sin(angle)
        px,pz = site['x']+c*u+s*out,site['z']-s*u+c*out
        colliders.append(rect(id+':'+suffix,'harbor-frontage-furniture',px,pz,
            (sx*abs(c)+sz*abs(s))/2,(sx*abs(s)+sz*abs(c))/2,
            b['baseY']+y-sy/2,b['baseY']+y+sy/2,'harbor-district.js:148-186'))
    for u in [-width/2+.65,width/2-.65]:
        fixture('planter-'+str(u),u,.36,.88,.85,.72,.82)
    if programmes[id] in ['cafe','noodles','bakery']:
        for u in [-4.5,4.5]:
            fixture('table-'+str(u),u,.42,1.10,1.1,.84,.86)
            for d in [-.70,.70]:
                fixture('chair-'+str(u+d),u+d,.44,1.07,.44,.88,.49)
    else:
        for u in [-4.55,4.55]: fixture('display-'+str(u),u,.63,.81,2.3,1.26,.94)

def interval_gap(lo1,hi1,lo2,hi2): return max(0,lo1-hi2,lo2-hi1)

def capsule_clearance(a,b,c,tolerance=0,radius=RADIUS):
    # Exact minimum for a cardinal line segment. Inflating each AABB axis by
    # tolerance proves a square +/- tolerance envelope before adding the disc.
    assert abs(a['x']-b['x']) < 1e-8 or abs(a['z']-b['z']) < 1e-8
    dx = interval_gap(min(a['x'],b['x']),max(a['x'],b['x']),
                      c['x']-c['hx']-tolerance,c['x']+c['hx']+tolerance)
    dz = interval_gap(min(a['z'],b['z']),max(a['z'],b['z']),
                      c['z']-c['hz']-tolerance,c['z']+c['hz']+tolerance)
    return math.hypot(dx,dz)-radius

def segment_rect_distance(a,b,c):
    # Exact convex piecewise quadratic distance, including possible intersection.
    dx,dz=b['x']-a['x'],b['z']-a['z']
    lx,hx=c['x']-c['hx'],c['x']+c['hx']
    lz,hz=c['z']-c['hz'],c['z']+c['hz']
    ts={0.0,1.0}
    if dx:
        ts.update(t for q in [lx,hx] if 0<(t:=(q-a['x'])/dx)<1)
    if dz:
        ts.update(t for q in [lz,hz] if 0<(t:=(q-a['z'])/dz)<1)
    ts=sorted(ts); candidates=list(ts)
    for lo,hi in zip(ts,ts[1:]):
        t=(lo+hi)/2; px,pz=a['x']+dx*t,a['z']+dz*t
        ax,bx=(a['x']-lx,dx) if px<lx else (a['x']-hx,dx) if px>hx else (0,0)
        az,bz=(a['z']-lz,dz) if pz<lz else (a['z']-hz,dz) if pz>hz else (0,0)
        den=bx*bx+bz*bz
        if den:
            q=-(ax*bx+az*bz)/den
            if lo<q<hi: candidates.append(q)
    def distance(t):
        px,pz=a['x']+dx*t,a['z']+dz*t
        return math.hypot(max(lx-px,0,px-hx),max(lz-pz,0,pz-hz))
    return min(map(distance,candidates))

def point(x,z): return dict(x=x,z=z)

def hull(points):
    pts=sorted({(p['x'],p['z']) for p in points})
    def cross(o,a,b): return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
    lower=[]
    for p in pts:
        while len(lower)>=2 and cross(lower[-2],lower[-1],p)<=0: lower.pop()
        lower.append(p)
    upper=[]
    for p in reversed(pts):
        while len(upper)>=2 and cross(upper[-2],upper[-1],p)<=0: upper.pop()
        upper.append(p)
    return [point(x,z) for x,z in lower[:-1]+upper[:-1]]

def polygon_rect_distance(poly,c):
    lx,hx=c['x']-c['hx'],c['x']+c['hx']
    lz,hz=c['z']-c['hz'],c['z']+c['hz']
    def inside(p):
        return all((b['x']-a['x'])*(p['z']-a['z'])-(b['z']-a['z'])*(p['x']-a['x'])>=-1e-10
            for a,b in zip(poly,poly[1:]+poly[:1]))
    if any(inside(point(x,z)) for x in [lx,hx] for z in [lz,hz]): return 0.0
    return min(segment_rect_distance(a,b,c) for a,b in zip(poly,poly[1:]+poly[:1]))

shells=[c for c in colliders if c['kind']=='south-shell']
results=[]
for id in IDS:
    b=catalogue[id]; face=b['z']+b['depth']/2; door_z=face+.64
    close=point(b['x'],face+2)
    wide=point(EAST_X if id in ['south-091','south-095'] else b['x'],door_z+9)
    outward=[close,point(wide['x'],close['z']),wide] if wide['x']!=close['x'] else [close,wide]
    legs=list(zip(outward,outward[1:]))
    evidence=[]
    for a,end in legs:
        distances=sorted((capsule_clearance(a,end,c,TOLERANCE),c['id']) for c in colliders)
        evidence.append(dict(start=a,end=end,minimumClearanceMetres=distances[0][0],
            nearestCollider=distances[0][1],nearestFive=[dict(id=i,clearanceMetres=d) for d,i in distances[:5]],
            colliderCount=len(colliders),axis='x' if a['x']!=end['x'] else 'z'))
    # Independent visual lines to full shell width plus collider skin, on the
    # public-door plane; this is deliberately broader than the 2.23m door.
    targets=[point(b['x']-b['width']/2-.25,door_z),point(b['x'],door_z),point(b['x']+b['width']/2+.25,door_z)]
    rays=[]
    for target in targets:
        distances=[]
        for c in shells:
            if c['id']==id+':skin': continue
            best=min(segment_rect_distance(point(wide['x']+ox,wide['z']+oz),target,c)
                     for ox in [-TOLERANCE,0,TOLERANCE] for oz in [-TOLERANCE,0,TOLERANCE])
            distances.append((best,c['id']))
        distances.sort()
        rays.append(dict(target=target,minimumOtherShellRayClearanceMetres=distances[0][0],
                         nearestOtherShell=distances[0][1],samples=9,
                         method='Exact segment/AABB distance; nine observer points in +/-0.15m square'))
    view_polygon=hull([point(wide['x']+ox,wide['z']+oz)
        for ox in [-TOLERANCE,TOLERANCE] for oz in [-TOLERANCE,TOLERANCE]]+[targets[0],targets[2]])
    # All lines from every observer in the complete tolerance square to every
    # point on the entire frontage edge lie in this convex hull.
    view_distances=sorted((polygon_rect_distance(view_polygon,c),c['id'])
        for c in shells if c['id']!=id+':skin')
    horizontal=math.hypot(wide['x']-b['x'],9)
    length=sum(math.hypot(a['x']-e['x'],a['z']-e['z']) for a,e in legs)*2
    original_direct=point(b['x'],door_z+9)
    direct_distances=sorted((capsule_clearance(close,original_direct,c,TOLERANCE),c['id']) for c in colliders)
    result=dict(id=id,name=b['name'],building=b,frontage=next(s for s in sites if s['buildingId']==id),
                publicDoor=dict(x=b['x'],z=door_z,y=b['baseY'],yaw=0),
                close=dict(**close,y=b['baseY']),wide=dict(**wide,y=0),
                publicDoorPlaneNormalDistanceMetres=9,
                doorCentreHorizontalDistanceMetres=horizontal,
                outwardRoute=outward,returnRoute=list(reversed(outward)),
                addedWalkingDistanceMetres=length,
                lowerBoundWalkingSimulationSecondsAt5_6mps=length/5.6,
                roadGroundAtWide=0,
                clearance=evidence,rays=rays,
                fullFrontageViewPolygon=view_polygon,
                fullFrontageViewMinimumOtherSouthShellClearanceMetres=view_distances[0][0],
                fullFrontageViewNearestOtherSouthShell=view_distances[0][1],
                fullFrontageViewMethod='Exact convex hull of full +/-0.15m observer square and both full width+.25 shell-skin endpoints on door plane; polygon to every other south shell AABB',
                directRetreatMinimumClearanceMetres=direct_distances[0][0],
                directRetreatNearestCollider=direct_distances[0][1])
    results.append(result)

source_files=['src/world.js','src/world-config.js','src/harbor-district.js',
 'src/harbor-frontage-profiles.js','src/city-exploration.js','src/collision.js',
 'src/simulation.js','src/harbor-transit.js','src/harbor-transit-renderer.js',
 'src/harbor-terrain.js','src/metropolis-infrastructure.js','src/metropolis-world.js',
 'src/metropolis-transit.js','src/metropolis-catalog.js','src/citizen-crossings.js',
 'src/traffic.js','src/harbor-vehicle-models.js','src/harbor-skyline.js',
 'src/expansion-programmes.js','src/terrain-openings.js']
companion=json.loads(Path('/tmp/neon-six-shop-collision-ground-readonly-2026-10-05/source-and-routes.json').read_text())
source_files=sorted(set(source_files)|{p['path'] for p in companion['sourcePins']})
input_files=[METHOD/'plans.mjs',METHOD/'input.mjs',METHOD/'evidence/captured-buildings.json',
 METHOD/'evidence/common-pose-proof.json',NATIVE,HISTORY]
source_matches={}
for f in source_files:
    frozen=subprocess.run(['git','show',native['gitHead']+':'+f],cwd=ROOT,check=True,capture_output=True).stdout
    source_matches[f]=(ROOT/f).read_bytes()==frozen
assert all(source_matches.values())
# A authored door geometry is not a physics collider. Its shared conservative
# ground-level envelope includes frame, glazing, handles and stone sill.
door_geometry=[]
for id in IDS:
    b=catalogue[id]; face=b['z']+b['depth']/2
    door_geometry.append(rect(id+':authored-public-door-envelope','visual-solid-envelope',
        b['x'],face+.615,1.115,.220,b['baseY']+.02,b['baseY']+3.14,
        'harbor-frontage-profiles.js:60-72,84-99; conservative max sill out .835'))
ground_prop_geometry=list(door_geometry)
leaf_radius=math.sqrt((.22*.92)**2+(.82*1.08)**2+(.11*.92)**2)+.04
for site in sites:
    angle=site['angle']; c,s=math.cos(angle),math.sin(angle)
    def ground_envelope(suffix,u,out,hu,ho):
        ground_prop_geometry.append(rect(site['buildingId']+':'+suffix,'visual-solid-envelope',
            site['x']+c*u+s*out,site['z']-s*u+c*out,
            abs(c)*hu+abs(s)*ho,abs(s)*hu+abs(c)*ho,
            site['baseY'],site['baseY']+2.05,
            'harbor-district.js:198-273 / harbor-frontage-profiles.js:40-115 conservative low props'))
    # Ground profile/frames/rolled shutters/menus below walker head, including
    # out .855 roll bound. Original generic shell details fit its +.25 skin.
    ground_envelope('ground-profile-envelope',0,(.24+.855)/2,site['width']/2,(.855-.24)/2)
    for u in [-site['width']/2+.65,site['width']/2-.65]:
        # Geometry leaf vertices have a rotation-independent sphere envelope;
        # this includes foliage extending beyond the smaller physics planter.
        ground_envelope('planter-leaf-envelope-'+str(u),u,.88,leaf_radius,leaf_radius)
    if site['programme'] in ['cafe','noodles','bakery']:
        for u in [-4.5,4.5]:
            ground_envelope('table-mesh-envelope-'+str(u),u,1.10,.49,.49)
            for d in [-.7,.7]:
                ground_envelope('chair-mesh-envelope-'+str(u+d),u+d,(.835+1.496)/2,.236,(1.496-.835)/2)
    else:
        for u in [-4.55,4.55]:
            ground_envelope('shelf-products-envelope-'+str(u),u,.81,1.15,.47)
for r in results:
    r['minimumAuthoredPublicDoorSolidEnvelopeClearanceMetres']=min(
        capsule_clearance(a,b,c,TOLERANCE) for a,b in zip(r['outwardRoute'],r['outwardRoute'][1:]) for c in door_geometry)
    r['minimumAuthoredGroundDoorAndPropEnvelopeClearanceMetres']=min(
        capsule_clearance(a,b,c,TOLERANCE) for a,b in zip(r['outwardRoute'],r['outwardRoute'][1:]) for c in ground_prop_geometry)
    # Source height bounds exclude short ground furniture. These visual line
    # checks conservatively include tall pole/trunk/union boxes but not cars.
    tall=[c for c in colliders if c['maxY']>1.62 and c['minY']<1.78
          and c['id']!=r['id']+':skin']
    visual_distances=sorted((polygon_rect_distance(r['fullFrontageViewPolygon'],c),c['id']) for c in tall)
    r['fullFrontageViewMinimumModelledTallStaticObstacleClearanceMetres']=visual_distances[0][0]
    r['fullFrontageViewNearestModelledTallStaticObstacle']=visual_distances[0][1]
    other_props=sorted((polygon_rect_distance(r['fullFrontageViewPolygon'],c),c['id'])
        for c in ground_prop_geometry if not c['id'].startswith(r['id']+':'))
    r['fullFrontageViewMinimumOtherAuthoredGroundEnvelopeClearanceMetres']=other_props[0][0]
    r['fullFrontageViewNearestOtherAuthoredGroundEnvelope']=other_props[0][1]

b092=catalogue['south-092']; face092=b092['z']+b092['depth']/2
east092=b092['x']+b092['width']/2+3
detour092=[point(east092,b092['z']),point(east092,face092+1.8),
           point(b092['x'],face092+1.8),point(b092['x'],b092['entrance']['z'])]
detour_evidence=[]
for a,b in zip(detour092,detour092[1:]):
    modelled=sorted((capsule_clearance(a,b,c,TOLERANCE),c['id']) for c in colliders)
    authored=sorted((capsule_clearance(a,b,c,TOLERANCE),c['id']) for c in door_geometry)
    all_props=sorted((capsule_clearance(a,b,c,TOLERANCE),c['id']) for c in ground_prop_geometry)
    detour_evidence.append(dict(start=a,end=b,minimumStaticColliderClearanceMetres=modelled[0][0],
        nearestStaticCollider=modelled[0][1],minimumAuthoredDoorSolidEnvelopeClearanceMetres=authored[0][0],
        nearestAuthoredDoorEnvelope=authored[0][1],
        minimumAuthoredGroundDoorAndPropEnvelopeClearanceMetres=all_props[0][0],
        nearestAuthoredGroundDoorAndPropEnvelope=all_props[0][1]))
unsafe120_a=point(east092,face092+1.2); unsafe120_b=point(b092['x'],face092+1.2)
rejected120=dict(offset=1.2,minimumStaticColliderClearanceMetres=min(
    capsule_clearance(unsafe120_a,unsafe120_b,c,TOLERANCE) for c in colliders),
    minimumAuthoredDoorSolidEnvelopeClearanceMetres=min(
    capsule_clearance(unsafe120_a,unsafe120_b,c,TOLERANCE) for c in door_geometry),
    reason='Physics shell is clear but .65m body with .15m tolerance intersects noncolliding authored public door/sill envelope.')
detour=dict(status='SOURCE_ONLY_REPLACEMENT_PROPOSAL_AUTHORIZED_BY_PARENT',
    buildingId='south-092',points=detour092,groundY=.18,sourceOffset=1.8,
    axisToleranceMetres=TOLERANCE,bodyRadiusMetres=RADIUS,legs=detour_evidence,
    rejectedCloserOffset=rejected120,
    originalPhotosPreserved=True,
    note='Replaces the original east-display return Z leg only after parent/root authorization; restores original entrance then the original X-centre / Z-close / door / E route. This calculation does not mutate plans or run input.')
pole=rect('block-200-120:lamp','lamp-post',225.5,145.5,.1,.1,0,8,'world.js:250-255,446-447')
old_target=catalogue['south-092']['entrance']['z']
actual_fixed_x=[]
for mode,x in [('baseline',225.8253757320793),('authored',225.98537573207915)]:
    dx=max(0,x-(pole['x']+pole['hx']))
    maximum_z=pole['z']-pole['hz']-math.sqrt(RADIUS**2-dx**2)
    actual_fixed_x.append(dict(mode=mode,actualXFromParentEvidence=x,
        fixedXMaximumReachableZOnNorthSide=maximum_z,targetZ=old_target,
        minimumAxisErrorIfXDoesNotChange=old_target-maximum_z))
needed_x=pole['x']+pole['hx']+math.sqrt(RADIUS**2-(pole['z']-pole['hz']-old_target)**2)
report=dict(status='STATIC_SOURCE_GEOMETRY_ONLY',rootHead=native['gitHead'],
 bodyRadiusMetres=RADIUS,axisToleranceMetres=TOLERANCE,
 capsuleMethod='Exact cardinal segment to AABB expanded independently on X/Z by .15m, then minus .65m radius',
 sourceHashes={f:sha(ROOT/f) for f in source_files},
 sourceFilesMatchEf92GitBlob=source_matches,
 inputHashes={str(f):sha(f) for f in input_files},
 historicalWorldSourceMatchesCurrent=True,historicalWorldConfigSourceMatchesCurrent=True,
 currentActualEightBuildingCatalogueExactlyMatchesPrepared=True,
 historicalSouthBuildingCount=len(south),analysedColliderCount=len(colliders),
 note='Collider formula catalogue covers all 96 south shells and relevant deterministic road/furniture/trunk classes. Other outdoor systems require source-bounds exclusions in the independent report; this is not an executed full-world collision proof.',
 colliders=colliders,shops=results,
 authoredPublicDoorSolidEnvelopes=door_geometry,
 authoredGroundDoorAndPropSolidEnvelopes=ground_prop_geometry,
 authoredGroundEnvelopeScope='Lower profiles, frames, menus, rollers, public door/sill/handles, conservative rotated planter foliage, table, chair back, shelves/products. Paving slab top .026m above base is floor decoration/support; upper awning/sign/hanging lamp/balcony start above 1.98m body head and are excluded. This is conservative source bounding geometry, not generated mesh OBB inspection.',
 replacement092OutsideCornerDetour=detour,
 original092StaticCollisionCounterexample=dict(pole=pole,
    originalNominalReturnZ=old_target,
    originalNominalEastDisplayX=catalogue['south-092']['x']+catalogue['south-092']['width']/2+3,
    actualEvidenceOrigin='Parent supplied original native baseline/authored positions; no independent trace/timing read by this agent',
    fixedXBounds=actual_fixed_x,minimumEastwardBypassCentreXAtTargetZ=needed_x,
    scope='Original nominal cardinal line crosses pole. Fixed-X return cannot reach within .15m. Collision solver may deflect X, so actual unconditional unreachability and time to go around are not established. Entire original route is not certified clear.'),
 allModelledStaticCapsulesClear=all(e['minimumClearanceMetres']>0 for r in results for e in r['clearance']),
 allOtherSouthShellSampledCornerRaysClear=all(e['minimumOtherShellRayClearanceMetres']>0 for r in results for e in r['rays']),
 allOtherSouthShellFullFrontageViewPolygonsClear=all(r['fullFrontageViewMinimumOtherSouthShellClearanceMetres']>0 for r in results),
 allModelledTallStaticFrontageViewPolygonsClear=all(r['fullFrontageViewMinimumModelledTallStaticObstacleClearanceMetres']>0 for r in results),
 allOtherAuthoredGroundFrontageViewPolygonsClear=all(r['fullFrontageViewMinimumOtherAuthoredGroundEnvelopeClearanceMetres']>0 for r in results),
 replacement092AllModelledStaticAndAuthoredDoorEnvelopesClear=all(
    r['minimumStaticColliderClearanceMetres']>0 and r['minimumAuthoredGroundDoorAndPropEnvelopeClearanceMetres']>0 for r in detour_evidence),
 exclusions=['Native walking, frame time, browser/GPU rendering, traffic timing, projected FOV, image/art acceptance, old interior proof reuse, world construction are not established.'])

def leg_records(points):
    records=[]
    for a,b in zip(points,points[1:]):
        static=sorted((capsule_clearance(a,b,c,TOLERANCE),c['id']) for c in colliders)
        props=sorted((capsule_clearance(a,b,c,TOLERANCE),c['id']) for c in ground_prop_geometry)
        records.append(dict(start=a,end=b,minimumStaticColliderClearanceMetres=static[0][0],
            nearestStaticCollider=static[0][1],minimumAuthoredGroundEnvelopeClearanceMetres=props[0][0],
            nearestAuthoredGroundEnvelope=props[0][1],clear=static[0][0]>0 and props[0][0]>0))
    return records

def station_records(points):
    unique=sorted({(p['x'],p['z']) for p in points})
    return [dict(position=point(x,z),minimumStaticColliderClearanceMetres=min(
        capsule_clearance(point(x,z),point(x,z),c,TOLERANCE) for c in colliders)) for x,z in unique]

report['version']=2
report['supersedesForCurrentProposal']='/tmp/neon-frontage-wide-static-geometry-2026-10-05/geometry.json'
report['originalOutdoorCardinalRouteAudits']={}
report['revisedCompleteOutdoorCardinalRouteAudits']={}
report['cases']={}
nominal096_x=catalogue['south-096']['x']+catalogue['south-096']['width']/2+3
nominal096_z=catalogue['south-096']['entrance']['z']
dx096=max(0,225.4-nominal096_x,nominal096_x-225.6)
bound096=225.4-math.sqrt(RADIUS**2-dx096**2)
report['original096StaticCollisionCounterexample']=dict(
    pole=dict(x=225.5,z=225.5,hx=.1,hz=.1),
    originalNominalEastEntrance=point(nominal096_x,nominal096_z),
    nominalPointDistanceToUnexpandedPoleAABB=math.hypot(dx096,225.4-nominal096_z),
    fixedXMaximumReachableZOnNorthSide=bound096,
    fixedXMinimumAxisError=nominal096_z-bound096,
    scope='Original nominal outbound X and direct return Z both intersect actual lamp collider; fixed-X bound is conditional, solver tangent/contacts and dynamic traffic are not executed.')
for r in results:
    id=r['id']; b=catalogue[id]; face=b['z']+b['depth']/2
    entrance=point(b['x'],b['entrance']['z']); close=point(b['x'],face+2)
    original=[entrance,close]
    fixture=None
    if id not in ['south-090','south-094']:
        east_x=b['x']+b['width']/2+3
        east_entry=point(east_x,entrance['z']); east_photo=point(east_x,b['z'])
        original += [entrance,east_entry,east_photo,east_entry,entrance,close]
        if id in ['south-092','south-096']:
            safe_z=face+1.8; center_safe=point(b['x'],safe_z); east_safe=point(east_x,safe_z)
            outbound=[entrance,center_safe,east_safe,east_photo]
            returning=[east_photo,east_safe,center_safe,entrance]
            revised=[entrance,close]+outbound+returning[1:]+[close]
            fixture=dict(status='ROOT_AUTHORIZED_SOURCE_ONLY_PROPOSAL',safeOutwardOffsetMetres=1.8,
                safeReturnZ=safe_z,outboundWaypoints=outbound,waypoints=returning,
                returnWaypoints=returning,outboundLegs=leg_records(outbound),returnLegs=leg_records(returning),
                originalEastPhotoPosition=dict(x=east_x,z=b['z'],y=.18),
                originalEntranceTarget=dict(**entrance,y=.18),groundY=.18,
                originalPhotosUnchanged=True,
                note='Preserve original Z alignment at entrance; add Zsafe before original X-east leg. Replace original direct return Z with Zsafe/Xcenter/ZoriginalEntrance, then preserved Xcenter/Zclose/door/E. Original files are untouched.')
        else: revised=original
    else: revised=original
    original_legs=leg_records(original); revised_legs=leg_records(revised)
    report['originalOutdoorCardinalRouteAudits'][id]=dict(points=original,legs=original_legs,
        stationCircleFlags=station_records(original),allModelledStaticAndAuthoredGroundClear=all(p['clear'] for p in original_legs))
    report['revisedCompleteOutdoorCardinalRouteAudits'][id]=dict(points=revised,legs=revised_legs,
        stationCircleFlags=station_records(revised),allModelledStaticAndAuthoredGroundClear=all(p['clear'] for p in revised_legs),
        scope='Complete planned outdoor cardinal part through original door station, plus the separately proven wide out-and-back; excludes interior legs and post-E scene transitions/dynamic traffic/native execution.')
    report['cases'][id]=dict(originalDoorStation=r['close'],wideStanding=r['wide'],publicDoor=r['publicDoor'],
        normalDistanceMetres=9,doorCentreHorizontalDistanceMetres=r['doorCentreHorizontalDistanceMetres'],
        outwardWaypoints=r['outwardRoute'],returnWaypoints=r['returnRoute'],
        fixtureDetour=fixture,minimumAddedStaticCapsuleClearanceMetres=min(e['minimumClearanceMetres'] for e in r['clearance']),
        minimumAddedAuthoredGroundEnvelopeClearanceMetres=r['minimumAuthoredGroundDoorAndPropEnvelopeClearanceMetres'],
        revisedOriginalOutdoorRouteClear=all(p['clear'] for p in revised_legs),
        viewPolygon=r['fullFrontageViewPolygon'],minimumOtherShellViewClearanceMetres=r['fullFrontageViewMinimumOtherSouthShellClearanceMetres'])

baseline_metadata=json.loads((NATIVE.parent.parent/'baseline'/'metadata.json').read_text())
expected=json.loads((METHOD.parent.parent/'expected-runtime-dictionaries.json').read_text())
by_mode={}
for mode,metadata in [('baseline',baseline_metadata),('authored',native)]:
    runtime=metadata['sourceServedVerifiedAssetDictionary']
    mode_hashes={}
    for f in source_files:
        if f not in runtime:
            assert mode=='baseline' and f=='src/harbor-frontage-profiles.js'
            continue
        pin=runtime[f]
        assert expected[mode]['assets'][f]==pin
        frozen=subprocess.run(['git','show',metadata['gitHead']+':'+f],cwd=ROOT,check=True,capture_output=True).stdout
        assert hashlib.sha256(frozen).hexdigest()==pin
        mode_hashes[f]=pin
    by_mode[mode]=mode_hashes
report['authoredGeometrySourceHashes']=report.pop('sourceHashes')
report['sourceHashes']=by_mode
report['modeSourceHead']={'baseline':baseline_metadata['gitHead'],'authored':native['gitHead']}
report['modeSourcePinsOrigin']={
    'baseline':str(NATIVE.parent.parent/'baseline'/'metadata.json'),
    'authored':str(NATIVE),
    'expectedDictionaries':str(METHOD.parent.parent/'expected-runtime-dictionaries.json'),
    'allComparedToActualNativeVerifiedRuntimeDictionaryAndMatchingGitBlob':True,
    'baselineProfileModuleAbsent':'src/harbor-frontage-profiles.js is absent in D2 baseline and is intentionally not a baseline runtime key.'}
report['baselineConservativeEnvelopeApplicability']='Baseline ground arches max out .795, sills .81 and lower panel .55 are inside authored profile envelope .855; shared low furniture unchanged. Authored separate public south door envelope .835 is an additional conservative bound for baseline generic shell; absence of baseline publicDoor snapshot metadata is not repaired or claimed present.'
report['allRevisedOutdoorCardinalRoutesModelledStaticAndAuthoredGroundClear']=all(
    r['allModelledStaticAndAuthoredGroundClear'] for r in report['revisedCompleteOutdoorCardinalRouteAudits'].values())
report['geometrySourceBaselineDifferencesReviewed']=dict(
    paths=['src/harbor-district.js','src/city-exploration.js','src/harbor-transit-renderer.js'],
    scope='Existing permanent shell/fixture/road/collision/support generation remains unchanged; authored front elevation geometric envelope is additional. Baseline/author source hashes are distinct and exact, never substituted.')
(OUT/'geometry.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
summary=[]
for r in results:
    summary.append(dict(id=r['id'],wide=r['wide'],normal=r['publicDoorPlaneNormalDistanceMetres'],
        horizontal=r['doorCentreHorizontalDistanceMetres'],
        minCapsuleClearance=min(e['minimumClearanceMetres'] for e in r['clearance']),
        minOtherShellRayClearance=min(e['minimumOtherShellRayClearanceMetres'] for e in r['rays']),
        fullFrontageViewMinimumOtherSouthShellClearance=r['fullFrontageViewMinimumOtherSouthShellClearanceMetres'],
        addedWalk=r['addedWalkingDistanceMetres'],
        directRetreatMin=r['directRetreatMinimumClearanceMetres']))
(OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(summary,ensure_ascii=False,indent=2))
