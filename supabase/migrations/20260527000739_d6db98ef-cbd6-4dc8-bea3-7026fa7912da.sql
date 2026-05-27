-- ============================================================
-- LIMPEZA do schema antigo
-- ============================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

DROP TABLE IF EXISTS
  public.item_tickets,
  public.item_events,
  public.items,
  public.lists,
  public.areas,
  public.profiles
CASCADE;

DROP FUNCTION IF EXISTS public.set_item_status(uuid, public.item_status);
DROP FUNCTION IF EXISTS public.on_item_status_change();
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.profiles_before_update();
DROP FUNCTION IF EXISTS public.items_before_update();
DROP FUNCTION IF EXISTS public.lists_before_update();
DROP FUNCTION IF EXISTS public.is_admin(uuid);

DROP TYPE IF EXISTS public.item_status;
DROP TYPE IF EXISTS public.item_event_type;

-- =====================================================
-- Listas e Checklists — schema inicial (modelo recorrente)
-- =====================================================

-- ---------- ENUMS ----------
CREATE TYPE public.item_event_type AS ENUM (
  'item_created',
  'item_edited',
  'verification',
  'comment',
  'archived',
  'unarchived',
  'ticket_opened'
);

-- ---------- PROFILES ----------
CREATE TABLE public.profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text NOT NULL,
  full_name  text,
  is_admin   boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND is_admin = true)
$$;

CREATE POLICY "profiles_select_authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION public.profiles_before_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin
     AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar o papel de admin';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_before_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_before_update();

-- ---------- TRIGGER: novo usuário ----------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF lower(NEW.email) NOT LIKE '%@vitatech.com.br' THEN
    RAISE EXCEPTION 'Apenas emails @vitatech.com.br podem se cadastrar'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, is_admin)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    lower(NEW.email) = 'francisco.carvalho@vitatech.com.br'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------- AREAS ----------
CREATE TABLE public.areas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       text NOT NULL UNIQUE,
  ordem      int  NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.areas TO authenticated;
