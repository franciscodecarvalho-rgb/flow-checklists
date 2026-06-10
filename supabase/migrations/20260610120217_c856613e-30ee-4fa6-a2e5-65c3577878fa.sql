
DROP POLICY IF EXISTS items_update_authenticated ON public.items;
CREATE POLICY items_update_authenticated ON public.items
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS item_tickets_insert_authenticated ON public.item_tickets;
CREATE POLICY item_tickets_insert_authenticated ON public.item_tickets
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
