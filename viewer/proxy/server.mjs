import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const port = Number(valueAfter('--port') ?? 5175);
const dist = resolve(valueAfter('--dist') ?? join(root, 'dist'));

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

const server = createServer(async (request, response) => {
  applyCors(response);
  if (request.url?.startsWith('/proxy/')) {
    await proxy(request, response);
    return;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
    return;
  }
  await serveStatic(request, response);
});

server.listen(port, () => console.log(`FHIR viewer listening on http://localhost:${port}`));

async function proxy(request, response) {
  if (request.method === 'OPTIONS') {
    const requestedHeaders = request.headers['access-control-request-headers'];
    response
      .writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers':
          typeof requestedHeaders === 'string'
            ? requestedHeaders
            : 'Accept, Authorization, X-Fhir-Base',
      })
      .end();
    return;
  }
  if (request.method !== 'GET') {
    response.writeHead(405, { Allow: 'GET' }).end('Only GET is supported');
    return;
  }
  const targetHeader = request.headers['x-fhir-base'];
  if (typeof targetHeader !== 'string' || !/^https?:\/\//i.test(targetHeader)) {
    response
      .writeHead(400, { 'Content-Type': 'text/plain' })
      .end('X-Fhir-Base must be an http(s) URL');
    return;
  }
  const incoming = new URL(request.url, 'http://viewer.local');
  const rest = incoming.pathname.slice('/proxy/'.length);
  const target = new URL(`${targetHeader.replace(/\/$/, '')}/${rest}${incoming.search}`);
  const headers = { Accept: request.headers.accept ?? 'application/fhir+json' };
  if (request.headers.authorization) headers.Authorization = request.headers.authorization;
  for (const [name, value] of Object.entries(request.headers)) {
    if (name.toLowerCase().startsWith('x-extra-') && typeof value === 'string')
      headers[name.slice('x-extra-'.length)] = value;
  }
  try {
    const result = await fetch(target, { headers });
    response.writeHead(result.status, {
      'Content-Type': result.headers.get('content-type') ?? 'application/fhir+json',
    });
    response.end(Buffer.from(await result.arrayBuffer()));
    console.log(
      `${request.method} ${incoming.pathname} -> ${result.status} (${target.origin}) auth=${headers.Authorization ? 'present' : 'none'}`,
    );
  } catch (error) {
    response
      .writeHead(502, { 'Content-Type': 'text/plain' })
      .end(`Proxy error: ${error instanceof Error ? error.message : 'request failed'}`);
  }
}

async function serveStatic(request, response) {
  const requested = new URL(request.url ?? '/', 'http://viewer.local').pathname;
  const safe = normalize(requested).replace(/^([.][.][\\/])+/, '');
  let file = resolve(dist, `.${safe}`);
  try {
    if ((await fs.stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    file = join(dist, 'index.html');
  }
  try {
    await fs.access(file);
  } catch {
    file = join(dist, 'index.html');
  }
  response.writeHead(200, { 'Content-Type': contentType(extname(file)) });
  createReadStream(file).pipe(response);
}

function applyCors(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'Accept, Authorization, X-Fhir-Base');
}
function contentType(extension) {
  return (
    {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json',
    }[extension] ?? 'application/octet-stream'
  );
}
