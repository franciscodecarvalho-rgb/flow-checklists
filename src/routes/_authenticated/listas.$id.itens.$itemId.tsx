import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
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
  type ItemEventType,
} from "@/lib/app.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/listas/$id/itens/$itemId")({
  component: ItemDetailPage,
});

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
  item_edited: "Texto editado",
  verification: "Verificação",
  comment: "Comentário",
  archived: "Arquivado",
  unarchived: "Desarquivado",
  ticket_opened: "Chamado aberto",
};

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00");
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function ItemDetailPage() {
  const { id, itemId } = Route.useParams();
  const qc = useQueryClient();
  const detail = useServerFn(getItemDetail);
  const comment = useServerFn(commentItem);
  const verify = useServerFn(verifyItem);
  const q = useQuery({
    queryKey: ["item", itemId],
    queryFn: () => detail({ data: { id: itemId } }),
  });

  const [text, setText] = useState("");
  const [verifyText, setVerifyText] = useState("");

  const m = useMutation({
    mutationFn: (texto: string) => comment({ data: { item_id: itemId, texto } }),
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["item", itemId] });
      toast.success("Comentário adicionado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const v = useMutation({
    mutationFn: (comentario: string) => verify({ data: { id: itemId, comentario } }),
    onSuccess: () => {
      setVerifyText("");
      qc.invalidateQueries({ queryKey: ["item", itemId] });
      qc.invalidateQueries({ queryKey: ["list", id] });
      qc.invalidateQueries({ queryKey: ["home"] });
      toast.success("Item verificado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <p className="text-muted-foreground">Carregando…</p>;
  if (q.error || !q.data)
    return <p className="text-destructive">Erro ao carregar item</p>;

  const days = daysUntil(q.data.proxima_checagem);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        to="/listas/$id"
        params={{ id }}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Voltar para {q.data.list_titulo}
      </Link>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {q.data.archived_at ? (
            <Badge variant="outline">arquivado</Badge>
          ) : q.data.proxima_checagem ? (
            <Badge variant="outline">
              próxima checagem: {q.data.proxima_checagem}
              {days !== null &&
                ` (${days < 0 ? `atrasado ${Math.abs(days)}d` : days === 0 ? "hoje" : `em ${days}d`})`}
            </Badge>
          ) : null}
          {q.data.periodicidade_dias && (
            <Badge variant="secondary">a cada {q.data.periodicidade_dias} dias</Badge>
          )}
        </div>
        <h1 className="text-xl font-semibold">{q.data.texto}</h1>
        {q.data.archived_by_name && (
          <p className="text-xs text-muted-foreground">
            arquivado por {q.data.archived_by_name}
          </p>
        )}
      </div>

      {!q.data.archived_at && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <p className="text-sm font-medium">Verificar item</p>
            <Textarea
              placeholder="Comentário da verificação (obrigatório)…"
              value={verifyText}
              onChange={(e) => setVerifyText(e.target.value)}
              maxLength={2000}
              rows={2}
            />
            <div className="flex justify-end">
              <Button
                disabled={!verifyText.trim() || v.isPending}
                onClick={() => v.mutate(verifyText.trim())}
              >
                <CheckCircle2 className="h-4 w-4" /> Confirmar verificação
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-3 pt-6">
          <Textarea
            placeholder="Adicionar comentário…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
            rows={3}
          />
          <div className="flex justify-end">
            <Button
              disabled={!text.trim() || m.isPending}
              onClick={() => m.mutate(text.trim())}
            >
              Comentar
            </Button>
          </div>
        </CardContent>
      </Card>

      {q.data.tickets.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Chamados</h2>
          <ul className="space-y-1">
            {q.data.tickets.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between rounded-md border bg-card p-2 text-sm"
              >
                <span className="font-mono">{t.ticket_code}</span>
                <span className="text-xs text-muted-foreground">
                  {t.ticket_status ?? "sem status"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-3">
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
                    <span className="font-medium text-foreground">{EVENT_LABEL[e.tipo]}</span>
                    <span>·</span>
                    <span>{e.author_name}</span>
                    <span>·</span>
                    <span>{new Date(e.created_at).toLocaleString("pt-BR")}</span>
                  </div>
                  <div className="mt-1">
                    {renderEventBody(e.tipo, e.payload)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
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
        Chamado <span className="font-mono text-foreground">{String(payload.ticket_code ?? "")}</span>
        {payload.ticket_status ? ` — ${String(payload.ticket_status)}` : ""}
      </p>
    );
  }
  if (tipo === "item_created") {
    return (
      <p className="text-muted-foreground">
        Texto: <span className="text-foreground">{String(payload.texto ?? "")}</span>
      </p>
    );
  }
  return null;
}
