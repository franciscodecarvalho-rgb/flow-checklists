import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ============================================================
// Types
// ============================================================
export type ItemEventType =
  | "item_created"
  | "item_edited"
  | "verification"
  | "comment"
  | "archived"
  | "unarchived"
  | "ticket_opened";

export type ListEventType = "archived" | "unarchived" | "transferred";

const db = (ctx: { supabase: unknown }) => ctx.supabase as any;

// ----- helpers -----
function safeDbError(
  err: { code?: string; message?: string } | null | undefined,
  fallback = "Operação falhou. Tente novamente.",
): Error {
  if (!err) return new Error(fallback);
  console.error("[db]", err);
  const code = err.code;
  if (code === "23505") return new Error("Já existe um registro com esse identificador.");
  if (code === "23503") return new Error("Operação inválida: registro referenciado por outros dados.");
  if (code === "23502") return new Error("Campo obrigatório ausente.");
  if (code === "23514") return new Error("Valor inválido para um dos campos.");
  if (code === "42501" || code === "PGRST301") return new Error("Você não tem permissão para esta operação.");
  if (code === "PGRST116") return new Error("Registro não encontrado.");
  // Mensagens vindas de RAISE EXCEPTION em triggers — repassa amigavelmente.
  if (err.message && /^Apenas|^Não é possível|^Ao desarquivar/i.test(err.message)) {
    return new Error(err.message);
  }
  return new Error(fallback);
}

async function assertAdmin(ctx: { supabase: unknown; userId: string }): Promise<void> {
  const { data, error } = await (ctx.supabase as any)
    .from("profiles")
    .select("is_admin")
    .eq("id", ctx.userId)
    .maybeSingle();
  if (error) throw safeDbError(error, "Falha ao verificar permissões.");
  if (!data?.is_admin) throw new Error("Apenas administradores");
}

async function resolveNames(
  _supa: any,
  ids: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter((x): x is string => !!x)));
  if (unique.length === 0) return new Map();
  // Cross-user lookup goes through the admin client so we don't need to expose
  // every profile row via RLS. Only the computed display name is returned to clients.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email")
    .in("id", unique);
  if (error) throw safeDbError(error);
  const map = new Map<string, string>();
  for (const r of (data ?? []) as { id: string; full_name: string | null; email: string }[]) {
    map.set(r.id, r.full_name?.trim() || r.email);
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
    await assertAdmin(context);
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
    await assertAdmin(context);
    const supa = db(context);
    const { count, error: countErr } = await supa
      .from("lists")
      .select("id", { count: "exact", head: true })
      .eq("area_id", data.id);
    if (countErr) throw safeDbError(countErr);
    if ((count ?? 0) > 0) {
      throw new Error(
        `Mova ou arquive as ${count} listas vinculadas antes de excluir esta área`,
      );
    }
    const { error } = await supa.from("areas").delete().eq("id", data.id);
    if (error) throw safeDbError(error);
    return { ok: true };
  });

// ============================================================
// USERS (admin only)
// ============================================================
export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await db(context)
      .from("profiles")
      .select("id, full_name, email, is_admin")
      .order("full_name", { ascending: true });
    if (error) throw safeDbError(error);
    return data as { id: string; full_name: string | null; email: string; is_admin: boolean }[];
  });

export const listProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    // Picking a "responsável" needs to see all colleagues, but we don't want
    // to expose raw emails / admin flags through RLS. Resolve cross-user data
    // server-side and only return id + display name.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .order("full_name", { ascending: true });
    if (error) throw safeDbError(error);
    return ((data ?? []) as { id: string; full_name: string | null; email: string }[]).map(
      (r) => ({ id: r.id, display_name: r.full_name?.trim() || r.email.split("@")[0] }),
    );
  });

