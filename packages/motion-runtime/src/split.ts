/**
 * Splits an element's text into word/char spans while preserving the accessible name:
 * the original text stays available via aria-label and the spans are aria-hidden.
 */
export interface SplitResult {
  words: HTMLElement[];
  chars: HTMLElement[];
  lines: HTMLElement[][];
  revert: () => void;
}

export function splitText(el: HTMLElement, by: "words" | "chars" | "lines", mask: boolean): SplitResult {
  const original = el.innerHTML;
  const label = el.textContent?.replace(/\s+/g, " ").trim() ?? "";
  const words: HTMLElement[] = [];
  const chars: HTMLElement[] = [];

  const walk = (node: Node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent ?? "";
        const frag = document.createDocumentFragment();
        for (const part of text.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) {
            frag.append(document.createTextNode(" "));
            continue;
          }
          const word = document.createElement("span");
          word.className = "m-word";
          if (by === "chars") {
            for (const ch of Array.from(part)) {
              const c = document.createElement("span");
              c.className = "m-char";
              c.textContent = ch;
              word.append(c);
              chars.push(c);
            }
          } else {
            word.textContent = part;
          }
          if (mask) {
            const m = document.createElement("span");
            m.className = "m-mask";
            m.append(word);
            frag.append(m);
          } else frag.append(word);
          words.push(word);
        }
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE && !(child as Element).matches("br, img, svg")) {
        walk(child);
      }
    }
  };
  walk(el);
  if (label) el.setAttribute("aria-label", label);
  for (const w of el.querySelectorAll(".m-word, .m-mask")) w.setAttribute("aria-hidden", "true");

  const lines: HTMLElement[][] = [];
  if (by === "lines") {
    let top = Number.NaN;
    for (const w of words) {
      const t = Math.round(w.getBoundingClientRect().top);
      if (t !== top) {
        lines.push([]);
        top = t;
      }
      lines[lines.length - 1]!.push(w);
    }
  }
  return {
    words,
    chars,
    lines,
    revert: () => {
      el.innerHTML = original;
      el.removeAttribute("aria-label");
    },
  };
}
