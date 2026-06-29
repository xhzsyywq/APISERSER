export default {
  async fetch(request, env) {
    const ALLOW_ORIGIN = "https://xhzsyywq.github.io";
    const origin = request.headers.get("origin");
    const corsHeaders = {
      "Access-Control-Allow-Origin": ALLOW_ORIGIN,
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (origin !== ALLOW_ORIGIN) {
      return Response.json(
        { code: -4, msg: "禁止外部调用该代理接口" },
        { headers: corsHeaders, status: 403 }
      );
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const target = url.searchParams.get("target");
    if (!target) {
      return Response.json(
        { code: -1, msg: "缺少target参数，可选deepseek/minimax/zhipu" },
        { headers: corsHeaders }
      );
    }

    let apiUrl, apiKey;
    switch (target) {
      case "deepseek":
        apiUrl = "https://api.deepseek.com/user/balance";
        apiKey = env.DEEPSEEK_KEY;
        break;
      case "minimax":
        apiUrl = "https://api.minimax.chat/v1/user/balance";
        apiKey = env.MINIMAX_KEY;
        break;
      case "zhipu":
        apiUrl = "https://open.bigmodel.cn/api/paas/v4/user/balance";
        apiKey = env.ZHIPU_KEY;
        break;
      default:
        return Response.json(
          { code: -2, msg: "不支持该服务商" },
          { headers: corsHeaders }
        );
    }

    if (!apiKey) {
      return Response.json(
        { code: -3, msg: "服务商密钥未配置" },
        { headers: corsHeaders }
      );
    }

    const res = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json"
      }
    });
    const data = await res.json();
    return Response.json(data, { headers: corsHeaders });
  }
};
