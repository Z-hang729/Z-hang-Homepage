const base = import.meta.env.BASE_URL;
const toast = (message: string) => {
  const el = document.querySelector("#toast");
  if (el) {
    el.textContent = message;
    el.classList.add("visible");
    setTimeout(() => el.classList.remove("visible"), 2500);
  }
};
document.querySelector(".theme-toggle")?.addEventListener("click", () => {
  const next =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("zh-theme", next);
  } catch {}
  document.dispatchEvent(new Event("themechange"));
});
document.querySelector(".menu-toggle")?.addEventListener("click", (event) => {
  const button = event.currentTarget as HTMLButtonElement;
  const open = button.getAttribute("aria-expanded") !== "true";
  button.setAttribute("aria-expanded", String(open));
  document.querySelector("#main-nav")?.classList.toggle("open", open);
});
const dialog = document.querySelector("#search-dialog") as HTMLDialogElement;
let searchLoaded = false;
async function openSearch() {
  dialog?.showModal();
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
      baseUrl: base,
      bundlePath: `${base}pagefind/`,
    });
    searchLoaded = true;
    document
      .querySelector<HTMLInputElement>(".pagefind-ui__search-input")
      ?.focus();
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
filters.forEach((f) => f.addEventListener("input", filterCards));
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
