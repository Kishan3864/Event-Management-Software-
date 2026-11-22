"use client";

import { ArrowLeft, Search, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------ page header
export function PageHeader({
  title,
  subtitle,
  actions,
  back,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: string | boolean;
  className?: string;
}) {
  const router = useRouter();
  return (
    <div data-tour="page-header" className={cn("mb-5 flex flex-wrap items-start gap-3 lg:mb-6", className)}>
      {back ? (
        <Button
          variant="outline"
          size="icon"
          className="mt-0.5 shrink-0 rounded-full bg-card"
          aria-label="Back"
          onClick={() => (typeof back === "string" ? router.push(back) : router.back())}
        >
          <ArrowLeft />
        </Button>
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl leading-tight font-semibold tracking-tight lg:text-2xl">{title}</h1>
        {subtitle ? <div className="mt-0.5 text-sm text-muted-foreground">{subtitle}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

// ------------------------------------------------------------ section card
export function Section({
  title,
  icon: Icon,
  action,
  children,
  className,
  contentClassName,
}: {
  title?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn("gap-0 py-0", className)}>
      {title ? (
        <div className="flex items-center gap-2 px-4 pt-4 pb-3 sm:px-5">
          {Icon ? (
            <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-primary">
              <Icon className="size-4" />
            </span>
          ) : null}
          <h2 className="flex-1 text-[15px] font-semibold tracking-tight">{title}</h2>
          {action}
        </div>
      ) : null}
      <div className={cn("px-4 pb-4 sm:px-5", !title && "pt-4", contentClassName)}>{children}</div>
    </Card>
  );
}

// ------------------------------------------------------------ empty state
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card/60 px-6 py-10 text-center", className)}>
      <span className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-accent text-primary">
        <Icon className="size-6" />
      </span>
      <p className="font-semibold">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

// ------------------------------------------------------------ stat card
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  href,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: LucideIcon;
  tone?: "default" | "brand" | "success" | "warning" | "danger" | "info" | "gold";
  href?: string;
  className?: string;
}) {
  const tones: Record<string, string> = {
    default: "bg-muted text-foreground",
    brand: "bg-accent text-primary",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-destructive",
    info: "bg-info-soft text-info",
    gold: "bg-gold-soft text-gold",
  };
  const body = (
    <Card
      className={cn(
        "h-full gap-0 p-4 transition-all duration-200",
        href && "hover:-translate-y-0.5 hover:shadow-lift active:translate-y-0",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] leading-tight font-medium text-muted-foreground">{label}</p>
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", tones[tone])}>
          <Icon className="size-[18px]" />
        </span>
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div> : null}
    </Card>
  );
  return href ? (
    <Link href={href} className="block rounded-2xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
      {body}
    </Link>
  ) : (
    body
  );
}

// ------------------------------------------------------------ tone badge
export function ToneBadge({
  tone,
  children,
  className,
}: {
  tone: "default" | "brand" | "success" | "warning" | "danger" | "info" | "gold" | "muted";
  children: ReactNode;
  className?: string;
}) {
  const tones: Record<string, string> = {
    default: "bg-secondary text-secondary-foreground",
    brand: "bg-accent text-primary",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-destructive",
    info: "bg-info-soft text-info",
    gold: "bg-gold-soft text-gold",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <Badge variant="secondary" className={cn("h-6 rounded-full px-2.5 text-[11.5px] font-medium", tones[tone], className)}>
      {children}
    </Badge>
  );
}

// ------------------------------------------------------------ form field
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label?: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {label ? (
        <Label htmlFor={htmlFor} className="text-[13px] font-medium text-foreground/80">
          {label}
          {required ? <span className="text-destructive">*</span> : null}
        </Label>
      ) : null}
      {children}
      {error ? (
        <p className="text-xs font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------ number input
type NumInputProps = Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: number | "" | null | undefined;
  onValueChange: (v: number | "") => void;
  decimals?: boolean;
  prefix?: string;
};

export function NumInput({ value, onValueChange, decimals = true, prefix, className, ...rest }: NumInputProps) {
  const input = (
    <Input
      {...rest}
      type="text"
      inputMode={decimals ? "decimal" : "numeric"}
      autoComplete="off"
      value={value === null || value === undefined ? "" : String(value)}
      onChange={(e) => {
        let v = e.target.value.replace(/,/g, "");
        if (v === "") return onValueChange("");
        if (decimals ? !/^\d*\.?\d{0,2}$/.test(v) : !/^\d*$/.test(v)) return;
        if (v.startsWith(".")) v = "0" + v;
        if (v.endsWith(".")) {
          // keep typing state: store as string-ish number later
          onValueChange(v as unknown as number);
          return;
        }
        onValueChange(Number(v));
      }}
      onFocus={(e) => {
        e.currentTarget.select();
        rest.onFocus?.(e);
      }}
      className={cn("tabular", prefix && "pl-7", className)}
    />
  );
  if (!prefix) return input;
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">{prefix}</span>
      {input}
    </div>
  );
}

export const num = (v: number | "" | null | undefined | string) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ------------------------------------------------------------ chip group (single select)
export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  className,
  size = "md",
}: {
  options: { value: T; label: ReactNode; icon?: LucideIcon }[];
  value: T | null | undefined;
  onChange: (v: T) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)} role="radiogroup">
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            type="button"
            role="radio"
            aria-checked={active}
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border font-medium transition-all duration-150 active:scale-[0.97]",
              size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm",
              active
                ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                : "border-border bg-card text-foreground/80 hover:border-primary/40 hover:bg-accent"
            )}
          >
            {Icon ? <Icon className="size-4" /> : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------ search box
export function SearchBox({
  value,
  onChange,
  placeholder = "Search…",
  className,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 rounded-full pr-10 pl-10"
        type="search"
        enterKeyHint="search"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------ skeletons
export function ListSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Card key={i} className="flex-row items-center gap-3 p-4">
          <Skeleton className="size-12 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </Card>
      ))}
    </div>
  );
}

export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="gap-3 p-4">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-7 w-2/3" />
        </Card>
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <StatsSkeleton />
      <ListSkeleton rows={4} />
    </div>
  );
}

// ------------------------------------------------------------ key/value row
export function KV({ label, value, className, strong }: { label: ReactNode; value: ReactNode; className?: string; strong?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-1.5 text-sm", className)}>
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("text-right tabular", strong && "font-semibold")}>{value}</span>
    </div>
  );
}
