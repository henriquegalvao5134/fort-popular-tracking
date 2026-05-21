// GET /api/meta-campaigns
// Returns Meta Ads campaign insights for the configured ad account.
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

  // Accept explicit since/until or fall back to days param for backwards compat
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
    const [insightsData, campaignsData, accountData, dailyData] = await Promise.all([
      fetchAll(
        `https://graph.facebook.com/v20.0/act_${accountId}/insights` +
        `?level=campaign&fields=campaign_name,campaign_id,spend,impressions,clicks,reach,frequency,ctr,cpm,actions` +
        `&time_range=${timeRange}&limit=100&access_token=${token}`
      ),
      fetchAll(
        `https://graph.facebook.com/v20.0/act_${accountId}/campaigns` +
        `?fields=id,name,status,objective&limit=200&access_token=${token}`
      ),
      fetchOne(
        `https://graph.facebook.com/v20.0/act_${accountId}` +
        `?fields=name,amount_spent,spend_cap,currency,account_status&access_token=${token}`
      // manual_balance: set META_ACCOUNT_BALANCE env var to the real account balance (update when topping up)
      ),
      fetchAll(
        `https://graph.facebook.com/v20.0/act_${accountId}/insights` +
        `?fields=spend,impressions,clicks,actions&time_range=${timeRange}&time_increment=1&access_token=${token}`
      ),
    ]);

    const statusMap = {};
    const objectiveMap = {};
    for (const c of campaignsData) {
      statusMap[c.id] = c.status;
      objectiveMap[c.id] = c.objective || '';
    }

    const campaigns = insightsData.map(r => ({
      ...r,
      status: statusMap[r.campaign_id] || 'UNKNOWN',
      objective: objectiveMap[r.campaign_id] || '',
    }));

    // Calculate remaining balance from spend_cap - amount_spent (both in cents)
    const cap   = parseFloat(accountData.spend_cap  || 0);
    const spent = parseFloat(accountData.amount_spent || 0);
    if (cap > 0 && cap > spent) {
      accountData.remaining_balance = ((cap - spent) / 100).toFixed(2);
    }

    return json({
      ok: true,
      account: accountData,
      campaigns,
      daily: dailyData.sort((a, b) => a.date_start > b.date_start ? 1 : -1),
    });
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

async function fetchOne(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Meta API ${resp.status}`);
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message || 'Meta API error');
  return data;
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
