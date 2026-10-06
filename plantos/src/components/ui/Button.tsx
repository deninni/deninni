import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const V: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent/85 border-accent",
  secondary: "bg-surface-elevated text-foreground hover:bg-surface-elevated/70 border-border",
  ghost: "bg-transparent text-muted hover:text-foreground border-transparent",
  danger: "bg-status-fault/15 text-status-fault border-status-fault/40 hover:bg-status-fault/25",
};

export function Button({ variant = "secondary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`focus-ring inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border px-3 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-8 ${V[variant]} ${className}`}
    />
  );
}
