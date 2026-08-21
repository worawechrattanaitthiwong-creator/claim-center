import app from './app.js';
import { injectCloudflareAdapter } from './client-adapter.js';

const BUILD = '2026-08-21-main-reconnect-v1';
const FRONTEND_IMPORTS = [
  `/pro-ui.js?v=${BUILD}`,
  `/master-validation.js?v=${BUILD}`,
  `/master-validation-hooks.js?v=${BUILD}`,
  `/ccd-adapter.js?v=${BUILD}`,
  `/ops-dashboard.js?v=${BUILD}`,
  `/history-styles.js?v=${BUILD}`,
  `/history-import.js?v=${BUILD}`,
  `/history-batch-adapter.js?v=${BUILD}`
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/build') {
      return json({
        status: 'ok',
        build: BUILD,
        branch: 'main',
        entrypoint: 'worker/production.js',
        database: 'claim-center'
      });
    }

    if (url.pathname.startsWith('/api/')) {
      return withBuildHeader(await app.fetch(request, env, ctx));
    }

    if (url.pathname === '/app.js') {
      return serveFrontendBundle(request, env);
    }

    const asset = await env.ASSETS.fetch(request);
    return stampAsset(asset);
  }
};

async function serveFrontendBundle(request, env) {
  const raw = await env.ASSETS.fetch(request);
  if (!raw.ok) return withBuildHeader(raw);

  const adapted = await injectCloudflareAdapter(raw);
  const source = await adapted.text();
  const imports = FRONTEND_IMPORTS.map((path) => `import '${path}';`).join('\n');
  const headers = new Headers(adapted.headers);
  headers.delete('content-length');
  headers.set('content-type', 'text/javascript; charset=utf-8');
  headers.set('cache-control', 'no-store, max-age=0');
  headers.set('x-claim-build', BUILD);

  return new Response(`${imports}\n${source}`, {
    status: adapted.status,
    statusText: adapted.statusText,
    headers
  });
}

async function stampAsset(response) {
  const headers = new Headers(response.headers);
  headers.set('x-claim-build', BUILD);

  const contentType = headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  headers.delete('content-length');
  headers.set('cache-control', 'no-store, max-age=0');
  const html = await response.text();
  const marker = `<meta name="claim-build" content="${BUILD}">`;
  const stamped = html.includes('</head>') ? html.replace('</head>', `${marker}</head>`) : `${marker}${html}`;
  return new Response(stamped, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function withBuildHeader(response) {
  const headers = new Headers(response.headers);
  headers.set('x-claim-build', BUILD);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-claim-build': BUILD
    }
  });
}
