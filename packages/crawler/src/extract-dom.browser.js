/* eslint-disable */
// Runs inside the crawled page (Playwright evaluate). Plain JS on purpose: it is injected verbatim,
// so it must not depend on transpiler helpers. Returns a raw, JSON-serializable extraction that is
// normalized and validated on the Node side (see extract.ts).
(() => {
  const MAX_TEXT = 20000;
  const norm = (s) => (s || "").replace(/[\u00a0\u202f]/g, " ").replace(/[ \t\f\v]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
  const oneLine = (s) => norm(s).replace(/\n+/g, " ");
  const abs = (u) => {
    try {
      return new URL(u, document.baseURI).href;
    } catch {
      return "";
    }
  };

  const NOISE = /(cookie|consent|gdpr|cmp-|onetrust|cookiebot|usercentrics|newsletter-popup|modal-backdrop|chat-widget|intercom|hubspot-messages|drift-|crisp-|tidio|zendesk|skip-link|screen-reader|sr-only|visually-hidden)/i;

  const visible = (el) => {
    if (!(el instanceof Element)) return true;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.visibility === "collapse") return false;
    if (Number(cs.opacity) === 0 && !el.querySelector("img,video")) {
      // Opacity 0 is often an entrance animation start state; keep it if it has size.
      const r0 = el.getBoundingClientRect();
      if (r0.width === 0 || r0.height === 0) return false;
    }
    if (el.getAttribute("aria-hidden") === "true" && !el.querySelector("img")) return false;
    if (el.hasAttribute("hidden")) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0 && cs.overflow !== "visible") return false;
    if (cs.position === "fixed" && NOISE.test(`${el.id} ${el.className}`)) return false;
    return true;
  };
  const isNoise = (el) => {
    const id = `${el.id || ""} ${typeof el.className === "string" ? el.className : ""} ${el.getAttribute("role") || ""} ${el.getAttribute("aria-label") || ""}`;
    return NOISE.test(id);
  };

  const INLINE = new Set(["A", "ABBR", "B", "BDI", "BDO", "BR", "CITE", "CODE", "DATA", "DFN", "EM", "I", "KBD", "MARK", "Q", "S", "SAMP", "SMALL", "SPAN", "STRONG", "SUB", "SUP", "TIME", "U", "VAR", "WBR", "FONT", "LABEL"]);
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "CANVAS", "LINK", "META", "HEAD", "OBJECT", "EMBED", "DIALOG"]);
  const HEADING = /^H([1-6])$/;

  const isInlineOnly = (el) => {
    for (const child of el.children) {
      if (SKIP.has(child.tagName)) continue;
      if (!INLINE.has(child.tagName)) return false;
      if (!isInlineOnly(child)) return false;
    }
    return true;
  };

  // ---------------------------------------------------------------------------------------------
  // Media helpers
  // ---------------------------------------------------------------------------------------------
  const imgSrc = (img) => {
    const lazy = img.getAttribute("data-src") || img.getAttribute("data-lazy-src") || img.getAttribute("data-original");
    let src = img.currentSrc || img.src || lazy || "";
    if (!src || src.startsWith("data:")) {
      const srcset = img.getAttribute("data-srcset") || img.getAttribute("srcset") || "";
      const candidates = srcset.split(",").map((s) => s.trim().split(/\s+/)[0]).filter(Boolean);
      src = lazy || candidates[candidates.length - 1] || "";
    }
    if (!src || src.startsWith("data:")) return "";
    return abs(src);
  };

  const classifyImage = (el, src, alt, w, h, inHeader) => {
    const hint = `${src} ${alt} ${el.className || ""} ${el.id || ""} ${el.parentElement ? el.parentElement.className : ""}`.toLowerCase();
    if (/logo|brand/.test(hint) && (inHeader || w < 500)) return "logo";
    const r = el.getBoundingClientRect();
    if (Math.max(w, h, r.width, r.height) <= 72) return /avatar|profile|gravatar|googleusercontent/.test(hint) ? "avatar" : "icon";
    if (/badge|award|certif|trustpilot|google-play|app-store|appstore|googleplay|rating|stars?\b/.test(hint)) return "badge";
    if (/avatar|gravatar|googleusercontent|profile/.test(hint) && r.width < 160) return "avatar";
    if (/\.svg(\?|$)/.test(src)) return "illustration";
    return "photo";
  };

  const mediaFromImg = (img, inHeader) => {
    const src = imgSrc(img);
    if (!src) return null;
    const w = img.naturalWidth || Number(img.getAttribute("width")) || 0;
    const h = img.naturalHeight || Number(img.getAttribute("height")) || 0;
    const r = img.getBoundingClientRect();
    if ((w && w <= 2 && h <= 2) || (r.width > 0 && r.width < 8 && r.height < 8)) return null; // tracking pixels
    const alt = oneLine(img.getAttribute("alt") || "");
    return {
      src,
      alt,
      width: w || Math.round(r.width) || undefined,
      height: h || Math.round(r.height) || undefined,
      kind: "image",
      role: classifyImage(img, src, alt, w, h, inHeader),
    };
  };

  const backgroundMedia = (el) => {
    const bg = getComputedStyle(el).backgroundImage;
    if (!bg || bg === "none") return null;
    const m = /url\(["']?([^"')]+)["']?\)/.exec(bg);
    if (!m || m[1].startsWith("data:")) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 240 || r.height < 160) return null;
    return { src: abs(m[1]), alt: oneLine(el.getAttribute("aria-label") || ""), width: Math.round(r.width), height: Math.round(r.height), kind: "image", role: "background" };
  };

  const videoMedia = (video) => {
    const src = video.currentSrc || video.src || (video.querySelector("source") && video.querySelector("source").src) || "";
    if (!src || src.startsWith("blob:") || src.startsWith("data:")) return null;
    const r = video.getBoundingClientRect();
    return { src: abs(src), alt: oneLine(video.getAttribute("aria-label") || video.getAttribute("title") || ""), width: Math.round(r.width) || undefined, height: Math.round(r.height) || undefined, kind: "video", role: "background" };
  };

  const embedFrom = (frame) => {
    const src = abs(frame.getAttribute("src") || frame.getAttribute("data-src") || "");
    if (!src) return null;
    let kind = "other";
    if (/youtube(-nocookie)?\.com\/embed\//.test(src)) kind = "youtube";
    else if (/player\.vimeo\.com\/video\//.test(src)) kind = "vimeo";
    else if (/google\.[a-z.]+\/maps|maps\.google\./.test(src)) kind = "google-maps";
    return { kind, src, title: oneLine(frame.getAttribute("title") || "") };
  };

  // ---------------------------------------------------------------------------------------------
  // Links & forms
  // ---------------------------------------------------------------------------------------------
  const isButtonLike = (a) => {
    const cs = getComputedStyle(a);
    const bg = cs.backgroundColor;
    const hasBg = bg && bg !== "transparent" && !/rgba\(\d+, \d+, \d+, 0\)/.test(bg);
    const hasBorder = parseFloat(cs.borderTopWidth) > 0 && parseFloat(cs.paddingLeft) >= 8;
    return /btn|button|cta/i.test(`${a.className}`) || a.getAttribute("role") === "button" || (hasBg && parseFloat(cs.paddingLeft) >= 8) || hasBorder;
  };

  const linkFrom = (a) => {
    const href = a.getAttribute("href") || "";
    if (!href || href.startsWith("javascript:")) return null;
    const label = oneLine(a.innerText || a.getAttribute("aria-label") || a.getAttribute("title") || (a.querySelector("img") && a.querySelector("img").alt) || "");
    if (!label) return null;
    let absolute = abs(href);
    let internal = false;
    try {
      const u = new URL(absolute);
      internal = u.hostname.replace(/^www\./, "") === location.hostname.replace(/^www\./, "") && /^https?:$/.test(u.protocol);
    } catch {}
    if (href.startsWith("#")) absolute = href;
    return { label, href: absolute, internal, primary: isButtonLike(a) };
  };

  let formCounter = 0;
  const formFrom = (form) => {
    const fields = [];
    const labelFor = (input) => {
      if (input.id) {
        const l = form.querySelector(`label[for="${CSS.escape(input.id)}"]`);
        if (l) return oneLine(l.innerText);
      }
      const wrap = input.closest("label");
      if (wrap) return oneLine(wrap.innerText);
      return oneLine(input.getAttribute("aria-label") || "");
    };
    for (const input of form.querySelectorAll("input, textarea, select")) {
      const tag = input.tagName.toLowerCase();
      let type = tag === "input" ? (input.getAttribute("type") || "text").toLowerCase() : tag;
      if (["submit", "button", "image", "reset", "file", "password"].includes(type)) continue;
      if (!["text", "email", "tel", "number", "url", "date", "textarea", "select", "checkbox", "radio", "hidden"].includes(type)) type = "text";
      const name = input.getAttribute("name") || input.id || `field-${fields.length + 1}`;
      if (type === "hidden") continue; // hidden tokens belong to the old backend
      fields.push({
        name: name.slice(0, 64),
        type,
        label: labelFor(input),
        placeholder: oneLine(input.getAttribute("placeholder") || ""),
        required: input.required || input.getAttribute("aria-required") === "true",
        options: tag === "select" ? [...input.querySelectorAll("option")].map((o) => oneLine(o.innerText)).filter(Boolean) : [],
      });
    }
    if (fields.length === 0) return null;
    const submit = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
    const submitLabel = submit ? oneLine(submit.innerText || submit.value || "") : "";
    formCounter += 1;
    const isSearch = form.getAttribute("role") === "search" || fields.every((f) => /search|^s$|^q$/i.test(f.name));
    if (isSearch) return null;
    return {
      key: `form-${formCounter}`,
      originalAction: abs(form.getAttribute("action") || location.href),
      method: (form.getAttribute("method") || "post").toLowerCase() === "get" ? "get" : "post",
      fields,
      submitLabel,
    };
  };

  // ---------------------------------------------------------------------------------------------
  // Atom walk: produce ordered content atoms for a subtree
  // ---------------------------------------------------------------------------------------------
  const walkAtoms = (root, inHeader) => {
    const atoms = [];
    const pushLinks = (link) => {
      const last = atoms[atoms.length - 1];
      if (last && last.type === "links") last.links.push(link);
      else atoms.push({ type: "links", links: [link] });
    };
    const visit = (el) => {
      if (!(el instanceof Element)) return;
      if (SKIP.has(el.tagName) && el.tagName !== "SVG") return;
      if (el.tagName === "SVG") return;
      if (!visible(el) || isNoise(el)) return;
      const tag = el.tagName;
      const bg = backgroundMedia(el);
      if (bg) atoms.push({ type: "media", media: bg });

      const hm = HEADING.exec(tag) || (el.getAttribute("role") === "heading" ? [null, el.getAttribute("aria-level") || "2"] : null);
      if (hm) {
        const text = oneLine(el.innerText);
        if (text) atoms.push({ type: "heading", level: Number(hm[1]), text, top: el.getBoundingClientRect().top + scrollY, el });
        for (const img of el.querySelectorAll("img")) {
          const m = mediaFromImg(img, inHeader);
          if (m) atoms.push({ type: "media", media: m });
        }
        return;
      }
      if (tag === "IMG") {
        const m = mediaFromImg(el, inHeader);
        if (m) atoms.push({ type: "media", media: m });
        return;
      }
      if (tag === "PICTURE") {
        const img = el.querySelector("img");
        if (img) visit(img);
        return;
      }
      if (tag === "VIDEO") {
        const m = videoMedia(el);
        if (m) atoms.push({ type: "media", media: m });
        return;
      }
      if (tag === "IFRAME") {
        const e = embedFrom(el);
        if (e && e.kind !== "other") atoms.push({ type: "embed", embed: e });
        return;
      }
      if (tag === "FORM") {
        const f = formFrom(el);
        if (f) {
          atoms.push({ type: "form", form: f });
          return;
        }
      }
      if (tag === "UL" || tag === "OL") {
        const items = [...el.children].filter((li) => li.tagName === "LI" && visible(li));
        const textual = items.every((li) => isInlineOnly(li) && !li.querySelector("img"));
        const allLinks = items.length > 0 && items.every((li) => {
          const anchors = li.querySelectorAll("a");
          return anchors.length === 1 && oneLine(anchors[0].innerText) === oneLine(li.innerText);
        });
        if (allLinks) {
          for (const li of items) {
            const l = linkFrom(li.querySelector("a"));
            if (l) pushLinks(l);
          }
          return;
        }
        if (textual) {
          const texts = items.map((li) => oneLine(li.innerText)).filter(Boolean);
          if (texts.length) atoms.push({ type: "list", ordered: tag === "OL", items: texts });
          return;
        }
        for (const li of items) visit(li);
        return;
      }
      if (tag === "TABLE") {
        const rows = [...el.querySelectorAll("tr")].map((tr) => [...tr.children].map((c) => oneLine(c.innerText)));
        if (rows.length) atoms.push({ type: "table", rows, header: !!el.querySelector("th") });
        return;
      }
      if (tag === "BLOCKQUOTE") {
        const cite = el.querySelector("cite, footer");
        atoms.push({ type: "quote", text: norm(el.innerText.replace(cite ? cite.innerText : "", "")), cite: cite ? oneLine(cite.innerText) : "" });
        return;
      }
      if (tag === "A") {
        const hasBlock = [...el.children].some((c) => !INLINE.has(c.tagName) && c.tagName !== "IMG");
        if (!hasBlock) {
          const img = el.querySelector("img");
          if (img && !oneLine(el.innerText)) {
            const m = mediaFromImg(img, inHeader);
            if (m) atoms.push({ type: "media", media: m });
          }
          const l = linkFrom(el);
          if (l) pushLinks(l);
          return;
        }
        // Card links: walk content, then record the link itself.
        for (const child of el.childNodes) visitNode(child);
        const l = linkFrom(el);
        if (l) pushLinks({ ...l, label: l.label.split(/\n| {2,}/)[0].slice(0, 120) });
        return;
      }
      if (tag === "BUTTON") return; // UI controls (menus, sliders) carry no content
      if (tag === "BR" || tag === "HR") return;

      // Leaf text block: paragraph-like element with only inline content.
      if (tag === "P" || tag === "FIGCAPTION" || tag === "ADDRESS" || tag === "DT" || tag === "DD" || tag === "SUMMARY" || ((tag === "DIV" || tag === "SPAN" || tag === "LI" || tag === "LABEL") && isInlineOnly(el))) {
        const anchors = [...el.querySelectorAll("a")];
        const text = norm(el.innerText);
        if (!text) {
          for (const img of el.querySelectorAll("img")) visit(img);
          return;
        }
        // A wrapper that only contains links is a link group, not a paragraph.
        if (anchors.length && anchors.map((a) => oneLine(a.innerText)).join(" ") === oneLine(text)) {
          for (const a of anchors) {
            const l = linkFrom(a);
            if (l) pushLinks(l);
          }
          return;
        }
        atoms.push({ type: "paragraph", text: text.slice(0, MAX_TEXT) });
        for (const img of el.querySelectorAll("img")) {
          const m = mediaFromImg(img, inHeader);
          if (m) atoms.push({ type: "media", media: m });
        }
        return;
      }
      for (const child of el.childNodes) visitNode(child);
    };
    const visitNode = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = norm(node.textContent);
        if (text && text.length > 1 && node.parentElement && visible(node.parentElement)) atoms.push({ type: "paragraph", text });
        return;
      }
      if (node.nodeType === Node.ELEMENT_NODE) visit(node);
    };
    visitNode(root);
    return atoms;
  };

  // ---------------------------------------------------------------------------------------------
  // Page regions
  // ---------------------------------------------------------------------------------------------
  const body = document.body;
  const pickHeader = () => {
    const explicit = document.querySelector("body > header, body > div > header, [role=banner], header");
    if (explicit && visible(explicit) && explicit.getBoundingClientRect().top < 200) return explicit;
    const nav = document.querySelector("nav");
    if (nav && nav.getBoundingClientRect().top < 200) {
      let el = nav;
      while (el.parentElement && el.parentElement !== body && el.parentElement.getBoundingClientRect().height < 220) el = el.parentElement;
      return el;
    }
    return null;
  };
  const header = pickHeader();
  const footerCandidates = [...document.querySelectorAll("footer, [role=contentinfo]")].filter(visible);
  const footer = footerCandidates.length ? footerCandidates[footerCandidates.length - 1] : null;
  const main = document.querySelector("main, [role=main]") || body;

  const inRegion = (el, region) => region && (region === el || region.contains(el));

  // Content root: descend through single-child wrappers.
  let contentRoot = main;
  for (let i = 0; i < 12; i++) {
    const kids = [...contentRoot.children].filter((c) => !SKIP.has(c.tagName) && visible(c) && !inRegion(c, header) && !inRegion(c, footer) && !(header && c.contains(header)) && !(footer && c.contains(footer)) && !isNoise(c));
    if (kids.length === 1) contentRoot = kids[0];
    else break;
  }
  const bands = [...contentRoot.children].filter((c) => !SKIP.has(c.tagName) && visible(c) && !isNoise(c) && !inRegion(c, header) && !inRegion(c, footer));
  // If header/footer live inside the content root, ignore them; if main is body, also drop them.
  const bandAtoms = bands.map((band) => {
    const clone = band;
    const atoms = walkAtoms(clone, false).filter((a) => !(a.el && (inRegion(a.el, header) || inRegion(a.el, footer))));
    return atoms;
  });

  // Split bands into sections at h1/h2 boundaries, and keep bands as boundaries otherwise.
  const sections = [];
  const flushNew = () => {
    const s = { heading: "", blocks: [] };
    sections.push(s);
    return s;
  };
  const levels = bandAtoms.flat().filter((a) => a.type === "heading").map((a) => a.level);
  const splitLevel = levels.includes(2) ? 2 : levels.includes(3) ? 3 : 2;
  for (const atoms of bandAtoms) {
    if (!atoms.length) continue;
    let current = flushNew();
    for (const atom of atoms) {
      if (atom.type === "heading" && atom.level <= splitLevel) {
        if (current.heading || current.blocks.some((b) => b.type !== "media")) current = flushNew();
        if (!current.heading) {
          current.heading = atom.text;
          current.headingLevel = atom.level;
          continue;
        }
      }
      const { el, top, ...clean } = atom;
      current.blocks.push(clean);
    }
  }
  const nonEmpty = sections.filter((s) => s.heading || s.blocks.length);

  // Hero: the section containing the h1, merged with anything above it; else the first section.
  let heroIndex = nonEmpty.findIndex((s) => s.headingLevel === 1 || s.blocks.some((b) => b.type === "heading" && b.level === 1));
  if (heroIndex < 0 || heroIndex > 2) heroIndex = 0;
  const heroParts = nonEmpty.slice(0, heroIndex + 1);
  const hero = { heading: "", blocks: [] };
  for (const part of heroParts) {
    if (part.heading && !hero.heading && part.headingLevel === 1) hero.heading = part.heading;
    else if (part.heading) hero.blocks.push({ type: "heading", level: part.headingLevel || 2, text: part.heading });
    hero.blocks.push(...part.blocks);
  }
  if (!hero.heading) {
    const h1 = hero.blocks.findIndex((b) => b.type === "heading" && b.level === 1);
    if (h1 >= 0) hero.heading = hero.blocks.splice(h1, 1)[0].text;
  }
  // Merge tiny heading-less fragments into the previous section to avoid dozens of micro sections.
  const rest = [];
  for (const s of nonEmpty.slice(heroIndex + 1)) {
    const prev = rest[rest.length - 1];
    if (prev && !s.heading && s.blocks.length <= 1 && s.blocks.every((b) => b.type !== "media" && b.type !== "form")) prev.blocks.push(...s.blocks);
    else rest.push(s);
  }

  const footerSection = { heading: "", blocks: footer ? walkAtoms(footer, false).map(({ el, top, ...a }) => a) : [] };

  // Navigation & logo
  const nav = [];
  if (header) {
    const seen = new Set();
    for (const a of header.querySelectorAll("a")) {
      if (!visible(a) && !a.closest("nav")) continue;
      // The logo link is captured as the logo, not as a navigation item.
      if (a.querySelector("img, svg") && !oneLine(a.innerText.replace(a.querySelector("svg") ? a.querySelector("svg").textContent : "", ""))) continue;
      const l = linkFrom(a);
      if (!l || seen.has(`${l.href} ${l.label}`)) continue;
      seen.add(`${l.href} ${l.label}`);
      nav.push(l);
    }
  }
  let logo = null;
  let logoSelector = "";
  const logoCandidates = [...(header ? header.querySelectorAll("img, svg") : []), ...document.querySelectorAll('img[class*="logo" i], img[alt*="logo" i], img[src*="logo" i], [class*="logo" i] svg')];
  for (const el of logoCandidates) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 16 || r.height < 10) continue;
    if (el.tagName === "IMG") {
      const m = mediaFromImg(el, true);
      if (m && !/\.svg(\?|$)/i.test(m.src)) {
        logo = { ...m, role: "logo" };
        break;
      }
    }
    // SVG (inline or file): screenshot the element on the Node side.
    el.setAttribute("data-redesign-logo", "1");
    logoSelector = '[data-redesign-logo="1"]';
    break;
  }

  // Facts
  const jsonLd = [];
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      jsonLd.push(JSON.parse(s.textContent || ""));
    } catch {}
  }
  const phones = new Set(), emails = new Set(), socials = new Set();
  for (const a of document.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href") || "";
    if (href.startsWith("tel:")) phones.add(decodeURIComponent(href.slice(4)).trim());
    else if (href.startsWith("mailto:")) emails.add(decodeURIComponent(href.slice(7).split("?")[0]).trim());
    else if (/(facebook|instagram|linkedin|twitter|x|youtube|tiktok|pinterest)\.com\//i.test(href)) socials.add(abs(href));
  }
  const addresses = [...document.querySelectorAll("address")].map((a) => oneLine(a.innerText)).filter(Boolean);

  // Palette: weighted computed colors of key UI elements + brand CSS variables.
  const toHex = (c) => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(c || "");
    if (!m || (m[4] !== undefined && Number(m[4]) < 0.5)) return null;
    return "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("");
  };
  const weights = new Map();
  const add = (hex, w) => hex && weights.set(hex, (weights.get(hex) || 0) + w);
  const rootStyle = getComputedStyle(document.documentElement);
  for (const sheet of [...document.styleSheets]) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of rules || []) {
      if (!rule.style || !/^(:root|html|body)$/.test(rule.selectorText || "")) continue;
      for (const name of rule.style) {
        if (/^--.*(primary|brand|accent|main|theme|highlight)/i.test(name)) {
          const probe = document.createElement("span");
          probe.style.color = rootStyle.getPropertyValue(name).trim();
          document.body.appendChild(probe);
          add(toHex(getComputedStyle(probe).color), 40);
          probe.remove();
        }
      }
    }
  }
  for (const el of document.querySelectorAll('a[class*="btn" i], a[class*="button" i], button, .cta, [class*="cta" i]')) {
    if (!visible(el)) continue;
    add(toHex(getComputedStyle(el).backgroundColor), 12);
  }
  if (header) add(toHex(getComputedStyle(header).backgroundColor), 8);
  for (const h of document.querySelectorAll("h1, h2")) add(toHex(getComputedStyle(h).color), 3);
  for (const a of [...document.querySelectorAll("a")].slice(0, 80)) add(toHex(getComputedStyle(a).color), 1);
  const isNeutral = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return Math.max(r, g, b) - Math.min(r, g, b) < 18;
  };
  const palette = [...weights.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h);
  const brandFirst = [...palette.filter((h) => !isNeutral(h)), ...palette.filter(isNeutral)].slice(0, 8);
  const bodyBg = toHex(getComputedStyle(body).backgroundColor) || "#ffffff";
  const fonts = [...new Set([getComputedStyle(document.querySelector("h1") || body).fontFamily, getComputedStyle(body).fontFamily].map((f) => f.split(",")[0].replace(/["']/g, "").trim()))];

  const meta = (sel) => (document.querySelector(sel) && document.querySelector(sel).getAttribute("content")) || "";
  const og = {};
  for (const m of document.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"]')) {
    const key = m.getAttribute("property") || m.getAttribute("name");
    og[key] = m.getAttribute("content") || "";
  }
  const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(visible).map((h) => ({ level: Number(h.tagName[1]), text: oneLine(h.innerText) })).filter((h) => h.text);
  const mainText = oneLine(main.innerText || "");

  return {
    url: location.href,
    lang: document.documentElement.lang || "",
    title: oneLine(document.title),
    description: meta('meta[name="description"]'),
    canonical: (document.querySelector('link[rel="canonical"]') && abs(document.querySelector('link[rel="canonical"]').getAttribute("href"))) || "",
    hreflang: [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map((l) => ({ lang: l.getAttribute("hreflang"), href: abs(l.getAttribute("href")) })),
    robots: meta('meta[name="robots"]'),
    og,
    logo,
    logoSelector,
    nav,
    hero,
    sections: rest.map(({ headingLevel, ...s }) => s),
    footer: footerSection,
    facts: {
      phones: [...phones],
      emails: [...emails],
      addresses,
      socials: [...socials],
    },
    jsonLd,
    palette: brandFirst,
    background: bodyBg,
    fonts,
    headings,
    wordCount: mainText ? mainText.split(/\s+/).length : 0,
    links: [...document.querySelectorAll("a[href]")].map((a) => abs(a.getAttribute("href"))).filter(Boolean),
  };
})();
