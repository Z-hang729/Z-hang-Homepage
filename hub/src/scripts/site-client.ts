import {installAcademicFigures} from './academic-reader.js';
installAcademicFigures();
const base = import.meta.env.BASE_URL;
const toast = (message: string) => {
  const el = document.querySelector("#toast");
  if (el) {
    el.textContent = message;
    el.classList.add("visible");
    setTimeout(() => el.classList.remove("visible"), 2500);
  }
};
const themeToggle = document.querySelector<HTMLButtonElement>(".theme-toggle");
const updateThemeLabel = () => {
  if (!themeToggle) return;
  const dark = document.documentElement.dataset.theme === "dark";
  themeToggle.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
};
updateThemeLabel();
themeToggle?.addEventListener("click", () => {
  const next =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("zh-theme", next);
  } catch {}
  updateThemeLabel();
  document.dispatchEvent(new Event("themechange"));
});
const menuToggle = document.querySelector<HTMLButtonElement>(".menu-toggle");
const mainNav = document.querySelector<HTMLElement>("#main-nav");
const closeMenu = (restoreFocus = false) => {
  if (!menuToggle || !mainNav) return;
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-label", "Open navigation");
  mainNav.classList.remove("open");
  if (restoreFocus) menuToggle.focus();
};
menuToggle?.addEventListener("click", (event) => {
  const button = event.currentTarget as HTMLButtonElement;
  const open = button.getAttribute("aria-expanded") !== "true";
  button.setAttribute("aria-expanded", String(open));
  button.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  mainNav?.classList.toggle("open", open);
  if (open) mainNav?.querySelector<HTMLElement>("a")?.focus();
});
mainNav?.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => closeMenu()));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && menuToggle?.getAttribute("aria-expanded") === "true") {
    event.preventDefault();
    closeMenu(true);
  }
});
document.addEventListener("pointerdown", (event) => {
  if (menuToggle?.getAttribute("aria-expanded") !== "true") return;
  const target = event.target as Node;
  if (!mainNav?.contains(target) && !menuToggle.contains(target)) closeMenu();
});
window.addEventListener("resize", () => {
  if (window.innerWidth > 850) closeMenu();
}, { passive: true });
const dialog = document.querySelector("#search-dialog") as HTMLDialogElement;
let searchLoaded = false;
let searchTrigger: HTMLButtonElement | null = null;
const escapeSearchMeta = (value: unknown) => String(value ?? "").replace(/[&<>\"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char] || char));
function decorateSearchResult(result: {meta?: Record<string, unknown>; excerpt?: string}) {
  const meta = result?.meta || {};
  if (result.excerpt?.includes('global-search-meta')) return result;
  const details = [
    meta.type && `Type: ${meta.type}`,
    (meta.updated || meta.date) && `Updated: ${meta.updated || meta.date}`,
    meta.related && `Related: ${meta.related}`,
  ].filter(Boolean).map(escapeSearchMeta);
  if (details.length) result.excerpt = `<span class="global-search-meta">${details.join(" · ")}</span><br>${result.excerpt || ""}`;
  return result;
}
function updateSearchQuery(value: string) {
  const next = new URL(location.href);
  if (value.trim()) next.searchParams.set("q", value.trim());
  else next.searchParams.delete("q");
  history.replaceState(null, "", `${next.pathname}${next.search}${next.hash}`);
}
async function openSearch(event?: Event) {
  searchTrigger = event?.currentTarget instanceof HTMLButtonElement
    ? event.currentTarget
    : document.querySelector<HTMLButtonElement>("[data-search-open]");
  dialog?.showModal();
  searchTrigger?.setAttribute("aria-expanded", "true");
  if(dialog&&!dialog.querySelector('[data-library-search-command]')){
    const command=document.createElement('a');
    command.href=`${base.replace(/\/$/,'')}/files/?focus=search`;
    command.textContent='Search Files ↗';
    command.dataset.librarySearchCommand='';
    command.style.cssText='display:inline-flex;margin:0 0 1rem;color:var(--accent);font-size:.9rem';
    document.querySelector('#global-search')?.before(command);
  }
  if (searchLoaded) return;
  try {
    if (import.meta.env.DEV) {
      document.querySelector("#search-hint")!.textContent =
        "Full-text search uses the last production build. Run npm run build first, then npm run preview to include new content.";
    }
    const moduleUrl = `${base}pagefind/pagefind-ui.js`;
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = `${base}pagefind/pagefind-ui.css`;
    document.head.append(style);
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = moduleUrl;
      s.onload = () => resolve();
      s.onerror = reject;
      document.head.append(s);
    });
    const PF = (window as any).PagefindUI;
    new PF({
      element: "#global-search",
      showSubResults: true,
      showImages: false,
      processResult: decorateSearchResult,
      baseUrl: base,
      bundlePath: `${base}pagefind/`,
    });
    searchLoaded = true;
    const input = document.querySelector<HTMLInputElement>(".pagefind-ui__search-input");
    const query = new URL(location.href).searchParams.get("q") || "";
    if (input && query) {
      input.value = query;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    input?.addEventListener("input", () => updateSearchQuery(input.value), { passive: true });
    input?.focus();
  } catch {
    document.querySelector("#search-hint")!.textContent =
      "The search index is not built yet. Run npm run build and npm run preview.";
  }
}
document
  .querySelectorAll("[data-search-open]")
  .forEach((el) => el.addEventListener("click", openSearch));
document
  .querySelector("[data-search-close]")
  ?.addEventListener("click", () => dialog.close());
dialog?.addEventListener("click", (e) => {
  if (e.target === dialog) dialog.close();
});
dialog?.addEventListener("close", () => {
  searchTrigger?.setAttribute("aria-expanded", "false");
  searchTrigger?.focus();
});
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    openSearch();
  }
});
document.querySelectorAll<HTMLElement>("pre:not(.mermaid)").forEach((pre) => {
  const button = document.createElement("button");
  button.className = "copy-code";
  button.textContent = "Copy";
  button.setAttribute("aria-label", "Copy code");
  pre.append(button);
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(
        pre.querySelector("code")?.textContent || "",
      );
      toast("Code copied");
    } catch {
      toast("Clipboard unavailable");
    }
  });
});
document.querySelectorAll("[data-share]").forEach((button) =>
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      toast("Link copied");
    } catch {
      toast("Copy this page URL from your address bar");
    }
  }),
);
document.querySelectorAll("[data-view]").forEach((button) =>
  button.addEventListener("click", () => {
    const view = button.getAttribute("data-view")!;
    document.querySelector("[data-cards]")?.setAttribute("data-layout", view);
    document
      .querySelectorAll("[data-view]")
      .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
  }),
);
const filters = document.querySelectorAll<HTMLSelectElement | HTMLInputElement>(
  "[data-filter]",
);
const archive = document.querySelector<HTMLElement>("[data-owner-archive]");
const archiveQueryKey = (filter: HTMLInputElement | HTMLSelectElement) =>
  filter.dataset.filter === "title" ? "q" : filter.dataset.filter || "";
