export interface Settings {
  prompt: string
  steps: number
  schedule: 'linear' | 'cosine'
  guidance_scale: number
  fidelity: number
  strength: number
  sampler: 'ddpm' | 'ddim'
  seed: number
}

export const defaultSettings: Settings = {
  prompt: 'a red sports car at sunset, cinematic lighting',
  steps: 24,
  schedule: 'cosine',
  guidance_scale: 7.5,
  fidelity: 0.85,
  strength: 0.75,
  sampler: 'ddpm',
  seed: 42,
}
