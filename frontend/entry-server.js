const server = (await import("./dist/server/server.js")).default;
const port = parseInt(process.env.PORT || "8080", 10);
const clientDist = "./dist/client";

async function serveStatic(req) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return null;
  }

  const url = new URL(req.url);
  const pathname = url.pathname;

  if (pathname === "/" || pathname.includes("..")) {
    return null;
  }

  const file = Bun.file(`${clientDist}${pathname}`);

  if (!(await file.exists())) {
    return null;
  }

  const headers = new Headers();

  if (pathname.startsWith("/assets/")) {
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  }

  return new Response(req.method === "HEAD" ? null : file, {
    headers,
  });
}

Bun.serve({
  port,
  async fetch(req) {
    return (await serveStatic(req)) ?? server.fetch(req);
  },
});

console.log(`Frontend listening on port ${port}`);
