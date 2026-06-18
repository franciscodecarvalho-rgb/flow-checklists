-- =====================================================
-- 1) LIST_EVENTS — histórico de listas (arquivar/desarquivar/transferir)
--    Antes desta migração o comentário obrigatório do arquivamento era
--    coletado na UI e descartado no servidor (não havia onde gravá-lo).
-- =====================================================
CREATE TYPE public.list_event_type AS ENUM (
  'archived',
  'unarchived',
  'transferred'
);

CREATE TABLE public.list_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id    uuid NOT NULL REFERENCES public.lists(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  tipo       public.list_event_type NOT NULL,
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX list_events_list_id_idx ON public.list_events(list_id, created_at DESC);

GRANT SELECT, INSERT ON public.list_events TO authenticated;
GRANT ALL ON public.list_events TO service_role;
ALTER TABLE public.list_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "list_events_select_authenticated" ON public.list_events
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "list_events_insert_self_author" ON public.list_events
  FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());

-- =====================================================
-- 2) reorder_items — reordenação atômica
--    Antes: o cliente disparava N UPDATEs em paralelo; se um falhasse,
--    a ordem ficava inconsistente. Agora tudo ocorre numa única transação.
--    Os triggers de items continuam valendo (só o dono altera 'ordem'),
--    e validamos a titularidade logo no início.
-- =====================================================
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
  IF NOT public.is_list_owner(p_list_id) THEN
    RAISE EXCEPTION 'Apenas o dono da lista pode reordenar os itens';
  END IF;

  UPDATE public.items AS i
  SET ordem = (u.pos * 10)::int
  FROM unnest(p_ordered_ids) WITH ORDINALITY AS u(id, pos)
  WHERE i.id = u.id AND i.list_id = p_list_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reorder_items(uuid, uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.reorder_items(uuid, uuid[]) TO authenticated;
