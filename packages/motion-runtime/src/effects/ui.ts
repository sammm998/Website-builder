/** Non-decorative behaviours that generated markup may opt into declaratively. */

/** `data-toggle="menu" data-target="<id>"`: toggles aria-expanded and data-open on the target. */
export function toggles(): void {
  for (const btn of document.querySelectorAll<HTMLElement>("[data-toggle][data-target]")) {
    const target = document.getElementById(btn.dataset["target"] ?? "");
    if (!target) continue;
    btn.setAttribute("aria-controls", target.id);
    btn.setAttribute("aria-expanded", "false");
    const set = (open: boolean) => {
      btn.setAttribute("aria-expanded", String(open));
      target.toggleAttribute("data-open", open);
      document.documentElement.toggleAttribute("data-menu-open", open && btn.dataset["toggle"] === "menu");
    };
    btn.addEventListener("click", () => set(btn.getAttribute("aria-expanded") !== "true"));
    target.addEventListener("click", (e) => {
      if ((e.target as Element).closest("a")) set(false);
    });
    addEventListener("keydown", (e) => {
      if (e.key === "Escape" && btn.getAttribute("aria-expanded") === "true") {
        set(false);
        btn.focus();
      }
    });
  }
}

/** Sets html[data-scrolled] and html[data-scroll-dir] for header styling. */
export function scrollState(): void {
  const root = document.documentElement;
  let lastY = scrollY;
  let ticking = false;
  const update = () => {
    const y = scrollY;
    root.toggleAttribute("data-scrolled", y > 40);
    if (Math.abs(y - lastY) > 6) root.setAttribute("data-scroll-dir", y > lastY && y > 200 ? "down" : "up");
    lastY = y;
    ticking = false;
  };
  addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true },
  );
  update();
}
