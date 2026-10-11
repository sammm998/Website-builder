"use client";

import { useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import clsx from "clsx";

/** Sandboxed live preview with a desktop/mobile toggle. */
export function DeviceFrame({ src, title, labels, className }: { src: string; title: string; labels: { desktop: string; mobile: string }; className?: string }) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  return (
    <div className={clsx("grid min-h-0 grid-rows-[auto_1fr] gap-3", className)}>
      <div className="flex justify-center gap-1 rounded-full bg-ink/5 p-1 justify-self-center" role="tablist">
        {(["desktop", "mobile"] as const).map((d) => (
          <button key={d} role="tab" aria-selected={device === d} onClick={() => setDevice(d)} className={clsx("inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm transition", device === d ? "bg-chalk shadow-sm" : "text-stone")}>
            {d === "desktop" ? <Monitor className="size-4" /> : <Smartphone className="size-4" />}
            {labels[d]}
          </button>
        ))}
      </div>
      <div className="grid min-h-0 place-items-center overflow-hidden rounded-2xl bg-ink/[0.04]">
        <iframe
          key={src}
          src={src}
          title={title}
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
          className={clsx("h-full border-0 bg-white transition-[width] duration-500 ease-expo", device === "desktop" ? "w-full" : "w-[390px] rounded-[2rem] shadow-xl ring-8 ring-ink")}
        />
      </div>
    </div>
  );
}
