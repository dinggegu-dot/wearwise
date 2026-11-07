import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve(process.cwd(),'out');
const port = Number(process.env.PORT || 3100);
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};
createServer(async (req,res) => {
  try {
    const path = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if (!path.startsWith('/wearwise/')) { res.writeHead(404).end('Not found'); return; }
    let file = resolve(root, '.' + path.slice('/wearwise'.length));
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end('Forbidden'); return; }
    if ((await stat(file)).isDirectory()) file = resolve(file,'index.html');
    const content = await readFile(file); res.writeHead(200,{'Content-Type':mime[extname(file)] || 'application/octet-stream'}).end(content);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(port,'127.0.0.1',()=>console.log(`Pages: http://127.0.0.1:${port}/wearwise/`));
