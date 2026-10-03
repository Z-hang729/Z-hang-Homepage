import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
export function pagefindDevPlugin() {
  return {
    name: "local-pagefind-preview",
    apply: "serve",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url, "http://localhost").pathname;
        const prefix = '/pagefind/';
        if (!pathname.startsWith(prefix)) return next();
        let relative;
        try {
          relative = decodeURIComponent(pathname.slice(prefix.length));
        } catch {
          return next();
        }
        const root = path.resolve(server.config.root, "dist/pagefind");
        const file = path.resolve(root, relative);
        if (!file.startsWith(root + path.sep) || !existsSync(file))
          return next();
        const ext = path.extname(file);
        res.setHeader(
          "Content-Type",
          {
            ".js": "text/javascript",
            ".css": "text/css",
            ".json": "application/json",
            ".wasm": "application/wasm",
          }[ext] || "application/octet-stream",
        );
        res.setHeader("X-Content-Type-Options", "nosniff");
        createReadStream(file)
          .on("error", () => res.destroy())
          .pipe(res);
      });
    },
  };
}