// ============================================================
// HOME — listas ativas agrupadas por área, itens ativos ordenados por data
// ============================================================
export const listHome = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supa = db(context);
    const [areasRes, listsRes, itemsRes] = await Promise.all([
      supa.from("areas").select("id, nome, ordem").order("ordem").order("nome"),
      supa
        .from("lists")
        .select("id, titulo, tipo, area_id, owner_id, created_at, updated_at")
        .is("archived_at", null)
        .order("titulo", { ascending: true }),
      supa
        .from("items")
        .select("id, list_id, texto, proxima_checagem, periodicidade_dias, ordem")
        .is("archived_at", null)
        .order("proxima_checagem", { ascending: true }),
    ]);
    if (areasRes.error) throw safeDbError(areasRes.error);
    if (listsRes.error) throw safeDbError(listsRes.error);
    if (itemsRes.error) throw safeDbError(itemsRes.error);

    type ListRow = {
      id: string;
      titulo: string;
      tipo: string;
      area_id: string;
      owner_id: string;
      created_at: string;
      updated_at: string;
    };
    type ItemRow = {
      id: string;
      list_id: string;
      texto: string;
      proxima_checagem: string;
      periodicidade_dias: number | null;
      ordem: number;
    };

    const lists = listsRes.data as ListRow[];
    const items = itemsRes.data as ItemRow[];
    const names = await resolveNames(supa, lists.map((l) => l.owner_id));

    const itemsByList = new Map<string, ItemRow[]>();
    for (const it of items) {
      const arr = itemsByList.get(it.list_id) ?? [];
      arr.push(it);
      itemsByList.set(it.list_id, arr);
    }

    return {
      areas: areasRes.data as { id: string; nome: string; ordem: number }[],
      lists: lists.map((l) => ({
        id: l.id,
        titulo: l.titulo,
        tipo: l.tipo,
        area_id: l.area_id,
        owner_id: l.owner_id,
        owner_name: names.get(l.owner_id) ?? "—",
        items: itemsByList.get(l.id) ?? [],
      })),
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
      .select("id, titulo, tipo, area_id, owner_id, archived_at, archived_by, created_at, updated_at, areas:area_id(nome)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw safeDbError(error);
    if (!list) throw new Error("Lista não encontrada");

    const { data: items, error: itemsErr } = await supa
      .from("items")
      .select("id, texto, proxima_checagem, periodicidade_dias, ordem, archived_at, responsavel_id, envolvido_id, prioridade, status, validade, link")
      .eq("list_id", data.id)
      .order("archived_at", { ascending: true, nullsFirst: true })
      .order("proxima_checagem", { ascending: true, nullsFirst: false })
      .order("ordem", { ascending: true });
    if (itemsErr) throw safeDbError(itemsErr);

    const { data: events, error: eventsErr } = await supa
      .from("list_events")
      .select("id, tipo, payload, created_at, author_id")
      .eq("list_id", data.id)
      .order("created_at", { ascending: false });
    if (eventsErr) throw safeDbError(eventsErr);

    type ListEventRow = {
      id: string;
      tipo: ListEventType;
      payload: Record<string, string | null> | null;
      created_at: string;
      author_id: string | null;
    };
    const eventRows = (events ?? []) as ListEventRow[];

    type ItemRow = {
      id: string;
      texto: string;
      proxima_checagem: string | null;
      periodicidade_dias: number | null;
      ordem: number;
      archived_at: string | null;
      responsavel_id: string | null;
      envolvido_id: string | null;
      prioridade: string;
      status: string | null;
      validade: string | null;
      link: string | null;
    };
    const itemRows = (items ?? []) as ItemRow[];

    // Favoritos do usuário atual entre os itens desta lista.
    const itemIds = itemRows.map((i) => i.id);
    let favSet = new Set<string>();
    if (itemIds.length) {
      const { data: favs, error: favErr } = await supa
        .from("item_favorites")
        .select("item_id")
        .eq("user_id", context.userId)
        .in("item_id", itemIds);
      if (favErr) throw safeDbError(favErr);
      favSet = new Set((favs ?? []).map((f: { item_id: string }) => f.item_id));
    }

    const names = await resolveNames(supa, [
      list.owner_id as string,
      list.archived_by as string | null,
      ...itemRows.map((i) => i.responsavel_id),
      ...itemRows.map((i) => i.envolvido_id),
      ...eventRows.map((e) => e.author_id),
      ...eventRows.map((e) => e.payload?.from ?? null),
      ...eventRows.map((e) => e.payload?.to ?? null),
    ]);

    return {
      id: list.id as string,
      titulo: list.titulo as string,
      tipo: list.tipo as string,
      area_id: list.area_id as string,
      area_nome: (list.areas?.nome as string) ?? "",
      owner_id: list.owner_id as string,
      owner_name: names.get(list.owner_id as string) ?? "—",
      archived_at: (list.archived_at as string | null) ?? null,
      archived_by_name: list.archived_by ? names.get(list.archived_by as string) ?? "—" : null,
      items: itemRows.map((i) => ({
        ...i,
        responsavel_name: i.responsavel_id ? names.get(i.responsavel_id) ?? "—" : null,
        envolvido_name: i.envolvido_id ? names.get(i.envolvido_id) ?? "—" : null,
        favorito: favSet.has(i.id),
      })),
      events: eventRows.map((e) => ({
        id: e.id,
        tipo: e.tipo,
        created_at: e.created_at,
        author_name: (e.author_id && names.get(e.author_id)) || "Sistema",
        comentario: e.payload?.comentario ?? null,
        to_name: e.payload?.to ? names.get(e.payload.to) ?? "—" : null,
        from_name: e.payload?.from ? names.get(e.payload.from) ?? "—" : null,
      })),
    };
  });


