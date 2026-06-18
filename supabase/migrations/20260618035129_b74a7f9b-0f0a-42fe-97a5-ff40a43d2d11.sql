ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS prioridade text NOT NULL DEFAULT 'media' CHECK (prioridade IN ('alta', 'media', 'baixa')),
  ADD COLUMN IF NOT EXISTS envolvido_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.item_favorites (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);

CREATE INDEX IF NOT EXISTS item_favorites_user_idx ON public.item_favorites(user_id);

GRANT SELECT, INSERT, DELETE ON public.item_favorites TO authenticated;
GRANT ALL ON public.item_favorites TO service_role;

ALTER TABLE public.item_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "item_favorites_select_self" ON public.item_favorites;
DROP POLICY IF EXISTS "item_favorites_insert_self" ON public.item_favorites;
DROP POLICY IF EXISTS "item_favorites_delete_self" ON public.item_favorites;

CREATE POLICY "item_favorites_select_self" ON public.item_favorites
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "item_favorites_insert_self" ON public.item_favorites
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "item_favorites_delete_self" ON public.item_favorites
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.items_before_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.lists_before_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_is_owner boolean := (OLD.owner_id = auth.uid());
  v_is_admin boolean := public.is_admin(auth.uid());
  v_active_items_count int;
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Apenas administradores podem transferir titularidade';
  END IF;

  IF NOT v_is_owner AND NOT v_is_admin THEN
    IF NEW.titulo IS DISTINCT FROM OLD.titulo
       OR NEW.area_id IS DISTINCT FROM OLD.area_id THEN
      RAISE EXCEPTION 'Apenas o dono da lista ou um administrador pode alterar título ou área';
    END IF;
  END IF;

  IF NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN
    IF NOT v_is_owner AND NOT v_is_admin THEN
      RAISE EXCEPTION 'Apenas o dono da lista ou um administrador pode arquivá-la ou desarquivá-la';
    END IF;
    IF NEW.archived_at IS NOT NULL THEN
      IF NOT v_is_admin THEN
        SELECT COUNT(*) INTO v_active_items_count
        FROM public.items
        WHERE list_id = NEW.id AND archived_at IS NULL;
        IF v_active_items_count > 0 THEN
          RAISE EXCEPTION 'Não é possível arquivar lista com itens ativos. Arquive os % itens primeiro.', v_active_items_count;
        END IF;
      END IF;
      NEW.archived_by := auth.uid();
    ELSE
      NEW.archived_by := NULL;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS profiles_before_update ON public.profiles;
CREATE TRIGGER profiles_before_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_before_update();

DROP TRIGGER IF EXISTS lists_before_update ON public.lists;
CREATE TRIGGER lists_before_update
  BEFORE UPDATE ON public.lists
  FOR EACH ROW EXECUTE FUNCTION public.lists_before_update();

DROP TRIGGER IF EXISTS items_before_update ON public.items;
CREATE TRIGGER items_before_update
  BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.items_before_update();

DROP TRIGGER IF EXISTS items_after_insert ON public.items;
CREATE TRIGGER items_after_insert
  AFTER INSERT ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.items_log_create();

CREATE OR REPLACE FUNCTION public.reorder_items(p_list_id uuid, p_ordered_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NOT public.is_list_owner(p_list_id) AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas o dono da lista ou um administrador pode reordenar os itens';
  END IF;

  UPDATE public.items AS i
  SET ordem = (u.pos * 10)::int
  FROM unnest(p_ordered_ids) WITH ORDINALITY AS u(id, pos)
  WHERE i.id = u.id AND i.list_id = p_list_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reorder_items(uuid, uuid[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.items_before_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.lists_before_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.items_log_create() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.profiles_before_update() FROM PUBLIC, anon, authenticated;