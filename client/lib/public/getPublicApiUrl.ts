export function getPublicApiUrl(endpoint: string): string | null {
  try {
    const websocketUrl =
      process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000";
    const url = new URL(websocketUrl);
    const publicEndpoint = new URL(endpoint, "http://localhost");
    url.protocol = url.protocol === "wss:" ? "https:" : "http:";
    url.pathname = publicEndpoint.pathname;
    url.search = publicEndpoint.search;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