// ============================================================
// ITEM DETAIL + timeline + tickets
// ============================================================
export const getItemDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const supa = db(context);
    const { data: item, error } = await supa
      .from("items")
      .select(
        "id, texto, proxima_checagem, periodicidade_dias, ordem, archived_at, archived_by, list_id, responsavel_id, envolvido_id, prioridade, status, validade, link, lists:list_id(id, titulo, owner_id, tipo)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw safeDbError(error);
    if (!item) throw new Error("Item não encontrado");

    const { data: favRow } = await supa
      .from("item_favorites")
      .select("item_id")
      .eq("user_id", context.userId)
      .eq("item_id", data.id)
      .maybeSingle();

    const [eventsRes, ticketsRes] = await Promise.all([
      supa
        .from("item_events")
        .select("id, tipo, payload, created_at, author_id")
        .eq("item_id", data.id)
        .order("created_at", { ascending: false }),
      supa
        .from("item_tickets")
        .select("id, ticket_code, ticket_status, created_at, last_synced_at")
        .eq("item_id", data.id)
        .order("created_at", { ascending: false }),
    ]);
    if (eventsRes.error) throw safeDbError(eventsRes.error);
    if (ticketsRes.error) throw safeDbError(ticketsRes.error);

    const evRows = (eventsRes.data ?? []) as {
      id: string;
      tipo: ItemEventType;
      payload: Record<string, string | number | null> | null;
      created_at: string;
      author_id: string | null;
    }[];

    const ids = [
      ...evRows.map((e) => e.author_id),
      item.archived_by as string | null,
      (item.lists?.owner_id as string) ?? null,
      item.responsavel_id as string | null,
      item.envolvido_id as string | null,
    ];
    const names = await resolveNames(supa, ids);

    return {
      id: item.id as string,
      texto: item.texto as string,
      proxima_checagem: (item.proxima_checagem as string | null) ?? null,
      periodicidade_dias: (item.periodicidade_dias as number | null) ?? null,
      archived_at: (item.archived_at as string | null) ?? null,
      archived_by_name: item.archived_by ? names.get(item.archived_by as string) ?? "—" : null,
      list_id: item.list_id as string,
      list_titulo: (item.lists?.titulo as string) ?? "",
      list_tipo: (item.lists?.tipo as string) ?? "checklist",
      list_owner_id: (item.lists?.owner_id as string) ?? "",
      list_owner_name: names.get((item.lists?.owner_id as string) ?? "") ?? "—",
      responsavel_id: (item.responsavel_id as string | null) ?? null,
      responsavel_name: item.responsavel_id
        ? names.get(item.responsavel_id as string) ?? "—"
        : null,
      envolvido_id: (item.envolvido_id as string | null) ?? null,
      envolvido_name: item.envolvido_id
        ? names.get(item.envolvido_id as string) ?? "—"
        : null,
      prioridade: (item.prioridade as string) ?? "media",
      favorito: !!favRow,
      status: (item.status as string | null) ?? null,
      validade: (item.validade as string | null) ?? null,
      link: (item.link as string | null) ?? null,
      events: evRows.map((e) => ({
        id: e.id,
        tipo: e.tipo,
        payload: (e.payload ?? {}) as Record<string, string | number | null>,
        created_at: e.created_at,
        author_name: (e.author_id && names.get(e.author_id)) || "Sistema",
      })),
      tickets: (ticketsRes.data ?? []) as {
        id: string;
        ticket_code: string;
        ticket_status: string | null;
        created_at: string;
        last_synced_at: string | null;
      }[],
    };
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
      tipo: z.enum(["checklist", "lista"]).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await db(context)
      .from("lists")
      .insert({
        titulo: data.titulo,
        area_id: data.area_id,
        owner_id: context.userId,
        tipo: data.tipo ?? "checklist",
      })
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

export const archiveList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      comentario: z.string().min(1).max(2000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const supa = db(context);
    // Arquiva primeiro: o trigger lists_before_update pode recusar (itens ativos,
    // não-dono). Só registramos o evento se o arquivamento de fato ocorreu, para
    // o comentário não virar ruído de uma operação que falhou.
    const { error } = await supa
      .from("lists")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw safeDbError(error);
    await supa.from("list_events").insert({
      list_id: data.id,
      author_id: context.userId,
      tipo: "archived",
      payload: { comentario: data.comentario },
    });
    return { ok: true };
  });

