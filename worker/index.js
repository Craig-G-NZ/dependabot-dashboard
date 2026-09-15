/** Dependabot Dashboard Worker — OAuth token proxy + runtime config + static assets */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

function readClientId(env) {
  return (
    env.GITHUB_CLIENT_ID ||
    env.github_client_id ||
    env.CLIENT_ID ||
    ''
  ).trim();
}

function readCanonicalHost(env) {
  return (env.CANONICAL_HOST || '').trim().toLowerCase();
}

function isAllowedHost(request, canonicalHost) {
  if (!canonicalHost) return true;
  const host = new URL(request.url).hostname.toLowerCase();
  return host === canonicalHost || LOCAL_HOSTS.has(host);
}

function blockedHostResponse(canonicalHost) {
  const site = canonicalHost ? `https://${canonicalHost}` : 'the configured custom domain';
  return new Response(
    `This app is only available at ${site}. workers.dev and preview URLs are disabled.`,
    { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
  );
}

async function handleOAuthToken(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const clientId = payload.client_id || readClientId(env);
  const { code, code_verifier, redirect_uri } = payload;

  if (!clientId || !code || !code_verifier || !redirect_uri) {
    return Response.json({ error: 'missing_parameters' }, { status: 400 });
  }

  const canonicalHost = readCanonicalHost(env);
  if (canonicalHost) {
    try {
      const redirectHost = new URL(redirect_uri).hostname.toLowerCase();
      if (redirectHost !== canonicalHost && !LOCAL_HOSTS.has(redirectHost)) {
        return Response.json({ error: 'invalid_redirect_uri' }, { status: 400 });
      }
    } catch {
      return Response.json({ error: 'invalid_redirect_uri' }, { status: 400 });
    }
  }

  const params = {
    client_id: clientId,
    code,
    redirect_uri,
    code_verifier,
  };
  if (env.GITHUB_CLIENT_SECRET) {
    params.client_secret = env.GITHUB_CLIENT_SECRET;
  }

  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
  });

  const data = await tokenResponse.json();
  return Response.json(data, { status: tokenResponse.ok ? 200 : 400 });
}

export default {
  async fetch(request, env) {
    const canonicalHost = readCanonicalHost(env);
    if (!isAllowedHost(request, canonicalHost)) {
      return blockedHostResponse(canonicalHost);
    }

    const url = new URL(request.url);

    if (url.pathname === '/api/oauth-token' && request.method === 'POST') {
      return handleOAuthToken(request, env);
    }

    if (url.pathname === '/api/config' && request.method === 'GET') {
      const clientId = readClientId(env);
      const siteUrl = canonicalHost ? `https://${canonicalHost}` : '';
      return Response.json(
        {
          clientId,
          configured: Boolean(clientId),
          canonicalHost,
          siteUrl,
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    return env.ASSETS.fetch(request);
  },
};
