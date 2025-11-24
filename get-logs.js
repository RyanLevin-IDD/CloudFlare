export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Skip internal dashboard/API requests
    if (url.pathname.startsWith("/get-logs") || request.headers.get("X-No-Log") === "1") {
      return fetch(request);
    }

    const now = new Date();
    const hdr = Object.fromEntries(request.headers.entries());
    const bodyText = await request.text();

    // Build log entry
    const logEntry = {
      timestamp: now.toISOString(),
      method: request.method,
      url: url.toString(),
      path: url.pathname,
      query: JSON.stringify(Object.fromEntries(url.searchParams)),
      ip: hdr["cf-connecting-ip"] || "unknown",
      country: hdr["cf-ipcountry"] || "unknown",
      colo: request.cf?.colo || "unknown",
      asn: request.cf?.asn || "unknown",
      tlsVersion: request.cf?.tlsVersion || "unknown",
      protocol: JSON.stringify(request.cf?.protocol || {}),
      userAgent: hdr["user-agent"] || "unknown",
      rayId: hdr["cf-ray"] || "unknown",
      contentType: hdr["content-type"] || "unknown",
      headers: JSON.stringify(hdr),
      body: bodyText,
      accept: hdr["accept"] || "",
      "accept-encoding": hdr["accept-encoding"] || "",
      "accept-language": hdr["accept-language"] || "",
      "cf-connecting-ip": hdr["cf-connecting-ip"] || "",
      "cf-ipcountry": hdr["cf-ipcountry"] || "",
      "cf-ray": hdr["cf-ray"] || "",
      "cf-visitor": hdr["cf-visitor"] || "",
      connection: hdr["connection"] || "",
      host: hdr["host"] || "",
      "user-agent": hdr["user-agent"] || "",
      "x-forwarded-proto": hdr["x-forwarded-proto"] || "",
      "x-real-ip": hdr["x-real-ip"] || "",
      "content-length": hdr["content-length"] || "",
      cookie: hdr["cookie"] || ""
    };

    const columns = Object.keys(logEntry).map(c => `"${c}"`);
    const placeholders = columns.map(() => "?");
    const dbTablePrefix = "pending_logs_";
    const safeDomain = env.DOMAIN.replace(/\./g, "_");
    const dbTableName = dbTablePrefix + safeDomain;
    await env.DB.prepare(
      `INSERT INTO ${dbTableName} (${columns.join(",")}) VALUES (${placeholders.join(",")})`
    ).bind(...Object.values(logEntry)).run();
      
    return fetch(request);
  }
};