export const unarchiveList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const supa = db(context);
    const { error } = await supa
      .from("lists")
      .update({ archived_at: null })
      .eq("id", data.id);
    if (error) throw safeDbError(error);
    await supa.from("list_events").insert({
      list_id: data.id,
      author_id: context.userId,
      tipo: "unarchived",
      payload: {},
    });
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
    await assertAdmin(context);
    const supa = db(context);
    const { data: prev } = await supa
      .from("lists")
      .select("owner_id")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await supa
      .from("lists")
      .update({ owner_id: data.new_owner_id })
      .eq("id", data.id);
    if (error) throw safeDbError(error);
    await supa.from("list_events").insert({
      list_id: data.id,
      author_id: context.userId,
      tipo: "transferred",
      payload: { from: (prev?.owner_id as string | null) ?? null, to: data.new_owner_id },
    });
    return { ok: true };
  });

// ============================================================
// ITEM MUTATIONS
// ============================================================
function addDays(date: Date, days: number): string {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

export const createItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      list_id: z.string().uuid(),
      texto: z.string().min(1).max(500),
      proxima_checagem: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      periodicidade_dias: z.number().int().positive().max(3650).nullable().optional(),
      responsavel_id: z.string().uuid().nullable().optional(),
      envolvido_id: z.string().uuid().nullable().optional(),
      prioridade: z.enum(["alta", "media", "baixa"]).optional(),
      status: z.string().max(60).nullable().optional(),
      validade: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      link: z.string().max(2000).nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const supa = db(context);
    const { data: list, error: listErr } = await supa
      .from("lists")
      .select("tipo, owner_id")
      .eq("id", data.list_id)
      .maybeSingle();
    if (listErr) throw safeDbError(listErr);
    if (!list) throw new Error("Lista não encontrada");
    const tipo = (list.tipo as string) ?? "checklist";

    const { data: last } = await supa
      .from("items")
      .select("ordem")
      .eq("list_id", data.list_id)
      .order("ordem", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrdem = ((last?.ordem as number | undefined) ?? 0) + 10;

    // Checklist: data padrão hoje+7. Lista: só se usuário informar.
    const proxima =
      data.proxima_checagem ?? (tipo === "checklist" ? addDays(new Date(), 7) : null);
    const responsavel = data.responsavel_id ?? (list.owner_id as string);

    const { data: row, error } = await supa
      .from("items")
      .insert({
        list_id: data.list_id,
        texto: data.texto,
        ordem: nextOrdem,
        proxima_checagem: proxima,
        periodicidade_dias: data.periodicidade_dias ?? null,
        responsavel_id: responsavel,
        envolvido_id: data.envolvido_id ?? null,
        prioridade: data.prioridade ?? "media",
        status: data.status ?? null,
        validade: data.validade ?? null,
        link: data.link ?? null,
      })
      .select("id")
      .single();
    if (error) throw safeDbError(error);
    return row as { id: string };
  });

