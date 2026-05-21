// GET /api/meta-creatives
// Returns available ad creatives in the configured ad account.
// Auth: ?key=<DASH_KEY>
// Used to list creative IDs before calling /api/meta-create-ad

export async function onRequestGet(context) {
  const { request, env } = context;

  const url = new URL(request.url);
  const key = url.searchParams.get('key') || '';

  if (!env.DASH_KEY || key !== env.DASH_KEY) {
    return json({ error: 'Unauthorized' }, 401);
  }

  if (!env.META_ADS_ACCESS_TOKEN || !env.META_ADS_ACCOUNT_ID) {
    return json({ error: 'META_ADS_ACCESS_TOKEN and META_ADS_ACCOUNT_ID not configured' }, 500);
  }

  const accountId = String(env.META_ADS_ACCOUNT_ID).replace(/^act_/, '');
  const token = env.META_ADS_ACCESS_TOKEN;

  try {
    const all = [];
    let next = `https://graph.facebook.com/v20.0/act_${accountId}/adcreatives` +
      `?fields=id,name,thumbnail_url,object_story_spec&limit=100&access_token=${token}`;
    let safety = 5;

    while (next && safety-- > 0) {
      const resp = await fetch(next);
      const data = await resp.json();
      if (data.error) throw new Error(data.error.message || 'Meta API error');
      if (Array.isArray(data.data)) all.push(...data.data);
      next = data.paging?.next || null;
    }

    return json({ ok: true, creatives: all });
  } catch (err) {
    return json({ ok: false, error: err.message || String(err) }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
