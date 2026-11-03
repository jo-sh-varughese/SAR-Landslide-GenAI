import type { DiffusionStep, RunParams } from '../lib/api'
import { Eq } from './Eq'
import { Panel } from './ui'

const f = (v: number, d = 4) => v.toFixed(d)

export function MathPanel({ step, params }: { step: DiffusionStep; params: RunParams }) {
  const ab = step.alpha_bar
  const sqrtAb = Math.sqrt(ab)
  const sqrtOmAb = Math.sqrt(1 - ab)

  return (
    <Panel eyebrow={`t = ${step.t}`} title="Governing equation at this step">
      <div className="space-y-4">
        {step.phase === 'forward' ? (
          <div>
            <div className="mb-2 text-[12.5px] text-(--color-ink-dim)">
              Forward process — closed-form sample from{' '}
              <Eq tex="q(x_t \mid x_0)" /> (no iteration needed to jump straight to any t):
            </div>
            <Eq
              display
              tex={String.raw`x_t = \sqrt{\bar\alpha_t}\,x_0 + \sqrt{1-\bar\alpha_t}\,\epsilon`}
            />
            <Eq
              display
              tex={String.raw`x_{${step.t}} = \underbrace{${f(sqrtAb, 3)}}_{\sqrt{\bar\alpha_t}}\,x_0 + \underbrace{${f(
                sqrtOmAb,
                3,
              )}}_{\sqrt{1-\bar\alpha_t}}\,\epsilon`}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="mb-2 text-[12.5px] text-(--color-ink-dim)">
                Classifier-free guidance (Ho &amp; Salimans 2021) combines the unconditional and
                prompt-conditioned noise estimates:
              </div>
              <Eq display tex={String.raw`\hat\epsilon = \epsilon_\varnothing + w\,(\epsilon_c - \epsilon_\varnothing)`} />
              <div className="text-center text-[12px] text-(--color-ink-faint)">w = {f(params.guidance_scale, 1)}</div>
            </div>
            <div>
              <div className="mb-2 text-[12.5px] text-(--color-ink-dim)">
                {params.sampler === 'ddpm' ? (
                  <>
                    DDPM posterior mean (Ho et al. 2020, eq. 11), then add noise scaled by{' '}
                    <Eq tex="\sigma_t" />:
                  </>
                ) : (
                  <>DDIM deterministic step (Song et al. 2020, eq. 12), η = 0 — no random draw:</>
                )}
              </div>
              {params.sampler === 'ddpm' ? (
                <>
                  <Eq
                    display
                    tex={String.raw`\mu_\theta = \tfrac{1}{\sqrt{\alpha_t}}\Big(x_t - \tfrac{\beta_t}{\sqrt{1-\bar\alpha_t}}\hat\epsilon\Big),\quad x_{t-1} = \mu_\theta + \sigma_t z`}
                  />
                  <div className="text-center text-[12px] text-(--color-ink-faint)">
                    α_t = {f(step.alpha, 3)}, β_t = {f(step.beta, 4)}, ᾱ_t = {f(step.alpha_bar, 4)}
                  </div>
                </>
              ) : (
                <>
                  <Eq
                    display
                    tex={String.raw`x_{t-1} = \sqrt{\bar\alpha_{t-1}}\,\hat x_0 + \sqrt{1-\bar\alpha_{t-1}}\,\hat\epsilon`}
                  />
                  <div className="text-center text-[12px] text-(--color-ink-faint)">ᾱ_t = {f(step.alpha_bar, 4)}</div>
                </>
              )}
            </div>
            <div>
              <div className="mb-2 text-[12.5px] text-(--color-ink-dim)">
                Tweedie's estimate of the clean latent, used above and shown as x̂₀ on the right:
              </div>
              <Eq
                display
                tex={String.raw`\hat x_0 = \frac{x_t - \sqrt{1-\bar\alpha_t}\,\hat\epsilon}{\sqrt{\bar\alpha_t}}`}
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-(--color-border-soft) pt-3 font-mono text-[11.5px] text-(--color-ink-dim)">
          <Metric label="β_t" value={f(step.beta, 5)} />
          <Metric label="α_t" value={f(step.alpha, 5)} />
          <Metric label="ᾱ_t (SNR proxy)" value={f(step.alpha_bar, 5)} />
          <Metric label="SNR_t = ᾱ/(1-ᾱ)" value={f(step.snr, 3)} />
          <Metric label="‖ε̂‖_rms" value={f(step.noise_rms, 4)} />
          {step.mse_to_original !== null && <Metric label="MSE(x̂₀, x₀)" value={f(step.mse_to_original, 5)} />}
        </div>
      </div>
    </Panel>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-(--color-ink-faint)">{label}</span>
      <span className="text-(--color-ink)">{value}</span>
    </div>
  )
}
