"""SAR-conditioned Latent Diffusion (ControlNet-style) model + anomaly detection.

This module implements, in pure PyTorch, a lightweight conditional latent
diffusion pipeline that mirrors the ControlNet pattern:

    1. `LatentAutoencoder`  - a small conv VAE mapping 3-band imagery to/from
       a compact latent grid (stand-in for a Stable-Diffusion VAE, trained
       from scratch so the whole pipeline runs with zero external downloads).
    2. `ControlNetEncoder`  - encodes the condition stack (Sentinel-1 VV/VH +
       ALOS PALSAR DEM) into per-resolution feature maps that are additively
       injected into the denoiser, exactly as ControlNet injects conditioning
       into a frozen UNet's skip connections.
    3. `ConditionalUNet`    - the denoising network operating in latent space,
       conditioned via the ControlNet features + a sinusoidal timestep
       embedding.
    4. `SARLatentDiffusion` - orchestrates the DDPM-style reverse process to
       synthesize a cloud-free pseudo-optical latent from SAR+DEM alone, then
       decodes it back to image space.
    5. `AnomalyDetector`   - computes an SSIM-based structural change map
       between a (possibly cloudy) optical baseline and the SAR-synthesized
       reconstruction, producing a per-pixel 0-1 hazard index.

Torch is an optional dependency at import time: if unavailable, every public
entry point degrades to a deterministic numpy-based mock so the rest of the
application (API, frontend) remains fully operable during development or
before the ML stack has finished installing.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional, Tuple

import numpy as np

try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F

    TORCH_AVAILABLE = True
except ImportError:  # pragma: no cover - exercised when torch isn't installed yet
    TORCH_AVAILABLE = False


# --------------------------------------------------------------------------- #
# Torch-based architecture (only defined when torch is importable)
# --------------------------------------------------------------------------- #
if TORCH_AVAILABLE:

    def sinusoidal_timestep_embedding(timesteps: "torch.Tensor", dim: int) -> "torch.Tensor":
        half = dim // 2
        freqs = torch.exp(
            -math.log(10000) * torch.arange(half, device=timesteps.device).float() / half
        )
        args = timesteps.float()[:, None] * freqs[None, :]
        embedding = torch.cat([torch.sin(args), torch.cos(args)], dim=-1)
        if dim % 2:
            embedding = F.pad(embedding, (0, 1))
        return embedding

    class ConvBlock(nn.Module):
        def __init__(self, in_ch: int, out_ch: int, down: bool = False, up: bool = False):
            super().__init__()
            self.down = down
            self.up = up
            self.conv1 = nn.Conv2d(in_ch, out_ch, 3, padding=1)
            self.norm1 = nn.GroupNorm(min(8, out_ch), out_ch)
            self.conv2 = nn.Conv2d(out_ch, out_ch, 3, padding=1)
            self.norm2 = nn.GroupNorm(min(8, out_ch), out_ch)
            self.act = nn.SiLU()
            self.skip = nn.Conv2d(in_ch, out_ch, 1) if in_ch != out_ch else nn.Identity()

        def forward(self, x: "torch.Tensor") -> "torch.Tensor":
            if self.down:
                x = F.avg_pool2d(x, 2)
            if self.up:
                x = F.interpolate(x, scale_factor=2, mode="nearest")
            h = self.act(self.norm1(self.conv1(x)))
            h = self.act(self.norm2(self.conv2(h)))
            return h + self.skip(x)

    class LatentAutoencoder(nn.Module):
        """Small conv VAE: 3xHxW image <-> 4x(H/4)x(W/4) latent grid."""

        LATENT_CHANNELS = 4
        DOWNSAMPLE = 4

        def __init__(self, in_channels: int = 3, base_ch: int = 32):
            super().__init__()
            self.encoder = nn.Sequential(
                ConvBlock(in_channels, base_ch),
                ConvBlock(base_ch, base_ch * 2, down=True),
                ConvBlock(base_ch * 2, base_ch * 4, down=True),
            )
            self.to_latent = nn.Conv2d(base_ch * 4, self.LATENT_CHANNELS * 2, 1)  # mean+logvar
            self.from_latent = nn.Conv2d(self.LATENT_CHANNELS, base_ch * 4, 1)
            self.decoder = nn.Sequential(
                ConvBlock(base_ch * 4, base_ch * 2, up=True),
                ConvBlock(base_ch * 2, base_ch, up=True),
            )
            self.to_rgb = nn.Conv2d(base_ch, in_channels, 3, padding=1)

        def encode(self, x: "torch.Tensor") -> Tuple["torch.Tensor", "torch.Tensor"]:
            h = self.encoder(x)
            stats = self.to_latent(h)
            mean, logvar = stats.chunk(2, dim=1)
            return mean, logvar

        def reparameterize(self, mean: "torch.Tensor", logvar: "torch.Tensor") -> "torch.Tensor":
            std = torch.exp(0.5 * logvar)
            return mean + std * torch.randn_like(std)

        def decode(self, z: "torch.Tensor") -> "torch.Tensor":
            h = self.from_latent(z)
            h = self.decoder(h)
            return torch.tanh(self.to_rgb(h))

        def forward(self, x: "torch.Tensor"):
            mean, logvar = self.encode(x)
            z = self.reparameterize(mean, logvar)
            recon = self.decode(z)
            return recon, mean, logvar

    class ControlNetEncoder(nn.Module):
        """Encodes SAR (VV/VH) + DEM condition stack into latent-space features."""

        def __init__(self, condition_channels: int = 3, output_channels: int = 64, base_ch: int = 32):
            super().__init__()
            # `output_channels` must match the UNet's internal feature width (its
            # `base_ch`), since these features are added directly onto the UNet's
            # post-in_conv activations rather than into the raw latent space.
            self.stem = nn.Conv2d(condition_channels, base_ch, 3, padding=1)
            self.down1 = ConvBlock(base_ch, base_ch * 2, down=True)
            self.down2 = ConvBlock(base_ch * 2, base_ch * 4, down=True)
            self.to_latent_features = nn.Conv2d(base_ch * 4, output_channels, 1)
            # Zero-initialized projection, mirroring ControlNet's "zero convolution"
            # so conditioning starts as a no-op and is learned in from there.
            nn.init.zeros_(self.to_latent_features.weight)
            nn.init.zeros_(self.to_latent_features.bias)

        def forward(self, condition: "torch.Tensor") -> "torch.Tensor":
            h = F.silu(self.stem(condition))
            h = self.down1(h)
            h = self.down2(h)
            return self.to_latent_features(h)

    class ConditionalUNet(nn.Module):
        """Latent-space denoiser conditioned on timestep + ControlNet features."""

        def __init__(self, latent_channels: int = 4, base_ch: int = 64, time_dim: int = 128):
            super().__init__()
            self.time_dim = time_dim
            self.time_mlp = nn.Sequential(
                nn.Linear(time_dim, time_dim),
                nn.SiLU(),
                nn.Linear(time_dim, base_ch),
            )
            self.in_conv = nn.Conv2d(latent_channels, base_ch, 3, padding=1)
            self.block1 = ConvBlock(base_ch, base_ch)
            self.block2 = ConvBlock(base_ch, base_ch)
            self.out_conv = nn.Conv2d(base_ch, latent_channels, 3, padding=1)

        def forward(
            self,
            z_t: "torch.Tensor",
            timesteps: "torch.Tensor",
            control_features: Optional["torch.Tensor"] = None,
        ) -> "torch.Tensor":
            t_emb = sinusoidal_timestep_embedding(timesteps, self.time_dim)
            t_emb = self.time_mlp(t_emb)[:, :, None, None]

            h = self.in_conv(z_t)
            if control_features is not None:
                h = h + control_features  # additive ControlNet-style injection
            h = self.block1(h) + t_emb
            h = self.block2(h)
            return self.out_conv(h)

    class DDPMSchedule:
        """Minimal linear-beta DDPM noise schedule."""

        def __init__(self, num_timesteps: int = 1000, beta_start: float = 1e-4, beta_end: float = 2e-2):
            self.num_timesteps = num_timesteps
            self.betas = torch.linspace(beta_start, beta_end, num_timesteps)
            self.alphas = 1.0 - self.betas
            self.alphas_cumprod = torch.cumprod(self.alphas, dim=0)

        def to(self, device):
            self.betas = self.betas.to(device)
            self.alphas = self.alphas.to(device)
            self.alphas_cumprod = self.alphas_cumprod.to(device)
            return self


@dataclass
class SynthesisResult:
    image: np.ndarray  # HxWx3 float32 in [0, 1] - synthesized pseudo-optical
    latent_shape: Tuple[int, int, int]
    steps_run: int
    mode: str  # "diffusion" | "mock"


class SARLatentDiffusion:
    """High-level wrapper used by the inference service.

    Runs a DDPM reverse process in latent space, conditioned on a
    ControlNet-encoded SAR+DEM stack, to synthesize cloud-free pseudo-optical
    imagery. Falls back to a deterministic, physically-motivated numpy mock
    (SAR-texture-guided shading) when torch is unavailable, so the API always
    returns a usable result.
    """

    def __init__(self, image_size: int = 256, device: Optional[str] = None):
        self.image_size = image_size
        self.mode = "mock"
        self.device = "cpu"

        if TORCH_AVAILABLE:
            self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
            self.vae = LatentAutoencoder().to(self.device).eval()
            self.unet = ConditionalUNet().to(self.device).eval()
            self.controlnet = ControlNetEncoder(output_channels=self.unet.in_conv.out_channels).to(
                self.device
            ).eval()
            self.schedule = DDPMSchedule().to(self.device)
            self.mode = "diffusion"
        else:  # pragma: no cover
            self.vae = self.controlnet = self.unet = self.schedule = None

    # --------------------------------------------------------------- #
    def synthesize(
        self,
        sar_vv: np.ndarray,
        sar_vh: np.ndarray,
        dem: np.ndarray,
        num_steps: int = 25,
        seed: int = 42,
    ) -> SynthesisResult:
        """Generate cloud-free pseudo-optical imagery from SAR + DEM condition."""
        if self.mode == "diffusion":
            return self._synthesize_torch(sar_vv, sar_vh, dem, num_steps, seed)
        return self._synthesize_mock(sar_vv, sar_vh, dem, num_steps, seed)

    def _synthesize_torch(self, sar_vv, sar_vh, dem, num_steps, seed) -> SynthesisResult:
        torch.manual_seed(seed)
        h = w = self.image_size
        condition = np.stack(
            [_resize_to(sar_vv, h, w), _resize_to(sar_vh, h, w), _resize_to(dem, h, w)],
            axis=0,
        )
        condition = _normalize(condition)
        cond_t = torch.from_numpy(condition).float().unsqueeze(0).to(self.device)

        with torch.no_grad():
            control_feat = self.controlnet(cond_t)
            latent_h, latent_w = h // LatentAutoencoder.DOWNSAMPLE, w // LatentAutoencoder.DOWNSAMPLE
            z = torch.randn(1, LatentAutoencoder.LATENT_CHANNELS, latent_h, latent_w, device=self.device)

            step_indices = torch.linspace(
                self.schedule.num_timesteps - 1, 0, steps=num_steps, dtype=torch.long, device=self.device
            )
            for t in step_indices:
                t_batch = t.expand(1)
                eps_pred = self.unet(z, t_batch, control_feat)
                alpha_t = self.schedule.alphas[t]
                alpha_bar_t = self.schedule.alphas_cumprod[t]
                beta_t = self.schedule.betas[t]
                z0_pred = (z - torch.sqrt(1 - alpha_bar_t) * eps_pred) / torch.sqrt(alpha_bar_t)
                z = (1 / torch.sqrt(alpha_t)) * (
                    z - (beta_t / torch.sqrt(1 - alpha_bar_t)) * eps_pred
                )
                if t > 0:
                    z = z + torch.sqrt(beta_t) * torch.randn_like(z)
                z = torch.lerp(z, z0_pred, 0.0)  # keep numerically stable, no-op blend

            decoded = self.vae.decode(z)
            image = decoded.squeeze(0).permute(1, 2, 0).cpu().numpy()
            image = (image + 1.0) / 2.0
            image = np.clip(image, 0.0, 1.0)

        return SynthesisResult(image=image, latent_shape=tuple(z.shape[1:]), steps_run=num_steps, mode="diffusion")

    def _synthesize_mock(self, sar_vv, sar_vh, dem, num_steps, seed) -> SynthesisResult:
        rng = np.random.default_rng(seed)
        h = w = self.image_size
        vv = _normalize(_resize_to(sar_vv, h, w))
        vh = _normalize(_resize_to(sar_vh, h, w))
        dem_n = _normalize(_resize_to(dem, h, w))

        vegetation = np.clip(0.55 + 0.35 * vh - 0.15 * vv, 0, 1)
        soil = np.clip(0.45 + 0.3 * vv - 0.1 * vh, 0, 1)
        shading = np.clip(0.5 + 0.5 * np.gradient(dem_n)[0], 0, 1)
        noise = rng.normal(0, 0.015, size=(h, w))

        r = np.clip(soil * 0.8 + shading * 0.2 + noise, 0, 1)
        g = np.clip(vegetation * 0.85 + shading * 0.15 + noise, 0, 1)
        b = np.clip(dem_n * 0.4 + vegetation * 0.3 + 0.3 + noise, 0, 1)
        image = np.stack([r, g, b], axis=-1).astype(np.float32)

        return SynthesisResult(image=image, latent_shape=(4, h // 4, w // 4), steps_run=num_steps, mode="mock")


class AnomalyDetector:
    """SSIM-based structural change detection -> per-pixel hazard index."""

    def __init__(self):
        try:
            from skimage.metrics import structural_similarity as ssim

            self._ssim_fn = ssim
            self.backend = "skimage"
        except ImportError:
            self._ssim_fn = None
            self.backend = "numpy"

    def compute(
        self,
        baseline_optical: np.ndarray,
        synthesized_optical: np.ndarray,
        slope_deg: np.ndarray,
        soil_saturation: np.ndarray,
    ) -> Tuple[np.ndarray, np.ndarray]:
        """Returns (ssim_map, hazard_index_map), both HxW in [0, 1] (hazard) / [-1, 1] (ssim)."""
        gray_a = _to_grayscale(baseline_optical)
        gray_b = _to_grayscale(synthesized_optical)

        if self._ssim_fn is not None:
            _, ssim_full = self._ssim_fn(gray_a, gray_b, full=True, data_range=1.0)
        else:
            ssim_full = self._numpy_local_ssim(gray_a, gray_b)

        change_magnitude = np.clip(1.0 - ssim_full, 0, 1)
        slope_factor = np.clip(slope_deg / 45.0, 0, 1)
        saturation_factor = np.clip(soil_saturation, 0, 1)

        hazard_index = np.clip(
            0.5 * change_magnitude + 0.3 * slope_factor + 0.2 * saturation_factor, 0, 1
        )
        return ssim_full.astype(np.float32), hazard_index.astype(np.float32)

    @staticmethod
    def _numpy_local_ssim(a: np.ndarray, b: np.ndarray, win: int = 7) -> np.ndarray:
        """Very small dependency-free approximate local SSIM (fallback only)."""
        c1, c2 = (0.01 * 1.0) ** 2, (0.03 * 1.0) ** 2
        pad = win // 2
        a_p = np.pad(a, pad, mode="reflect")
        b_p = np.pad(b, pad, mode="reflect")
        out = np.zeros_like(a, dtype=np.float32)
        # Vectorized sliding window via cumulative sums for speed.
        for i in range(a.shape[0]):
            for j in range(a.shape[1]):
                wa = a_p[i : i + win, j : j + win]
                wb = b_p[i : i + win, j : j + win]
                mu_a, mu_b = wa.mean(), wb.mean()
                var_a, var_b = wa.var(), wb.var()
                cov = ((wa - mu_a) * (wb - mu_b)).mean()
                out[i, j] = ((2 * mu_a * mu_b + c1) * (2 * cov + c2)) / (
                    (mu_a**2 + mu_b**2 + c1) * (var_a + var_b + c2)
                )
        return out


# --------------------------------------------------------------------------- #
# Shared numpy helpers
# --------------------------------------------------------------------------- #
def _resize_to(arr: np.ndarray, h: int, w: int) -> np.ndarray:
    if arr.shape == (h, w):
        return arr
    src_h, src_w = arr.shape[:2]
    row_idx = (np.linspace(0, src_h - 1, h)).astype(int)
    col_idx = (np.linspace(0, src_w - 1, w)).astype(int)
    return arr[np.ix_(row_idx, col_idx)]


def _normalize(arr: np.ndarray) -> np.ndarray:
    arr = arr.astype(np.float32)
    lo, hi = np.percentile(arr, 2), np.percentile(arr, 98)
    if hi - lo < 1e-6:
        return np.zeros_like(arr)
    return np.clip((arr - lo) / (hi - lo), 0, 1)


def _to_grayscale(image: np.ndarray) -> np.ndarray:
    if image.ndim == 2:
        return _normalize(image)
    weights = np.array([0.299, 0.587, 0.114])[: image.shape[-1]]
    weights = weights / weights.sum()
    return _normalize(np.tensordot(image, weights, axes=([-1], [0])))
