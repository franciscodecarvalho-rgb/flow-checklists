import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  ExternalLink,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  Ticket,
} from "lucide-react";
import {
  getItemDetail,
  commentItem,
  verifyItem,
  updateItemFields,
  updateItemSchedule,
  archiveItem,
  unarchiveItem,
  listProfiles,
  type ItemEventType,
} from "@/lib/app.functions";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const EVENT_ICON: Record<ItemEventType, React.ComponentType<{ className?: string }>> = {
  item_created: Plus,
  item_edited: Pencil,
  verification: CheckCircle2,
  comment: MessageSquare,
  archived: Archive,
  unarchived: RefreshCw,
  ticket_opened: Ticket,
};

const EVENT_LABEL: Record<ItemEventType, string> = {
  item_created: "Item criado",
  item_edited: "Editado",
  verification: "Verificação",
  comment: "Andamento",
  archived: "Arquivado",
  unarchived: "Desarquivado",
  ticket_opened: "Chamado aberto",
};

export function ItemSheet({
  open,
  onOpenChange,
  itemId,
  listId,
  canEdit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  itemId: string | null;
  listId: string;
  canEdit: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {itemId ? (
          <ItemSheetBody itemId={itemId} listId={listId} canEdit={canEdit} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function ItemSheetBody({
  itemId,
  listId,
  canEdit,
}: {
  itemId: string;
  listId: string;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const detail = useServerFn(getItemDetail);
  const comment = useServerFn(commentItem);
  const verify = useServerFn(verifyItem);
  const updFields = useServerFn(updateItemFields);
  const updSched = useServerFn(updateItemSchedule);
  const archI = useServerFn(archiveItem);
  const unarchI = useServerFn(unarchiveItem);
  const profilesFn = useServerFn(listProfiles);

  const q = useQuery({
    queryKey: ["item", itemId],
    queryFn: () => detail({ data: { id: itemId } }),
  });
  const usersQ = useQuery({
    queryKey: ["profiles"],
    queryFn: () => profilesFn(),
    enabled: canEdit,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["item", itemId] });
    qc.invalidateQueries({ queryKey: ["list", listId] });
    qc.invalidateQueries({ queryKey: ["home"] });
  };

  // --- mutations ---
  const addComment = useMutation({
    mutationFn: (texto: string) => comment({ data: { item_id: itemId, texto } }),
    onSuccess: () => {
      setProgress("");
      invalidate();
      toast.success("Andamento registrado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const verifyM = useMutation({
    mutationFn: (comentario: string) => verify({ data: { id: itemId, comentario } }),
    onSuccess: () => {
      setVerifyText("");
      invalidate();
      toast.success("Verificação confirmada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  type FieldsPatch = {
    id: string;
    texto?: string;
    responsavel_id?: string | null;
    status?: string | null;
    validade?: string | null;
    link?: string | null;
  };
  const fieldsM = useMutation({
    mutationFn: (p: FieldsPatch) => updFields({ data: p }),
    onSuccess: () => {
      invalidate();
      toast.success("Salvo");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const schedM = useMutation({
    mutationFn: (p: { proxima_checagem?: string; periodicidade_dias?: number | null }) =>
      updSched({ data: { id: itemId, ...p } }),
    onSuccess: () => {
      invalidate();
      toast.success("Salvo");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archM = useMutation({
    mutationFn: (comentario: string) => archI({ data: { id: itemId, comentario } }),
    onSuccess: () => {
      setArchText("");
      invalidate();
      toast.success("Item arquivado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unarchM = useMutation({
    mutationFn: (proxima_checagem: string) =>
      unarchI({ data: { id: itemId, proxima_checagem } }),
    onSuccess: () => {
      invalidate();
      toast.success("Item desarquivado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // --- form state, hydrated from data ---
  const [texto, setTexto] = useState("");
  const [responsavelId, setResponsavelId] = useState<string>("");
  const [status, setStatus] = useState("");
  const [validade, setValidade] = useState("");
  const [link, setLink] = useState("");
  const [proxima, setProxima] = useState("");
  const [periodicidade, setPeriodicidade] = useState("");
  const [progress, setProgress] = useState("");
  const [verifyText, setVerifyText] = useState("");
  const [archText, setArchText] = useState("");
  const [unarchDate, setUnarchDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });

  useEffect(() => {
    if (q.data) {
      setTexto(q.data.texto);
      setResponsavelId(q.data.responsavel_id ?? q.data.list_owner_id ?? "");
      setStatus(q.data.status ?? "");
      setValidade(q.data.validade ?? "");
      setLink(q.data.link ?? "");
      setProxima(q.data.proxima_checagem ?? "");
      setPeriodicidade(q.data.periodicidade_dias?.toString() ?? "");
    }
  }, [q.data]);

  if (q.isLoading) {
    return (
      <div className="space-y-2">
        <SheetHeader>
          <SheetTitle>Carregando…</SheetTitle>
        </SheetHeader>
      </div>
    );
  }
  if (q.error || !q.data) {
    return (
      <SheetHeader>
        <SheetTitle>Erro ao carregar</SheetTitle>
      </SheetHeader>
    );
  }

  const isLista = q.data.list_tipo === "lista";
  const isArchived = !!q.data.archived_at;

  const saveCoreFields = () => {
    const patch: Record<string, unknown> = { id: itemId };
    if (texto.trim() && texto !== q.data!.texto) patch.texto = texto.trim();
    const newResp = responsavelId || null;
    if (newResp !== q.data!.responsavel_id) patch.responsavel_id = newResp;
    if (isLista) {
      const ns = status.trim() || null;
      if (ns !== q.data!.status) patch.status = ns;
      const nv = validade || null;
      if (nv !== q.data!.validade) patch.validade = nv;
      const nl = link.trim() || null;
      if (nl !== q.data!.link) patch.link = nl;
    }
    if (Object.keys(patch).length <= 1) {
      toast.info("Nada a salvar");
      return;
    }
    fieldsM.mutate(patch as FieldsPatch);
  };

  const saveSchedule = () => {
    const p: { proxima_checagem?: string; periodicidade_dias?: number | null } = {};
    if (proxima && proxima !== q.data!.proxima_checagem) p.proxima_checagem = proxima;
    const parsed = periodicidade === "" ? null : Number(periodicidade);
    if (parsed !== q.data!.periodicidade_dias) p.periodicidade_dias = parsed;
    if (Object.keys(p).length === 0) {
      toast.info("Nada a salvar");
      return;
    }
    schedM.mutate(p);
  };

  return (
    <div className="space-y-6">
      <SheetHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{isLista ? "Lista" : "Checklist"}</Badge>
          {isArchived && <Badge variant="outline">arquivado</Badge>}
          {!isArchived && !isLista && q.data.proxima_checagem && (
            <Badge variant="secondary">próx.: {q.data.proxima_checagem}</Badge>
          )}
        </div>
        <SheetTitle className="text-left text-lg">{q.data.texto}</SheetTitle>
      </SheetHeader>

      {/* ---- edit fields ---- */}
      <div className="space-y-4 rounded-md border bg-card p-4">
        <div className="space-y-2">
          <Label>Texto do item</Label>
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            disabled={!canEdit}
            maxLength={500}
          />
        </div>

        <div className="space-y-2">
          <Label>Responsável</Label>
          <Select
            value={responsavelId}
            onValueChange={setResponsavelId}
            disabled={!canEdit}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecionar…" />
            </SelectTrigger>
            <SelectContent>
              {(usersQ.data ?? []).map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {q.data.responsavel_name && (
            <p className="text-xs text-muted-foreground">
              Atual: {q.data.responsavel_name}
            </p>
          )}
        </div>

        {isLista ? (
          <>
            <div className="space-y-2">
              <Label>Status</Label>
              <Input
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={!canEdit}
                maxLength={60}
                placeholder="Ex.: vigente, vencido…"
              />
            </div>
            <div className="space-y-2">
              <Label>Prazo</Label>
              <Input
                type="date"
                value={validade}
                onChange={(e) => setValidade(e.target.value)}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2">
              <Label>Link</Label>
              <div className="flex gap-2">
                <Input
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  disabled={!canEdit}
                  maxLength={2000}
                  placeholder="https://…"
                />
                {q.data.link && (
                  <Button asChild variant="outline" size="icon" type="button">
                    <a href={q.data.link} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <Label>Próxima checagem</Label>
              <Input
                type="date"
                value={proxima}
                onChange={(e) => setProxima(e.target.value)}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2">
              <Label>Periodicidade (dias)</Label>
              <Input
                type="number"
                min={1}
                max={3650}
                value={periodicidade}
                onChange={(e) => setPeriodicidade(e.target.value)}
                disabled={!canEdit}
                placeholder="Ex.: 7"
              />
            </div>
          </>
        )}

        {canEdit && (
          <div className="flex flex-wrap justify-end gap-2">
            {!isLista && (
              <Button
                variant="outline"
                onClick={saveSchedule}
                disabled={schedM.isPending}
              >
                Salvar data/periodicidade
              </Button>
            )}
            <Button onClick={saveCoreFields} disabled={fieldsM.isPending}>
              Salvar alterações
            </Button>
          </div>
        )}
      </div>

      {/* ---- verify (checklist only) ---- */}
      {canEdit && !isArchived && !isLista && (
        <div className="space-y-2 rounded-md border bg-card p-4">
          <Label>Confirmar verificação</Label>
          <Textarea
            value={verifyText}
            onChange={(e) => setVerifyText(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Comentário da verificação (obrigatório)…"
          />
          <div className="flex justify-end">
            <Button
              disabled={!verifyText.trim() || verifyM.isPending}
              onClick={() => verifyM.mutate(verifyText.trim())}
            >
              <CheckCircle2 className="h-4 w-4" /> Confirmar verificação
            </Button>
          </div>
        </div>
      )}

      {/* ---- adicionar andamento (qualquer usuário autenticado) ---- */}
      <div className="space-y-2 rounded-md border bg-card p-4">
        <Label>Adicionar andamento</Label>
        <Textarea
          value={progress}
          onChange={(e) => setProgress(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Escreva uma atualização… (não apaga o histórico)"
        />
        <div className="flex justify-end">
          <Button
            disabled={!progress.trim() || addComment.isPending}
            onClick={() => addComment.mutate(progress.trim())}
          >
            <MessageSquare className="h-4 w-4" /> Registrar
          </Button>
        </div>
      </div>

      {/* ---- timeline ---- */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Histórico</h2>
        {q.data.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum evento ainda.</p>
        ) : (
          <ul className="space-y-2">
            {q.data.events.map((e) => {
              const Icon = EVENT_ICON[e.tipo] ?? MessageSquare;
              return (
                <li key={e.id} className="rounded-md border bg-card p-3 text-sm">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Icon className="h-3 w-3" />
                    <span className="font-medium text-foreground">
                      {EVENT_LABEL[e.tipo]}
                    </span>
                    <span>·</span>
                    <span>{e.author_name}</span>
                    <span>·</span>
                    <span>{new Date(e.created_at).toLocaleString("pt-BR")}</span>
                  </div>
                  <div className="mt-1">{renderEventBody(e.tipo, e.payload)}</div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ---- archive / unarchive (por último) ---- */}
      {canEdit && (
        <div className="space-y-2 rounded-md border bg-card p-4">
          {isArchived ? (
            <>
              <Label>Desarquivar</Label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={unarchDate}
                  onChange={(e) => setUnarchDate(e.target.value)}
                />
                <Button
                  variant="outline"
                  disabled={!unarchDate || unarchM.isPending}
                  onClick={() => unarchM.mutate(unarchDate)}
                >
                  <ArchiveRestore className="h-4 w-4" /> Desarquivar
                </Button>
              </div>
            </>
          ) : (
            <>
              <Label>Arquivar item</Label>
              <Textarea
                value={archText}
                onChange={(e) => setArchText(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder="Motivo do arquivamento (obrigatório)…"
              />
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  disabled={!archText.trim() || archM.isPending}
                  onClick={() => archM.mutate(archText.trim())}
                >
                  <Archive className="h-4 w-4" /> Arquivar
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function renderEventBody(
  tipo: ItemEventType,
  payload: Record<string, string | number | null>,
) {
  if (tipo === "comment") {
    return <p className="whitespace-pre-wrap">{String(payload.texto ?? "")}</p>;
  }
  if (tipo === "verification") {
    return (
      <div className="space-y-1">
        {payload.comentario && (
          <p className="whitespace-pre-wrap">{String(payload.comentario)}</p>
        )}
        <p className="text-xs text-muted-foreground">
          próxima checagem: {String(payload.proxima_checagem ?? "—")}
          {payload.anterior ? ` (era ${String(payload.anterior)})` : ""}
        </p>
      </div>
    );
  }
  if (tipo === "item_edited") {
    if (payload.changes && typeof payload.changes === "object") {
      const ch = payload.changes as unknown as Record<
        string,
        { from: unknown; to: unknown }
      >;
      return (
        <ul className="space-y-0.5 text-muted-foreground">
          {Object.entries(ch).map(([k, v]) => (
            <li key={k}>
              <span className="font-medium text-foreground">{k}:</span>{" "}
              <span className="line-through">{String(v.from ?? "—")}</span> →{" "}
              <span className="text-foreground">{String(v.to ?? "—")}</span>
            </li>
          ))}
        </ul>
      );
    }
    return (
      <p className="text-muted-foreground">
        <span className="line-through">{String(payload.from ?? "")}</span> →{" "}
        <span className="text-foreground">{String(payload.to ?? "")}</span>
      </p>
    );
  }
  if (tipo === "archived" || tipo === "unarchived") {
    return payload.comentario ? (
      <p className="whitespace-pre-wrap">{String(payload.comentario)}</p>
    ) : (
      <p className="text-muted-foreground">
        {tipo === "archived" ? "Item arquivado." : "Item desarquivado."}
      </p>
    );
  }
  if (tipo === "ticket_opened") {
    return (
      <p className="text-muted-foreground">
        Chamado{" "}
        <span className="font-mono text-foreground">
          {String(payload.ticket_code ?? "")}
        </span>
        {payload.ticket_status ? ` — ${String(payload.ticket_status)}` : ""}
      </p>
    );
  }
  if (tipo === "item_created") {
    return (
      <p className="text-muted-foreground">
        Texto:{" "}
        <span className="text-foreground">{String(payload.texto ?? "")}</span>
      </p>
    );
  }
  return null;
}
