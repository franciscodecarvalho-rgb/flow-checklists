import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ============================================================
// Types
// ============================================================
export type ItemStatus = "pending" | "in_progress" | "done";
export type EventType = "status_change" | "comment" | "ticket_opened";

// Helper to get an untyped client (types.ts is regenerated async).
const db = (ctx: { supabase: unknown }) => ctx.supabase as any;

// Map raw Postgres/PostgREST errors to safe, user-facing messages.
// Internal details are logged server-side only.
function safeDbError(err: { code?: string; message?: string } | null | undefined, fallback = "Operação falhou. Tente novamente."): Error {
  if (!err) return new Error(fallback);
  // Log full detail server-side for debugging
  console.error("[db]", err);
  const code = err.code;
  if (code === "23505") return new Error("Já existe um registro com esse identificador.");
  if (code === "23503") return new Error("Operação inválida: registro referenciado por outros dados.");
  if (code === "23502") return new Error("Campo obrigatório ausente.");
  if (code === "23514") return new Error("Valor inválido para um dos campos.");
  if (code === "42501" || code === "PGRST301") return new Error("Você não tem permissão para esta operação.");
  if (code === "PGRST116") return new Error("Registro não encontrado.");
  return new Error(fallback);
}

// Throws if the current user is not an admin. Use for admin-only server functions.
async function assertAdmin(ctx: { supabase: unknown; userId: string }): Promise<void> {
  const { data, error } = await (ctx.supabase as any)
    .from("profiles")
    .select("is_admin")
    .eq("id", ctx.userId)
    .maybeSingle();
  if (error) throw safeDbError(error, "Falha ao verificar permissões.");
  if (!data?.is_admin) throw new Error("Apenas administradores");
}

// Resolve display names for a set of user ids using the safe public view.
// `profiles_public` only exposes id + full_name.
async function resolveNames(
  supa: any,
  ids: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter((x): x is string => !!x)));
  if (unique.length === 0) return new Map();
  const { data, error } = await supa
    .from("profiles_public")
    .select("id, full_name")
    .in("id", unique);
  if (error) throw safeDbError(error);
  const map = new Map<string, string>();
  for (const r of data as { id: string; full_name: string | null }[]) {
    map.set(r.id, r.full_name || "—");
  }
  return map;
}

// ============================================================
// AREAS
// ============================================================
export const listAreas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await db(context)
      .from("areas")
      .select("id, nome, ordem")
      .order("ordem", { ascending: true })
      .order("nome", { ascending: true });
    if (error) throw safeDbError(error);
    return data as { id: string; nome: string; ordem: number }[];
  });

export const createArea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      nome: z.string().min(1).max(80),
      ordem: z.number().int().min(0).max(100000).default(0),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row, error } = await db(context)
      .from("areas")
      .insert({ nome: data.nome, ordem: data.ordem })
      .select("id, nome, ordem")
      .single();
    if (error) throw safeDbError(error);
    return row;
  });

export const updateArea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      nome: z.string().min(1).max(80).optional(),
      ordem: z.number().int().min(0).max(100000).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { data: row, error } = await db(context)
      .from("areas")
      .update(patch)
      .eq("id", id)
      .select("id, nome, ordem")
      .single();
    if (error) throw safeDbError(error);
    return row;
  });

export const deleteArea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const supa = db(context);
    const { count, error: countErr } = await supa
      .from("lists")
      .select("id", { count: "exact", head: true })
      .eq("area_id", data.id);
    if (countErr) throw safeDbError(countErr);
    if ((count ?? 0) > 0) {
      throw new Error(
        `Mova ou apague as ${count} listas vinculadas antes de excluir esta área`,
      );
    }
    const { error } = await supa.from("areas").delete().eq("id", data.id);
    if (error) throw safeDbError(error);
    return { ok: true };
  });

