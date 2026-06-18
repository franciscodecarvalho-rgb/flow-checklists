-- =====================================================
-- 1) ITEMS: prioridade de monitoramento + envolvido
--    (idempotente — o Lovable re-aplica migrations no rebuild)
-- =====================================================
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS prioridade text NOT NULL DEFAULT 'media',
  ADD COLUMN IF NOT EXISTS envolvido_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'items_prioridade_check'
  ) THEN
    ALTER TABLE public.items
      ADD CONSTRAINT items_prioridade_check CHECK (prioridade IN ('alta', 'media', 'baixa'));
  END IF;
END $$;

-- Trigger: mantém a permissão de admin (igual à migração 020753 do Lovable)
-- e acrescenta prioridade e envolvido_id à lista de campos owner/admin-only.
CREATE OR REPLACE FUNCTION public.items_before_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_owner boolean := public.is_list_owner(OLD.list_id);
  v_is_admin boolean := public.is_admin(auth.uid());
BEGIN
  IF NOT v_is_owner AND NOT v_is_admin THEN
    IF NEW.texto IS DISTINCT FROM OLD.texto
       OR NEW.ordem IS DISTINCT FROM OLD.ordem
       OR NEW.list_id IS DISTINCT FROM OLD.list_id
       OR NEW.periodicidade_dias IS DISTINCT FROM OLD.periodicidade_dias
       OR NEW.archived_at IS DISTINCT FROM OLD.archived_at
       OR NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id
       OR NEW.envolvido_id IS DISTINCT FROM OLD.envolvido_id
       OR NEW.prioridade IS DISTINCT FROM OLD.prioridade
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.validade IS DISTINCT FROM OLD.validade
       OR NEW.link IS DISTINCT FROM OLD.link THEN
      RAISE EXCEPTION 'Apenas o dono da lista ou um administrador pode alterar este campo';
    END IF;
  END IF;

  IF NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN
    IF NEW.archived_at IS NOT NULL THEN
      NEW.proxima_checagem := NULL;
      NEW.archived_by := auth.uid();
    ELSE
      NEW.archived_by := NULL;
      IF NEW.proxima_checagem IS NULL THEN
        RAISE EXCEPTION 'Ao desarquivar um item, é obrigatório definir nova data de próxima checagem';
      END IF;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

-- =====================================================
-- 2) ITEM_FAVORITES: favoritos por usuário (idempotente)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.item_favorites (
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_id    uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);
CREATE INDEX IF NOT EXISTS item_favorites_user_idx ON public.item_favorites(user_id);

GRANT SELECT, INSERT, DELETE ON public.item_favorites TO authenticated;
GRANT ALL ON public.item_favorites TO service_role;
ALTER TABLE public.item_favorites ENABLE ROW LEVEL SECURITY;

-- Cada usuário só enxerga e gerencia os próprios favoritos.
DROP POLICY IF EXISTS "item_favorites_select_self" ON public.item_favorites;
CREATE POLICY "item_favorites_select_self" ON public.item_favorites
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "item_favorites_insert_self" ON public.item_favorites;
CREATE POLICY "item_favorites_insert_self" ON public.item_favorites
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "item_favorites_delete_self" ON public.item_favorites;
CREATE POLICY "item_favorites_delete_self" ON public.item_favorites
  FOR DELETE TO authenticated USING (user_id = auth.uid());
