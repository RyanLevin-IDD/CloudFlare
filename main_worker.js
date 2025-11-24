const DOMAIN_LIST = [
  "void.bid",
];


export default {
  // Manual trigger via HTTP
  async fetch(request, env, ctx) {
    await this.scheduled({ scheduledTime: new Date().toISOString() }, env, ctx);
    return new Response("Scheduled function triggered manually", { status: 200 });
  },

  // Scheduled trigger
  async scheduled(event, env, ctx) {
    const results = [];

    for (const domain of DOMAIN_LIST) {
      const safeDomain = domain.replace(/\./g, "-");
      const bindingName = "send-logs-" + safeDomain;
      const workerBinding = env[bindingName];

      if (!workerBinding || typeof workerBinding.fetch !== "function") {
        console.error(`No valid worker binding found for domain ${domain}`);
        results.push({ domain, status: "ERROR", response: "No binding" });
        continue;
      }

      try {
        // Use a dummy URL; service binding ignores it
        const response = await workerBinding.fetch("https://dummy/");

        const text = await response.text();

        console.log(`Response from ${bindingName} for ${domain}:`, text);

        results.push({
          domain,
          worker: bindingName,
          status: response.status,
          response: text
        });
      } catch (err) {
        console.error(`Error calling worker ${bindingName} for ${domain}:`, err.toString());
        results.push({
          domain,
          worker: bindingName,
          status: "ERROR",
          response: err.toString()
        });
      }
    }

    console.log("All workers completed:", JSON.stringify(results));
  }
};
