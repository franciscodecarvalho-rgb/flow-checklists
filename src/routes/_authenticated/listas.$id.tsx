import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Archive,
  ArchiveRestore,
  Check,
  GripVertical,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Star,
  UserCog,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  getListDetail,
  createItem,
  verifyItem,
  updateItemText,
  updateItemSchedule,
  updateItemFields,
  archiveItem,
  unarchiveItem,
  reorderItems,
  archiveList,
  unarchiveList,
  updateListTitle,
  transferList,
  toggleFavorite,
  listUsers,
  listProfiles,
  listAreas,
} from "@/lib/app.functions";
import {
  statusFromPrazo,
  prioridadeInfo,
  PRIORIDADE_OPTIONS,
} from "@/lib/item-display";
import { ItemSheet } from "@/components/ItemSheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExternalLink } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/listas/$id")({
  component: ListDetailPage,
});

type Item = {
  id: string;
  texto: string;
  proxima_checagem: string | null;
  periodicidade_dias: number | null;
  ordem: number;
  archived_at: string | null;
  responsavel_id: string | null;
  responsavel_name: string | null;
  envolvido_id: string | null;
  envolvido_name: string | null;
  prioridade: string;
  status: string | null;
  validade: string | null;
  link: string | null;
  favorito: boolean;
};

