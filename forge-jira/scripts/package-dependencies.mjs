// UE1 package layout mirrors Package::LoadTables / PackageStream::ReadIndex.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
export function imports(data) {
  if (data.readUInt32LE(0) !== 0x9e2a83c1) throw new Error('Invalid Unreal package signature');
  const version = data.readUInt16LE(4);
  if(version < 60 || version >= 100) throw new Error(`Unsupported package version ${version}`);
  let offset = data.readUInt32LE(16);
  function index() {
    let byte=data[offset++], negative=byte&128, value=byte&63, shift=6;
    if(byte&64) do {byte=data[offset++];value|=(byte&127)<<shift;shift+=7;} while(byte&128 && shift<32);
    return negative ? -value : value;
  }
  const names=[];
  for(let n=0;n<data.readUInt32LE(12);n++) {
    const length=version>=64 ? index() : data.indexOf(0,offset)-offset+1;
    if(length<=0 || offset+length+4>data.length) throw new Error('Invalid package name table');
    names.push(data.toString('latin1',offset,offset+length-1));offset+=length+4;
  }
  offset=data.readUInt32LE(32);
  const result=[];
  for(let n=0;n<data.readUInt32LE(28);n++) {
    index();const cls=index();const outer=data.readInt32LE(offset);offset+=4;const name=index();
    if(outer===0 && names[cls]==='Package') result.push(names[name]);
  }
  return result;
}
export async function launchDependencies(root, seeds) {
  const packages=new Map();
  for(const dir of ['System','Maps','Textures','Sounds','Music']) {
    for(const entry of await readdir(path.join(root,dir))) {
      if(/\.(u|unr|utx|uax|umx)$/i.test(entry)) packages.set(path.parse(entry).name.toLowerCase(),`${dir}/${entry}`);
    }
  }
  const selected=new Set(seeds);
  const queue=[...seeds].filter(file=>/\.(u|unr|utx|uax|umx)$/i.test(file));
  while(queue.length) {
    const file=queue.shift();
    for(const name of imports(await readFile(path.join(root,file)))) {
      const dependency=packages.get(name.toLowerCase());
      if(!dependency) throw new Error(`Missing package ${name}, imported by ${file}`);
      if(!selected.has(dependency)){selected.add(dependency);queue.push(dependency);}
    }
  }
  return [...selected];
}
