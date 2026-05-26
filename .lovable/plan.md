## Próximos passos

### 1. Aplicar migration completa (passo 3 do plano original)
Inclui enums, tabelas (`profiles`, `areas`, `lists`, `items`, `item_events`, `item_tickets`), GRANTs, RLS, policies, `is_admin()`, `handle_new_user` (validação `@vitatech.com.br` + flag admin para `francisco.carvalho@vitatech.com.br`), `on_item_status_change`, `lists_before_update` (versão corrigida com bloqueio simétrico admin/dono), `items_before_update`, **novo `profiles_before_update`** (bloqueia auto-promoção a admin, **sem** `updated_at`), e seed das 15 áreas.

### 2. Server functions (passo 4)
Em `src/lib/*.functions.ts`, usando `createServerFn` + `requireSupabaseAuth`:
- `listHome` — listas agrupadas por área com contagens de status
- `getListDetail`, `getItemDetail` (com timeline ordenada)
- `listUsers` — só admin, para modal de transferência
- Mutations: criar/editar/apagar listas, criar/editar/apagar/reordenar itens, mudar status, comentar, transferir titularidade, CRUD de áreas (delete bloqueado por FK RESTRICT com mensagem amigável)

### 3. Checkpoint
Aviso ao concluir o passo 4 antes de seguir para as telas (passos 5+).

## Pontos anotados para depois
- Tratar mensagem de erro do signup fora de domínio na UI (remover prefixo `Database error saving new user:` antes de exibir).
