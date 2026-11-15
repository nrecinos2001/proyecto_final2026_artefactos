import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-border bg-surface p-4 sm:p-5 ${className}`}
    >
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-medium text-muted">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export type Tone = "good" | "warning" | "critical" | "info" | "neutral";

const toneClass: Record<Tone, string> = {
  good: "bg-good-bg text-foreground",
  warning: "bg-warning-bg text-foreground",
  critical: "bg-critical-bg text-foreground",
  info: "bg-info-bg text-foreground",
  neutral: "bg-surface-2 text-muted",
};

const toneIconColor: Record<Tone, string> = {
  good: "text-good",
  warning: "text-warning",
  critical: "text-critical",
  info: "text-water",
  neutral: "text-faint",
};

/** Icono de estado: el color nunca va solo, siempre con forma + texto */
export function StatusIcon({ tone, className = "h-4 w-4" }: { tone: Tone; className?: string }) {
  const color = toneIconColor[tone];
  if (tone === "good")
    return (
      <svg viewBox="0 0 20 20" className={`${className} ${color}`} fill="currentColor" aria-hidden>
        <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.7-9.3a1 1 0 0 0-1.4-1.4L9 10.6 7.7 9.3a1 1 0 0 0-1.4 1.4l2 2a1 1 0 0 0 1.4 0l4-4Z" clipRule="evenodd" />
      </svg>
    );
  if (tone === "warning" || tone === "critical")
    return (
      <svg viewBox="0 0 20 20" className={`${className} ${color}`} fill="currentColor" aria-hidden>
        <path fillRule="evenodd" d="M8.3 2.9a2 2 0 0 1 3.4 0l6.1 10.6A2 2 0 0 1 16.1 16.5H3.9a2 2 0 0 1-1.7-3L8.3 2.9ZM10 7a1 1 0 0 0-1 1v3a1 1 0 1 0 2 0V8a1 1 0 0 0-1-1Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
      </svg>
    );
  return (
    <svg viewBox="0 0 20 20" className={`${className} ${color}`} fill="currentColor" aria-hidden>
      <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm1-11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-2 2.5a1 1 0 0 1 2 0V14a1 1 0 1 1-2 0V9.5Z" clipRule="evenodd" />
    </svg>
  );
}

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${toneClass[tone]}`}
    >
      <StatusIcon tone={tone} className="h-3.5 w-3.5" />
      {children}
    </span>
  );
}

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
}) {
  const styles = {
    primary: "bg-water text-white hover:opacity-90",
    secondary: "border border-border bg-surface hover:bg-surface-2",
    danger: "border border-critical/40 text-critical hover:bg-critical-bg",
    ghost: "text-muted hover:text-foreground hover:bg-surface-2",
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    />
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-critical/30 bg-critical-bg p-4 text-sm">
      <StatusIcon tone="critical" className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="flex-1">{message}</div>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-surface-2 ${className}`} />;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-faint">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm tabular outline-none focus:border-water focus:ring-2 focus:ring-water/20";
