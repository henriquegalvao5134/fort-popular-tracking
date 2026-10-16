# Fort Popular Tracking — Notas do Projeto

## Links
- **Relatório do cliente:** https://fort-popular-tracking.pages.dev/relatorio/?key=`<CLIENT_KEY>`
- **Dashboard interno (você):** https://fort-popular-tracking.pages.dev/dash/?key=`<DASH_KEY>`
- **GitHub:** https://github.com/henriquegalvao5134/fort-popular-tracking
- **Cloudflare Pages:** https://dash.cloudflare.com → Workers & Pages → fort-popular-tracking

---

## Senhas e Chaves
- **Senha do relatório do cliente (CLIENT_KEY):** fica nas variáveis da Cloudflare
- **DASH_KEY:** fica nas variáveis da Cloudflare
- **SYNC_SECRET:** fica nas variáveis da Cloudflare

---

## Banco D1
- **Nome:** `fort-popular-tracking-db`
- **ID:** `f6e88914-8a14-4113-af07-9f5546dcabd3`
- **Status:** Criado e migrações aplicadas

---

## Variáveis de Ambiente no Cloudflare
_(Configuradas em: Pages → fort-popular-tracking → Settings → Environment Variables)_

| Variável | Status | Descrição |
|---|---|---|
| `CLIENT_KEY`             | ✅ Configurada | Senha do relatório do cliente |
| `DASH_KEY`               | ✅ Configurada | Chave do dashboard interno |
| `SYNC_SECRET`            | ✅ Configurada | Chave do cron de sincronização |
| `TIMEZONE_OFFSET`        | ✅ Configurada | `-03:00` |
| `META_ADS_ACCESS_TOKEN`  | ✅ Configurada | Token de acesso da conta Meta Ads do cliente |
| `META_ADS_ACCOUNT_ID`    | ✅ Configurada | ID da conta de anúncios (act_XXXXXXX) |
| `SUPABASE_URL`           | ✅ Configurada | URL do projeto Supabase |
| `SUPABASE_SERVICE_KEY`   | ✅ Configurada | Chave service_role do Supabase |
| `META_PIXEL_ID`          | ⏳ Pendente   | Pixel do Meta (opcional para relatório) |
| `META_ACCESS_TOKEN`      | ⏳ Pendente   | Token do Pixel/CAPI (opcional) |

---

## Pixels Instalados no Site
| Pixel | ID | Status |
|---|---|---|
| Google Ads | `AW-18144522784` | ✅ Instalado |
| Meta Pixel | `1673965483607621` | ✅ Instalado |
| Tintim | — | ❌ Removido |

---

## Pendente / Próximos Passos
- [x] Adicionar META_ADS_ACCESS_TOKEN do cliente no Cloudflare
- [x] Adicionar META_ADS_ACCOUNT_ID do cliente no Cloudflare
- [x] Adicionar SUPABASE_URL e SUPABASE_SERVICE_KEY no Cloudflare
- [ ] Testar relatório: https://fort-popular-tracking.pages.dev/relatorio/?key=`<CLIENT_KEY>`

---

## Atenção: Token Meta expira em ~60 dias
O `META_ADS_ACCESS_TOKEN` é um token de 60 dias gerado pelo Graph API Explorer.
Quando expirar, gerar novo em: https://developers.facebook.com/tools/explorer/
- Permissões: `ads_read`, `ads_management`
- Atualizar no Cloudflare → Environment Variables → fazer redeploy
