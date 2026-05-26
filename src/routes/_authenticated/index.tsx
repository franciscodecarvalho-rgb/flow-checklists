import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/")({
  component: HomePage,
});

function HomePage() {
  const { profile } = useAuth();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Bem-vindo{profile?.full_name ? `, ${profile.full_name}` : ""}!</h1>
      <p className="text-muted-foreground">
        As listas aparecerão aqui assim que o banco de dados for configurado.
      </p>
    </div>
  );
}
