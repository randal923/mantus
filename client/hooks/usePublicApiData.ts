"use client";

import { useEffect, useState } from "react";
import { getPublicApiUrl } from "../lib/public/getPublicApiUrl";

interface PublicDataParser<TData> {
  safeParse(input: unknown):
    | { readonly success: true; readonly data: TData }
    | { readonly success: false };
}

export type PublicDataState<TData> =
  | { readonly status: "loading"; readonly data: null }
  | { readonly status: "ready"; readonly data: TData }
  | { readonly status: "not-found"; readonly data: null }
  | { readonly status: "unavailable"; readonly data: null };

export function usePublicApiData<TData>(
  endpoint: string | null,
  parser: PublicDataParser<TData>,
): PublicDataState<TData> {
  const requestUrl = endpoint ? getPublicApiUrl(endpoint) : null;
  const [resolved, setResolved] = useState<{
    readonly requestUrl: string | null;
    readonly state: PublicDataState<TData>;
  }>({
    requestUrl: null,
    state: { status: "unavailable", data: null },
  });
  const state =
    resolved.requestUrl === requestUrl
      ? resolved.state
      : requestUrl
        ? ({ status: "loading", data: null } as const)
        : ({ status: "unavailable", data: null } as const);

  useEffect(() => {
    if (!requestUrl) return;
    const controller = new AbortController();
    void fetch(requestUrl, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (response.status === 404) {
          setResolved({
            requestUrl,
            state: { status: "not-found", data: null },
          });
          return;
        }
        if (!response.ok) {
          throw new Error(`public API returned ${response.status}`);
        }
        const parsed = parser.safeParse(await response.json());
        if (!parsed.success) {
          throw new Error("public API returned an invalid response");
        }
        setResolved({
          requestUrl,
          state: { status: "ready", data: parsed.data },
        });
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") {
          return;
        }
        setResolved({
          requestUrl,
          state: { status: "unavailable", data: null },
        });
      });

    return () => controller.abort();
  }, [parser, requestUrl]);

  return state;
}
