REVOKE EXECUTE ON FUNCTION public.handle_new_user()         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.profiles_before_update()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.lists_before_update()     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.items_before_update()     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.items_log_create()        FROM PUBLIC, anon, authenticated;