import { useEffect, useMemo, useState } from 'react'
import { ArchitectureDiagram } from './components/ArchitectureDiagram'
import { ControlsPanel } from './components/ControlsPanel'
import { Eq } from './components/Eq'
import { ExplainerArticle } from './components/ExplainerArticle'
import { Header } from './components/Header'
import { MathPanel } from './components/MathPanel'
import { RealEditPanel } from './components/RealEditPanel'
import { ResultsStage } from './components/ResultsStage'
import { TelemetryCharts } from './components/TelemetryCharts'
import { Timeline } from './components/Timeline'
import { UploadDropzone } from './components/UploadDropzone'
import { runDiffusion, type DiffusionRunResult } from './lib/api'
import { defaultSettings, type Settings } from './lib/settings'
import { Badge, Callout, Panel, SectionHeading } from './components/ui'

export default function App() {
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [result, setResult] = useState<DiffusionRunResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [fps, setFps] = useState(6)

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const handleRun = async () => {
    if (!file) {
      setError('Upload an image first.')
      return
    }
    setLoading(true)
    setError(null)
    setPlaying(false)
    try {
      const res = await runDiffusion({ image: file, ...settings })
      setResult(res)
      setIndex(0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  const currentStep = useMemo(() => result?.steps[Math.min(index, result.steps.length - 1)], [result, index])

  return (
    <div className="min-h-screen">
      <Header />

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-5 pt-14 pb-10 sm:px-8">
        <Badge tone="accent">real DDPM/DDIM math · simulated denoiser · zero GPU, zero model download</Badge>
        <h1 className="font-serif-heading mt-4 max-w-3xl text-[34px] leading-[1.15] font-medium text-(--color-ink) sm:text-[44px]">
          Stable diffusion, traced through one photo of yours.
        </h1>
        <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-(--color-ink-dim)">
          Upload an image. This runs the real forward noising process and the real DDPM/DDIM reverse
          process on it — every equation below is computed live, step by step, on your actual pixels — with
          a trained UNet's noise prediction replaced by an interpolatable oracle so the whole thing runs
          instantly, in your browser's request, with no GPU.
        </p>
        <div className="mt-6">
          <ArchitectureDiagram />
        </div>
      </section>

      {/* Demo */}
      <section id="demo" className="mx-auto max-w-6xl px-5 pb-16 sm:px-8">
        <SectionHeading kicker="Demo" title="Run it on your image">
          Every control below maps directly onto a term in the equations in the Theory section — hover
          nothing, just turn a knob and watch the math panel update with real substituted numbers.
        </SectionHeading>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[340px_1fr]">
          <div className="space-y-5">
            <Panel eyebrow="Input" title="Source image">
              <UploadDropzone file={file} previewUrl={previewUrl} onFile={setFile} />
            </Panel>
            <ControlsPanel
              settings={settings}
              onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))}
              onRandomSeed={() => setSettings((s) => ({ ...s, seed: Math.floor(Math.random() * 1_000_000) }))}
            />
            <button
              type="button"
              onClick={handleRun}
              disabled={loading || !file}
              className="w-full rounded-lg bg-(--color-accent) py-3 text-[14px] font-medium text-(--color-bg) transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? 'Running diffusion…' : 'Run diffusion'}
            </button>
            {error && (
              <Callout tone="danger" label="Error:">
                {error}
              </Callout>
            )}
          </div>

          <div className="space-y-5">
            {!result && !loading && (
              <Panel className="flex min-h-[420px] flex-col items-center justify-center text-center">
                <div className="max-w-sm">
                  <div className="font-serif-heading text-lg text-(--color-ink)">
                    Results appear here
                  </div>
                  <p className="mt-2 text-[14px] leading-relaxed text-(--color-ink-dim)">
                    Upload a photo and click <span className="text-(--color-ink)">Run diffusion</span> to
                    watch it dissolve into noise via <Eq tex="q(x_t|x_0)" /> and reconstruct via ancestral
                    DDPM / deterministic DDIM sampling, frame by frame.
                  </p>
                </div>
              </Panel>
            )}

            {loading && (
              <Panel className="flex min-h-[420px] items-center justify-center">
                <div className="flex items-center gap-3 text-(--color-ink-dim)">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-(--color-border) border-t-(--color-accent)" />
                  computing {settings.steps * 2} frames…
                </div>
              </Panel>
            )}

            {result && currentStep && (
              <>
                <Panel eyebrow={`run ${result.run_id} · ${result.elapsed_ms.toFixed(0)}ms`} title="Trajectory timeline">
                  <Timeline
                    steps={result.steps}
                    index={index}
                    onIndexChange={setIndex}
                    playing={playing}
                    onTogglePlay={() => setPlaying((p) => !p)}
                    fps={fps}
                    onFpsChange={setFps}
                  />
                  <div className="mt-5">
                    <ResultsStage step={currentStep} params={result.params} />
                  </div>
                </Panel>

                <MathPanel step={currentStep} params={result.params} />
                <TelemetryCharts steps={result.steps} index={index} />

                <Panel eyebrow="Side by side" title="Original vs. final reconstruction">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="mb-1.5 text-[11.5px] text-(--color-ink-dim)">original (resized 192×192)</div>
                      <img src={result.original_image} className="w-full rounded-lg border border-(--color-border)" />
                    </div>
                    <div>
                      <div className="mb-1.5 text-[11.5px] text-(--color-ink-dim)">final reconstruction (t=0)</div>
                      <img src={result.final_image} className="w-full rounded-lg border border-(--color-border)" />
                    </div>
                  </div>
                </Panel>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Real editing */}
      <section id="real-edit" className="mx-auto max-w-6xl px-5 pb-16 sm:px-8">
        <SectionHeading kicker="Contrast" title="Now the real thing">
          Everything above is real diffusion math wrapped around a simulated denoiser. This panel is the
          opposite: a real, trained model, actually running.
        </SectionHeading>
        <RealEditPanel />
      </section>

      {/* Theory */}
      <section id="theory" className="border-t border-(--color-border-soft) px-5 py-16 sm:px-8">
        <ExplainerArticle />
      </section>

      <footer className="border-t border-(--color-border-soft) px-5 py-10 sm:px-8">
        <div className="mx-auto max-w-6xl text-[12.5px] text-(--color-ink-faint)">
          <p className="mb-2">
            References: Sohl-Dickstein et al. 2015 · Ho, Jain &amp; Abbeel 2020 (DDPM) · Song, Meng &amp;
            Ermon 2021 (DDIM) · Nichol &amp; Dhariwal 2021 (cosine schedule, IDDPM) · Ho &amp; Salimans 2021
            (classifier-free guidance) · Rombach, Blattmann, Lorenz, Esser &amp; Ommer 2022 (latent
            diffusion / Stable Diffusion).
          </p>
          <p>
            Built as an educational sample project. The diffusion math is real; the VAE, text encoder, and
            noise predictor are simulated stand-ins for trained networks — see Theory §9 for exactly what
            that means.
          </p>
        </div>
      </footer>
    </div>
  )
}
