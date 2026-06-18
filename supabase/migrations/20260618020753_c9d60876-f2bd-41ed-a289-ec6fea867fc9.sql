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
SET search_path TO 'public'
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
      SELECT COUNT(*) INTO v_active_items_count
      FROM public.items
      WHERE list_id = NEW.id AND archived_at IS NULL;
      IF v_active_items_count > 0 THEN
        RAISE EXCEPTION 'Não é possível arquivar lista com itens ativos. Arquive os % itens primeiro.', v_active_items_count;
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

CREATE OR REPLACE FUNCTION public.reorder_items(
  p_list_id     uuid,
  p_ordered_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_list_owner(p_list_id) AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas o dono da lista ou um administrador pode reordenar os itens';
  END IF;

  UPDATE public.items AS i
  SET ordem = (u.pos * 10)::int
  FROM unnest(p_ordered_ids) WITH ORDINALITY AS u(id, pos)
  WHERE i.id = u.id AND i.list_id = p_list_id;
END;
$$;