GRANT ALL ON public.areas TO service_role;
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "areas_select_authenticated" ON public.areas FOR SELECT TO authenticated USING (true);
CREATE POLICY "areas_insert_admin"          ON public.areas FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "areas_update_admin"          ON public.areas FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "areas_delete_admin"          ON public.areas FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- ---------- LISTS ----------
CREATE TABLE public.lists (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo      text NOT NULL,
  area_id     uuid NOT NULL REFERENCES public.areas(id) ON DELETE RESTRICT,
  owner_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  archived_at timestamptz,
  archived_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lists_area_id_idx  ON public.lists(area_id);
CREATE INDEX lists_owner_id_idx ON public.lists(owner_id);
CREATE INDEX lists_active_idx   ON public.lists(archived_at) WHERE archived_at IS NULL;
GRANT SELECT, INSERT, UPDATE ON public.lists TO authenticated;
GRANT ALL ON public.lists TO service_role;
ALTER TABLE public.lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lists_select_authenticated" ON public.lists FOR SELECT TO authenticated USING (true);
CREATE POLICY "lists_insert_self_owner"    ON public.lists FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "lists_update_owner_or_admin" ON public.lists
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (owner_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.lists_before_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_owner boolean := (OLD.owner_id = auth.uid());
  v_is_admin boolean := public.is_admin(auth.uid());
  v_active_items_count int;
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Apenas administradores podem transferir titularidade';
  END IF;

  IF NOT v_is_owner THEN
    IF NEW.titulo IS DISTINCT FROM OLD.titulo
       OR NEW.area_id IS DISTINCT FROM OLD.area_id THEN
      RAISE EXCEPTION 'Apenas o dono da lista pode alterar título ou área';
    END IF;
  END IF;

  IF NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN
    IF NOT v_is_owner THEN
      RAISE EXCEPTION 'Apenas o dono da lista pode arquivá-la ou desarquivá-la';
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
$$;

CREATE TRIGGER lists_before_update
  BEFORE UPDATE ON public.lists
  FOR EACH ROW EXECUTE FUNCTION public.lists_before_update();

-- ---------- ITEMS ----------
CREATE TABLE public.items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id            uuid NOT NULL REFERENCES public.lists(id) ON DELETE CASCADE,
  texto              text NOT NULL,
  proxima_checagem   date,
  periodicidade_dias int,
  ordem              int NOT NULL DEFAULT 0,
  archived_at        timestamptz,
  archived_by        uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT items_active_must_have_date
    CHECK ((archived_at IS NOT NULL) OR (proxima_checagem IS NOT NULL)),
  CONSTRAINT items_periodicidade_positive
    CHECK (periodicidade_dias IS NULL OR periodicidade_dias > 0)
);
CREATE INDEX items_list_id_idx     ON public.items(list_id, ordem);
CREATE INDEX items_active_date_idx ON public.items(proxima_checagem) WHERE archived_at IS NULL;
GRANT SELECT, INSERT, UPDATE ON public.items TO authenticated;
GRANT ALL ON public.items TO service_role;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_list_owner(_list_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.lists WHERE id = _list_id AND owner_id = auth.uid())
$$;

CREATE POLICY "items_select_authenticated" ON public.items FOR SELECT TO authenticated USING (true);
CREATE POLICY "items_insert_list_owner"    ON public.items FOR INSERT TO authenticated WITH CHECK (public.is_list_owner(list_id));
CREATE POLICY "items_update_authenticated" ON public.items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.items_before_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_owner boolean := public.is_list_owner(OLD.list_id);
BEGIN
  IF NOT v_is_owner THEN
    IF NEW.texto IS DISTINCT FROM OLD.texto
       OR NEW.ordem IS DISTINCT FROM OLD.ordem
       OR NEW.list_id IS DISTINCT FROM OLD.list_id
       OR NEW.periodicidade_dias IS DISTINCT FROM OLD.periodicidade_dias
       OR NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN
      RAISE EXCEPTION 'Apenas o dono da lista pode alterar texto, ordem, periodicidade ou arquivamento';
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
$$;

CREATE TRIGGER items_before_update
  BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.items_before_update();

-- ---------- ITEM_EVENTS ----------
CREATE TABLE public.item_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  tipo       public.item_event_type NOT NULL,
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX item_events_item_id_idx ON public.item_events(item_id, created_at DESC);
GRANT SELECT, INSERT ON public.item_events TO authenticated;
GRANT ALL ON public.item_events TO service_role;
ALTER TABLE public.item_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "item_events_select_authenticated" ON public.item_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "item_events_insert_self_author"   ON public.item_events FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());

CREATE OR REPLACE FUNCTION public.items_log_create()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO public.item_events (item_id, author_id, tipo, payload)
    VALUES (
      NEW.id,
      auth.uid(),
      'item_created',
      jsonb_build_object('texto', NEW.texto, 'proxima_checagem', NEW.proxima_checagem)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER items_after_insert
  AFTER INSERT ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.items_log_create();

-- ---------- ITEM_TICKETS ----------
CREATE TABLE public.item_tickets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  ticket_code    text NOT NULL,
  ticket_status  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz
);
CREATE INDEX item_tickets_item_id_idx ON public.item_tickets(item_id);
GRANT SELECT, INSERT, UPDATE ON public.item_tickets TO authenticated;
GRANT ALL ON public.item_tickets TO service_role;
ALTER TABLE public.item_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "item_tickets_select_authenticated" ON public.item_tickets FOR SELECT TO authenticated USING (true);
CREATE POLICY "item_tickets_insert_authenticated" ON public.item_tickets FOR INSERT TO authenticated WITH CHECK (true);

-- ---------- SEED: áreas ----------
INSERT INTO public.areas (nome, ordem) VALUES
  ('Administrativo',     10),
  ('Comercial',          20),
  ('Compras',            30),
  ('Estoque / Armazém',  40),
  ('Financeiro',         50),
  ('Global',             60),
  ('Importações',        70),
  ('Jurídico',           80),
  ('Logística',          90),
  ('Marketing',         100),
  ('Qualidade',         110),
  ('Recursos Humanos',  120),
  ('Regulatório',       130),
  ('SAC / Pós-venda',   140),
  ('TI',                150);