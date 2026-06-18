import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ExternalLink, Search, Star } from "lucide-react";
import { listAllItems } from "@/lib/app.functions";
import {
  statusFromPrazo,
  prioridadeInfo,
  PRIORIDADE_OPTIONS,
  STATUS_FILTER_OPTIONS,
} from "@/lib/item-display";
import { useAuth } from "@/lib/auth-context";
import { ItemSheet } from "@/components/ItemSheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/tudo")({
  component: TudoPage,
});

const ALL = "__all__";

function validadeLabel(dateStr: string | null): string {
  if (!dateStr) return "—";
  return dateStr;
}

function TudoPage() {
  const { user, profile } = useAuth();
  const allFn = useServerFn(listAllItems);
  const q = useQuery({ queryKey: ["all-items"], queryFn: () => allFn() });

  const [busca, setBusca] = useState("");
  const [area, setArea] = useState<string>(ALL);
  const [prioridade, setPrioridade] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [responsavel, setResponsavel] = useState<string>(ALL);
  const [soFavoritos, setSoFavoritos] = useState(false);

  const [openItem, setOpenItem] = useState<{ itemId: string; listId: string; canEdit: boolean } | null>(null);

  const responsaveis = useMemo(() => {
    const set = new Map<string, string>();
    for (const it of q.data?.items ?? []) {
      if (it.responsavel_id) set.set(it.responsavel_id, it.responsavel_name);
    }
    return Array.from(set, ([id, nome]) => ({ id, nome })).sort((a, b) =>
      a.nome.localeCompare(b.nome),
    );
  }, [q.data]);

  const filtered = useMemo(() => {
    const term = busca.trim().toLowerCase();
    return (q.data?.items ?? []).filter((it) => {
      if (term && !it.texto.toLowerCase().includes(term)) return false;
      if (area !== ALL && it.area_id !== area) return false;
      if (prioridade !== ALL && it.prioridade !== prioridade) return false;
      if (status !== ALL && statusFromPrazo(it.validade).label !== status) return false;
      if (responsavel !== ALL && it.responsavel_id !== responsavel) return false;
      if (soFavoritos && !it.favorito) return false;
      return true;
    });
  }, [q.data, busca, area, prioridade, status, responsavel, soFavoritos]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Tudo</h1>
        <p className="text-sm text-muted-foreground">
          Todos os itens ativos de todas as listas, num só lugar.
        </p>
      </div>

      {/* filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar item…"
            className="w-full pl-8 sm:w-56"
          />
        </div>
        <Select value={area} onValueChange={setArea}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Área" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as áreas</SelectItem>
            {(q.data?.areas ?? []).map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={prioridade} onValueChange={setPrioridade}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Prioridade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Toda prioridade</SelectItem>
            {PRIORIDADE_OPTIONS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todo status</SelectItem>
            {STATUS_FILTER_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={responsavel} onValueChange={setResponsavel}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Responsável" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todo responsável</SelectItem>
            {responsaveis.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant={soFavoritos ? "default" : "outline"}
          onClick={() => setSoFavoritos((v) => !v)}
        >
          <Star className={`h-4 w-4 ${soFavoritos ? "fill-current" : ""}`} /> Favoritos
        </Button>
      </div>

      {q.isLoading && <p className="text-muted-foreground">Carregando…</p>}
      {q.error && (
        <p className="text-destructive">Erro: {(q.error as Error).message}</p>
      )}

      {!q.isLoading && (
        <p className="text-xs text-muted-foreground">
          {filtered.length} de {q.data?.items.length ?? 0} itens
        </p>
      )}

      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 text-center">★</TableHead>
              <TableHead className="w-[22%]">Item</TableHead>
              <TableHead>Lista</TableHead>
              <TableHead>Área</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Envolvido</TableHead>
              <TableHead>Prioridade</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Prazo</TableHead>
              <TableHead>Link</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((it) => {
              const s = statusFromPrazo(it.validade);
              const p = prioridadeInfo(it.prioridade);
              const canEdit = it.list_owner_id === user?.id || !!profile?.is_admin;
              return (
                <TableRow key={it.id} className="align-middle">
                  <TableCell className="text-center">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenItem({ itemId: it.id, listId: it.list_id, canEdit })
                      }
                      title="Abrir item"
                      aria-label="Favorito"
                      className="text-muted-foreground hover:text-amber-500"
                    >
                      <Star
                        className={`h-4 w-4 ${it.favorito ? "fill-amber-400 text-amber-400" : ""}`}
                      />
                    </button>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenItem({ itemId: it.id, listId: it.list_id, canEdit })
                      }
                      className="text-left text-sm font-medium text-foreground hover:underline"
                    >
                      {it.texto}
                    </button>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {it.list_titulo}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {it.area_nome}
                  </TableCell>
                  <TableCell className="text-sm">{it.responsavel_name}</TableCell>
                  <TableCell className="text-sm">{it.envolvido_name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={p.className}>
                      {p.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={s.className}>
                      {s.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{validadeLabel(it.validade)}</TableCell>
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
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {!q.isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum item com esses filtros.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <ItemSheet
        open={!!openItem}
        onOpenChange={(v) => {
          if (!v) setOpenItem(null);
        }}
        itemId={openItem?.itemId ?? null}
        listId={openItem?.listId ?? ""}
        canEdit={openItem?.canEdit ?? false}
      />
    </div>
  );
}