// ============================================================
// HOME — listas agrupadas por área com contagens de status
// ============================================================
export const listHome = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supa = db(context);
    const [areasRes, listsRes, itemsRes] = await Promise.all([
      supa
        .from("areas")
        .select("id, nome, ordem")
        .order("nome", { ascending: true }),
      supa
        .from("lists")
        .select("id, titulo, area_id, owner_id, created_at, updated_at")
        .order("titulo", { ascending: true }),
      supa.from("items").select("list_id, status"),
    ]);
    if (areasRes.error) throw safeDbError(areasRes.error);
    if (listsRes.error) throw safeDbError(listsRes.error);
    if (itemsRes.error) throw safeDbError(itemsRes.error);

    const counts = new Map<string, { pending: number; in_progress: number; done: number; total: number }>();
    for (const it of itemsRes.data as { list_id: string; status: ItemStatus }[]) {
      const c = counts.get(it.list_id) ?? { pending: 0, in_progress: 0, done: 0, total: 0 };
      c[it.status] += 1;
      c.total += 1;
      counts.set(it.list_id, c);
    }

    type ListRow = {
      id: string;
      titulo: string;
      area_id: string;
      owner_id: string;
      created_at: string;
      updated_at: string;
    };

    const rows = listsRes.data as ListRow[];
    const names = await resolveNames(supa, rows.map((l) => l.owner_id));

    const lists = rows.map((l) => ({
      id: l.id,
      titulo: l.titulo,
      area_id: l.area_id,
      owner_id: l.owner_id,
      owner_name: names.get(l.owner_id) ?? "—",
      counts: counts.get(l.id) ?? { pending: 0, in_progress: 0, done: 0, total: 0 },
    }));

    return {
      areas: areasRes.data as { id: string; nome: string; ordem: number }[],
      lists,
    };
  });

// ============================================================
// LIST DETAIL
// ============================================================
export const getListDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const supa = db(context);
    const { data: list, error } = await supa
      .from("lists")
      .select("id, titulo, area_id, owner_id, created_at, updated_at, areas:area_id(nome)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw safeDbError(error);
    if (!list) throw new Error("Lista não encontrada");

    const names = await resolveNames(supa, [list.owner_id as string]);

    const { data: items, error: itemsErr } = await supa
      .from("items")
      .select("id, texto, status, ordem")
      .eq("list_id", data.id)
      .order("ordem", { ascending: true });
    if (itemsErr) throw safeDbError(itemsErr);

    return {
      id: list.id as string,
      titulo: list.titulo as string,
      area_id: list.area_id as string,
      area_nome: (list.areas?.nome as string) ?? "",
      owner_id: list.owner_id as string,
      owner_name: names.get(list.owner_id as string) ?? "—",
      items: items as { id: string; texto: string; status: ItemStatus; ordem: number }[],
    };
  });

// ============================================================
// ITEM DETAIL + timeline
// ============================================================
export const getItemDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const supa = db(context);
    const { data: item, error } = await supa
      .from("items")
      .select("id, texto, status, ordem, list_id, lists:list_id(id, titulo, owner_id)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw safeDbError(error);
    if (!item) throw new Error("Item não encontrado");

    const { data: events, error: evErr } = await supa
      .from("item_events")
      .select("id, tipo, payload, created_at, author_id")
      .eq("item_id", data.id)
      .order("created_at", { ascending: false });
    if (evErr) throw safeDbError(evErr);

    const evRows = (events ?? []) as {
      id: string;
      tipo: EventType;
      payload: Record<string, string | number | null> | null;
      created_at: string;
      author_id: string | null;
    }[];
    const names = await resolveNames(supa, evRows.map((e) => e.author_id));

    return {
      id: item.id as string,
      texto: item.texto as string,
      status: item.status as ItemStatus,
      list_id: item.list_id as string,
      list_titulo: (item.lists?.titulo as string) ?? "",
      list_owner_id: (item.lists?.owner_id as string) ?? "",
      events: evRows.map((e) => ({
        id: e.id,
        tipo: e.tipo,
        payload: (e.payload ?? {}) as Record<string, string | number | null>,
        created_at: e.created_at,
        author_name: (e.author_id && names.get(e.author_id)) || "Sistema",
      })),
    };
  });

