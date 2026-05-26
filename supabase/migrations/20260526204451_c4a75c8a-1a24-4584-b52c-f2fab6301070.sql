
-- =========================================================
-- ENUMS
-- =========================================================
CREATE TYPE public.item_status AS ENUM ('pending', 'in_progress', 'done');
CREATE TYPE public.item_event_type AS ENUM ('status_change', 'comment', 'ticket_opened');

-- =========================================================
-- PROFILES
-- =========================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- is_admin (SECURITY DEFINER, evita recursão em RLS)
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_admin FROM public.profiles WHERE id = _user_id), false);
$$;

-- Profiles policies
CREATE POLICY "profiles_select_all" ON public.profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE POLICY "profiles_update_admin" ON public.profiles
  FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

-- Trigger que bloqueia auto-promoção a admin (CORREÇÃO 1)
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

-- =========================================================
-- handle_new_user: valida domínio e cria perfil
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NULL OR NEW.email NOT ILIKE '%@vitatech.com.br' THEN
    RAISE EXCEPTION 'Apenas emails @vitatech.com.br podem se cadastrar';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, is_admin)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    LOWER(NEW.email) = 'francisco.carvalho@vitatech.com.br'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- AREAS
-- =========================================================
CREATE TABLE public.areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.areas TO authenticated;
GRANT ALL ON public.areas TO service_role;

ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "areas_select_all" ON public.areas
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "areas_insert_admin" ON public.areas
  FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "areas_update_admin" ON public.areas
  FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "areas_delete_admin" ON public.areas
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- =========================================================
-- LISTS
-- =========================================================
CREATE TABLE public.lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  area_id UUID NOT NULL REFERENCES public.areas(id) ON DELETE RESTRICT,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lists_area ON public.lists(area_id);
CREATE INDEX idx_lists_owner ON public.lists(owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lists TO authenticated;
GRANT ALL ON public.lists TO service_role;

ALTER TABLE public.lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lists_select_all" ON public.lists
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "lists_insert_self" ON public.lists
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "lists_update_owner_or_admin" ON public.lists
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "lists_delete_owner_or_admin" ON public.lists
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin(auth.uid()));

-- Trigger (CORREÇÃO 2): bloqueia admin não-dono de mudar título/área
CREATE OR REPLACE FUNCTION public.lists_before_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_owner boolean := (OLD.owner_id = auth.uid());
  v_is_admin boolean := public.is_admin(auth.uid());
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

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER lists_before_update
  BEFORE UPDATE ON public.lists
  FOR EACH ROW EXECUTE FUNCTION public.lists_before_update();

-- =========================================================
-- ITEMS
-- =========================================================
CREATE TABLE public.items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES public.lists(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  status public.item_status NOT NULL DEFAULT 'pending',
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_items_list_ordem ON public.items(list_id, ordem);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.items TO authenticated;
GRANT ALL ON public.items TO service_role;

ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "items_select_all" ON public.items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "items_insert_owner" ON public.items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.lists l
    WHERE l.id = list_id AND l.owner_id = auth.uid()
  ));

CREATE POLICY "items_update_any_authenticated" ON public.items
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "items_delete_owner" ON public.items
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.lists l
    WHERE l.id = list_id AND l.owner_id = auth.uid()
  ));

-- Trigger: bloqueia não-donos de editar texto/ordem; permite mudar status
CREATE OR REPLACE FUNCTION public.items_before_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner UUID;
BEGIN
  SELECT owner_id INTO v_owner FROM public.lists WHERE id = OLD.list_id;

  IF v_owner <> auth.uid() THEN
    IF NEW.texto IS DISTINCT FROM OLD.texto
       OR NEW.ordem IS DISTINCT FROM OLD.ordem
       OR NEW.list_id IS DISTINCT FROM OLD.list_id THEN
      RAISE EXCEPTION 'Apenas o dono da lista pode alterar texto ou ordem do item';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER items_before_update
  BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.items_before_update();

-- =========================================================
-- ITEM_EVENTS
-- =========================================================
CREATE TABLE public.item_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  tipo public.item_event_type NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_item_events_item ON public.item_events(item_id, created_at DESC);

GRANT SELECT, INSERT ON public.item_events TO authenticated;
GRANT ALL ON public.item_events TO service_role;

ALTER TABLE public.item_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "item_events_select_all" ON public.item_events
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "item_events_insert_comment" ON public.item_events
  FOR INSERT TO authenticated
  WITH CHECK (tipo = 'comment' AND author_id = auth.uid());

-- Trigger: registra mudança de status automaticamente
CREATE OR REPLACE FUNCTION public.on_item_status_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.item_events (item_id, tipo, payload, author_id)
    VALUES (
      NEW.id,
      'status_change',
      jsonb_build_object('from', OLD.status, 'to', NEW.status),
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_item_status_change
  AFTER UPDATE OF status ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.on_item_status_change();

-- =========================================================
-- ITEM_TICKETS (placeholder)
-- =========================================================
CREATE TABLE public.item_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  external_ref TEXT,
  status TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.item_tickets TO authenticated;
GRANT ALL ON public.item_tickets TO service_role;

ALTER TABLE public.item_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "item_tickets_select_all" ON public.item_tickets
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "item_tickets_insert_auth" ON public.item_tickets
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

-- =========================================================
-- SEED: 15 áreas em ordem alfabética (10, 20, 30, ...)
-- =========================================================
INSERT INTO public.areas (nome, ordem) VALUES
  ('Administrativo', 10),
  ('Atendimento', 20),
  ('Compras', 30),
  ('Comunicação', 40),
  ('Diretoria', 50),
  ('Expedição', 60),
  ('Faturamento', 70),
  ('Financeiro', 80),
  ('Jurídico', 90),
  ('Logística', 100),
  ('Marketing', 110),
  ('Qualidade', 120),
  ('Recursos Humanos', 130),
  ('TI', 140),
  ('Vendas', 150);