export const updateItemFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      texto: z.string().min(1).max(500).optional(),
      responsavel_id: z.string().uuid().nullable().optional(),
      envolvido_id: z.string().uuid().nullable().optional(),
      prioridade: z.enum(["alta", "media", "baixa"]).optional(),
      status: z.string().max(60).nullable().optional(),
      validade: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      link: z.string().max(2000).nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const supa = db(context);
    const { id, ...rest } = data;
    const patch: Record<string, unknown> = {};
    for (const k of ["texto", "responsavel_id", "envolvido_id", "prioridade", "status", "validade", "link"] as const) {
      if (rest[k] !== undefined) patch[k] = rest[k];
    }
    if (Object.keys(patch).length === 0) return { ok: true };

    const { data: prev, error: prevErr } = await supa
      .from("items")
      .select("texto, responsavel_id, envolvido_id, prioridade, status, validade, link")
      .eq("id", id)
      .maybeSingle();
    if (prevErr) throw safeDbError(prevErr);
    if (!prev) throw new Error("Item não encontrado");

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const k of Object.keys(patch)) {
      if ((prev as Record<string, unknown>)[k] !== patch[k]) {
        changes[k] = { from: (prev as Record<string, unknown>)[k], to: patch[k] };
      }
    }
    if (Object.keys(changes).length === 0) return { ok: true };

    const { error } = await supa.from("items").update(patch).eq("id", id);
    if (error) throw safeDbError(error);

    await supa.from("item_events").insert({
      item_id: id,
      author_id: context.userId,
      tipo: "item_edited",
      payload: { changes },
    });
    return { ok: true };
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
    const supa = db(context);
    const { data: prev, error: prevErr } = await supa
      .from("items")
      .select("texto")
      .eq("id", data.id)
      .maybeSingle();
    if (prevErr) throw safeDbError(prevErr);
    if (!prev) throw new Error("Item não encontrado");
    if (prev.texto === data.texto) return { ok: true };

    const { error } = await supa
      .from("items")
      .update({ texto: data.texto })
      .eq("id", data.id);
    if (error) throw safeDbError(error);

    await supa.from("item_events").insert({
      item_id: data.id,
      author_id: context.userId,
      tipo: "item_edited",
      payload: { from: prev.texto, to: data.texto },
    });
    return { ok: true };
  });

export const updateItemSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      proxima_checagem: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      periodicidade_dias: z.number().int().positive().max(3650).nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.proxima_checagem !== undefined) patch.proxima_checagem = data.proxima_checagem;
    if (data.periodicidade_dias !== undefined) patch.periodicidade_dias = data.periodicidade_dias;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await db(context).from("items").update(patch).eq("id", data.id);
    if (error) throw safeDbError(error);
    return { ok: true };
  });

export const verifyItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      comentario: z.string().min(1).max(2000),
      proxima_checagem: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const supa = db(context);
    const { data: item, error: getErr } = await supa
      .from("items")
      .select("proxima_checagem, periodicidade_dias")
      .eq("id", data.id)
      .maybeSingle();
    if (getErr) throw safeDbError(getErr);
    if (!item) throw new Error("Item não encontrado");

    // Próxima data: input explícito > base + periodicidade > base + 7
    let proxima = data.proxima_checagem;
    if (!proxima) {
      const baseStr = (item.proxima_checagem as string | null) ?? null;
      const base = baseStr ? new Date(baseStr + "T00:00:00Z") : new Date();
      const step = (item.periodicidade_dias as number | null) ?? 7;
      proxima = addDays(base, step);
    }

    const { error } = await supa
      .from("items")
      .update({ proxima_checagem: proxima })
      .eq("id", data.id);
    if (error) throw safeDbError(error);

    await supa.from("item_events").insert({
      item_id: data.id,
      author_id: context.userId,
      tipo: "verification",
      payload: {
        comentario: data.comentario,
        proxima_checagem: proxima,
        anterior: item.proxima_checagem as string | null,
      },
    });
    return { ok: true, proxima_checagem: proxima };
  });

