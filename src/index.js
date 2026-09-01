export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }

    if (url.pathname === "/ajax/fulltable.php") {
      const codlinha = url.searchParams.get("codlinha") || "1010";
      const city = url.searchParams.get("city") || "UBEN";
      const targetUrl =
        "https://cdfuberaba.auttran.com/ajax/fulltable.php?codlinha=" +
        codlinha +
        "&city=" +
        city;
      try {
        const res = await fetch(targetUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            Referer: "https://cdfuberaba.auttran.com/chegadas/chegadas.php"
          }
        });
        const data = await res.text();
        return new Response(data, {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=UTF-8",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Cache-Control": "no-store"
          }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
    }

    return env.ASSETS.fetch(request);
  }
};