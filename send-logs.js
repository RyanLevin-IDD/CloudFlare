export default {
  async fetch(request, env, ctx) {
    await this.scheduled({ scheduledTime: new Date().toISOString() }, env, ctx);
    return new Response("Worker triggered manually or via service binding", { status: 200 });
  },

  async scheduled(event, env, ctx) {
    try {
      //Fetch pending logs
      const dbTablePrefix = "pending_logs_";
      const safeDomain = env.DOMAIN.replace(/\./g, "_");
      const dbTableNamePending = dbTablePrefix + safeDomain;
      const pending = await env.DB.prepare(
        `SELECT * FROM ${dbTableNamePending} ORDER BY timestamp ASC LIMIT 1000`
      ).all();

      if (!pending.results || pending.results.length === 0) {
        console.log("No pending logs");
        return;
      }

      const rows = pending.results;
      const columns = Object.keys(rows[0]);

      //Build CSV
      const csvHeader = columns.join(",");
      const csvBody = rows
        .map(r =>
          columns
            .map(c =>
              r[c] === undefined || r[c] === null
                ? ""
                : typeof r[c] === "object"
                ? JSON.stringify(r[c]).replace(/"/g, '""')
                : String(r[c]).replace(/"/g, '""')
            )
            .map(v => `"${v}"`)
            .join(",")
        )
        .join("\n");
      const csvContent = csvHeader + "\n" + csvBody;

      //Create filename
      const now = new Date();
      const pad = n => n.toString().padStart(2, "0");
      const YY = now.getFullYear().toString().slice(-2);
      const MM = pad(now.getMonth() + 1);
      const DD = pad(now.getDate());
      const HH = pad(now.getHours());
      const mm = pad(now.getMinutes());
      const filename = `${YY}${MM}${DD}_${HH}${mm}_${env.DOMAIN}.csv`;

      //Save CSV to R2
      await env.MY_BUCKET.put(filename, csvContent, {
        httpMetadata: { contentType: "text/csv" }
      });
      
      // Generate URL
      const csvUrl = `https://${env.BUCKET_NAME}.r2.dev/${filename}`;

      //Move logs to sent_logs table
      const insertColumns = columns.map(c => `"${c}"`);
      const placeholders = columns.map(() => "?");
      
      const dbTableNameSend = "sent_logs_" + safeDomain;
      const insertStmt = env.DB.prepare(
        `INSERT INTO ${dbTableNameSend} (${insertColumns.join(
          ","
        )}) VALUES (${placeholders.join(",")})`
      );

      for (const row of rows) {
        const values = Object.values(row).map(val =>
          val === undefined || val === null
            ? null
            : typeof val === "object"
            ? JSON.stringify(val)
            : val
        );
        await insertStmt.bind(...values).run();
      }

      //Delete logs from pending logs
      await env.DB.prepare(
        `DELETE FROM ${dbTableNamePending} WHERE rowid IN (
          SELECT rowid FROM ${dbTableNamePending} ORDER BY timestamp ASC LIMIT ?
        )`
      )
        .bind(rows.length)
        .run();

      console.log(`Processed ${rows.length} logs successfully`);

      //Send CSV link to Google Sheets
      const payload = {
        domain: env.DOMAIN,
        csvLink: csvUrl
      };

      const res = await fetch(env.ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        console.error(`Failed to send CSV link to Sheets: ${res.statusText}`);
        return;
      }

      console.log(`CSV link sent to Sheets: ${csvUrl}`);
    } catch (err) {
      console.error(`Error in scheduled(): ${err.message}`);
    }
  }
};
