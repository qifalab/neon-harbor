import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.wasm': 'application/wasm',
};

function contained(root, target) {
  const path = relative(root, target);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
}

/** Serve only files beneath root, including after symlink resolution. */
export async function createStaticServer({ root = projectRoot } = {}) {
  const rootPath = await realpath(root);
  return createServer(async (request, response) => {
    const fail = (code, message) => {
      response.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(message);
    };
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.setHeader('Allow', 'GET, HEAD');
      return fail(405, 'Method not allowed');
    }
    let pathname;
    try {
      // Decode once; reject invalid encodings, hidden files and path traversal.
      pathname = decodeURIComponent((request.url ?? '/').split('?')[0]);
    } catch {
      return fail(400, 'Invalid URL encoding');
    }
    if (pathname.includes('\0') || pathname.includes('\\') ||
        pathname.split('/').some((segment) => segment.startsWith('.'))) {
      return fail(403, 'Forbidden');
    }
    let target = resolve(rootPath, `.${pathname.startsWith('/') ? pathname : `/${pathname}`}`);
    if (!contained(rootPath, target)) return fail(403, 'Forbidden');
    try {
      if ((await stat(target)).isDirectory()) target = resolve(target, 'index.html');
      const canonical = await realpath(target);
      if (!contained(rootPath, canonical)) return fail(403, 'Forbidden');
      const info = await stat(canonical);
      if (!info.isFile()) return fail(404, 'Not found');
      const contents = request.method === 'HEAD' ? null : await readFile(canonical);
      response.writeHead(200, {
        'Content-Type': mimeTypes[extname(canonical)] ?? 'application/octet-stream',
        'Content-Length': info.size,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      });
      response.end(contents);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return fail(404, 'Not found');
      if (error.code === 'EACCES') return fail(403, 'Forbidden');
      console.error('Static request failed:', error.message);
      fail(500, 'Internal server error');
    }
  });
}

function optionsFromArgs(args) {
  const options = { host: '127.0.0.1', port: Number(process.env.PORT ?? 5173), root: projectRoot };
  for (let index = 0; index < args.length; index += 2) {
    const [flag, value] = args.slice(index, index + 2);
    if (!value || !['--host', '--port', '--dir'].includes(flag)) {
      throw new Error('Usage: node tools/server.mjs [--host 127.0.0.1] [--port 5173] [--dir dist]');
    }
    if (flag === '--host') options.host = value;
    if (flag === '--port') options.port = Number(value);
    if (flag === '--dir') options.root = resolve(projectRoot, value);
  }
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error('Port must be an integer between 1 and 65535');
  }
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = optionsFromArgs(process.argv.slice(2));
  const server = await createStaticServer(options);
  server.on('error', (error) => {
    console.error(`Server failed: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(options.port, options.host, () => {
    console.log(`Neon Harbor: http://${options.host}:${options.port}`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(() => { process.exitCode = 0; }));
  }
}