// ============================================================
// USERS (admin only) — para transferência
// ============================================================
export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supa = db(context);
    const { data: me, error: meErr } = await supa
      .from("profiles")
      .select("is_admin")
      .eq("id", context.userId)
      .maybeSingle();
    if (meErr) throw safeDbError(meErr);
    if (!me?.is_admin) throw new Error("Apenas administradores");

    const { data, error } = await supa
      .from("profiles")
      .select("id, full_name, email, is_admin")
      .order("full_name", { ascending: true });
    if (error) throw safeDbError(error);
    return data as { id: string; full_name: string | null; email: string; is_admin: boolean }[];
  });

// ============================================================
// LIST MUTATIONS
// ============================================================
export const createList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      titulo: z.string().min(1).max(200),
      area_id: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await db(context)
      .from("lists")
      .insert({ titulo: data.titulo, area_id: data.area_id, owner_id: context.userId })
      .select("id")
      .single();
    if (error) throw safeDbError(error);
    return row as { id: string };
  });

export const updateListTitle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      titulo: z.string().min(1).max(200).optional(),
      area_id: z.string().uuid().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await db(context).from("lists").update(patch).eq("id", id);
    if (error) throw safeDbError(error);
    return { ok: true };
  });

export const deleteList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await db(context).from("lists").delete().eq("id", data.id);
    if (error) throw safeDbError(error);
    return { ok: true };
  });

export const transferList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      new_owner_id: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await db(context)
      .from("lists")
      .update({ owner_id: data.new_owner_id })
      .eq("id", data.id);
    if (error) throw safeDbError(error);
    return { ok: true };
  });

// ============================================================
// ITEM MUTATIONS
// ============================================================
export const createItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      list_id: z.string().uuid(),
      texto: z.string().min(1).max(500),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const supa = db(context);
    const { data: last } = await supa
      .from("items")
      .select("ordem")
      .eq("list_id", data.list_id)
      .order("ordem", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrdem = ((last?.ordem as number | undefined) ?? 0) + 10;

    const { data: row, error } = await supa
      .from("items")
      .insert({ list_id: data.list_id, texto: data.texto, ordem: nextOrdem, status: "pending" })
      .select("id")
      .single();
    if (error) throw safeDbError(error);
    return row as { id: string };
  });

export const updateItemText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      texto: z.string().min(1).max(500),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await db(context)
      .from("items")
      .update({ texto: data.texto })
      .eq("id", data.id);
    if (error) throw safeDbError(error);
    return { ok: true };
  });

export const updateItemStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["pending", "in_progress", "done"]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await db(context).rpc("set_item_status", {
      _item_id: data.id,
      _status: data.status,
    });
    if (error) throw safeDbError(error);
    return { ok: true };
  });

export const deleteItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await db(context).from("items").delete().eq("id", data.id);
    if (error) throw safeDbError(error);
    return { ok: true };
  });

// Reordena items: aplica novas ordens; se gap mínimo < 2, normaliza (10,20,30...).
export const reorderItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      list_id: z.string().uuid(),
      ordered_ids: z.array(z.string().uuid()).min(1).max(500),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const supa = db(context);
    // Sempre normaliza (passo 10) — simples e robusto.
    const updates = data.ordered_ids.map((id, idx) => ({ id, ordem: (idx + 1) * 10 }));
    // Atualiza em paralelo
    const results = await Promise.all(
      updates.map((u) =>
        supa.from("items").update({ ordem: u.ordem }).eq("id", u.id).eq("list_id", data.list_id),
      ),
    );
    const firstErr = results.find((r) => r.error);
    if (firstErr?.error) throw safeDbError(firstErr.error);
    return { ok: true };
  });

// ============================================================
// COMMENTS
// ============================================================
export const addComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      item_id: z.string().uuid(),
      texto: z.string().min(1).max(2000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await db(context).from("item_events").insert({
      item_id: data.item_id,
      tipo: "comment",
      payload: { texto: data.texto },
      author_id: context.userId,
    });
    if (error) throw safeDbError(error);
    return { ok: true };
  });
