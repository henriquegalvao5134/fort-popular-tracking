// GET /api/meta-ads
// Returns Meta Ads ad-level insights for the configured ad account.
// Auth: ?key=<DASH_KEY>
// Query params: days (7, 30, 90) — defaults to 30

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

  let since, until;
  const sinceParam = url.searchParams.get('since');
  const untilParam = url.searchParams.get('until');
  const isYmd = s => s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (isYmd(sinceParam) && isYmd(untilParam)) {
    since = sinceParam;
    until = untilParam;
  } else {
    const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '30'), 1), 365);
    until = ymd(new Date());
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);
    since = ymd(sinceDate);
  }
  const timeRange = encodeURIComponent(JSON.stringify({ since, until }));

  try {
    const [insights, creatives] = await Promise.all([
      fetchAll(
        `https://graph.facebook.com/v20.0/act_${accountId}/insights` +
        `?level=ad&fields=ad_name,ad_id,adset_name,campaign_name,spend,impressions,clicks,ctr,cpm,actions` +
        `&time_range=${timeRange}&limit=100&sort=spend_descending&access_token=${token}`
      ),
      fetchAll(
        `https://graph.facebook.com/v20.0/act_${accountId}/ads` +
        `?fields=id,creative{thumbnail_url}&limit=200&access_token=${token}`
      ),
    ]);

    const thumbMap = {};
    for (const ad of creatives) {
      if (ad.creative?.thumbnail_url) thumbMap[ad.id] = ad.creative.thumbnail_url;
    }

    const ads = insights.map(r => ({
      ...r,
      thumbnail_url: thumbMap[r.ad_id] || null,
    }));

    return json({ ok: true, ads });
  } catch (err) {
    return json({ error: err.message || String(err) }, 500);
  }
}

async function fetchAll(url) {
  const all = [];
  let next = url;
  let safety = 10;
  while (next && safety-- > 0) {
    const resp = await fetch(next);
    if (!resp.ok) throw new Error(`Meta API ${resp.status}`);
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message || 'Meta API error');
    if (Array.isArray(data.data)) all.push(...data.data);
    next = data.paging?.next || null;
  }
  return all;
}

function ymd(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
