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
  archiveItem,
  unarchiveItem,
  reorderItems,
  archiveList,
  unarchiveList,
  updateListTitle,
  transferList,
  listUsers,
  listAreas,
} from "@/lib/app.functions";
import { ItemSheet } from "@/components/ItemSheet";
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
};

function daysUntil(dateStr: string | null | undefined): number {
  if (!dateStr) return Number.POSITIVE_INFINITY;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00");
  return Math.round((d.getTime() - today.getTime()) / 86400000);
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
  const canEditItems = isOwner;
  const listArchived = !!q.data?.archived_at;

  const createI = useServerFn(createItem);
  const reorder = useServerFn(reorderItems);
  const archList = useServerFn(archiveList);
  const unarchList = useServerFn(unarchiveList);
  const updTitle = useServerFn(updateListTitle);

  const addItem = useMutation({
    mutationFn: (texto: string) => createI({ data: { list_id: id, texto } }),
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

  const activeItems = items.filter((i) => !i.archived_at);
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newItemText.trim()) return;
            addItem.mutate(newItemText.trim(), {
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
      )}

      {activeItems.length === 0 && archivedItems.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nenhum item ainda.
        </div>
      ) : (
        <>
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
        <Link
          to="/listas/$id/itens/$itemId"
          params={{ id: listId, itemId: item.id }}
          className="flex-1 truncate text-sm text-foreground"
        >
          {item.texto}
        </Link>
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
