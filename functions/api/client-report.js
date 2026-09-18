// GET /api/client-report
// Endpoint público para o relatório do cliente.
// Auth: ?key=<CLIENT_KEY> (separado do DASH_KEY interno)

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const key = url.searchParams.get('key') || '';

  if (!env.CLIENT_KEY || key !== env.CLIENT_KEY) {
    return json({ error: 'Unauthorized' }, 401);
  }

  if (!env.META_ADS_ACCESS_TOKEN || !env.META_ADS_ACCOUNT_ID) {
    return json({ error: 'Meta Ads not configured' }, 500);
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
    const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '7'), 1), 90);
    until = ymd(new Date());
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);
    since = ymd(sinceDate);
  }
  const timeRange = encodeURIComponent(JSON.stringify({ since, until }));

  try {
    const [insightsData, campaignsData, accountData, dailyData, adsData, adInsightsData, dailyCampaignData] = await Promise.all([
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
      ),
      fetchAll(
        `https://graph.facebook.com/v20.0/act_${accountId}/insights` +
        `?fields=spend,impressions,clicks,reach,cpm,ctr,frequency,actions&time_range=${timeRange}&time_increment=1&access_token=${token}`
      ),
      fetchAll(
        `https://graph.facebook.com/v20.0/act_${accountId}/ads` +
        `?fields=id,name,status,campaign_id,adset_id,creative{id,title,body,image_url,thumbnail_url,video_id}` +
        `&limit=200&access_token=${token}`
      ),
      fetchAll(
        `https://graph.facebook.com/v20.0/act_${accountId}/insights` +
        `?level=ad&fields=ad_id,ad_name,campaign_id,spend,impressions,clicks,reach,ctr,cpm,actions,video_p25_watched_actions,video_p75_watched_actions` +
        `&time_range=${timeRange}&limit=200&access_token=${token}`
      ),
      fetchAll(
        `https://graph.facebook.com/v20.0/act_${accountId}/insights` +
        `?level=campaign&fields=campaign_name,campaign_id,spend,cpm,impressions` +
        `&time_range=${timeRange}&time_increment=1&limit=500&access_token=${token}`
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

    // Include campaigns that exist but had zero activity in the period
    const insightIds = new Set(campaigns.map(c => c.campaign_id));
    for (const c of campaignsData) {
      if (!insightIds.has(c.id)) {
        campaigns.push({
          campaign_id: c.id,
          campaign_name: c.name,
          spend: '0',
          impressions: '0',
          clicks: '0',
          reach: '0',
          frequency: '0',
          ctr: '0',
          cpm: '0',
          actions: [],
          status: c.status,
          objective: c.objective || '',
        });
      }
    }

    const cap   = parseFloat(accountData.spend_cap  || 0);
    const spent = parseFloat(accountData.amount_spent || 0);
    if (cap > 0 && cap > spent) {
      accountData.remaining_balance = ((cap - spent) / 100).toFixed(2);
    }

    // Merge ad creative data with ad insights
    const adInsightMap = {};
    for (const a of adInsightsData) {
      adInsightMap[a.ad_id] = a;
    }
    const ads = adsData.map(a => ({
      id: a.id,
      name: a.name,
      status: a.status,
      campaign_id: a.campaign_id,
      adset_id: a.adset_id,
      creative: a.creative || null,
      insights: adInsightMap[a.id] || null,
    }));

    return json({
      ok: true,
      account: accountData,
      campaigns,
      ads,
      daily: dailyData.sort((a, b) => a.date_start > b.date_start ? 1 : -1),
      daily_campaign: dailyCampaignData.sort((a, b) => a.date_start > b.date_start ? 1 : -1),
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
