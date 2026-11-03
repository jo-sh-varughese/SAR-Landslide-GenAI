import type { ReactNode } from 'react'
import { Eq } from './Eq'
import { ScheduleComparisonChart } from './ScheduleComparisonChart'
import { Callout, SectionHeading } from './ui'

function P({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-[15px] leading-[1.75] text-(--color-ink-dim)">{children}</p>
}

function H3({ children }: { children: ReactNode }) {
  return <h3 className="font-serif-heading mt-8 mb-2 text-lg font-medium text-(--color-ink)">{children}</h3>
}

export function ExplainerArticle() {
  return (
    <div className="mx-auto max-w-3xl">
      <SectionHeading kicker="Theory" title="How diffusion models actually work">
        A derivation-level walkthrough of the mechanism this demo traces on your image, with citations to
        the original papers and an explicit note, at the end of each section, of what this particular
        implementation simplifies.
      </SectionHeading>

      <article className="font-serif-heading">
        <H3>1 — Latent diffusion, at a glance</H3>
        <P>
          Stable Diffusion (Rombach, Blattmann, Lorenz, Esser &amp; Ommer, "High-Resolution Image Synthesis
          with Latent Diffusion Models," CVPR 2022) is a <em>latent</em> diffusion model: rather than
          running the noising/denoising process on raw pixels, it first compresses an image into a much
          smaller latent grid with a pretrained autoencoder, runs the entire diffusion process there, and
          decodes back to pixels at the end. This is why a consumer GPU can run it at all — an 8× spatial
          downsample means the UNet operates on roughly 1/64th as many spatial locations as the pixel grid.
        </P>
        <P>
          Three learned components cooperate: a <strong>VAE</strong> for perceptual compression, a{' '}
          <strong>UNet</strong> that iteratively predicts noise inside the latent space, and a{' '}
          <strong>text encoder</strong> (CLIP or T5) whose token embeddings the UNet attends to via
          cross-attention at every resolution. This demo reproduces the pipeline's shape and its exact
          diffusion mathematics, and replaces the three trained networks with simple, clearly-labeled
          stand-ins — see §9.
        </P>

        <H3>2 — Perceptual compression</H3>
        <P>
          The encoder <Eq tex="\mathcal{E}" /> maps an <Eq tex="H\times W\times 3" /> image to a{' '}
          <Eq tex="\tfrac{H}{8}\times\tfrac{W}{8}\times 4" /> latent <Eq tex="z = \mathcal{E}(x)" />, trained
          with a KL-regularized autoencoding objective so the latent stays close to a standard normal
          prior — which matters later, because the diffusion process itself assumes it starts from
          approximately unit-variance Gaussian noise. A decoder <Eq tex="\mathcal{D}" /> is trained jointly
          to invert it, <Eq tex="\mathcal{D}(\mathcal{E}(x)) \approx x" />.
        </P>

        <H3>3 — The forward (noising) process</H3>
        <P>
          Diffusion defines a fixed Markov chain that gradually destroys a data sample{' '}
          <Eq tex="x_0 \sim q(x_0)" /> over <Eq tex="T" /> steps by adding a small amount of Gaussian noise
          at each step (Sohl-Dickstein et al. 2015; Ho, Jain &amp; Abbeel, "Denoising Diffusion
          Probabilistic Models," NeurIPS 2020):
        </P>
        <Eq display tex={String.raw`q(x_t \mid x_{t-1}) = \mathcal{N}\!\big(x_t;\ \sqrt{1-\beta_t}\,x_{t-1},\ \beta_t I\big)`} />
        <P>
          Because each step is Gaussian, the chain has a closed form for jumping straight from{' '}
          <Eq tex="x_0" /> to any <Eq tex="x_t" /> without simulating every intermediate step — set{' '}
          <Eq tex="\alpha_t = 1-\beta_t" /> and <Eq tex="\bar\alpha_t = \prod_{s=1}^t \alpha_s" />:
        </P>
        <Eq display tex={String.raw`q(x_t \mid x_0) = \mathcal{N}\!\big(x_t;\ \sqrt{\bar\alpha_t}\,x_0,\ (1-\bar\alpha_t) I\big)`} />
        <P>
          The reparameterization trick turns this into a single deterministic function of a noise draw,
          which is exactly what <code className="rounded bg-(--color-panel-2) px-1 py-0.5 text-[13px]">diffusion.forward_diffuse</code> computes for every frame in the "forward" half of the
          timeline above:
        </P>
        <Eq display tex={String.raw`x_t = \sqrt{\bar\alpha_t}\,x_0 + \sqrt{1-\bar\alpha_t}\,\epsilon,\qquad \epsilon\sim\mathcal N(0,I)`} />
        <P>
          <Eq tex="\bar\alpha_t" /> is the fraction of the original signal's variance still present at step{' '}
          <Eq tex="t" /> — it starts near 1 (clean) and decays toward 0 (pure noise). The chart in §4
          plots it directly.
        </P>

        <H3>4 — Noise schedules</H3>
        <P>
          <Eq tex="\beta_t" /> — how much noise is injected at each step — is a hand-chosen schedule, not
          learned. Two are implemented here, both exactly as published:
        </P>
        <Eq display tex={String.raw`\beta_t^{\text{linear}} = \beta_1 + \tfrac{t-1}{T-1}(\beta_T-\beta_1)`} />
        <Eq
          display
          tex={String.raw`\bar\alpha_t^{\text{cosine}} = \frac{f(t)}{f(0)},\quad f(t)=\cos^2\!\Big(\frac{t/T+s}{1+s}\cdot\frac{\pi}{2}\Big),\quad s=0.008`}
        />
        <div className="my-5">
          <ScheduleComparisonChart />
        </div>

        <H3>5 — Learning to reverse it</H3>
        <P>
          The reverse process <Eq tex="p_\theta(x_{t-1}\mid x_t)" /> is what we actually want — start from
          noise, iteratively remove it, and get a sample. It's intractable in closed form, so a neural
          network approximates it. Ho et al. show that maximizing the variational lower bound on{' '}
          <Eq tex="\log p_\theta(x_0)" /> reduces, after reparameterizing the network to predict the noise{' '}
          <Eq tex="\epsilon" /> instead of the mean directly, to a strikingly simple regression loss:
        </P>
        <Eq display tex={String.raw`L_{\text{simple}} = \mathbb{E}_{x_0,\epsilon,t}\Big[\ \big\|\epsilon - \epsilon_\theta(x_t, t)\big\|^2\ \Big]`} />
        <P>
          <Eq tex="\epsilon_\theta" /> is a UNet: convolutional down/up-sampling blocks with residual
          connections, timestep embeddings injected at every block (so one network handles all noise
          levels), and — in the text-to-image case — cross-attention layers where each spatial location's
          features act as queries against the prompt's token embeddings as keys/values. Training simply
          draws a random <Eq tex="(x_0, t)" />, noises it via §3's closed form, and regresses the network's
          output toward the noise that was actually added.
        </P>
        <P>
          This demo has no trained <Eq tex="\epsilon_\theta" />. It exposes a <em>fidelity</em> slider that
          linearly interpolates between the exact noise (computable because we know <Eq tex="x_0" />) and
          random noise — see §9 for exactly why, and what that still teaches you.
        </P>

        <H3>6 — Reverse sampling: DDPM vs. DDIM</H3>
        <P>
          Given a noise estimate <Eq tex="\hat\epsilon" /> at step <Eq tex="t" />, two different sampling
          rules turn it into <Eq tex="x_{t-1}" />. Both first form Tweedie's point-estimate of the clean
          latent:
        </P>
        <Eq display tex={String.raw`\hat x_0 = \frac{x_t - \sqrt{1-\bar\alpha_t}\,\hat\epsilon}{\sqrt{\bar\alpha_t}}`} />
        <P>
          <strong>DDPM (ancestral, stochastic)</strong> uses the true posterior{' '}
          <Eq tex="q(x_{t-1}\mid x_t, x_0)" /> — itself Gaussian in closed form — and samples from it:
        </P>
        <Eq
          display
          tex={String.raw`\mu_\theta(x_t,t)=\tfrac{1}{\sqrt{\alpha_t}}\Big(x_t-\tfrac{\beta_t}{\sqrt{1-\bar\alpha_t}}\hat\epsilon\Big),\quad x_{t-1}=\mu_\theta+\sigma_t z,\ z\sim\mathcal N(0,I)`}
        />
        <P>
          <strong>DDIM</strong> (Song, Meng &amp; Ermon, "Denoising Diffusion Implicit Models," ICLR 2021)
          instead defines a non-Markovian family of processes with the <em>same</em> marginals{' '}
          <Eq tex="q(x_t\mid x_0)" /> but a deterministic reverse map (setting <Eq tex="\eta=0" />):
        </P>
        <Eq display tex={String.raw`x_{t-1} = \sqrt{\bar\alpha_{t-1}}\,\hat x_0 + \sqrt{1-\bar\alpha_{t-1}}\,\hat\epsilon`} />
        <P>
          No noise is injected, so the same starting point and the same <Eq tex="\hat\epsilon" /> at every
          step always produce the same output — and, importantly, DDIM remains valid when you skip steps
          (evaluate on a strided subsequence of <Eq tex="t" />), which is why it's the standard choice for
          fast, 20–50-step sampling. Toggle the sampler control above and watch the trajectory: DDPM
          re-randomizes at every step (compare noise_rms in the telemetry chart), DDIM doesn't.
        </P>

        <H3>7 — Conditioning and classifier-free guidance</H3>
        <P>
          A prompt only influences generation because the UNet is trained on <em>both</em> conditional and
          unconditional objectives (the caption is randomly dropped ~10% of the time during training).
          At sampling time, Ho &amp; Salimans ("Classifier-Free Diffusion Guidance," NeurIPS Workshop 2021)
          run the network twice — once with the prompt, once without — and extrapolate:
        </P>
        <Eq display tex={String.raw`\hat\epsilon = \epsilon_\theta(x_t,t,\varnothing) + w\big(\epsilon_\theta(x_t,t,c)-\epsilon_\theta(x_t,t,\varnothing)\big)`} />
        <P>
          <Eq tex="w=1" /> recovers plain conditional sampling; <Eq tex="w=0" /> ignores the prompt;{' '}
          <Eq tex="w>1" /> — real Stable Diffusion typically uses 7–8 — pushes <em>past</em> the conditional
          estimate in the direction conditioning moved it, trading sample diversity for prompt adherence.
          Push it too far and images oversaturate and lose coherence, a well-documented failure mode of
          strong guidance.
        </P>

        <H3>8 — Why noise prediction works: the score connection</H3>
        <P>
          There's a second, equivalent way to see all of this. Song &amp; Ermon's score-based generative
          models learn <Eq tex="\nabla_x \log p(x)" /> — the <em>score</em> — and generate samples by
          running Langevin dynamics up the score field from noise. Diffusion models turn out to be a
          discretization of exactly this idea: the noise-prediction network is, up to a known scale factor,
          a score estimator,
        </P>
        <Eq display tex={String.raw`\epsilon_\theta(x_t,t) \approx -\sqrt{1-\bar\alpha_t}\ \nabla_{x_t}\log p(x_t)`} />
        <P>
          so each reverse step is a (noisy, for DDPM) gradient ascent step on the log-density of
          progressively-less-noised data — "denoising" and "following the score toward high-probability
          regions" are the same operation viewed two ways.
        </P>

        <H3>9 — What this demo simulates, precisely</H3>
        <P>
          Everything in §3, §4, §6, and the guidance <em>combination formula</em> in §7 runs exactly as
          written above — <code className="rounded bg-(--color-panel-2) px-1 py-0.5 text-[13px]">backend/app/diffusion.py</code> and{' '}
          <code className="rounded bg-(--color-panel-2) px-1 py-0.5 text-[13px]">schedules.py</code> contain
          no approximations. Three pieces stand in for trained neural networks that this project does not
          have the data or compute to train:
        </P>
        <ul className="mb-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-(--color-ink-dim)">
          <li>
            <strong>The VAE</strong> (§2) is box-filter downsampling / bicubic upsampling — linear,
            untrained, at the same 8× factor. It reproduces the "compress → diffuse small → decompress"
            shape and the blocky character of a small latent grid, not the learned perceptual compression
            that lets a real VAE preserve detail at 8×.
          </li>
          <li>
            <strong>The text encoder</strong> (§7) hashes the prompt into a deterministic pseudo-embedding
            and turns it into a low-frequency spatial bias — illustrating "conditioning nudges the noise
            estimate," not CLIP's actual semantics.
          </li>
          <li>
            <strong>ε_θ itself</strong> (§5) is interpolated between the oracle noise (exact, because{' '}
            <Eq tex="x_0" /> is known — see §3's inverted formula) and random noise, by the <em>fidelity</em>{' '}
            slider. This is the load-bearing simplification: a real UNet's prediction quality is a
            complicated function of architecture, data and training time; fidelity is one honest knob
            standing in for all of it, deliberately exposed rather than hidden.
          </li>
        </ul>
        <Callout label="Try this:">
          set fidelity to 100% and strength to 1.0 — the reverse process should reconstruct your original
          photo almost exactly, since a perfect denoiser inverts the (invertible, given ε) forward process.
          Drop fidelity to ~30% and watch the reconstruction-error chart plateau instead of decaying —
          that plateau is, qualitatively, what an undertrained model's sample quality looks like.
        </Callout>
      </article>
    </div>
  )
}
