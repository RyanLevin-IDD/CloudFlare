const DOMAIN_NAME = "domainName"; 

export default {
  async fetch(request, env) {
    return new Response("This endpoint can be called manually via HTTP");
  },

  async scheduled(event, env, ctx) {
    try {
      // Fetch pending logs
      const pending = await env.DB.prepare(
        `SELECT * FROM pending_logs_${DOMAIN_NAME} ORDER BY timestamp ASC LIMIT 1000`
      ).all();

      if (!pending.results || pending.results.length === 0) {
        console.log("No pending logs");
        return;
      }

      // Send to Google Apps Script endpoint
      const payload = {
        domain: DOMAIN_NAME,
        results: pending.results
      };

      const scriptUrl = env.ENDPOINT;
      console.log(pending.results);
      const res = await fetch(scriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        console.log(`Failed to send logs: ${res.statusText}`);
        return;
      }

      // Move logs to Sent Logs table
      const columns = Object.keys(pending.results[0]).map(c => `"${c}"`);
      const placeholders = columns.map(() => "?");
      const insertStmt = env.DB.prepare(
        `INSERT INTO sent_logs_${DOMAIN_NAME} (${columns.join(",")}) VALUES (${placeholders.join(",")})`
      );

      for (const row of pending.results) {
        const values = Object.values(row).map(val =>
          val === undefined || val === null ? null : (typeof val === "object" ? JSON.stringify(val) : val)
        );
        await insertStmt.bind(...values).run();
      }

      // Delete the same number of rows fetched
      await env.DB.prepare(
        `DELETE FROM pending_logs_${DOMAIN_NAME} WHERE rowid IN (
          SELECT rowid FROM pending_logs_${DOMAIN_NAME} ORDER BY timestamp ASC LIMIT ?
        )`
      ).bind(pending.results.length).run();

      console.log(`Sent ${pending.results.length} logs successfully`);
    } catch (err) {
      console.error(`Error in scheduled(): ${err.message}`);
    }
  }
};