export const archiveItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      comentario: z.string().min(1).max(2000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const supa = db(context);
    const { error } = await supa
      .from("items")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw safeDbError(error);
    await supa.from("item_events").insert({
      item_id: data.id,
      author_id: context.userId,
      tipo: "archived",
      payload: { comentario: data.comentario },
    });
    return { ok: true };
  });

export const unarchiveItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      proxima_checagem: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const supa = db(context);
    const { error } = await supa
      .from("items")
      .update({ archived_at: null, proxima_checagem: data.proxima_checagem })
      .eq("id", data.id);
    if (error) throw safeDbError(error);
    await supa.from("item_events").insert({
      item_id: data.id,
      author_id: context.userId,
      tipo: "unarchived",
      payload: { proxima_checagem: data.proxima_checagem },
    });
    return { ok: true };
  });

export const reorderItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      list_id: z.string().uuid(),
      ordered_ids: z.array(z.string().uuid()).min(1).max(500),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Uma única transação no banco (RPC) em vez de N UPDATEs paralelos: ou
    // toda a nova ordem é aplicada, ou nada — sem estado intermediário inconsistente.
    const { error } = await db(context).rpc("reorder_items", {
      p_list_id: data.list_id,
      p_ordered_ids: data.ordered_ids,
    });
    if (error) throw safeDbError(error);
    return { ok: true };
  });

// ============================================================
// COMMENT
// ============================================================
export const commentItem = createServerFn({ method: "POST" })
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
      author_id: context.userId,
      tipo: "comment",
      payload: { texto: data.texto },
    });
    if (error) throw safeDbError(error);
    return { ok: true };
  });

// ============================================================
// TICKETS
// ============================================================
export const openTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      item_id: z.string().uuid(),
      ticket_code: z.string().min(1).max(120),
      ticket_status: z.string().max(60).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const supa = db(context);
    const { data: row, error } = await supa
      .from("item_tickets")
      .insert({
        item_id: data.item_id,
        ticket_code: data.ticket_code,
        ticket_status: data.ticket_status ?? null,
      })
      .select("id")
      .single();
    if (error) throw safeDbError(error);
    await supa.from("item_events").insert({
      item_id: data.item_id,
      author_id: context.userId,
      tipo: "ticket_opened",
      payload: { ticket_code: data.ticket_code, ticket_status: data.ticket_status ?? null },
    });
    return row as { id: string };
  });

// ============================================================
// FAVORITOS (por usuário)
// ============================================================
export const toggleFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      item_id: z.string().uuid(),
      favorito: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const supa = db(context);
    if (data.favorito) {
      const { error } = await supa
        .from("item_favorites")
        .upsert(
          { user_id: context.userId, item_id: data.item_id },
          { onConflict: "user_id,item_id", ignoreDuplicates: true },
        );
      if (error) throw safeDbError(error);
    } else {
      const { error } = await supa
        .from("item_favorites")
        .delete()
        .eq("user_id", context.userId)
        .eq("item_id", data.item_id);
      if (error) throw safeDbError(error);
    }
    return { ok: true, favorito: data.favorito };
  });

