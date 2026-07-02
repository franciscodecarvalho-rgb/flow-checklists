
-- Lists: DELETE policy
CREATE POLICY "Owners and admins can delete lists"
ON public.lists
FOR DELETE
TO authenticated
USING (owner_id = auth.uid() OR public.is_admin(auth.uid()));

-- Items: DELETE policy
CREATE POLICY "Owners of list and admins can delete items"
ON public.items
FOR DELETE
TO authenticated
USING (public.is_list_owner(list_id) OR public.is_admin(auth.uid()));

-- Item tickets: tighten INSERT and add UPDATE/DELETE scoped to list ownership
DROP POLICY IF EXISTS "Authenticated users can create item tickets" ON public.item_tickets;
DROP POLICY IF EXISTS "authenticated_insert_item_tickets" ON public.item_tickets;

CREATE POLICY "Owners and admins can create item tickets"
ON public.item_tickets
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.items i
    WHERE i.id = item_tickets.item_id
      AND (public.is_list_owner(i.list_id) OR public.is_admin(auth.uid()))
  )
);

CREATE POLICY "Owners and admins can update item tickets"
ON public.item_tickets
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.items i
    WHERE i.id = item_tickets.item_id
      AND (public.is_list_owner(i.list_id) OR public.is_admin(auth.uid()))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.items i
    WHERE i.id = item_tickets.item_id
      AND (public.is_list_owner(i.list_id) OR public.is_admin(auth.uid()))
  )
);

CREATE POLICY "Owners and admins can delete item tickets"
ON public.item_tickets
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.items i
    WHERE i.id = item_tickets.item_id
      AND (public.is_list_owner(i.list_id) OR public.is_admin(auth.uid()))
  )
);
