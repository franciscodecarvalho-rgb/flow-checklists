import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Shield } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

export function AppHeader() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    navigate({ to: "/login", replace: true });
  };

  return (
    <header className="border-b bg-background">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link to="/" className="text-lg font-semibold">
            Listas e Checklists
          </Link>
          <nav className="hidden gap-4 text-sm md:flex">
            <Link
              to="/tudo"
              className="text-muted-foreground hover:text-foreground"
              activeProps={{ className: "text-foreground font-medium" }}
            >
              Tudo
            </Link>
            {profile?.is_admin && (
              <>
                <Link
                  to="/admin/areas"
                  className="text-muted-foreground hover:text-foreground"
                  activeProps={{ className: "text-foreground font-medium" }}
                >
                  Áreas
                </Link>
                <Link
                  to="/admin/usuarios"
                  className="text-muted-foreground hover:text-foreground"
                  activeProps={{ className: "text-foreground font-medium" }}
                >
                  Usuários
                </Link>
              </>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {profile?.is_admin && (
            <span className="hidden items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary sm:inline-flex">
              <Shield className="h-3 w-3" /> Admin
            </span>
          )}
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {profile?.full_name || user?.email}
          </span>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Sair</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
