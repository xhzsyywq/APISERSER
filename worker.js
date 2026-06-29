export default {
  async fetch(request, env) {
    const ALLOW_ORIGIN = "https://xhzsyywq.github.io";
    const origin = request.headers.get("origin");
    const corsHeaders = {
      "Access-Control-Allow-Origin": ALLOW_ORIGIN,
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (origin !== ALLOW_ORIGIN) {
      return Response.json({ code: -4, msg: "forbidden origin" }, { headers: corsHeaders, status: 403 });
    }

    const url = new URL(request.url);
    const target = url.searchParams.get("target");
    if (!target) {
      return Response.json({ code: -1, msg: "missing target param" }, { headers: corsHeaders });
    }

    let apiUrl, apiKey;
    switch (target) {
      case "deepseek":
        apiUrl = "https://api.deepseek.com/user/balance";
        apiKey = env.DEEPSEEK_KEY;
        break;
      case "minimax":
        apiUrl = "https://api.minimaxi.com/v1/user/balance";
        apiKey = env.MINIMAX_KEY;
        break;
      default:
        return Response.json({ code: -2, msg: "unsupported provider" }, { headers: corsHeaders });
    }

    if (!apiKey) {
      return Response.json({ code: -3, msg: "provider key not configured" }, { headers: corsHeaders });
    }

    const res = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json"
      }
    });
    const rawData = await res.json();
    return Response.json(rawData, { headers: corsHeaders });
  }
};