// ============================================================
// TUDO — todos os itens ativos de listas ativas (visão global)
// ============================================================
export const listAllItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supa = db(context);
    const [itemsRes, listsRes, areasRes, favRes] = await Promise.all([
      supa
        .from("items")
        .select(
          "id, list_id, texto, proxima_checagem, prioridade, status, validade, link, responsavel_id, envolvido_id",
        )
        .is("archived_at", null),
      supa
        .from("lists")
        .select("id, titulo, tipo, area_id, owner_id")
        .is("archived_at", null),
      supa.from("areas").select("id, nome, ordem").order("ordem").order("nome"),
      supa.from("item_favorites").select("item_id").eq("user_id", context.userId),
    ]);
    if (itemsRes.error) throw safeDbError(itemsRes.error);
    if (listsRes.error) throw safeDbError(listsRes.error);
    if (areasRes.error) throw safeDbError(areasRes.error);
    if (favRes.error) throw safeDbError(favRes.error);

    type ItemRow = {
      id: string;
      list_id: string;
      texto: string;
      proxima_checagem: string | null;
      prioridade: string;
      status: string | null;
      validade: string | null;
      link: string | null;
      responsavel_id: string | null;
      envolvido_id: string | null;
    };
    type ListRow = {
      id: string;
      titulo: string;
      tipo: string;
      area_id: string;
      owner_id: string;
    };
    const items = (itemsRes.data ?? []) as ItemRow[];
    const lists = (listsRes.data ?? []) as ListRow[];
    const areas = (areasRes.data ?? []) as { id: string; nome: string; ordem: number }[];

    const listById = new Map(lists.map((l) => [l.id, l] as const));
    const areaById = new Map(areas.map((a) => [a.id, a] as const));
    const favSet = new Set(
      ((favRes.data ?? []) as { item_id: string }[]).map((f) => f.item_id),
    );

    // Só itens cuja lista está ativa (não arquivada).
    const visible = items.filter((i) => listById.has(i.list_id));

    const names = await resolveNames(supa, [
      ...visible.map((i) => i.responsavel_id),
      ...visible.map((i) => i.envolvido_id),
      ...lists.map((l) => l.owner_id),
    ]);

    return {
      areas: areas.map((a) => ({ id: a.id, nome: a.nome })),
      items: visible.map((i) => {
        const l = listById.get(i.list_id)!;
        const a = areaById.get(l.area_id);
        return {
          id: i.id,
          list_id: i.list_id,
          list_titulo: l.titulo,
          list_tipo: l.tipo,
          list_owner_id: l.owner_id,
          area_id: l.area_id,
          area_nome: a?.nome ?? "—",
          texto: i.texto,
          prioridade: i.prioridade,
          proxima_checagem: i.proxima_checagem,
          validade: i.validade,
          link: i.link,
          responsavel_id: i.responsavel_id,
          responsavel_name: i.responsavel_id
            ? names.get(i.responsavel_id) ?? "—"
            : names.get(l.owner_id) ?? "—",
          envolvido_id: i.envolvido_id,
          envolvido_name: i.envolvido_id ? names.get(i.envolvido_id) ?? "—" : null,
          favorito: favSet.has(i.id),
        };
      }),
    };
  });

// ============================================================
// ADMIN: gestão de usuários e senhas
// ============================================================
export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      email: z.string().email().max(255),
      full_name: z.string().min(1).max(120),
      password: z.string().min(8).max(72),
      is_admin: z.boolean().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (!/@vitatech\.com\.br$/i.test(data.email)) {
      throw new Error("Apenas emails @vitatech.com.br podem ser cadastrados");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error) throw new Error(error.message);
    const newId = created.user?.id;
    if (!newId) throw new Error("Falha ao criar usuário");
    // O trigger handle_new_user já cria o profile. Garantimos full_name e is_admin (via admin autenticado).
    if (data.is_admin) {
      const { error: updErr } = await db(context)
        .from("profiles")
        .update({ full_name: data.full_name, is_admin: true })
        .eq("id", newId);
      if (updErr) throw safeDbError(updErr);
    } else {
      const { error: updErr } = await db(context)
        .from("profiles")
        .update({ full_name: data.full_name })
        .eq("id", newId);
      if (updErr) throw safeDbError(updErr);
    }
    return { id: newId };
  });

export const adminUpdateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      full_name: z.string().min(1).max(120).optional(),
      is_admin: z.boolean().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.is_admin === false && data.id === context.userId) {
      throw new Error("Você não pode remover seu próprio acesso de administrador");
    }
    const patch: Record<string, unknown> = {};
    if (data.full_name !== undefined) patch.full_name = data.full_name;
    if (data.is_admin !== undefined) patch.is_admin = data.is_admin;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await db(context).from("profiles").update(patch).eq("id", data.id);
    if (error) throw safeDbError(error);
    return { ok: true };
  });

export const adminResetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      password: z.string().min(8).max(72),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.id, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.id === context.userId) {
      throw new Error("Você não pode excluir sua própria conta");
    }
    const supa = db(context);
    const { count, error: countErr } = await supa
      .from("lists")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", data.id);
    if (countErr) throw safeDbError(countErr);
    if ((count ?? 0) > 0) {
      throw new Error(
        `Transfira as ${count} listas deste usuário antes de excluí-lo`,
      );
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
