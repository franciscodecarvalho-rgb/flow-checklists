
-- 1) PROFILES: tighten SELECT to self/admin; add public view for names
DROP POLICY IF EXISTS profiles_select_all ON public.profiles;

CREATE POLICY profiles_select_self_or_admin
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id OR public.is_admin(auth.uid()));

-- Public-safe view (id + display name only)
CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = true) AS
SELECT id, full_name FROM public.profiles;

GRANT SELECT ON public.profiles_public TO authenticated;

-- Allow authenticated users to read id + full_name of any profile via a
-- narrow column-scoped policy too (so PostgREST joins to profiles still
-- resolve names server-side via service role; client uses profiles_public).
-- (Handled in app code by switching joins to use the service-role client.)

-- 2) PROFILES UPDATE: prevent self-promotion via WITH CHECK
DROP POLICY IF EXISTS profiles_update_self ON public.profiles;

CREATE POLICY profiles_update_self
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND (is_admin = false OR public.is_admin(auth.uid()))
);

-- 3) ITEMS UPDATE: restrict to list owner or admin
DROP POLICY IF EXISTS items_update_any_authenticated ON public.items;

CREATE POLICY items_update_owner_or_admin
ON public.items FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.lists l WHERE l.id = items.list_id AND l.owner_id = auth.uid())
  OR public.is_admin(auth.uid())
);

-- Collaborative status toggle for any authenticated user via SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.set_item_status(_item_id uuid, _status public.item_status)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  UPDATE public.items SET status = _status, updated_at = now() WHERE id = _item_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_item_status(uuid, public.item_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_item_status(uuid, public.item_status) TO authenticated;

-- 4) ITEM_EVENTS: restrict SELECT to admin, list owner, or author
DROP POLICY IF EXISTS item_events_select_all ON public.item_events;

CREATE POLICY item_events_select_scoped
ON public.item_events FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR author_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.items i
    JOIN public.lists l ON l.id = i.list_id
    WHERE i.id = item_events.item_id AND l.owner_id = auth.uid()
  )
);

-- 5) ITEM_TICKETS: restrict SELECT similarly
DROP POLICY IF EXISTS item_tickets_select_all ON public.item_tickets;

CREATE POLICY item_tickets_select_scoped
ON public.item_tickets FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.items i
    JOIN public.lists l ON l.id = i.list_id
    WHERE i.id = item_tickets.item_id AND l.owner_id = auth.uid()
  )
);

-- 6) Revoke EXECUTE on internal SECURITY DEFINER helpers from public roles
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.profiles_before_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.lists_before_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.items_before_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_item_status_change() FROM PUBLIC, anon, authenticated;
