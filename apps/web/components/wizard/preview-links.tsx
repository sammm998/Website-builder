"use client";

import { useState } from "react";
import { ExternalLink, Link2 } from "lucide-react";
import { createPreviewShareAction } from "@/app/actions";
import type { Dict } from "@/lib/i18n";
import { Button, Spinner } from "../ui";

/** "Open in new tab" (owner preview) and "Copy test link" (7-day link that works without logging in). */
export function PreviewLinks({ href, kind, targetId, t }: { href: string; kind: "direction" | "build"; targetId: string; t: Dict["wizard"] }) {
  const [state, setState] = useState<{ busy: boolean; url?: string; error?: string }>({ busy: false });
  const copy = async () => {
    setState({ busy: true });
    const result = await createPreviewShareAction(kind, targetId);
    if (!result.ok || !result.message) return setState({ busy: false, error: result.error });
    const url = result.message;
    // Clipboard can be unavailable (permissions, older browsers): the link is shown either way.
    await navigator.clipboard?.writeText(url).catch(() => {});
    setState({ busy: false, url });
  };
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <a href={href} target="_blank" rel="noopener" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-ink/15 px-4 text-sm hover:bg-ink/5">
          <ExternalLink className="size-3.5" /> {t.openNewTab}
        </a>
        <Button size="sm" variant="secondary" onClick={copy} disabled={state.busy} title={t.testLinkHint}>
          {state.busy ? <Spinner /> : <Link2 className="size-3.5" />} {t.copyTestLink}
        </Button>
      </div>
      {state.url ? (
        <p className="text-xs text-stone" role="status">
          {t.testLinkCopied}{" "}
          <a href={state.url} target="_blank" rel="noopener" className="break-all font-mono underline underline-offset-2" data-testid="test-link">
            {state.url}
          </a>
        </p>
      ) : null}
      {state.error ? <p className="text-xs text-ember">{state.error}</p> : null}
    </div>
  );
}
