
## Decisões confirmadas

a) Habilitar Lovable Cloud no início.
b) Trigger SQL no banco para inserir `item_events` em toda mudança de `items.status`.
c) DELETE de área bloqueado por FK `ON DELETE RESTRICT`; UI mostra "Mova ou apague as N listas vinculadas antes de excluir esta área".
d) Signup restrito a `@vitatech.com.br` (validação na função `handle_new_user` com `RAISE EXCEPTION`); fluxo "Esqueci minha senha" nativo do Supabase com rota pública `/reset-password`.

## Checkpoint obrigatório

Antes de aplicar a migration do passo 3, vou colar o **SQL completo** no chat para sua revisão e aguardar OK explícito. Demais passos sigo direto, avisando ao concluir cada um.

## Ordem de execução

1. **Habilitar Lovable Cloud.**
2. **Auth shell**
   - `/login` (email+senha, link "Esqueci minha senha", shadcn).
   - `/forgot-password` (envia `resetPasswordForEmail` com `redirectTo = origin + /reset-password`).
   - `/reset-password` (rota pública, detecta `type=recovery`, chama `updateUser({ password })`).
   - Layout `_authenticated` com `beforeLoad` checando sessão; redireciona para `/login` preservando `redirect`.
   - Listener `onAuthStateChange` único no root, invalidando router + queries.
   - Header com nome do usuário e logout.
3. **Migration única (PARA REVISÃO ANTES DE APLICAR)** contendo:
   - Enums `item_status`, `item_event_type`.
   - Tabelas `profiles`, `areas`, `lists`, `items`, `item_events`, `item_tickets` (FK `lists.area_id` → `areas(id) ON DELETE RESTRICT`).
   - GRANTs para `authenticated` e `service_role` em cada tabela.
   - RLS habilitado em todas + policies conforme briefing.
   - Função `public.is_admin(uuid)` SECURITY DEFINER (evita recursão em RLS).
   - Função + trigger `handle_new_user` em `auth.users`: valida domínio `@vitatech.com.br` (rejeita com mensagem clara), cria `profiles`, marca `is_admin = true` se email = `francisco.carvalho@vitatech.com.br`.
   - Função + trigger `on_item_status_change` em `items`: insere `item_events` (`tipo='status_change'`, `payload={from,to}`, `author_id=auth.uid()`) quando `OLD.status IS DISTINCT FROM NEW.status`.
   - Seed das 15 áreas (ordem 10..150, alfabético).
4. **Server functions** (`createServerFn` + `requireSupabaseAuth`):
   - `listHome` (listas agrupadas por área com contagem de status).
   - `getListDetail`, `getItemDetail` (com timeline).
   - `listUsers` (para transferência de titularidade — só admin).
   - Mutations para create/update/delete de lists, items, comentários, transferência, CRUD de áreas.
5. **Tela `/`** (home): grupos por área (alfabético), filtro de área, busca por título, card com dono e contagens, modal "Nova lista".
6. **Tela `/listas/:id`**: cabeçalho (título, badge área, dono), lista de itens com chip de status colorido (cinza/amarelo/verde), setinhas ↑↓, ações de owner ("Adicionar item", "Editar título", "Apagar lista"), ação de admin "Transferir titularidade".
7. **Drag-and-drop** com `@dnd-kit/core` + `@dnd-kit/sortable` + util de ordem esparsa (passo 10) com normalização automática quando o gap entre vizinhos < 2.
8. **Tela `/listas/:id/itens/:itemId`**: status, botão "Abrir ticket" desabilitado com tooltip "Integração em breve", timeline reversa formatada por tipo (`status_change`, `comment`, `ticket_opened`), campo de comentário usando `date-fns` para "há 2h".
9. **Telas admin**:
   - `/admin/areas`: CRUD; DELETE consulta count de listas vinculadas e bloqueia com mensagem.
   - `/admin/listas`: tabela global com dono + modal de transferência.
10. **Polimento**: toasts em toda mutação, loading/empty states (lista vazia, área sem listas, item sem eventos), responsivo mobile.

## Dependências a instalar

- `@dnd-kit/core`
- `@dnd-kit/sortable`
- `@dnd-kit/utilities`
- `date-fns`

## Próximo passo após aprovar este plano

Executo os passos 1 e 2, paro no passo 3 e colo o SQL completo da migration para sua revisão antes de aplicar.
