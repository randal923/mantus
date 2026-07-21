export interface LookItemEntry {
  article: string;
  name: string;
  description?: string;
}

let catalogPromise: Promise<ReadonlyMap<number, LookItemEntry>> | null = null;

/** Lazily fetches the generated look catalog; cached after the first call. */
export function loadLookItemCatalog(): Promise<
  ReadonlyMap<number, LookItemEntry>
> {
  catalogPromise ??= fetch("/assets/look-items.json")
    .then(async (response) => {
      if (!response.ok) throw new Error("look catalog unavailable");
      const data = (await response.json()) as {
        formatVersion: number;
        items: Record<string, [string, string, string?]>;
      };
      const entries = new Map<number, LookItemEntry>();
      for (const [id, [article, name, description]] of Object.entries(
        data.items,
      )) {
        entries.set(Number(id), {
          article,
          name,
          ...(description ? { description } : {}),
        });
      }
      return entries;
    })
    .catch((error: unknown) => {
      catalogPromise = null;
      throw error;
    });
  return catalogPromise;
}
