import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, MessageSquare, RefreshCw } from "lucide-react";
import { getItemDetail, addComment, type ItemStatus } from "@/lib/app.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/listas/$id/itens/$itemId")({
  component: ItemDetailPage,
});

const STATUS_LABEL: Record<ItemStatus, string> = {
  pending: "Pendente",
  in_progress: "Em andamento",
  done: "Concluído",
};

function ItemDetailPage() {
  const { id, itemId } = Route.useParams();
  const qc = useQueryClient();
  const detail = useServerFn(getItemDetail);
  const comment = useServerFn(addComment);
  const q = useQuery({
    queryKey: ["item", itemId],
    queryFn: () => detail({ data: { id: itemId } }),
  });

  const [text, setText] = useState("");
  const m = useMutation({
    mutationFn: (texto: string) => comment({ data: { item_id: itemId, texto } }),
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["item", itemId] });
      toast.success("Comentário adicionado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <p className="text-muted-foreground">Carregando…</p>;
  if (q.error || !q.data)
    return <p className="text-destructive">Erro ao carregar item</p>;

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
          <Badge variant="outline">{STATUS_LABEL[q.data.status]}</Badge>
        </div>
        <h1 className="text-xl font-semibold">{q.data.texto}</h1>
      </div>

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

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Histórico</h2>
        {q.data.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum evento ainda.</p>
        ) : (
          <ul className="space-y-2">
            {q.data.events.map((e) => (
              <li key={e.id} className="rounded-md border bg-card p-3 text-sm">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {e.tipo === "comment" ? (
                    <MessageSquare className="h-3 w-3" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  <span className="font-medium text-foreground">{e.author_name}</span>
                  <span>·</span>
                  <span>{new Date(e.created_at).toLocaleString("pt-BR")}</span>
                </div>
                <div className="mt-1">
                  {e.tipo === "comment" ? (
                    <p className="whitespace-pre-wrap">{String(e.payload.texto ?? "")}</p>
                  ) : (
                    <p className="text-muted-foreground">
                      Status alterado:{" "}
                      <span className="text-foreground">
                        {STATUS_LABEL[(e.payload.from as ItemStatus) ?? "pending"]}
                      </span>{" "}
                      →{" "}
                      <span className="text-foreground">
                        {STATUS_LABEL[(e.payload.to as ItemStatus) ?? "pending"]}
                      </span>
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
