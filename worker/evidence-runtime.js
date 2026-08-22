import runtime from './v8-runtime.js';

const MAX_BYTES = 1200000;
const CHUNK_BYTES = 64 * 1024;
const TTL_MS = 35 * 24 * 60 * 60 * 1000;
const FINAL_UI_STYLE = '<link rel="stylesheet" href="/final-ui.css?v=complete">';
const FINAL_UI_SCRIPT = '<script type="module" src="/final-ui.js?v=complete"></script>';

export class EvidenceStore {
  constructor(ctx) {
    this.storage = ctx.storage;
  }

  async fetch(request) {
    const method = request.method.toUpperCase();

    if (method === 'PUT') {
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (bytes.byteLength > MAX_BYTES) return new Response('Evidence too large', { status: 413 });

      await this.storage.deleteAll();
      const count = Math.max(1, Math.ceil(bytes.byteLength / CHUNK_BYTES));
      await this.storage.put('meta', { bytes: bytes.byteLength, count });
      for (let i = 0; i < count; i += 1) {
        const start = i * CHUNK_BYTES;
        const end = Math.min(bytes.byteLength, start + CHUNK_BYTES);
        await this.storage.put(`chunk:${i}`, bytes.slice(start, end).buffer);
      }
      await this.storage.setAlarm(Date.now() + TTL_MS);
      return new Response(null, { status: 204 });
    }

    if (method === 'GET') {
      const meta = await this.storage.get('meta');
      if (!meta) return new Response('Evidence not found', { status: 404 });

      const output = new Uint8Array(Number(meta.bytes || 0));
      let offset = 0;
      for (let i = 0; i < Number(meta.count || 0); i += 1) {
        const raw = await this.storage.get(`chunk:${i}`);
        if (!raw) return new Response('Evidence not found', { status: 404 });
        const chunk = raw instanceof ArrayBuffer
          ? new Uint8Array(raw)
          : ArrayBuffer.isView(raw)
            ? new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
            : null;
        if (!chunk) return new Response('Evidence data invalid', { status: 500 });
        output.set(chunk, offset);
        offset += chunk.byteLength;
      }

      return new Response(output, {
        headers: { etag: `"${meta.bytes}-${meta.count}"` }
      });
    }

    if (method === 'DELETE') {
      await this.storage.deleteAll();
      await this.storage.deleteAlarm();
      return new Response(null, { status: 204 });
    }

    return new Response('Method not allowed', { status: 405 });
  }

  async alarm() {
    await this.storage.deleteAll();
  }
}

function evidenceBucket(env) {
  const namespace = env.EVIDENCE_DO;
  if (!namespace) return null;

  const stubFor = key => namespace.get(namespace.idFromName(String(key)));
  return {
    async put(key, value) {
      let body;
      if (value instanceof ArrayBuffer) body = value;
      else if (ArrayBuffer.isView(value)) body = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
      else body = await new Response(value).arrayBuffer();

      const response = await stubFor(key).fetch('https://evidence.local/', { method: 'PUT', body });
      if (!response.ok) throw new Error(`Evidence storage PUT failed (${response.status})`);
    },

    async get(key) {
      const response = await stubFor(key).fetch('https://evidence.local/', { method: 'GET' });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Evidence storage GET failed (${response.status})`);
      return {
        body: response.body,
        httpEtag: response.headers.get('etag') || ''
      };
    },

    async delete(key) {
      const response = await stubFor(key).fetch('https://evidence.local/', { method: 'DELETE' });
      if (!response.ok && response.status !== 404) throw new Error(`Evidence storage DELETE failed (${response.status})`);
    }
  };
}

function withEvidence(env) {
  const EVIDENCE = evidenceBucket(env);
  if (!EVIDENCE) return env;
  return Object.assign(Object.create(env), { EVIDENCE });
}

async function withFinalUi(request, response) {
  if (request.method === 'HEAD' || !response?.ok) return response;
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  let html = await response.text();
  html = html.replace(/<title>[\s\S]*?<\/title>/i, '<title>Claim Center · Store & DC Operations</title>');
  if (!html.includes('/final-ui.css')) html = html.replace('</head>', `${FINAL_UI_STYLE}</head>`);
  if (!html.includes('/final-ui.js')) html = html.replace('</body>', `${FINAL_UI_SCRIPT}</body>`);

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('etag');
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  async fetch(request, env, ctx) {
    const response = await runtime.fetch(request, withEvidence(env), ctx);
    return withFinalUi(request, response);
  }
};
