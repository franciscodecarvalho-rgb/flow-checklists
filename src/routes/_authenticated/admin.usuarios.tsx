import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, Pencil, Plus, Shield, ShieldOff, Trash2 } from "lucide-react";
import {
  listUsers,
  adminCreateUser,
  adminUpdateUser,
  adminResetPassword,
  adminDeleteUser,
} from "@/lib/app.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/admin/usuarios")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
    const { data: prof } = await (supabase.from as any)("profiles")
      .select("is_admin")
      .eq("id", data.user.id)
      .maybeSingle();
    if (!prof?.is_admin) throw redirect({ to: "/" });
  },
  component: AdminUsuariosPage,
});

type Row = { id: string; full_name: string | null; email: string; is_admin: boolean };

function AdminUsuariosPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const listFn = useServerFn(listUsers);
  const createFn = useServerFn(adminCreateUser);
  const updateFn = useServerFn(adminUpdateUser);
  const resetFn = useServerFn(adminResetPassword);
  const deleteFn = useServerFn(adminDeleteUser);

  const q = useQuery({ queryKey: ["admin-users"], queryFn: () => listFn() });

  const [createOpen, setCreateOpen] = useState(false);
  const [cEmail, setCEmail] = useState("");
  const [cName, setCName] = useState("");
  const [cPassword, setCPassword] = useState("");
  const [cAdmin, setCAdmin] = useState(false);

  const [editing, setEditing] = useState<Row | null>(null);
  const [eName, setEName] = useState("");
  const [eAdmin, setEAdmin] = useState(false);

  const [resetting, setResetting] = useState<Row | null>(null);
  const [rPassword, setRPassword] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-users"] });

  const createM = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          email: cEmail.trim().toLowerCase(),
          full_name: cName.trim(),
          password: cPassword,
          is_admin: cAdmin,
        },
      }),
    onSuccess: () => {
      toast.success("Usuário criado");
      setCreateOpen(false);
      setCEmail("");
      setCName("");
      setCPassword("");
      setCAdmin(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateM = useMutation({
    mutationFn: () =>
      updateFn({
        data: { id: editing!.id, full_name: eName.trim(), is_admin: eAdmin },
      }),
    onSuccess: () => {
      toast.success("Usuário atualizado");
      setEditing(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetM = useMutation({
    mutationFn: () => resetFn({ data: { id: resetting!.id, password: rPassword } }),
    onSuccess: () => {
      toast.success("Senha redefinida");
      setResetting(null);
      setRPassword("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Usuário excluído");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (q.data ?? []) as Row[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Usuários e senhas</h1>
          <p className="text-sm text-muted-foreground">
            Apenas administradores criam acessos. Domínio aceito: @vitatech.com.br
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> Novo usuário
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo usuário</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Nome completo</Label>
                <Input value={cName} onChange={(e) => setCName(e.target.value)} maxLength={120} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={cEmail}
                  onChange={(e) => setCEmail(e.target.value)}
                  placeholder="nome@vitatech.com.br"
                />
              </div>
              <div className="space-y-2">
                <Label>Senha provisória</Label>
                <Input
                  type="text"
                  value={cPassword}
                  onChange={(e) => setCPassword(e.target.value)}
                  minLength={8}
                  placeholder="mínimo 8 caracteres"
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label>Administrador</Label>
                  <p className="text-xs text-muted-foreground">
                    Pode gerenciar áreas, usuários e transferir listas
                  </p>
                </div>
                <Switch checked={cAdmin} onCheckedChange={setCAdmin} />
              </div>
            </div>
            <DialogFooter>
              <Button
                disabled={
                  !cName.trim() ||
                  !cEmail.trim() ||
                  cPassword.length < 8 ||
                  createM.isPending
                }
                onClick={() => createM.mutate()}
              >
                Criar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {q.isLoading && <p className="text-muted-foreground">Carregando…</p>}

      <div className="overflow-hidden rounded-md border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Nome</th>
              <th className="px-3 py-2 text-left">Email</th>
              <th className="px-3 py-2 text-left">Papel</th>
              <th className="px-3 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="px-3 py-2">{u.full_name || "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{u.email}</td>
                <td className="px-3 py-2">
                  {u.is_admin ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                      <Shield className="h-3 w-3" /> Admin
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      <ShieldOff className="h-3 w-3" /> Usuário
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Editar"
                      onClick={() => {
                        setEditing(u);
                        setEName(u.full_name ?? "");
                        setEAdmin(u.is_admin);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Redefinir senha"
                      onClick={() => {
                        setResetting(u);
                        setRPassword("");
                      }}
                    >
                      <KeyRound className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Excluir"
                      disabled={u.id === user?.id}
                      onClick={() => {
                        if (confirm(`Excluir ${u.full_name || u.email}?`)) deleteM.mutate(u.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !q.isLoading && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-sm text-muted-foreground">
                  Nenhum usuário.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Nome completo</Label>
                <Input value={eName} onChange={(e) => setEName(e.target.value)} maxLength={120} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={editing.email} disabled />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label>Administrador</Label>
                  <p className="text-xs text-muted-foreground">
                    {editing.id === user?.id
                      ? "Você não pode remover seu próprio acesso"
                      : "Pode gerenciar áreas, usuários e transferir listas"}
                  </p>
                </div>
                <Switch
                  checked={eAdmin}
                  onCheckedChange={setEAdmin}
                  disabled={editing.id === user?.id && editing.is_admin}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button disabled={!eName.trim() || updateM.isPending} onClick={() => updateM.mutate()}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetting} onOpenChange={(o) => !o && setResetting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir senha</DialogTitle>
          </DialogHeader>
          {resetting && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Nova senha para <strong>{resetting.full_name || resetting.email}</strong>. Informe ao
                usuário para entrar e trocar pelo fluxo "Esqueci minha senha" se quiser.
              </p>
              <div className="space-y-2">
                <Label>Nova senha</Label>
                <Input
                  type="text"
                  value={rPassword}
                  onChange={(e) => setRPassword(e.target.value)}
                  minLength={8}
                  placeholder="mínimo 8 caracteres"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button disabled={rPassword.length < 8 || resetM.isPending} onClick={() => resetM.mutate()}>
              Redefinir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
