import os,json,time,signal,subprocess,hashlib,sys
from pathlib import Path
out=Path(sys.argv[1]);out.mkdir(exist_ok=False)
def proc(pid):
 try:
  raw=Path(f'/proc/{pid}/stat').read_text();a=raw[raw.rfind(')')+2:].split()
  return dict(pid=pid,state=a[0],ppid=int(a[1]),pgid=int(a[2]),session=int(a[3]),startTicks=a[19])
 except FileNotFoundError:return None
def save(name,data):(out/name).write_text(json.dumps(data,indent=2)+'\n')
owned={};events=[];first_error=None;start=time.monotonic();limit=start+165
log=open(out/'stdout.log','w');err=open(out/'stderr.log','w')
p=subprocess.Popen(['node','/tmp/neon-public-resident-diary-ui-probe-20261005.mjs',str(out)],stdout=log,stderr=err,start_new_session=True)
r=proc(p.pid)
assert r and r['ppid']==os.getpid() and r['pgid']==p.pid and r['session']==p.pid
fd=os.pidfd_open(p.pid);assert proc(p.pid)['startTicks']==r['startTicks'];owned[p.pid]=(r,fd)
events.append({'event':'root-bound-before-poll','identity':r,'pidfdBound':True})
def alive(identity):
 a=proc(identity['pid']);return bool(a and a['startTicks']==identity['startTicks'] and a['state']!='Z')
def observe():
 # Descendants are admitted only from an already-bound root/owned identity.
 changed=True
 while changed:
  changed=False
  for path in Path('/proc').iterdir():
   if not path.name.isdigit():continue
   pid=int(path.name)
   if pid in owned:continue
   a=proc(pid)
   if not a or a['state']=='Z' or a['ppid'] not in owned or not alive(owned[a['ppid']][0]):continue
   try:
    f=os.pidfd_open(pid);b=proc(pid)
    if not b or b['startTicks']!=a['startTicks'] or b['ppid']!=a['ppid']:os.close(f);continue
    owned[pid]=(a,f);events.append({'event':'owned-descendant-bound','identity':a,'pidfdBound':True});changed=True
   except ProcessLookupError:continue
def signal_owned(sig):
 for pid,(identity,f) in reversed(list(owned.items())):
  if alive(identity):
   try:signal.pidfd_send_signal(f,sig);events.append({'event':'signal-owned-pidfd','identity':identity,'signal':sig})
   except ProcessLookupError:pass
try:
 while True:
  observe()
  state=None
  try:state=json.loads((out/'probe.json').read_text())
  except (FileNotFoundError,json.JSONDecodeError):pass
  if state:
   for idx,v in enumerate(state.get('variants',[]),1):
    if v.get('awaitWrapperClosureGate') and not (out/f'closure-{idx}.json').exists():
     live=[a for pid,(a,_) in owned.items() if pid!=p.pid and alive(a)]
     if not live:save(f'closure-{idx}.json',{'ownedClosureConfirmed':True,'boundRoot':r,'observedOwnedProcesses':len(owned)-1,'verifiedAt':time.time(),'identityBoundPidfdOnly':True,'liveOwnedBrowserProcesses':[]})
  if p.poll() is not None:break
  if time.monotonic()>=limit:
   first_error='Finite165000ms whole probe deadline';signal_owned(signal.SIGKILL);break
  time.sleep(.025)
 p.wait(timeout=3)
except BaseException as e:
 first_error=first_error or repr(e);signal_owned(signal.SIGKILL)
 try:p.wait(timeout=3)
 except Exception:pass
finally:
 observe();live=[a for _,(a,_) in owned.items() if alive(a)]
 if live:
  first_error=first_error or 'Owned live processes after tool return';signal_owned(signal.SIGKILL)
  for _ in range(100):
   live=[a for _,(a,_) in owned.items() if alive(a)]
   if not live:break
   time.sleep(.01)
 receipt={'status':'CLOSED' if not live and not first_error else 'FAILED','firstError':first_error,'exitCode':p.returncode,'elapsedSeconds':time.monotonic()-start,'wholeBudgetSeconds':165,'ownedClosureConfirmed':not live,'liveOwnedProcesses':live,'events':events,'methodFiles':[{'path':x,'bytes':Path(x).stat().st_size,'sha256':hashlib.sha256(Path(x).read_bytes()).hexdigest()} for x in ['/tmp/neon-public-resident-diary-ui-probe-20261005.mjs',__file__]]}
 save('owned-process-receipt.json',receipt)
 for _,f in owned.values():os.close(f)
 log.close();err.close()
 print(json.dumps({k:receipt[k] for k in ['status','firstError','exitCode','elapsedSeconds','ownedClosureConfirmed']}))
sys.exit(0 if p.returncode==0 and not first_error and not live else 1)
