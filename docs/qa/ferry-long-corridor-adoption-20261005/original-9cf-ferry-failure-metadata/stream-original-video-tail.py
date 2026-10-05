from pathlib import Path
import zipfile,subprocess,json,time,hashlib
base=Path('/workspace/neon-candidates/9cf-ferry-high-first-failure-readonly-review-20261005');archive=Path('/workspace/neon-evidence/9cf-ferry-high-first-failure-original-11335559241/original.zip')
with zipfile.ZipFile(archive) as z:
 for variant in ['baseline','authored']:
  info=next(i for i in z.infolist() if i.filename.startswith('native/'+variant+'/ferry/video/') and i.filename.endswith('.webm'))
  out=base/(variant+'-original-video-tail-keyframes');out.mkdir(exist_ok=True)
  cmd=['ffmpeg','-hide_banner','-loglevel','warning','-threads','1','-skip_frame','nokey','-i','pipe:0','-vf',r'select=gte(t\,880),fps=1/10','-vsync','vfr',str(out/'tail-%03d.png')]
  started=time.monotonic();p=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE);h=hashlib.sha256();count=0
  with z.open(info) as f:
   while True:
    b=f.read(1024*1024)
    if not b:break
    h.update(b);count+=len(b);p.stdin.write(b)
  p.stdin.close();stderr=p.stderr.read().decode();rc=p.wait();assert rc==0 and count==info.file_size
  (base/(variant+'-video-tail-stream-receipt.json')).write_text(json.dumps({'status':'CPU_READ_ONLY_ORIGINAL_VIDEO_KEYFRAME_SAMPLES_NOT_NATIVE_RUN','archivePath':str(archive),'member':info.filename,'bytes':count,'memberSHA256':h.hexdigest(),'command':cmd,'fullVideoExtracted':False,'filter':'Original video keyframe samples only at t>=880s; fps one/10s. PNG output times are selected visual samples, not instrumented simulation timestamps.','elapsedCPUSeconds':time.monotonic()-started,'exitCode':rc,'stderr':stderr,'samples':[{'path':str(f.relative_to(base)),'sha256':hashlib.sha256(f.read_bytes()).hexdigest()}for f in sorted(out.glob('*.png'))]},indent=2)+'\n')
  print(json.dumps({'variant':variant,'elapsedCPUSeconds':time.monotonic()-started,'sampleCount':len(list(out.glob('*.png'))),'exitCode':rc}),flush=True)
