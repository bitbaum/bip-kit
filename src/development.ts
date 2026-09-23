/** Public development records are projections of a remote producer, never local fallback copy. */
export interface DevelopmentProfile {
  slug: string;
  name: string;
  what: string | null;
  roadmap: {
    title: string;
    status: string | null;
    progress: number | null;
    targetDate: string | null;
    /** Legacy string rows and the fleet map's checked milestone records. */
    milestones: (string | { title: string; done: boolean })[];
    source?: string | null;
  }[];
  changelog: { date: string; done: string }[];
}

export function developmentProfileFromMap(value: unknown, slug: string): DevelopmentProfile | null {
  if (!value || typeof value !== "object" || !("projects" in value)) return null;
  const projects = value.projects;
  if (!Array.isArray(projects)) return null;
  const p = projects.find((entry) => entry?.slug === slug);
  if (!p || typeof p.name !== "string" || !Array.isArray(p.roadmap) || !Array.isArray(p.changelog))
    return null;
  if (
    !p.roadmap.every(
      (g: Record<string, unknown>) =>
        g &&
        typeof g.title === "string" &&
        Array.isArray(g.milestones) &&
        g.milestones.every(
          (m: unknown) =>
            typeof m === "string" ||
            (!!m &&
              typeof m === "object" &&
              "title" in m &&
              typeof m.title === "string" &&
              "done" in m &&
              typeof m.done === "boolean"),
        ) &&
        (g.source == null || typeof g.source === "string"),
    ) ||
    !p.changelog.every(
      (e: Record<string, unknown>) => e && typeof e.date === "string" && typeof e.done === "string",
    )
  )
    return null;
  return {
    slug,
    name: p.name,
    what: typeof p.what === "string" ? p.what : null,
    roadmap: p.roadmap.map((g: DevelopmentProfile["roadmap"][number]) => ({
      title: g.title,
      status: typeof g.status === "string" ? g.status : null,
      progress:
        typeof g.progress === "number" && Number.isFinite(g.progress)
          ? Math.min(100, Math.max(0, g.progress))
          : null,
      targetDate: typeof g.targetDate === "string" ? g.targetDate : null,
      milestones: g.milestones,
      source: typeof g.source === "string" ? g.source : null,
    })),
    changelog: p.changelog.map((e: DevelopmentProfile["changelog"][number]) => ({
      date: e.date,
      done: e.done,
    })),
  };
}

export async function loadDevelopmentProfile(
  mapUrl: string,
  slug: string,
  fetcher: typeof fetch = fetch,
): Promise<DevelopmentProfile | null> {
  try {
    const response = await fetcher(mapUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    return response.ok ? developmentProfileFromMap(await response.json(), slug) : null;
  } catch {
    return null;
  }
}
