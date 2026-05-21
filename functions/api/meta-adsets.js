// GET /api/meta-adsets
// Returns Meta Ads adset-level insights for the configured ad account.
// Auth: ?key=<DASH_KEY>
// Query params: since, until (YYYY-MM-DD) or days fallback

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
    const [insightsData, adsetsData] = await Promise.all([
      fetchAll(
        `https://graph.facebook.com/v20.0/act_${accountId}/insights` +
        `?level=adset&fields=adset_name,adset_id,campaign_name,campaign_id,spend,impressions,clicks,reach,frequency,ctr,cpm,actions` +
        `&time_range=${timeRange}&limit=200&access_token=${token}`
      ),
      fetchAll(
        `https://graph.facebook.com/v20.0/act_${accountId}/adsets` +
        `?fields=id,name,status&limit=500&access_token=${token}`
      ),
    ]);

    const statusMap = {};
    for (const a of adsetsData) statusMap[a.id] = a.status;

    const adsets = insightsData.map(r => ({
      ...r,
      status: statusMap[r.adset_id] || 'UNKNOWN',
    }));

    return json({ ok: true, adsets });
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