if (archive) {
  const params = new URL(location.href).searchParams;
  filters.forEach((filter) => {
    const value = params.get(archiveQueryKey(filter));
    if (value !== null) filter.value = value;
  });
}
function syncArchiveQuery() {
  if (!archive) return;
  const next = new URL(location.href);
  filters.forEach((filter) => {
    const key = archiveQueryKey(filter);
    if (!key) return;
    if (filter.value) next.searchParams.set(key, filter.value);
    else next.searchParams.delete(key);
  });
  history.replaceState(null, "", `${next.pathname}${next.search}${next.hash}`);
}
function filterCards() {
  let count = 0;
  document.querySelectorAll<HTMLElement>("[data-card]").forEach((card) => {
    const show = Array.from(filters).every((filter) => {
      const key = filter.dataset.filter!;
      const value = filter.value.toLowerCase();
      if (!value) return true;
      const text = (card.dataset[key] || "").toLowerCase();
      return key === "title"
        ? text.includes(value)
        : key === "tags"
          ? text.split("|").includes(value)
          : text === value;
    });
    card.hidden = !show;
    if (show) count++;
  });
  const counter = document.querySelector("[data-result-count]");
  if (counter)
    counter.textContent = `${count} ${count === 1 ? "entry" : "entries"}`;
  const empty = document.querySelector<HTMLElement>("[data-empty]");
  if (empty) empty.hidden = count > 0;
}
filters.forEach((f) => {
  f.addEventListener("input", () => { filterCards(); syncArchiveQuery(); });
  f.addEventListener("change", () => { filterCards(); syncArchiveQuery(); });
});
if (archive) filterCards();
const diagrams = document.querySelectorAll<HTMLElement>("pre.mermaid");
if (diagrams.length) {
  import("mermaid")
    .then(async ({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme:
          document.documentElement.dataset.theme === "dark"
            ? "dark"
            : "neutral",
      });
      await mermaid.run({ nodes: Array.from(diagrams) });
    })
    .catch(() =>
      toast("Diagram source is available; diagram rendering failed"),
    );
}
