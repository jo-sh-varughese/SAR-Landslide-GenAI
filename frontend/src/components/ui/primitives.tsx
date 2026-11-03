"use client";

import * as SliderPrimitive from "@radix-ui/react-slider";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { AlertOctagon, AlertTriangle, CheckCircle2, Droplets, Eye, ShieldAlert } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { riskMeta } from "@/lib/hazard";
import type { RiskLevel } from "@/lib/types";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------- Button */
type Variant = "primary" | "ghost" | "subtle";
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }>(
  ({ className, variant = "subtle", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-xl px-3.5 text-[13px] font-medium transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:pointer-events-none disabled:opacity-40",
        "active:scale-[0.98]",
        variant === "primary" &&
          "bg-gradient-to-b from-[#5aa5ff] to-[#3b82f6] text-white shadow-[0_0_0_1px_rgb(255_255_255/0.12)_inset,0_8px_24px_-6px_rgb(76_155_255/0.6)] hover:brightness-110",
        variant === "subtle" && "bg-white/[0.05] text-fg ring-1 ring-white/[0.07] hover:bg-white/[0.09]",
        variant === "ghost" && "text-fg-2 hover:bg-white/[0.06] hover:text-fg",
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";

/* ------------------------------------------------------------- Segmented */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" className={cn("flex rounded-xl bg-black/30 p-[3px] ring-1 ring-white/[0.06]", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex-1 whitespace-nowrap rounded-[9px] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
              size === "md" ? "h-7 px-2.5 text-[12px]" : "h-6 px-2 text-[11px]",
              active ? "bg-white/[0.1] text-fg shadow-[0_1px_2px_rgb(0_0_0/0.4),0_0_0_1px_rgb(255_255_255/0.06)_inset]" : "text-fg-3 hover:text-fg-2",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- Slider */
export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  label: string;
}) {
  return (
    <SliderPrimitive.Root
      className="relative flex h-5 w-full touch-none select-none items-center"
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={([v]) => onChange(v)}
      aria-label={label}
    >
      <SliderPrimitive.Track className="relative h-[3px] grow overflow-hidden rounded-full bg-white/[0.08]">
        <SliderPrimitive.Range className="absolute h-full rounded-full bg-gradient-to-r from-accent/50 to-accent" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border-2 border-accent bg-ink-950 shadow-[0_0_0_4px_rgb(76_155_255/0.15)] transition-shadow hover:shadow-[0_0_0_6px_rgb(76_155_255/0.2)] focus-visible:outline-none focus-visible:shadow-[0_0_0_6px_rgb(76_155_255/0.35)]" />
    </SliderPrimitive.Root>
  );
}

/* ---------------------------------------------------------------- Switch */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onChange}
      aria-label={label}
      className="relative h-[18px] w-8 shrink-0 rounded-full bg-white/[0.1] transition-colors data-[state=checked]:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
    >
      <SwitchPrimitive.Thumb className="block h-[14px] w-[14px] translate-x-[2px] rounded-full bg-white shadow transition-transform duration-150 data-[state=checked]:translate-x-[16px]" />
    </SwitchPrimitive.Root>
  );
}

/* --------------------------------------------------------------- Tooltip */
export function Tip({ content, children, side = "top" }: { content: ReactNode; children: ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <TooltipPrimitive.Root delayDuration={250}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={8}
          className="z-50 max-w-64 rounded-lg bg-ink-700 px-2.5 py-1.5 text-[12px] leading-snug text-fg shadow-xl ring-1 ring-white/10"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export const TipProvider = TooltipPrimitive.Provider;

/* ------------------------------------------------------------------- Kbd */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] border border-white/10 bg-white/[0.06] px-1 font-mono text-[10px] text-fg-2",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/* ------------------------------------------------------------- RiskBadge */
const RISK_ICON: Record<RiskLevel, typeof CheckCircle2> = {
  Safe: CheckCircle2,
  Watch: Eye,
  Warning: AlertTriangle,
  Critical: ShieldAlert,
  Severe: AlertOctagon,
  "Not Applicable": Droplets,
};

export function RiskBadge({ level, size = "md" }: { level: RiskLevel; size?: "sm" | "md" }) {
  const Icon = RISK_ICON[level];
  const { color } = riskMeta(level);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-semibold",
        size === "md" ? "h-7 px-2.5 text-[12px]" : "h-[22px] px-2 text-[11px]",
      )}
      style={{ color, background: `color-mix(in oklab, ${color} 14%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 30%, transparent)` }}
    >
      <Icon className={size === "md" ? "h-3.5 w-3.5" : "h-3 w-3"} strokeWidth={2.4} />
      {level}
    </span>
  );
}

/* ------------------------------------------------------------ Section */
export function Section({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-2.5", className)}>
      <div className="flex items-center justify-between">
        <h3 className="eyebrow">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
