import { useCallback, useRef, useState } from 'react'
import clsx from 'clsx'

export function UploadDropzone({
  file,
  onFile,
  previewUrl,
}: {
  file: File | null
  onFile: (f: File) => void
  previewUrl: string | null
}) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const f = files?.[0]
      if (f && f.type.startsWith('image/')) onFile(f)
    },
    [onFile],
  )

  return (
    <div
      className={clsx(
        'relative flex min-h-[220px] flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition-colors',
        dragging ? 'border-(--color-accent) bg-(--color-accent-dim)/10' : 'border-(--color-border)',
      )}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        handleFiles(e.dataTransfer.files)
      }}
    >
      {previewUrl ? (
        <>
          <img src={previewUrl} alt="upload preview" className="h-full max-h-[220px] w-full object-cover" />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="absolute right-2 bottom-2 rounded-md border border-(--color-border) bg-(--color-bg)/85 px-2.5 py-1 text-xs font-medium text-(--color-ink) backdrop-blur hover:border-(--color-accent)"
          >
            Change image
          </button>
          {file && (
            <span className="absolute top-2 left-2 rounded-md border border-(--color-border) bg-(--color-bg)/85 px-2 py-0.5 font-mono text-[10.5px] text-(--color-ink-dim) backdrop-blur">
              {file.name}
            </span>
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex flex-col items-center gap-2 px-6 py-10 text-center"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-(--color-ink-faint)">
            <path
              d="M4 16.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1.5M7.5 8.5 12 4l4.5 4.5M12 4v12"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-sm font-medium text-(--color-ink)">Drop an image, or click to browse</span>
          <span className="text-xs text-(--color-ink-faint)">
            Cropped to a square, resized to 192×192 — any photo works
          </span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  )
}
