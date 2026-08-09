import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

async function proxyRequest(request: NextRequest, { params }: RouteContext): Promise<Response> {
  const { path } = await params;

  if (path[0] === "admin") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const backendBaseUrl = process.env.BACKEND_URL || "http://127.0.0.1:3001";
  const target = new URL(`/api/${path.map(encodeURIComponent).join("/")}`, backendBaseUrl);
  target.search = request.nextUrl.search;

  const headers = new Headers(request.headers);
  headers.delete("connection");
  headers.delete("content-length");
  headers.delete("host");

  try {
    const backendResponse = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
      redirect: "manual",
    });

    const responseHeaders = new Headers(backendResponse.headers);
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("content-length");
    responseHeaders.delete("transfer-encoding");

    return new Response(await backendResponse.arrayBuffer(), {
      status: backendResponse.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json({ error: "Backend service is unavailable" }, { status: 502 });
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
