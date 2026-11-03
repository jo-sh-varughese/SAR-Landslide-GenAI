import { ArrowRight, Cloud, Fingerprint, Layers3, Radar, ScanEye, Sigma } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/panels/CommandBar";
import { TerrainHero } from "@/components/landing/TerrainHero";

const AUTHORS = [
  { name: "Johan S Varughese", reg: "B23CS2135" },
  { name: "Aiswarya M S", reg: "B23CS2111" },
  { name: "Nadeema Jahan", reg: "B23CS2146" },
  { name: "Rishika Pratap Jagdale", reg: "B23CS2155" },
];

const PIPELINE = [
  {
    icon: Radar,
    step: "01",
    title: "See through the monsoon",
    body: "Dual-pol Sentinel-1 SAR (VV/VH) penetrates cloud and works at night, exactly when optical satellites go blind and slopes fail.",
  },
  {
    icon: ScanEye,
    step: "02",
    title: "Translate radar to readable imagery",
    body: "A ControlNet-conditioned latent diffusion model turns SAR + DEM into cloud-free pseudo-optical views for responders.",
  },
  {
    icon: Sigma,
    step: "03",
    title: "Score hazard you can explain",
    body: "Real SRTM slope, live Open-Meteo rainfall and terrain relief, combined with fixed, documented weights. Every number is traceable.",
  },
];

const FACTS = [
  { k: "0.45 · 0.40 · 0.15", v: "slope · rain · relief weights" },
  { k: "1000-step", v: "DDPM noise schedule" },
  { k: "256 cells", v: "3D hazard grid per run" },
  { k: "100%", v: "of inputs report provenance" },
];

