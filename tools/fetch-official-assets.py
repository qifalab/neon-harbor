"""Select individual CC0 core files from the official ZIP using HTTP ranges.
No MakeHuman program logic is copied or run by this independent extractor.
"""
import urllib.request, io, zipfile, pathlib, json, hashlib, sys
URL='https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip'
ROOT=pathlib.Path(__file__).resolve().parents[1]/'art-source/near-resident/source'
class HTTPRanges(io.RawIOBase):
 def __init__(self,url):
  self.url=url;self.pos=0;self.cache={};self.requests=[]
  r=urllib.request.urlopen(urllib.request.Request(url,method='HEAD'),timeout=25)
  self.size=int(r.headers['Content-Length']);self.etag=r.headers.get('ETag');r.close()
 def seekable(self):return True
 def readable(self):return True
 def tell(self):return self.pos
 def seek(self,n,whence=0):
  self.pos=n if whence==0 else self.pos+n if whence==1 else self.size+n
  return self.pos
 def read(self,n=-1):
  n=self.size-self.pos if n<0 else min(n,self.size-self.pos)
  if n<=0:return b''
  key=(self.pos,n)
  if key not in self.cache:
   r=urllib.request.urlopen(urllib.request.Request(self.url,headers={'Range':f'bytes={self.pos}-{self.pos+n-1}'}),timeout=25)
   if r.status!=206:r.close();raise RuntimeError('Range unsupported; refusing full ZIP download')
   self.cache[key]=r.read();r.close();self.requests.append({'offset':self.pos,'bytes':len(self.cache[key])})
  b=self.cache[key];self.pos+=len(b);return b
r=HTTPRanges(URL);z=zipfile.ZipFile(r)
if len(sys.argv)==1:
 files=[{'path':i.filename,'bytes':i.file_size,'compressed':i.compress_size,'crc32':f'{i.CRC:08x}'} for i in z.infolist()]
 (ROOT/'official-core-zip-index.json').write_text(json.dumps({'url':URL,'bytes':r.size,'etag':r.etag,'files':files},indent=2))
 print('\n'.join(i.filename for i in z.infolist()))
else:
 records=[]
 for name in sys.argv[1:]:
  info=z.getinfo(name);b=z.read(name);p=ROOT/'core-pack'/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
  records.append({'path':name,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'zipCRC32':f'{info.CRC:08x}'})
  print(name,len(b))
 existing=ROOT/'official-core-download-manifest.json'
 old=json.loads(existing.read_text())['files'] if existing.exists() else []
 files={i['path']:i for i in old+records}
 existing.write_text(json.dumps({'url':URL,'packBytes':r.size,'etag':r.etag,'files':list(files.values()),'lastDownloadRanges':r.requests},indent=2))
print('Transferred',sum(i['bytes'] for i in r.requests),'bytes in',len(r.requests),'ranges')
