import sys,json,gzip
from pathlib import Path
source,target=map(Path,sys.argv[1:])
manifest=json.load(sys.stdin)
total=0
for name in manifest['bootstrapFiles']:
    src=source/name
    dst=target/(name+'.gz')
    dst.parent.mkdir(parents=True,exist_ok=True)
    if not dst.exists() or dst.stat().st_mtime<src.stat().st_mtime:
        data=src.read_bytes()
        dst.write_bytes(gzip.compress(data, compresslevel=9, mtime=0))
    total+=dst.stat().st_size
for p in target.rglob('*'):
    if p.is_file() and p.name!='manifest.json' and p.relative_to(target).as_posix() not in {f+'.gz' for f in manifest['bootstrapFiles']}:
        p.unlink()
manifest['compression']='gzip'
(target/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(f'Compressed asset bytes: {total}')
