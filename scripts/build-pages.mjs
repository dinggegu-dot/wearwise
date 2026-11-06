import { mkdtemp, cp, mkdir, symlink, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const staging = await mkdtemp(join(tmpdir(), 'wearwise-pages-'));
const dest = join(root, 'out');
try {
  for (const name of ['package.json','package-lock.json','next-env.d.ts','next.config.ts','postcss.config.mjs','tsconfig.json']) await cp(join(root,name),join(staging,name));
  await cp(join(root,'src'),join(staging,'src'),{recursive:true,filter: source => {
    const sub = relative(join(root,'src'),source); return sub !== join('app','api') && !sub.startsWith(join('app','api') + '/');
  }});
  try { await access(join(root,'public')); await cp(join(root,'public'),join(staging,'public'),{recursive:true}); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await symlink(resolve(root,'node_modules'),join(staging,'node_modules'),'dir');
  const code = await new Promise((resolveCode,reject) => {
    const child=spawn('npm',['run','build'],{cwd:staging,stdio:'inherit',env:{...process.env,PAGES_EXPORT:'1',NEXT_PUBLIC_RUNTIME_TARGET:'pages',NEXT_TELEMETRY_DISABLED:'1'}});
    child.on('error',reject);child.on('exit',exitCode=>resolveCode(exitCode));
  });
  if (code !== 0) throw new Error(`静态构建失败：${code}`);
  try { await access(dest); await access(join(dest,'.wearwise-generated')); await rm(dest,{recursive:true}); }
  catch(error) { if(error.code !== 'ENOENT') throw error; try { await access(dest); throw new Error('out 已存在但不是本脚本生成，拒绝覆盖'); } catch(e) { if(e.code !== 'ENOENT') throw e; } }
  await mkdir(dest); await cp(join(staging,'out'),dest,{recursive:true}); await writeFile(join(dest,'.wearwise-generated'),'WearWise Pages output\n');
  console.log('Pages 静态文件已生成到 out/');
} finally { await rm(staging,{recursive:true,force:true}); }
