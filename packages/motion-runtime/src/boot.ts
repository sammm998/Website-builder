// Tiny synchronous boot script (in <head>): flags JS so armed initial states can apply without a
// flash, and guarantees content becomes visible even if the main runtime never loads.
(() => {
  const root = document.documentElement;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    root.classList.add("m-reduced");
    return;
  }
  root.classList.add("m-pending");
  setTimeout(() => {
    if (!root.classList.contains("m-armed")) root.classList.remove("m-pending");
  }, 2500);
})();
