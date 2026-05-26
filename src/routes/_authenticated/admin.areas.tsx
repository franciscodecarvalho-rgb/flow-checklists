import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { listAreas, createArea, updateArea, deleteArea } from "@/lib/app.functions";
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
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/areas")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
    const { data: prof } = await (supabase.from as any)("profiles")
      .select("is_admin")
      .eq("id", data.user.id)
      .maybeSingle();
    if (!prof?.is_admin) throw redirect({ to: "/" });
  },
  component: AdminAreasPage,
});

function AdminAreasPage() {
  const qc = useQueryClient();
  const list = useServerFn(listAreas);
  const create = useServerFn(createArea);
  const upd = useServerFn(updateArea);
  const del = useServerFn(deleteArea);

  const q = useQuery({ queryKey: ["areas"], queryFn: () => list() });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string; nome: string } | null>(null);
  const [nome, setNome] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      if (editing) return upd({ data: { id: editing.id, nome } });
      return create({ data: { nome, ordem: 0 } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["areas"] });
      qc.invalidateQueries({ queryKey: ["home"] });
      toast.success(editing ? "Área atualizada" : "Área criada");
      setOpen(false);
      setEditing(null);
      setNome("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["areas"] });
      qc.invalidateQueries({ queryKey: ["home"] });
      toast.success("Área apagada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Áreas</h1>
          <p className="text-sm text-muted-foreground">Gerencie as áreas da empresa</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              onClick={() => {
                setEditing(null);
                setNome("");
              }}
            >
              <Plus className="h-4 w-4" /> Nova área
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar área" : "Nova área"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} />
            </div>
            <DialogFooter>
              <Button disabled={!nome.trim() || save.isPending} onClick={() => save.mutate()}>
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {q.isLoading && <p className="text-muted-foreground">Carregando…</p>}
      <ul className="divide-y rounded-md border bg-card">
        {(q.data ?? []).map((a) => (
          <li key={a.id} className="flex items-center justify-between p-3">
            <span>{a.nome}</span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setEditing({ id: a.id, nome: a.nome });
                  setNome(a.nome);
                  setOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (confirm(`Apagar "${a.nome}"?`)) delM.mutate(a.id);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </li>
        ))}
        {q.data?.length === 0 && (
          <li className="p-6 text-center text-sm text-muted-foreground">
            Nenhuma área cadastrada.
          </li>
        )}
      </ul>
    </div>
  );
}