export default function Landing() {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-ink-950">
      <div className="grid-backdrop pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-accent/10 blur-[120px]" />

      <nav className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <Logo className="h-8 w-8" />
          <span className="text-[14px] font-semibold tracking-tight">SAR-Landslide-GenAI</span>
        </div>
        <div className="flex items-center gap-1 text-[13px]">
          <a href="#method" className="hidden rounded-lg px-3 py-2 text-fg-2 transition hover:text-fg sm:block">Method</a>
          <a href="#team" className="hidden rounded-lg px-3 py-2 text-fg-2 transition hover:text-fg sm:block">Team</a>
          <a href="https://github.com/jo-sh-varughese/SAR-Landslide-GenAI" className="rounded-lg px-3 py-2 text-fg-2 transition hover:text-fg">GitHub</a>
          <Link href="/dashboard" className="ml-2 rounded-xl bg-white px-3.5 py-2 font-medium text-ink-950 transition hover:bg-white/90">
            Open dashboard
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-10 pt-14 text-center md:pt-20">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-white/[0.04] px-3 py-1.5 text-[12px] text-fg-2 ring-1 ring-white/[0.08]">
          <span className="h-1.5 w-1.5 rounded-full bg-safe" />
          Research prototype · Western Ghats, Kerala · 2026
        </div>
        <h1 className="mx-auto mt-6 max-w-4xl text-balance text-[44px] font-semibold leading-[1.02] tracking-[-0.035em] md:text-[72px]">
          Landslide intelligence that{" "}
          <span className="bg-gradient-to-r from-[#7cb8ff] via-[#a8cbff] to-[#f0834f] bg-clip-text text-transparent">sees through clouds.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-balance text-[16px] leading-relaxed text-fg-2 md:text-[18px]">
          Generative SAR-to-optical synthesis paired with an explainable, provenance-aware susceptibility model, on a live 3D map
          built for disaster-management decisions.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="group inline-flex h-12 items-center gap-2 rounded-2xl bg-gradient-to-b from-[#5aa5ff] to-[#3b82f6] px-6 text-[15px] font-medium text-white shadow-[0_0_0_1px_rgb(255_255_255/0.15)_inset,0_12px_40px_-8px_rgb(76_155_255/0.7)] transition hover:brightness-110"
          >
            Launch dashboard
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a href="#method" className="inline-flex h-12 items-center rounded-2xl px-6 text-[15px] font-medium text-fg-2 ring-1 ring-white/10 transition hover:bg-white/[0.04] hover:text-fg">
            How it works
          </a>
        </div>
      </section>

      {/* Visual */}
      <section className="relative z-10 mx-auto max-w-6xl px-6">
        <div className="panel relative h-[300px] overflow-hidden !rounded-3xl md:h-[440px]">
          <TerrainHero />
          <div className="absolute left-5 top-5 flex items-center gap-2 rounded-xl bg-black/50 px-3 py-2 text-[12px] backdrop-blur ring-1 ring-white/10">
            <Cloud className="h-3.5 w-3.5 text-fg-3" />
            <span className="text-fg-2">Cloud cover</span>
            <span className="font-mono text-fg">94%</span>
            <span className="text-fg-3">→ SAR unaffected</span>
          </div>
          <div className="absolute bottom-5 right-5 w-56 rounded-2xl bg-black/55 p-3.5 text-left backdrop-blur ring-1 ring-white/10">
            <div className="eyebrow">Meppadi · Wayanad</div>
            <div className="mt-2 flex items-end justify-between">
              <span className="text-[30px] font-semibold leading-none tracking-tight">0.82</span>
              <span className="rounded-full bg-severe/15 px-2 py-0.5 text-[11px] font-semibold text-severe ring-1 ring-severe/30">Severe</span>
            </div>
            <div className="mt-1 text-[11px] text-fg-3">baseline hazard · documented zone</div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/[0.06] md:grid-cols-4">
          {FACTS.map((f) => (
            <div key={f.v} className="bg-ink-950 px-5 py-5">
              <div className="text-[20px] font-semibold tracking-tight">{f.k}</div>
              <div className="mt-1 text-[12.5px] text-fg-3">{f.v}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Method */}
      <section id="method" className="relative z-10 mx-auto max-w-6xl scroll-mt-10 px-6 py-24">
        <div className="max-w-2xl">
          <div className="eyebrow">Method</div>
          <h2 className="mt-3 text-[32px] font-semibold leading-tight tracking-[-0.02em] md:text-[40px]">
            Generation and decision, deliberately separated.
          </h2>
          <p className="mt-4 text-[15.5px] leading-relaxed text-fg-2">
            The generative model helps people <em>see</em>. It never decides. Hazard comes from a transparent overlay of measured
            inputs, so an imperfect image generator can never corrupt a safety-relevant number.
          </p>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {PIPELINE.map((p) => (
            <div key={p.step} className="panel group p-6 transition hover:-translate-y-0.5">
              <div className="flex items-center justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft ring-1 ring-accent/20">
                  <p.icon className="h-5 w-5 text-accent" />
                </span>
                <span className="font-mono text-[12px] text-fg-3">{p.step}</span>
              </div>
              <h3 className="mt-5 text-[17px] font-semibold tracking-tight">{p.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-fg-2">{p.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="panel p-6">
            <div className="flex items-center gap-2 text-[13px] font-semibold"><Layers3 className="h-4 w-4 text-fg-3" /> Hazard model</div>
            <pre className="mt-4 overflow-x-auto font-mono text-[13px] leading-relaxed text-fg-2">
{`H(p) = 0.45 · f_slope(p)
     + 0.40 · f_rain
     + 0.15 · f_relief(p)
H(p) = 0   if p ∈ water`}
            </pre>
          </div>
          <div className="panel p-6">
            <div className="flex items-center gap-2 text-[13px] font-semibold"><Fingerprint className="h-4 w-4 text-fg-3" /> Provenance by design</div>
            <p className="mt-4 text-[14px] leading-relaxed text-fg-2">
              Every response states whether elevation, rainfall and SAR came from live sources or labelled fallbacks. Open-water
              tiles return <span className="font-mono text-fg">Not Applicable</span> instead of a fabricated score.
            </p>
          </div>
        </div>
      </section>

      {/* Team */}
      <section id="team" className="relative z-10 mx-auto max-w-6xl scroll-mt-10 px-6 pb-24">
        <div className="eyebrow">Project team</div>
        <h2 className="mt-3 text-[32px] font-semibold tracking-[-0.02em]">Built by</h2>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {AUTHORS.map((a) => (
            <div key={a.reg} className="panel p-5">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-white/15 to-white/[0.03] text-[13px] font-semibold ring-1 ring-white/10">
                {a.name.split(" ").filter((w) => w.length > 1).slice(0, 2).map((w) => w[0]).join("")}
              </div>
              <div className="mt-4 text-[15px] font-semibold tracking-tight">{a.name}</div>
              <div className="mt-0.5 font-mono text-[12px] text-fg-3">{a.reg}</div>
            </div>
          ))}
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 text-[12.5px] text-fg-3 md:flex-row md:items-center md:justify-between">
          <span>© 2026 Johan S Varughese, Aiswarya M S, Nadeema Jahan, Rishika Pratap Jagdale</span>
          <span>Research-grade decision support. Not a replacement for KSDMA / IMD alerts.</span>
        </div>
      </footer>
    </main>
  );
}
