# Fort Popular Tracking — Notas do Projeto

## Links
- **Relatório do cliente:** https://fort-popular-tracking.pages.dev/relatorio/?key=fortpopular2026
- **Dashboard interno (você):** https://fort-popular-tracking.pages.dev/dash/?key=8b00fa11a0c0278a95bb68b536050b44b30ca7625840aadf676ae93380c93e85
- **GitHub:** https://github.com/henriquegalvao5134/fort-popular-tracking
- **Cloudflare Pages:** https://dash.cloudflare.com → Workers & Pages → fort-popular-tracking

---

## Senhas e Chaves
- **Senha do relatório do cliente:** `fortpopular2026`
  _(variável CLIENT_KEY no Cloudflare — já configurada)_
- **DASH_KEY:** `8b00fa11a0c0278a95bb68b536050b44b30ca7625840aadf676ae93380c93e85`
  _(variável DASH_KEY no Cloudflare — já configurada)_
- **SYNC_SECRET:** `dec5424b7ac81f7680e6244ac408060a519d2fd4438123c07b3690972369ce0e`

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
| `CLIENT_KEY`             | ✅ Configurada | `fortpopular2026` — senha do relatório do cliente |
| `DASH_KEY`               | ✅ Configurada | Chave do dashboard interno |
| `SYNC_SECRET`            | ✅ Configurada | Chave do cron de sincronização |
| `TIMEZONE_OFFSET`        | ✅ Configurada | `-03:00` |
| `META_ADS_ACCESS_TOKEN`  | ✅ Configurada | Token de acesso da conta Meta Ads do cliente |
| `META_ADS_ACCOUNT_ID`    | ✅ Configurada | ID da conta de anúncios (act_XXXXXXX) |
| `META_PIXEL_ID`          | ⏳ Pendente   | Pixel do Meta (opcional para relatório) |
| `META_ACCESS_TOKEN`      | ⏳ Pendente   | Token do Pixel/CAPI (opcional) |

---

## Tintim — Dados de Integração
- **Código do Cliente:** `72387556-f1d2-4511-9f34-e28ed4d056ce`
- **Token de Segurança:** `llLetSouyRwYo_wddcf8dAxCuxAyG74h4l0RXQwUsRM`

---

## Pixels Instalados no Site
| Pixel | ID | Status |
|---|---|---|
| Google Ads | `AW-18144522784` | ✅ Instalado |
| Meta Pixel | `1673965483607621` | ✅ Instalado |
| Tintim | `72387556-f1d2-4511-9f34-e28ed4d056ce` | ✅ Instalado |

---

## Pendente / Próximos Passos
- [x] Adicionar META_ADS_ACCESS_TOKEN do cliente no Cloudflare
- [x] Adicionar META_ADS_ACCOUNT_ID do cliente no Cloudflare
- [ ] Testar relatório: https://fort-popular-tracking.pages.dev/relatorio/?key=fortpopular2026

---

## Atenção: Token Meta expira em ~60 dias
O `META_ADS_ACCESS_TOKEN` é um token de 60 dias gerado pelo Graph API Explorer.
Quando expirar, gerar novo em: https://developers.facebook.com/tools/explorer/
- Permissões: `ads_read`, `ads_management`
- Atualizar no Cloudflare → Environment Variables → fazer redeploy
