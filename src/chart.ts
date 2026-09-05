/**
 * ```chart fences carry a deliberately tiny declarative spec.
 * Two accepted bodies: strict JSON, or a line format:
 *
 *   kind: bar
 *   title: Weekly signups
 *   ylabel: signups
 *   series Organic: Jan=12, Feb=30, Mar=41
 *   series Paid: Jan=4, Feb=9, Mar=8
 *
 * Errors THROW with the reason — committed content is the trust boundary,
 * and a broken chart spec should fail the build like a broken import,
 * never silently drop the block.
 */

export interface ChartSeries {
  name: string;
  points: [string | number, number][];
}

export interface ChartSpec {
  kind: "bar" | "line" | "area";
  title?: string;
  yLabel?: string;
  series: ChartSeries[];
}

const KINDS = new Set(["bar", "line", "area"]);

export function parseChartSpec(source: string): ChartSpec {
  const trimmed = source.trim();
  if (!trimmed) throw new Error("chart block: empty spec");

  if (trimmed.startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      throw new Error(
        `chart block: invalid JSON — ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
    return validateChartSpec(parsed);
  }

  const spec: { kind?: string; title?: string; yLabel?: string; series: ChartSeries[] } = {
    series: [],
  };
  for (const rawLine of trimmed.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const seriesMatch = line.match(/^series\s+(.+?)\s*:\s*(.+)$/);
    if (seriesMatch) {
      const points: [string | number, number][] = [];
      for (const pair of seriesMatch[2].split(",")) {
        const m = pair.trim().match(/^(.+?)\s*=\s*(-?\d+(?:\.\d+)?)$/);
        if (!m) {
          throw new Error(
            `chart block: bad point "${pair.trim()}" in series "${seriesMatch[1]}" — expected label=number`,
          );
        }
        points.push([m[1], Number(m[2])]);
      }
      spec.series.push({ name: seriesMatch[1], points });
      continue;
    }
    const kv = line.match(/^(kind|title|ylabel)\s*:\s*(.+)$/i);
    if (kv) {
      const key = kv[1].toLowerCase();
      if (key === "kind") spec.kind = kv[2].trim();
      else if (key === "title") spec.title = kv[2].trim();
      else spec.yLabel = kv[2].trim();
      continue;
    }
    throw new Error(`chart block: unrecognized line "${line}"`);
  }
  return validateChartSpec(spec);
}

export function validateChartSpec(value: unknown): ChartSpec {
  if (typeof value !== "object" || value === null) {
    throw new Error("chart block: spec must be an object");
  }
  const v = value as Record<string, unknown>;
  if (typeof v.kind !== "string" || !KINDS.has(v.kind)) {
    throw new Error(
      `chart block: kind must be "bar" | "line" | "area", got ${JSON.stringify(v.kind)}`,
    );
  }
  if (v.title !== undefined && typeof v.title !== "string") {
    throw new Error("chart block: title must be a string");
  }
  if (v.yLabel !== undefined && typeof v.yLabel !== "string") {
    throw new Error("chart block: yLabel must be a string");
  }
  if (!Array.isArray(v.series) || v.series.length === 0) {
    throw new Error("chart block: series must be a non-empty array");
  }
  const series: ChartSeries[] = v.series.map((s: unknown, i: number) => {
    if (typeof s !== "object" || s === null)
      throw new Error(`chart block: series[${i}] must be an object`);
    const sv = s as Record<string, unknown>;
    if (typeof sv.name !== "string" || sv.name.length === 0) {
      throw new Error(`chart block: series[${i}].name must be a non-empty string`);
    }
    if (!Array.isArray(sv.points) || sv.points.length === 0) {
      throw new Error(`chart block: series "${sv.name}" has no points`);
    }
    const points: [string | number, number][] = sv.points.map((p: unknown, j: number) => {
      if (
        !Array.isArray(p) ||
        p.length !== 2 ||
        (typeof p[0] !== "string" && typeof p[0] !== "number") ||
        typeof p[1] !== "number" ||
        Number.isNaN(p[1])
      ) {
        throw new Error(`chart block: series "${sv.name}" point ${j} must be [label, number]`);
      }
      return [p[0], p[1]];
    });
    return { name: sv.name, points };
  });
  return {
    kind: v.kind as ChartSpec["kind"],
    title: v.title as string | undefined,
    yLabel: v.yLabel as string | undefined,
    series,
  };
}
