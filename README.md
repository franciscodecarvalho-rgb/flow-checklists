# Flow Checklists

Gestão de **checklists recorrentes** e **listas de controle** por área, para a Vitatech.
Cada área (Financeiro, Jurídico, Qualidade, …) agrupa coleções de itens com responsável,
verificação periódica, histórico de eventos e arquivamento auditável.

## Conceitos

- **Área** — agrupador organizacional (gerido por administradores).
- **Lista** — pertence a uma área e a um dono. Dois tipos:
  - `checklist` — rotinas que se repetem em intervalos (`periodicidade_dias` + `proxima_checagem`).
  - `lista` — controle de documentos/registros (status, validade, link), sem repetição.
- **Item** — linha de uma lista, com responsável, datas e histórico (`item_events`).
- **Verificação** — marca um item de checklist como conferido e reagenda a próxima checagem.
- **Histórico** — `item_events` (por item) e `list_events` (arquivar/desarquivar/transferir lista)
  registram quem fez o quê, com comentário obrigatório nas ações sensíveis.

## Stack

- **Frontend:** React 19 + [TanStack Start](https://tanstack.com/start) / Router + TanStack Query
- **UI:** Tailwind CSS v4 + shadcn/ui (Radix) + lucide-react + sonner
- **Backend:** Server Functions (TanStack Start) com validação [Zod](https://zod.dev)
- **Dados/Auth:** [Supabase](https://supabase.com) (Postgres + RLS + Auth)
- **Runtime/deploy:** Cloudflare (Vite plugin / Wrangler) — provisionado via Lovable Cloud
- **Gerenciador de pacotes:** [Bun](https://bun.sh) (`bun.lock` é a fonte de verdade)

## Como rodar localmente

```bash
# 1. Instale as dependências
bun install            # ou: npm install

# 2. Configure o ambiente
cp .env.example .env   # preencha com as chaves do seu projeto Supabase

# 3. Suba o servidor de desenvolvimento
bun dev                # ou: npm run dev
```

Scripts: `dev`, `build`, `preview`, `lint`, `format`.

## Estrutura

```
src/
  routes/                       # rotas (file-based, TanStack Router)
    _authenticated/             # área logada: home, listas, itens, admin
    login / forgot / reset      # fluxo de autenticação
  lib/app.functions.ts          # server functions (toda a lógica de dados + Zod)
  integrations/supabase/        # clients (browser/server), auth middleware
  components/                   # AppHeader, ItemSheet e ui/ (shadcn)
supabase/migrations/            # schema, RLS, triggers e funções do banco
```

## Segurança

- Toda a autorização vive no **Postgres via RLS** + triggers (`is_admin`, `is_list_owner`,
  `lists_before_update`, `items_before_update`). As server functions são uma camada fina
  por cima, com validação Zod e mensagens de erro traduzidas.
- Apenas e-mails `@vitatech.com.br` podem se cadastrar (trigger `handle_new_user`).
- O `.env` versionado contém **apenas chaves publishable/anon** (públicas por design).
  A `service_role` key nunca deve ser commitada nem exposta ao cliente.

## Deploy

Projeto gerido no **Lovable**: o fluxo é `git push` → o Lovable aplica as migrations em
`supabase/migrations/` e publica o frontend. Mantenha código e migrations no **mesmo push**
quando um depender do outro (ex.: uma server function que lê uma tabela nova).
