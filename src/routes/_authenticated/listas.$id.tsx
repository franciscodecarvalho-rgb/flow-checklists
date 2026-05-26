import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  Circle,
  GripVertical,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
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
  updateItemStatus,
  updateItemText,
  deleteItem,
  reorderItems,
  deleteList,
  updateListTitle,
  transferList,
  listUsers,
  listAreas,
  type ItemStatus,
} from "@/lib/app.functions";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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

type Item = { id: string; texto: string; status: ItemStatus; ordem: number };

const STATUS_NEXT: Record<ItemStatus, ItemStatus> = {
  pending: "in_progress",
  in_progress: "done",
  done: "pending",
};

const STATUS_LABEL: Record<ItemStatus, string> = {
  pending: "Pendente",
  in_progress: "Em andamento",
  done: "Concluído",
};

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
  const canEditItems = isOwner; // texto/ordem só dono

  const createI = useServerFn(createItem);
  const updateStatus = useServerFn(updateItemStatus);
  const reorder = useServerFn(reorderItems);
  const delList = useServerFn(deleteList);
  const updTitle = useServerFn(updateListTitle);

  const addItem = useMutation({
    mutationFn: (texto: string) => createI({ data: { list_id: id, texto } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["list", id] });
      qc.invalidateQueries({ queryKey: ["home"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: (p: { id: string; status: ItemStatus }) =>
      updateStatus({ data: p }),
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

  const delListM = useMutation({
    mutationFn: () => delList({ data: { id } }),
    onSuccess: () => {
      toast.success("Lista apagada");
      qc.invalidateQueries({ queryKey: ["home"] });
      navigate({ to: "/" });
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
    reorderM.mutate(next.map((i) => i.id));
  };

  const [newItemText, setNewItemText] = useState("");

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
          </h1>
          <p className="text-sm text-muted-foreground">
            {q.data.area_nome} · dono: {q.data.owner_name}
          </p>
        </div>
        <div className="flex gap-2">
          {canEditList && (
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
          {isAdmin && (
            <TransferDialog listId={id} currentOwner={q.data.owner_id} />
          )}
          {canEditList && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="icon" title="Apagar lista">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Apagar esta lista?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Todos os itens e o histórico serão removidos. Ação irreversível.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => delListM.mutate()}>
                    Apagar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {canEditItems && (
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
            placeholder="Novo item…"
            maxLength={500}
          />
          <Button type="submit" disabled={addItem.isPending || !newItemText.trim()}>
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </form>
      )}

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nenhum item ainda.
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">
              {items.map((it) => (
                <SortableRow
                  key={it.id}
                  item={it}
                  listId={id}
                  draggable={canEditItems}
                  editable={canEditItems}
                  onToggleStatus={() =>
                    setStatus.mutate({ id: it.id, status: STATUS_NEXT[it.status] })
                  }
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function SortableRow({
  item,
  listId,
  draggable,
  editable,
  onToggleStatus,
}: {
  item: Item;
  listId: string;
  draggable: boolean;
  editable: boolean;
  onToggleStatus: () => void;
}) {
  const qc = useQueryClient();
  const updText = useServerFn(updateItemText);
  const delI = useServerFn(deleteItem);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, disabled: !draggable });

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.texto);

  const save = useMutation({
    mutationFn: () => updText({ data: { id: item.id, texto: draft.trim() } }),
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["list", listId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: () => delI({ data: { id: item.id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["list", listId] });
      qc.invalidateQueries({ queryKey: ["home"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border bg-card p-3 shadow-sm"
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
      <StatusButton status={item.status} onClick={onToggleStatus} />
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
          className={`flex-1 truncate text-sm ${
            item.status === "done" ? "text-muted-foreground line-through" : ""
          }`}
        >
          {item.texto}
        </Link>
      )}
      <Badge variant="outline" className="hidden sm:inline-flex">
        {STATUS_LABEL[item.status]}
      </Badge>
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
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => del.mutate()}
            >
              <Trash2 className="h-4 w-4" /> Apagar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}

function StatusButton({ status, onClick }: { status: ItemStatus; onClick: () => void }) {
  const cls =
    status === "done"
      ? "bg-emerald-500 border-emerald-500 text-white"
      : status === "in_progress"
        ? "bg-blue-500 border-blue-500 text-white"
        : "border-muted-foreground/40 text-transparent";
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Status: ${STATUS_LABEL[status]} (clique para alternar)`}
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${cls}`}
    >
      {status === "done" ? <Check className="h-3 w-3" /> : <Circle className="h-2 w-2 fill-current" />}
    </button>
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
