// GET /api/instagram-insights
// Busca crescimento de seguidores do Instagram Business Account
// Auth: ?key=<CLIENT_KEY> ou <DASH_KEY>

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const key = url.searchParams.get('key') || '';

  const validKey = (env.CLIENT_KEY && key === env.CLIENT_KEY) ||
                   (env.DASH_KEY   && key === env.DASH_KEY);
  if (!validKey) return json({ error: 'Unauthorized' }, 401);

  const userToken = env.META_ADS_ACCESS_TOKEN;
  if (!userToken) return json({ error: 'Token não configurado' }, 500);

  try {
    // 1. Busca página com Instagram vinculado e seu token
    const pagesResp = await fetch(
      `https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${userToken}`
    );
    const pagesData = await pagesResp.json();
    if (pagesData.error) return json({ error: pagesData.error.message }, 500);

    const page = (pagesData.data || []).find(p => p.instagram_business_account);
    if (!page) {
      return json({ error: 'Nenhuma conta Instagram Business encontrada.' }, 404);
    }

    const igId     = page.instagram_business_account.id;
    const pageToken = page.access_token;

    const since = url.searchParams.get('since') || ymd(daysAgo(7));
    const until = url.searchParams.get('until') || ymd(new Date());

    // follower_count disponível apenas nos últimos 90 dias
    const maxAgo = ymd(daysAgo(90));
    const followerSince = since < maxAgo ? maxAgo : since;

    // 2. Busca perfil e crescimento de seguidores em paralelo (apenas 2 chamadas)
    const [profileData, insightsFollower] = await Promise.all([
      fetchSafe(`https://graph.facebook.com/v20.0/${igId}?fields=username,followers_count,media_count&access_token=${pageToken}`),
      fetchSafe(`https://graph.facebook.com/v20.0/${igId}/insights?metric=follower_count&period=day&since=${followerSince}&until=${until}&access_token=${pageToken}`),
    ]);

    // 3. Processa variação diária de seguidores
    const followerDaily = (insightsFollower?.data?.[0]?.values || []).map(v => ({
      date: v.end_time?.substring(0, 10) || '',
      change: parseInt(v.value) || 0,
    }));
    const netGain = followerDaily.reduce((s, d) => s + d.change, 0);

    return json({
      ok: true,
      instagram: {
        id: igId,
        username: profileData?.username || '',
        followers: profileData?.followers_count || 0,
        media_count: profileData?.media_count || 0,
      },
      follower_growth: {
        net_gain: netGain,
        daily: followerDaily,
      },
    });

  } catch (err) {
    return json({ error: err.message || String(err) }, 500);
  }
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function ymd(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function fetchSafe(url) {
  try {
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.error) return null;
    return data;
  } catch { return null; }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
