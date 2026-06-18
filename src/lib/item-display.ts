// Helpers de exibição compartilhados entre a tela de lista, o ItemSheet e a visão "Tudo".

function daysUntil(dateStr: string | null | undefined): number {
  if (!dateStr) return Number.POSITIVE_INFINITY;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00");
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

export type Badgeish = { label: string; className: string };

// Status é CALCULADO a partir do Prazo (validade): não é mais editável.
// Regra: sem data => "Sem prazo"; data passada => "Vencido";
// faltando até 30 dias => "A vencer"; senão "Vigente".
export function statusFromPrazo(validade: string | null | undefined): Badgeish {
  if (!validade)
    return { label: "Sem prazo", className: "border-border bg-muted text-muted-foreground" };
  const d = daysUntil(validade);
  if (d < 0)
    return {
      label: "Vencido",
      className: "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300",
    };
  if (d <= 30)
    return {
      label: "A vencer",
      className: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    };
  return {
    label: "Vigente",
    className: "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  };
}

export const STATUS_FILTER_OPTIONS = ["Sem prazo", "Vigente", "A vencer", "Vencido"] as const;

export const PRIORIDADE_OPTIONS = [
  { value: "alta", label: "Alta" },
  { value: "media", label: "Média" },
  { value: "baixa", label: "Baixa" },
] as const;

export function prioridadeInfo(p: string | null | undefined): Badgeish {
  switch (p) {
    case "alta":
      return {
        label: "Alta",
        className: "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300",
      };
    case "baixa":
      return {
        label: "Baixa",
        className: "border-border bg-muted text-muted-foreground",
      };
    default:
      return {
        label: "Média",
        className: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      };
  }
}
