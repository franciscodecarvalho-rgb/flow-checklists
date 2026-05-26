import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const searchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: searchSchema,
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { session } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Redirect once authenticated (driven by AuthProvider state)
  useEffect(() => {
    if (session) {
      navigate({ to: search.redirect ?? "/", replace: true });
    }
  }, [session, navigate, search.redirect]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Login realizado");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        toast.success("Conta criada. Verifique seu email para confirmar.");
      }
    } catch (err) {
      let message = err instanceof Error ? err.message : "Erro desconhecido";
      message = message.replace(/^Database error saving new user:\s*/i, "");
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Listas e Checklists</CardTitle>
          <CardDescription>
            {mode === "signin" ? "Entre na sua conta" : "Crie sua conta"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="fullName">Nome completo</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  maxLength={120}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="nome@vitatech.com.br"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Aguarde…" : mode === "signin" ? "Entrar" : "Criar conta"}
            </Button>

            <div className="flex flex-col items-center gap-2 text-sm">
              {mode === "signin" ? (
                <>
                  <Link to="/forgot-password" className="text-muted-foreground hover:underline">
                    Esqueci minha senha
                  </Link>
                  <button
                    type="button"
                    onClick={() => setMode("signup")}
                    className="text-muted-foreground hover:underline"
                  >
                    Criar nova conta
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setMode("signin")}
                  className="text-muted-foreground hover:underline"
                >
                  Já tenho conta
                </button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
