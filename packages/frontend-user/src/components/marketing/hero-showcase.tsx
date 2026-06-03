'use client';

import { useState, type ReactNode } from 'react';

type HeroShowcaseSlide = 'video' | 'workspace';

export function HeroShowcase({
  video,
  workspace,
}: {
  video: ReactNode;
  workspace: ReactNode;
}) {
  const [activeSlide, setActiveSlide] = useState<HeroShowcaseSlide>('video');

  return (
    <div className="relative mx-auto mt-[72px] w-full max-w-[1100px] overflow-visible pb-16">
      <div className="relative" style={{ aspectRatio: '1100 / 720' }}>
        <div
          aria-hidden={activeSlide !== 'video'}
          className={`absolute inset-0 transition-opacity duration-700 ease-out ${
            activeSlide === 'video' ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          {video}
        </div>

        <div
          aria-hidden={activeSlide !== 'workspace'}
          className={`absolute inset-0 transition-opacity duration-700 ease-out ${
            activeSlide === 'workspace' ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          {workspace}
        </div>
      </div>

      <div className="absolute bottom-0 left-1/2 z-50 flex -translate-x-1/2 items-center rounded-full border border-[rgba(20,22,26,0.10)] bg-white/90 p-1 shadow-[0_18px_40px_-28px_rgba(20,22,26,0.50)] backdrop-blur">
        {([
          ['video', 'Video'],
          ['workspace', 'Workspace'],
        ] as const).map(([slide, label]) => (
          <button
            key={slide}
            type="button"
            aria-label={slide === 'video' ? 'Show product video' : 'Show product workspace'}
            aria-pressed={activeSlide === slide}
            className={`h-9 rounded-full px-4 text-[12px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6f8a78] ${
              activeSlide === slide
                ? 'bg-[#6f8a78] text-white shadow-[0_10px_24px_-18px_rgba(20,22,26,0.70)]'
                : 'text-muted-foreground hover:bg-[rgba(20,22,26,0.05)] hover:text-foreground'
            }`}
            onClick={() => setActiveSlide(slide)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