function daysUntil(dateStr: string | null | undefined): number {
  if (!dateStr) return Number.POSITIVE_INFINITY;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00");
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function validadeLabel(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = daysUntil(dateStr);
  if (d < 0) return `vencido há ${Math.abs(d)}d`;
  if (d === 0) return "vence hoje";
  if (d <= 30) return `vence em ${d}d`;
  return dateStr;
}

function bucketClass(days: number): string {
  if (days < 2) return "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300";
  if (days <= 7) return "border-orange-500/50 bg-orange-500/10 text-orange-700 dark:text-orange-300";
  if (days <= 15) return "border-yellow-500/60 bg-yellow-500/15 text-yellow-800 dark:text-yellow-300";
  if (days <= 21) return "border-yellow-400/40 bg-yellow-400/10 text-yellow-700 dark:text-yellow-200";
  return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
}

function ListDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const detail = useServerFn(getListDetail);
  const areasFn = useServerFn(listAreas);

  const q = useQuery({
    queryKey: ["list", id],
    queryFn: () => detail({ data: { id } }),
  });
  const areasQ = useQuery({ queryKey: ["areas"], queryFn: () => areasFn() });

  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    if (q.data) setItems(q.data.items);
  }, [q.data]);

  const isOwner = q.data?.owner_id === user?.id;
  const isAdmin = !!profile?.is_admin;
  const canEditList = isOwner || isAdmin;
  const canEditItems = isOwner || isAdmin;
  const listArchived = !!q.data?.archived_at;

  const createI = useServerFn(createItem);
  const reorder = useServerFn(reorderItems);
  const archList = useServerFn(archiveList);
  const unarchList = useServerFn(unarchiveList);
  const updTitle = useServerFn(updateListTitle);

  type NewItemInput = {
    texto: string;
    responsavel_id?: string | null;
    envolvido_id?: string | null;
    prioridade?: "alta" | "media" | "baixa";
    validade?: string | null;
    link?: string | null;
  };
  const addItem = useMutation({
    mutationFn: (p: NewItemInput) => createI({ data: { list_id: id, ...p } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["list", id] });
      qc.invalidateQueries({ queryKey: ["home"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reorderM = useMutation({
    mutationFn: (ordered_ids: string[]) =>
      reorder({ data: { list_id: id, ordered_ids } }),
    onError: (e: Error) => {
      toast.error(e.message);
      qc.invalidateQueries({ queryKey: ["list", id] });
    },
  });

  const archListM = useMutation({
    mutationFn: (comentario: string) => archList({ data: { id, comentario } }),
    onSuccess: () => {
      toast.success("Lista arquivada");
      qc.invalidateQueries({ queryKey: ["home"] });
      navigate({ to: "/" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unarchListM = useMutation({
    mutationFn: () => unarchList({ data: { id } }),
    onSuccess: () => {
      toast.success("Lista desarquivada");
      qc.invalidateQueries({ queryKey: ["list", id] });
      qc.invalidateQueries({ queryKey: ["home"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((i) => i.id === active.id);
    const newIdx = items.findIndex((i) => i.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(items, oldIdx, newIdx);
    setItems(next);
    reorderM.mutate(next.filter((i) => !i.archived_at).map((i) => i.id));
  };

  const [newItemText, setNewItemText] = useState("");
  const [openItemId, setOpenItemId] = useState<string | null>(null);


  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }
  if (q.error || !q.data) {
    return (
      <div className="space-y-3">
        <p className="text-destructive">
          Erro: {q.error ? (q.error as Error).message : "Lista não encontrada"}
        </p>
        <Button variant="outline" asChild>
          <Link to="/">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        </Button>
      </div>
    );
  }

  const isLista = q.data.tipo === "lista";
  const ownerId = q.data.owner_id;
  const ownerName = q.data.owner_name;
  const activeItemsRaw = items.filter((i) => !i.archived_at);
  const activeItems = isLista
    ? [...activeItemsRaw].sort((a, b) => {
        const av = a.validade ? new Date(a.validade).getTime() : Number.POSITIVE_INFINITY;
        const bv = b.validade ? new Date(b.validade).getTime() : Number.POSITIVE_INFINITY;
        return av - bv;
      })
    : activeItemsRaw;
  const archivedItems = items.filter((i) => i.archived_at);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" /> Voltar
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {q.data.titulo}
            {listArchived && (
              <Badge variant="outline" className="ml-2 align-middle">
                arquivada
              </Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            {q.data.area_nome} · dono: {q.data.owner_name}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEditList && !listArchived && (
            <EditListDialog
              currentTitle={q.data.titulo}
              currentArea={q.data.area_id}
              areas={areasQ.data ?? []}
              onSave={async (patch) => {
                await updTitle({ data: { id, ...patch } });
                qc.invalidateQueries({ queryKey: ["list", id] });
                qc.invalidateQueries({ queryKey: ["home"] });
              }}
              canChangeTitle={isOwner}
              canChangeArea={isOwner}
            />
          )}
          {isAdmin && !listArchived && (
            <TransferDialog listId={id} currentOwner={q.data.owner_id} />
          )}
          {isOwner && !listArchived && (
            <ArchiveListDialog onConfirm={(c) => archListM.mutate(c)} />
          )}
          {isOwner && listArchived && (
            <Button variant="outline" onClick={() => unarchListM.mutate()}>
              <ArchiveRestore className="h-4 w-4" /> Desarquivar
            </Button>
          )}
        </div>
      </div>

      {canEditItems && !listArchived && (
        isLista ? (
          <NewListaItemForm
            ownerId={ownerId}
            ownerName={ownerName}
            pending={addItem.isPending}
            onSubmit={(p) => addItem.mutate(p)}
          />
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newItemText.trim()) return;
              addItem.mutate({ texto: newItemText.trim() }, {
                onSuccess: () => setNewItemText(""),
              });
            }}
            className="flex gap-2"
          >
            <Input
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              placeholder="Novo item (próxima checagem em 7 dias)…"
              maxLength={500}
            />
            <Button type="submit" disabled={addItem.isPending || !newItemText.trim()}>
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </form>
        )
      )}

      {activeItems.length === 0 && archivedItems.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nenhum item ainda.
        </div>
      ) : (
        <>
          {isLista ? (
            <ListaTable
              items={activeItems}
              ownerName={ownerName}
              editable={canEditItems}
              onOpen={(itemId) => setOpenItemId(itemId)}
            />
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={activeItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                <ul className="space-y-2">
                  {activeItems.map((it) => (
                    <SortableRow
                      key={it.id}
                      item={it}
                      listId={id}
                      draggable={canEditItems}
                      editable={canEditItems}
                      onOpen={() => setOpenItemId(it.id)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}

          {archivedItems.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">
                Arquivados ({archivedItems.length})
              </h2>
              <ul className="space-y-2 opacity-70">
                {archivedItems.map((it) => (
                  <li
                    key={it.id}
                    className="flex items-center gap-2 rounded-md border bg-muted/30 p-3 text-sm"
                  >
                    <Archive className="h-3.5 w-3.5 text-muted-foreground" />
                    <button
                      type="button"
                      onClick={() => setOpenItemId(it.id)}
                      className="flex-1 truncate text-left line-through"
                    >
                      {it.texto}
                    </button>
                    {isOwner && (
                      <UnarchiveItemButton itemId={it.id} listId={id} />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <ListHistory events={q.data.events} />

      <ItemSheet
        open={!!openItemId}
        onOpenChange={(v) => { if (!v) setOpenItemId(null); }}
        itemId={openItemId}
        listId={id}
        canEdit={canEditItems}
      />
    </div>
  );
}

type ListEvent = {
  id: string;
  tipo: "archived" | "unarchived" | "transferred";
  created_at: string;
  author_name: string;
  comentario: string | null;
  to_name: string | null;
  from_name: string | null;
};

const LIST_EVENT_META: Record<
  ListEvent["tipo"],
  { label: string; Icon: typeof Archive }
> = {
  archived: { label: "Lista arquivada", Icon: Archive },
  unarchived: { label: "Lista desarquivada", Icon: ArchiveRestore },
  transferred: { label: "Titularidade transferida", Icon: UserCog },
};

function ListHistory({ events }: { events: ListEvent[] }) {
  if (!events || events.length === 0) return null;
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground">
        Histórico da lista
      </h2>
      <ul className="space-y-2">
        {events.map((e) => {
          const { label, Icon } = LIST_EVENT_META[e.tipo];
          return (
            <li key={e.id} className="rounded-md border bg-card p-3 text-sm">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Icon className="h-3 w-3" />
                <span className="font-medium text-foreground">{label}</span>
                <span>·</span>
                <span>{e.author_name}</span>
                <span>·</span>
                <span>{new Date(e.created_at).toLocaleString("pt-BR")}</span>
              </div>
              <div className="mt-1">
                {e.tipo === "transferred" ? (
                  <p className="text-muted-foreground">
                    {e.from_name ? `de ${e.from_name} ` : ""}para{" "}
                    <span className="text-foreground">{e.to_name ?? "—"}</span>
                  </p>
                ) : e.comentario ? (
                  <p className="whitespace-pre-wrap">{e.comentario}</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SortableRow({
  item,
  listId,
  draggable,
  editable,
  onOpen,
}: {
  item: Item;
  listId: string;
  draggable: boolean;
  editable: boolean;
  onOpen: () => void;
}) {
  const qc = useQueryClient();
  const updText = useServerFn(updateItemText);
  const updSched = useServerFn(updateItemSchedule);
  const verify = useServerFn(verifyItem);
  const archI = useServerFn(archiveItem);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, disabled: !draggable });

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.texto);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [archOpen, setArchOpen] = useState(false);
  const [schedOpen, setSchedOpen] = useState(false);

  const save = useMutation({
    mutationFn: () => updText({ data: { id: item.id, texto: draft.trim() } }),
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["list", listId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const verifyM = useMutation({
    mutationFn: (comentario: string) => verify({ data: { id: item.id, comentario } }),
    onSuccess: () => {
      setVerifyOpen(false);
      toast.success("Item verificado");
      qc.invalidateQueries({ queryKey: ["list", listId] });
      qc.invalidateQueries({ queryKey: ["home"] });
      qc.invalidateQueries({ queryKey: ["item", item.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archM = useMutation({
    mutationFn: (comentario: string) => archI({ data: { id: item.id, comentario } }),
    onSuccess: () => {
      setArchOpen(false);
      toast.success("Item arquivado");
      qc.invalidateQueries({ queryKey: ["list", listId] });
      qc.invalidateQueries({ queryKey: ["home"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const schedM = useMutation({
    mutationFn: (p: { proxima_checagem?: string; periodicidade_dias?: number | null }) =>
      updSched({ data: { id: item.id, ...p } }),
    onSuccess: () => {
      setSchedOpen(false);
      qc.invalidateQueries({ queryKey: ["list", listId] });
      qc.invalidateQueries({ queryKey: ["home"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const days = daysUntil(item.proxima_checagem);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-md border p-3 shadow-sm ${bucketClass(days)}`}
    >
      {draggable && (
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
          aria-label="Reordenar"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        onClick={() => setVerifyOpen(true)}
        title="Verificar agora"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-current/40 hover:bg-current/10"
      >
        <Check className="h-3 w-3" />
      </button>
      {editing ? (
        <div className="flex flex-1 gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            maxLength={500}
          />
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            Salvar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDraft(item.texto);
              setEditing(false);
            }}
          >
            Cancelar
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="flex-1 truncate text-left text-sm text-foreground hover:underline"
        >
          {item.texto}
        </button>
      )}
      <span className="hidden text-xs font-medium sm:inline">
        {item.proxima_checagem
          ? days < 0
            ? `atrasado ${Math.abs(days)}d`
            : days === 0
              ? "hoje"
              : `em ${days}d`
          : "—"}
      </span>
      {editable && !editing && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> Editar texto
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSchedOpen(true)}>
              <Pencil className="h-4 w-4" /> Editar data/periodicidade
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setArchOpen(true)}
            >
              <Archive className="h-4 w-4" /> Arquivar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <CommentDialog
        open={verifyOpen}
        onOpenChange={setVerifyOpen}
        title="Verificar item"
        actionLabel="Confirmar verificação"
        pending={verifyM.isPending}
        onConfirm={(c) => verifyM.mutate(c)}
      />
      <CommentDialog
        open={archOpen}
        onOpenChange={setArchOpen}
        title="Arquivar item"
        actionLabel="Arquivar"
        pending={archM.isPending}
        onConfirm={(c) => archM.mutate(c)}
      />
      <ScheduleDialog
        open={schedOpen}
        onOpenChange={setSchedOpen}
        currentDate={item.proxima_checagem}
        currentPeriod={item.periodicidade_dias}
        pending={schedM.isPending}
        onConfirm={(p) => schedM.mutate(p)}
      />
    </li>
  );
}

function UnarchiveItemButton({ itemId, listId }: { itemId: string; listId: string }) {
  const qc = useQueryClient();
  const unarch = useServerFn(unarchiveItem);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const m = useMutation({
    mutationFn: () => unarch({ data: { id: itemId, proxima_checagem: date } }),
    onSuccess: () => {
      setOpen(false);
      toast.success("Item desarquivado");
      qc.invalidateQueries({ queryKey: ["list", listId] });
      qc.invalidateQueries({ queryKey: ["home"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <ArchiveRestore className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Desarquivar item</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Próxima checagem</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <DialogFooter>
          <Button onClick={() => m.mutate()} disabled={!date || m.isPending}>
            Desarquivar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CommentDialog({
  open,
  onOpenChange,
  title,
  actionLabel,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  actionLabel: string;
  pending: boolean;
  onConfirm: (comentario: string) => void;
}) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!open) setText("");
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Comentário (obrigatório)</Label>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={2000}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button disabled={!text.trim() || pending} onClick={() => onConfirm(text.trim())}>
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleDialog({
  open,
  onOpenChange,
  currentDate,
  currentPeriod,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentDate: string | null;
  currentPeriod: number | null;
  pending: boolean;
  onConfirm: (p: { proxima_checagem?: string; periodicidade_dias?: number | null }) => void;
}) {
  const [date, setDate] = useState(currentDate ?? "");
  const [period, setPeriod] = useState<string>(currentPeriod?.toString() ?? "");
  useEffect(() => {
    if (open) {
      setDate(currentDate ?? "");
      setPeriod(currentPeriod?.toString() ?? "");
    }
  }, [open, currentDate, currentPeriod]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar data e periodicidade</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Próxima checagem</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Periodicidade (dias) — opcional</Label>
            <Input
              type="number"
              min={1}
              max={3650}
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="Ex.: 7"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={pending}
            onClick={() => {
              const p: { proxima_checagem?: string; periodicidade_dias?: number | null } = {};
              if (date && date !== currentDate) p.proxima_checagem = date;
              const parsed = period === "" ? null : Number(period);
              if (parsed !== currentPeriod) p.periodicidade_dias = parsed;
              onConfirm(p);
            }}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ArchiveListDialog({ onConfirm }: { onConfirm: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setText("");
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Archive className="h-4 w-4" /> Arquivar lista
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Arquivar lista</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Comentário (obrigatório)</Label>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={2000}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Todos os itens precisam estar arquivados antes de arquivar a lista.
          </p>
        </div>
        <DialogFooter>
          <Button
            disabled={!text.trim()}
            onClick={() => {
              onConfirm(text.trim());
              setOpen(false);
            }}
          >
            Arquivar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditListDialog({
  currentTitle,
  currentArea,
  areas,
  onSave,
  canChangeTitle,
  canChangeArea,
}: {
  currentTitle: string;
  currentArea: string;
  areas: { id: string; nome: string }[];
  onSave: (p: { titulo?: string; area_id?: string }) => Promise<void>;
  canChangeTitle: boolean;
  canChangeArea: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [titulo, setTitulo] = useState(currentTitle);
  const [areaId, setAreaId] = useState(currentArea);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitulo(currentTitle);
      setAreaId(currentArea);
    }
  }, [open, currentTitle, currentArea]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Pencil className="h-4 w-4" /> Editar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar lista</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Título</Label>
            <Input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              disabled={!canChangeTitle}
              maxLength={200}
            />
            {!canChangeTitle && (
              <p className="text-xs text-muted-foreground">
                Apenas o dono pode alterar o título.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Área</Label>
            <Select value={areaId} onValueChange={setAreaId} disabled={!canChangeArea}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {areas.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={saving}
            onClick={async () => {
              const patch: { titulo?: string; area_id?: string } = {};
              if (canChangeTitle && titulo !== currentTitle) patch.titulo = titulo;
              if (canChangeArea && areaId !== currentArea) patch.area_id = areaId;
              if (!Object.keys(patch).length) {
                setOpen(false);
                return;
              }
              setSaving(true);
              try {
                await onSave(patch);
                toast.success("Lista atualizada");
                setOpen(false);
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({ listId, currentOwner }: { listId: string; currentOwner: string }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const usersFn = useServerFn(listUsers);
  const transfer = useServerFn(transferList);
  const qc = useQueryClient();

  const usersQ = useQuery({
    queryKey: ["users"],
    queryFn: () => usersFn(),
    enabled: open,
  });

  const m = useMutation({
    mutationFn: () => transfer({ data: { id: listId, new_owner_id: target } }),
    onSuccess: () => {
      toast.success("Titularidade transferida");
      qc.invalidateQueries({ queryKey: ["list", listId] });
      qc.invalidateQueries({ queryKey: ["home"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <UserCog className="h-4 w-4" /> Transferir
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transferir titularidade</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Novo dono</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger>
              <SelectValue placeholder="Selecionar usuário…" />
            </SelectTrigger>
            <SelectContent>
              {(usersQ.data ?? [])
                .filter((u) => u.id !== currentOwner)
                .map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name || u.email}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button disabled={!target || m.isPending} onClick={() => m.mutate()}>
            Transferir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewListaItemForm({
  ownerId,
  ownerName,
  pending,
  onSubmit,
}: {
  ownerId: string;
  ownerName: string;
  pending: boolean;
  onSubmit: (p: {
    texto: string;
    responsavel_id?: string | null;
    envolvido_id?: string | null;
    prioridade?: "alta" | "media" | "baixa";
    validade?: string | null;
    link?: string | null;
  }) => void;
}) {
  const profilesFn = useServerFn(listProfiles);
  const usersQ = useQuery({ queryKey: ["profiles"], queryFn: () => profilesFn() });
  const [texto, setTexto] = useState("");
  const [responsavelId, setResponsavelId] = useState<string>(ownerId);
  const [envolvidoId, setEnvolvidoId] = useState<string>("");
  const [prioridade, setPrioridade] = useState<"alta" | "media" | "baixa">("media");
  const [validade, setValidade] = useState("");
  const [link, setLink] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!texto.trim()) return;
        onSubmit({
          texto: texto.trim(),
          responsavel_id: responsavelId || null,
          envolvido_id: envolvidoId || null,
          prioridade,
          validade: validade || null,
          link: link.trim() || null,
        });
        setTexto("");
        setEnvolvidoId("");
        setPrioridade("media");
        setValidade("");
        setLink("");
        setResponsavelId(ownerId);
      }}
      className="space-y-3 rounded-md border bg-card p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label>Item *</Label>
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ex.: Alvará sanitário"
            maxLength={500}
          />
        </div>
        <div className="space-y-1">
          <Label>Responsável</Label>
          <Select value={responsavelId} onValueChange={setResponsavelId}>
            <SelectTrigger>
              <SelectValue placeholder={ownerName} />
            </SelectTrigger>
            <SelectContent>
              {(usersQ.data ?? []).map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Envolvido</Label>
          <Select
            value={envolvidoId || "__none__"}
            onValueChange={(v) => setEnvolvidoId(v === "__none__" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— ninguém —</SelectItem>
              {(usersQ.data ?? []).map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Prioridade</Label>
          <Select
            value={prioridade}
            onValueChange={(v) => setPrioridade(v as "alta" | "media" | "baixa")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORIDADE_OPTIONS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Prazo</Label>
          <Input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Link</Label>
          <Input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://…"
            maxLength={2000}
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !texto.trim()}>
          <Plus className="h-4 w-4" /> Adicionar
        </Button>
      </div>
    </form>
  );
}

function ListaTable({
  items,
  ownerName,
  editable,
  onOpen,
}: {
  items: Item[];
  ownerName: string;
  editable: boolean;
  onOpen: (itemId: string) => void;
}) {
  const qc = useQueryClient();
  const profilesFn = useServerFn(listProfiles);
  const updFields = useServerFn(updateItemFields);
  const fav = useServerFn(toggleFavorite);
  const usersQ = useQuery({ queryKey: ["profiles"], queryFn: () => profilesFn() });

  const update = useMutation({
    mutationFn: (p: {
      id: string;
      responsavel_id?: string | null;
      envolvido_id?: string | null;
      prioridade?: "alta" | "media" | "baixa";
      validade?: string | null;
      link?: string | null;
    }) => updFields({ data: p }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["list"] });
      qc.invalidateQueries({ queryKey: ["home"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const favM = useMutation({
    mutationFn: (p: { item_id: string; favorito: boolean }) => fav({ data: p }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["list"] });
      qc.invalidateQueries({ queryKey: ["all-items"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="overflow-x-auto rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[24%]">Item</TableHead>
            <TableHead>Responsável</TableHead>
            <TableHead>Envolvido</TableHead>
            <TableHead>Prioridade</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Prazo</TableHead>
            <TableHead>Link</TableHead>
            <TableHead className="w-10 text-center">★</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((it) => {
            const respName = it.responsavel_name ?? ownerName;
            return (
              <TableRow key={it.id} className="align-middle">
                <TableCell>
                  <button
                    type="button"
                    onClick={() => onOpen(it.id)}
                    className="text-left text-sm font-medium text-foreground hover:underline"
                  >
                    {it.texto}
                  </button>
                </TableCell>
                <TableCell className="min-w-[160px]">
                  {editable ? (
                    <Select
                      value={it.responsavel_id ?? ""}
                      onValueChange={(v) =>
                        update.mutate({ id: it.id, responsavel_id: v || null })
                      }
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder={respName} />
                      </SelectTrigger>
                      <SelectContent>
                        {(usersQ.data ?? []).map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.display_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-sm">{respName}</span>
                  )}
                </TableCell>
                <TableCell className="min-w-[160px]">
                  {editable ? (
                    <Select
                      value={it.envolvido_id ?? "__none__"}
                      onValueChange={(v) =>
                        update.mutate({
                          id: it.id,
                          envolvido_id: v === "__none__" ? null : v,
                        })
                      }
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— ninguém —</SelectItem>
                        {(usersQ.data ?? []).map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.display_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-sm">{it.envolvido_name ?? "—"}</span>
                  )}
                </TableCell>
                <TableCell className="min-w-[120px]">
                  {editable ? (
                    <Select
                      value={it.prioridade}
                      onValueChange={(v) =>
                        update.mutate({
                          id: it.id,
                          prioridade: v as "alta" | "media" | "baixa",
                        })
                      }
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORIDADE_OPTIONS.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge
                      variant="outline"
                      className={prioridadeInfo(it.prioridade).className}
                    >
                      {prioridadeInfo(it.prioridade).label}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="min-w-[110px]">
                  <Badge
                    variant="outline"
                    className={statusFromPrazo(it.validade).className}
                  >
                    {statusFromPrazo(it.validade).label}
                  </Badge>
                </TableCell>
                <TableCell className="min-w-[160px]">
                  {editable ? (
                    <div className="space-y-0.5">
                      <Input
                        type="date"
                        value={it.validade ?? ""}
                        onChange={(e) =>
                          update.mutate({
                            id: it.id,
                            validade: e.target.value || null,
                          })
                        }
                        className="h-8"
                      />
                      {it.validade && (
                        <span className="text-xs text-muted-foreground">
                          {validadeLabel(it.validade)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-sm">{validadeLabel(it.validade)}</span>
                  )}
                </TableCell>
                <TableCell>
                  {it.link ? (
                    <a
                      href={it.link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" /> abrir
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onOpen(it.id)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      adicionar…
                    </button>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <button
                    type="button"
                    onClick={() =>
                      favM.mutate({ item_id: it.id, favorito: !it.favorito })
                    }
                    className="text-muted-foreground transition hover:text-amber-500"
                    title={it.favorito ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                    aria-label="Favoritar"
                  >
                    <Star
                      className={`h-4 w-4 ${it.favorito ? "fill-amber-400 text-amber-400" : ""}`}
                    />
                  </button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
