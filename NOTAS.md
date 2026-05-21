# Fort Popular Tracking — Notas do Projeto

## Links
- **Dashboard interno (você):** https://fort-popular-tracking.pages.dev/dash/?key=8355ad51f1d2933f84b69aa372eefc6592c89d7e17d0e100ad81fde767f31fb6
- **GitHub:** https://github.com/henriquegalvao5134/fort-popular-tracking
- **Cloudflare Pages:** https://dash.cloudflare.com → Workers & Pages → fort-popular-tracking

---

## Senhas e Chaves
- **DASH_KEY:** `8355ad51f1d2933f84b69aa372eefc6592c89d7e17d0e100ad81fde767f31fb6`
- **SYNC_SECRET:** `9a01ea0958607421d1b233cb829da2b2621605f6708510f10647961747b4e8a2`

---

## Banco D1
- **Nome:** `fort-popular-tracking-db`
- **ID:** `f6e88914-8a14-4113-af07-9f5546dcabd3`

---

## Slugs de Webhook
| Plataforma | URL completa |
|---|---|
| Eduzz    | `https://fort-popular-tracking.pages.dev/webhook/eduzz/7b4e90ef-e71a-46cd-bb6c-f6ac6814c13c` |
| Hotmart  | `https://fort-popular-tracking.pages.dev/webhook/hotmart/3a70ab07-a9e8-406a-9e5a-2e05cc1134a5` |
| Kiwify   | `https://fort-popular-tracking.pages.dev/webhook/kiwify/f8b229fd-9a44-4cb1-bcf9-762e0b2c0419` |

---

## Variáveis de Ambiente no Cloudflare
_(Configurar em: Pages → fort-popular-tracking → Settings → Environment Variables)_

| Variável | Valor | Tipo |
|---|---|---|
| `META_PIXEL_ID`           | _(pixel do cliente)_            | Plaintext |
| `META_ACCESS_TOKEN`       | _(token CAPI do cliente)_       | Secret |
| `DASH_KEY`                | `8355ad51f1d2933f84b69aa372eefc6592c89d7e17d0e100ad81fde767f31fb6` | Secret |
| `SYNC_SECRET`             | `9a01ea0958607421d1b233cb829da2b2621605f6708510f10647961747b4e8a2` | Secret |
| `EDUZZ_WEBHOOK_SLUG`      | `7b4e90ef-e71a-46cd-bb6c-f6ac6814c13c` | Secret |
| `HOTMART_WEBHOOK_SLUG`    | `3a70ab07-a9e8-406a-9e5a-2e05cc1134a5` | Secret |
| `KIWIFY_WEBHOOK_SLUG`     | `f8b229fd-9a44-4cb1-bcf9-762e0b2c0419` | Secret |
| `TIMEZONE_OFFSET`         | `-03:00`                        | Plaintext |

---

## Passos Manuais no Cloudflare Dashboard

### 1. Criar o projeto Pages
1. Acesse: https://dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git
2. Repositório: `henriquegalvao5134/fort-popular-tracking`
3. Project name: `fort-popular-tracking`
4. Production branch: `main`
5. Framework preset: `None`
6. Build command: _(deixar vazio)_
7. Build output directory: `/`
8. Clique **Save and Deploy**

### 2. Binding do banco D1
1. Pages → fort-popular-tracking → Settings → Bindings → Add → D1 database
2. Variable name: `DB`
3. D1 database: `fort-popular-tracking-db`

### 3. Variáveis de ambiente
1. Settings → Environment variables → Add variables
2. Adicionar todas as variáveis da tabela acima
3. Após salvar: Deployments → Retry deployment (para aplicar as variáveis)

---

## Pendente / Próximos Passos
- [ ] Criar projeto no Cloudflare Pages (passos acima)
- [ ] Adicionar META_PIXEL_ID e META_ACCESS_TOKEN do cliente
- [ ] Confirmar plataforma de vendas (Eduzz / Hotmart / Kiwify)
