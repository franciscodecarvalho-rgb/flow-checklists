import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import {
  listHome,
  listAreas,
  createList,
} from "@/lib/app.functions";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/")({
  component: HomePage,
});

// Faixa de cores por dias até a próxima checagem.
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

function HomePage() {
  const { profile, user } = useAuth();
  const home = useServerFn(listHome);
  const areasFn = useServerFn(listAreas);
  const navigate = useNavigate();

  const homeQ = useQuery({ queryKey: ["home"], queryFn: () => home() });
  const areasQ = useQuery({ queryKey: ["areas"], queryFn: () => areasFn() });
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const stats = useMemo(() => {
    let atrasados = 0;
    let hoje = 0;
    let amanha = 0;
    for (const l of homeQ.data?.lists ?? []) {
      for (const it of l.items) {
        const d = daysUntil(it.proxima_checagem);
        if (!Number.isFinite(d)) continue;
        if (d < 0) atrasados++;
        else if (d === 0) hoje++;
        else if (d === 1) amanha++;
      }
    }
    return { atrasados, hoje, amanha };
  }, [homeQ.data]);

  const { checklists, listas } = useMemo(() => {
    const term = q.trim().toLowerCase();
    const data = homeQ.data;
    const areaName = new Map((data?.areas ?? []).map((a) => [a.id, a.nome] as const));
    const areaOrder = new Map((data?.areas ?? []).map((a) => [a.id, a.ordem] as const));
    const enriched = (data?.lists ?? [])
      .filter((l) => !term || l.titulo.toLowerCase().includes(term))
      .map((l) => ({
        ...l,
        area_nome: areaName.get(l.area_id) ?? "—",
        area_ordem: areaOrder.get(l.area_id) ?? 0,
      }))
      .sort(
        (a, b) => a.area_ordem - b.area_ordem || a.titulo.localeCompare(b.titulo),
      );
    return {
      checklists: enriched.filter((l) => l.tipo !== "lista"),
      listas: enriched.filter((l) => l.tipo === "lista"),
    };
  }, [homeQ.data, q]);

  const total = checklists.length + listas.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Olá{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground">
            {user?.email} — {homeQ.data?.lists.length ?? 0} listas em{" "}
            {homeQ.data?.areas.length ?? 0} áreas
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar lista…"
              className="pl-8 w-full sm:w-64"
            />
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" /> Nova lista
              </Button>
            </DialogTrigger>
            <NewListDialog
              areas={areasQ.data ?? []}
              onCreated={(id) => {
                setOpen(false);
                navigate({ to: "/listas/$id", params: { id } });
              }}
            />
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Atrasados" value={stats.atrasados} tone="red" />
        <StatTile label="Hoje" value={stats.hoje} tone="amber" />
        <StatTile label="Amanhã" value={stats.amanha} tone="neutral" />
      </div>

      {homeQ.isLoading && <p className="text-muted-foreground">Carregando…</p>}
      {homeQ.error && (
        <p className="text-destructive">Erro ao carregar: {(homeQ.error as Error).message}</p>
      )}

      {total === 0 && !homeQ.isLoading && !homeQ.error && (
        <EmptyState message={q ? "Nenhuma lista encontrada." : "Nenhuma lista ainda. Clique em “Nova lista” para começar."} />
      )}

      {total > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <ListColumn
            title="Checklists"
            emptyMsg="Nenhum checklist."
            lists={checklists.map((l) => ({
              id: l.id,
              titulo: l.titulo,
              area: l.area_nome,
              count: l.items.length,
              nextDays: nextDaysOf(l.items),
            }))}
          />
          <ListColumn
            title="Listas"
            emptyMsg="Nenhuma lista."
            lists={listas.map((l) => ({
              id: l.id,
              titulo: l.titulo,
              area: l.area_nome,
              count: l.items.length,
              nextDays: null,
            }))}
          />
        </div>
      )}
    </div>
  );
}

function nextDaysOf(items: { proxima_checagem: string | null }[]): number | null {
  let min = Number.POSITIVE_INFINITY;
  for (const it of items) {
    const d = daysUntil(it.proxima_checagem);
    if (d < min) min = d;
  }
  return Number.isFinite(min) ? min : null;
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "red" | "amber" | "neutral";
}) {
  const toneClass =
    tone === "red"
      ? "border-red-500/40 bg-red-500/10"
      : tone === "amber"
        ? "border-amber-500/40 bg-amber-500/10"
        : "border-border bg-card";
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="text-2xl font-semibold leading-none tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

type CardData = {
  id: string;
  titulo: string;
  area: string;
  count: number;
  nextDays: number | null;
};

function ListColumn({
  title,
  emptyMsg,
  lists,
}: {
  title: string;
  emptyMsg: string;
  lists: CardData[];
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Badge variant="secondary">{lists.length}</Badge>
      </div>
      {lists.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
          {emptyMsg}
        </p>
      ) : (
        <div className="space-y-2">
          {lists.map((l) => (
            <CompactCard key={l.id} {...l} />
          ))}
        </div>
      )}
    </section>
  );
}

function CompactCard({ id, titulo, area, count, nextDays }: CardData) {
  return (
    <Link to="/listas/$id" params={{ id }} className="block">
      <div className="rounded-md border bg-card px-3 py-2 transition hover:border-primary/50 hover:shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{titulo}</span>
          {nextDays !== null && (
            <Badge
              variant="outline"
              className={`shrink-0 text-[10px] ${bucketClass(nextDays)}`}
            >
              {nextDays < 0
                ? `atrasado ${Math.abs(nextDays)}d`
                : nextDays === 0
                  ? "hoje"
                  : `em ${nextDays}d`}
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">{area}</span>
          <span>·</span>
          <span className="shrink-0">
            {count} {count === 1 ? "item" : "itens"}
          </span>
        </div>
      </div>
    </Link>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function NewListDialog({
  areas,
  onCreated,
}: {
  areas: { id: string; nome: string }[];
  onCreated: (id: string) => void;
}) {
  const create = useServerFn(createList);
  const qc = useQueryClient();
  const [titulo, setTitulo] = useState("");
  const [areaId, setAreaId] = useState<string>("");
  const [tipo, setTipo] = useState<"checklist" | "lista">("checklist");

  const m = useMutation({
    mutationFn: () => create({ data: { titulo, area_id: areaId, tipo } }),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["home"] });
      toast.success("Coleção criada");
      setTitulo("");
      setAreaId("");
      setTipo("checklist");
      onCreated(row.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Nova coleção</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Tipo</Label>
          <div className="grid grid-cols-2 gap-2">
            {(["checklist", "lista"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                  tipo === t
                    ? "border-primary bg-primary/10"
                    : "border-input hover:border-primary/40"
                }`}
              >
                <div className="font-medium capitalize">{t}</div>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {tipo === "checklist"
              ? "Checklist: rotinas que se repetem em intervalos."
              : "Lista: controle de documentos/registros sem repetição."}
          </p>
        </div>
        <div className="space-y-2">
          <Label>Título</Label>
          <Input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder={tipo === "checklist" ? "Ex.: Checklist envio cliente X" : "Ex.: Contratos vigentes"}
            maxLength={200}
          />
        </div>
        <div className="space-y-2">
          <Label>Área</Label>
          <Select value={areaId} onValueChange={setAreaId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione…" />
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
          onClick={() => m.mutate()}
          disabled={!titulo.trim() || !areaId || m.isPending}
        >
          {m.isPending ? "Criando…" : "Criar"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
