ALTER TABLE public.lists
  ADD COLUMN tipo text NOT NULL DEFAULT 'checklist'
  CHECK (tipo IN ('checklist','lista'));

ALTER TABLE public.items
  ADD COLUMN responsavel_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN status text,
  ADD COLUMN validade date,
  ADD COLUMN link text;

ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_active_must_have_date;

CREATE OR REPLACE FUNCTION public.items_before_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_is_owner boolean := public.is_list_owner(OLD.list_id);
BEGIN
  IF NOT v_is_owner THEN
    IF NEW.texto IS DISTINCT FROM OLD.texto
       OR NEW.ordem IS DISTINCT FROM OLD.ordem
       OR NEW.list_id IS DISTINCT FROM OLD.list_id
       OR NEW.periodicidade_dias IS DISTINCT FROM OLD.periodicidade_dias
       OR NEW.archived_at IS DISTINCT FROM OLD.archived_at
       OR NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.validade IS DISTINCT FROM OLD.validade
       OR NEW.link IS DISTINCT FROM OLD.link THEN
      RAISE EXCEPTION 'Apenas o dono da lista pode alterar este campo';
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