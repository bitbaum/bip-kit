import type { ChartSpec } from "../chart.js";

/**
 * Inline-SVG chart for the tiny declarative ChartSpec — no chart library.
 * Theme-aware through CSS vars only (--bp-chart-1..6, --bp-border,
 * --bp-fg-muted); the SVG itself hardcodes no color.
 */

const VIEW_W = 640;
const VIEW_H = 360;
const PAD = { top: 16, right: 12, bottom: 34, left: 48 };
const SERIES_COLORS = 6;

function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = Math.pow(10, exp);
  const n = value / base;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return nice * base;
}

function formatTick(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${value / 1_000_000}M`;
  if (Math.abs(value) >= 1_000) return `${value / 1_000}k`;
  return String(Math.round(value * 100) / 100);
}

export function Chart({ spec }: { spec: ChartSpec }) {
  // Categories: union of point labels, in order of first appearance.
  const categories: string[] = [];
  for (const series of spec.series) {
    for (const [label] of series.points) {
      const key = String(label);
      if (!categories.includes(key)) categories.push(key);
    }
  }
  const values = spec.series.flatMap((s) => s.points.map(([, y]) => y));
  const yMax = niceCeil(Math.max(...values, 0));
  const yMin = Math.min(0, ...values);

  const plotW = VIEW_W - PAD.left - PAD.right;
  const plotH = VIEW_H - PAD.top - PAD.bottom;
  const yScale = (v: number) => PAD.top + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;
  const slotW = plotW / Math.max(1, categories.length);
  const xCenter = (c: number) => PAD.left + slotW * c + slotW / 2;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => yMin + (yMax - yMin) * f);
  const color = (i: number) => `var(--bp-chart-${(i % SERIES_COLORS) + 1})`;

  const valueOf = (series: ChartSpec["series"][number], category: string): number | null => {
    const found = series.points.find(([label]) => String(label) === category);
    return found ? found[1] : null;
  };

  // Show every label when they fit; otherwise thin to ~8.
  const labelStep = Math.max(1, Math.ceil(categories.length / 8));

  return (
    <figure className="bp-chart" data-kind={spec.kind}>
      {spec.title ? <figcaption className="bp-chart-title">{spec.title}</figcaption> : null}
      <div className="bp-chart-frame">
        {spec.yLabel ? <span className="bp-chart-ylabel">{spec.yLabel}</span> : null}
        <svg
          className="bp-chart-svg"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          role="img"
          aria-label={spec.title ?? `${spec.kind} chart`}
        >
          {/* gridlines + y tick labels */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line
                x1={PAD.left}
                x2={VIEW_W - PAD.right}
                y1={yScale(t)}
                y2={yScale(t)}
                className="bp-chart-grid"
              />
              <text x={PAD.left - 8} y={yScale(t) + 4} textAnchor="end" className="bp-chart-tick">
                {formatTick(t)}
              </text>
            </g>
          ))}

          {/* x labels */}
          {categories.map((c, i) =>
            i % labelStep === 0 ? (
              <text
                key={c}
                x={xCenter(i)}
                y={VIEW_H - PAD.bottom + 20}
                textAnchor="middle"
                className="bp-chart-tick"
              >
                {c}
              </text>
            ) : null,
          )}

          {/* marks */}
          {spec.kind === "bar"
            ? spec.series.map((series, si) => {
                const groupW = slotW * 0.7;
                const barW = groupW / spec.series.length;
                return (
                  <g key={series.name} fill={color(si)}>
                    {categories.map((c, ci) => {
                      const v = valueOf(series, c);
                      if (v === null) return null;
                      const x = xCenter(ci) - groupW / 2 + barW * si;
                      const y0 = yScale(Math.max(0, yMin));
                      const y1 = yScale(v);
                      return (
                        <rect
                          key={c}
                          x={x + barW * 0.06}
                          y={Math.min(y0, y1)}
                          width={barW * 0.88}
                          height={Math.max(1, Math.abs(y0 - y1))}
                          rx={2}
                        />
                      );
                    })}
                  </g>
                );
              })
            : spec.series.map((series, si) => {
                const pts = categories
                  .map((c, ci) => {
                    const v = valueOf(series, c);
                    return v === null ? null : ([xCenter(ci), yScale(v)] as const);
                  })
                  .filter((p): p is readonly [number, number] => p !== null);
                if (pts.length === 0) return null;
                const path = pts.map(([x, y]) => `${x},${y}`).join(" ");
                const baseline = yScale(Math.max(0, yMin));
                return (
                  <g key={series.name}>
                    {spec.kind === "area" ? (
                      <polygon
                        points={`${pts[0][0]},${baseline} ${path} ${pts[pts.length - 1][0]},${baseline}`}
                        fill={color(si)}
                        opacity={0.15}
                      />
                    ) : null}
                    <polyline
                      points={path}
                      fill="none"
                      stroke={color(si)}
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                    {pts.map(([x, y], i) => (
                      <circle key={i} cx={x} cy={y} r={3} fill={color(si)} />
                    ))}
                  </g>
                );
              })}

          {/* axis line */}
          <line
            x1={PAD.left}
            x2={VIEW_W - PAD.right}
            y1={yScale(Math.max(0, yMin))}
            y2={yScale(Math.max(0, yMin))}
            className="bp-chart-axis"
          />
        </svg>
      </div>
      {spec.series.length > 1 ? (
        <ul className="bp-chart-legend">
          {spec.series.map((series, si) => (
            <li key={series.name} className="bp-chart-legend-item">
              <span className="bp-chart-swatch" style={{ background: color(si) }} aria-hidden />
              {series.name}
            </li>
          ))}
        </ul>
      ) : null}
    </figure>
  );
}
