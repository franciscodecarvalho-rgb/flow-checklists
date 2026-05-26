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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

function HomePage() {
  const { profile, user } = useAuth();
  const home = useServerFn(listHome);
  const areasFn = useServerFn(listAreas);
  const navigate = useNavigate();

  const homeQ = useQuery({ queryKey: ["home"], queryFn: () => home() });
  const areasQ = useQuery({ queryKey: ["areas"], queryFn: () => areasFn() });
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const grouped = useMemo(() => {
    if (!homeQ.data) return [];
    const term = q.trim().toLowerCase();
    return homeQ.data.areas
      .map((a) => ({
        area: a,
        lists: homeQ.data!.lists
          .filter((l) => l.area_id === a.id)
          .filter((l) => !term || l.titulo.toLowerCase().includes(term)),
      }))
      .filter(({ lists }) => lists.length > 0);
  }, [homeQ.data, q]);


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

      {homeQ.isLoading && <p className="text-muted-foreground">Carregando…</p>}
      {homeQ.error && (
        <p className="text-destructive">Erro ao carregar: {(homeQ.error as Error).message}</p>
      )}

      {grouped.length === 0 && !homeQ.isLoading && (
        <EmptyState message="Nenhuma área cadastrada. Peça a um admin para criar." />
      )}

      <div className="space-y-8">
        {grouped.map(({ area, lists }) => (
          <section key={area.id} className="space-y-3">
            <h2 className="text-lg font-semibold">{area.nome}</h2>
            {lists.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem listas nesta área.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {lists.map((l) => (
                  <Link key={l.id} to="/listas/$id" params={{ id: l.id }} className="block">
                    <Card className="h-full transition hover:border-primary/50 hover:shadow-md">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">{l.titulo}</CardTitle>
                        <p className="text-xs text-muted-foreground">por {l.owner_name}</p>
                      </CardHeader>
                      <CardContent className="flex flex-wrap gap-2 text-xs">
                        <Badge variant="secondary">{l.counts.total} itens</Badge>
                        {l.counts.pending > 0 && (
                          <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300">
                            {l.counts.pending} pend.
                          </Badge>
                        )}
                        {l.counts.in_progress > 0 && (
                          <Badge variant="outline" className="border-blue-500/40 text-blue-700 dark:text-blue-300">
                            {l.counts.in_progress} em and.
                          </Badge>
                        )}
                        {l.counts.done > 0 && (
                          <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
                            {l.counts.done} ok
                          </Badge>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
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

  const m = useMutation({
    mutationFn: () => create({ data: { titulo, area_id: areaId } }),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["home"] });
      toast.success("Lista criada");
      setTitulo("");
      setAreaId("");
      onCreated(row.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Nova lista</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Título</Label>
          <Input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ex.: Checklist envio cliente X"
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
