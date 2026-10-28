import { PENDING_MODULE_MESSAGE } from "@agency/core";
import { Badge, PendingModuleNotice, PreviewArea } from "@agency/ui";
import { BarChart3, FlaskConical, LineChart } from "lucide-react";

/**
 * Visuelt preview af kommende KPI'er. ALLE tal er illustrative demoværdier og
 * er markeret som sådan — de stammer ikke fra platformens data.
 */
const DEMO_KPIS: Array<{ label: string; value: string; note: string }> = [
  { label: "Antal leads", value: "48", note: "Fra Research og CRM" },
  { label: "Antal kunder", value: "12", note: "Fra CRM" },
  { label: "Aktive tilbud", value: "7", note: "Fra Tilbud" },
  { label: "Tilbudskonvertering", value: "31 %", note: "Accepterede / sendte" },
  { label: "Pipelineværdi", value: "640.000 kr.", note: "Åbne muligheder" },
  { label: "Implementeringsomsætning", value: "210.000 kr.", note: "Denne måned" },
  { label: "MRR", value: "38.400 kr.", note: "Månedlig tilbagevendende" },
  { label: "Aktive produktionsprojekter", value: "5", note: "Fra Produktion" },
  { label: "Levering til tiden", value: "92 %", note: "Leveringsstatus" },
  { label: "Kundelivstidsværdi", value: "185.000 kr.", note: "Gennemsnit" },
];

const DEMO_MRR = [18, 21, 22, 26, 29, 31, 33, 38]; // tusind kr., demo
const MONTHS = ["Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt"];
const DEMO_CONVERSION = [22, 25, 24, 28, 27, 30, 29, 31]; // procent, demo

function DemoTag() {
  return (
    <Badge variant="demo" className="px-1.5 text-[10px]">
      <FlaskConical /> Demo
    </Badge>
  );
}

/** Én serie, én farve — søjler med 4px afrundede ender ved dataenden og 2px mellemrum. */
function BarPreview() {
  const w = 320, h = 140, pad = 24, max = 40;
  const slot = (w - pad) / DEMO_MRR.length;
  const bw = slot - 6;
  return (
    <svg viewBox={`0 0 ${w} ${h + 18}`} className="w-full" role="img" aria-label="Demo: MRR pr. måned">
      {[0, 20, 40].map((t) => {
        const y = h - (t / max) * (h - 10);
        return (
          <g key={t}>
            <line x1={pad} x2={w} y1={y} y2={y} stroke="hsl(var(--border))" strokeWidth={1} />
            <text x={pad - 6} y={y + 3} textAnchor="end" fontSize={9} fill="hsl(var(--muted-foreground))">{t}k</text>
          </g>
        );
      })}
      {DEMO_MRR.map((v, i) => {
        const bh = (v / max) * (h - 10);
        const x = pad + i * slot + 3;
        const y = h - bh;
        const r = 4;
        return (
          <g key={i}>
            <path d={`M${x},${h} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${h} Z`} fill="hsl(var(--accent))" opacity={0.85}>
              <title>{`${MONTHS[i]}: ${v}.000 kr. (demo)`}</title>
            </path>
            <text x={x + bw / 2} y={h + 13} textAnchor="middle" fontSize={9} fill="hsl(var(--muted-foreground))">{MONTHS[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}

function LinePreview() {
  const w = 320, h = 140, pad = 24, min = 15, max = 35;
  const step = (w - pad - 8) / (DEMO_CONVERSION.length - 1);
  const pts = DEMO_CONVERSION.map((v, i) => [pad + 4 + i * step, h - ((v - min) / (max - min)) * (h - 10)] as const);
  return (
    <svg viewBox={`0 0 ${w} ${h + 18}`} className="w-full" role="img" aria-label="Demo: tilbudskonvertering pr. måned">
      {[15, 25, 35].map((t) => {
        const y = h - ((t - min) / (max - min)) * (h - 10);
        return (
          <g key={t}>
            <line x1={pad} x2={w} y1={y} y2={y} stroke="hsl(var(--border))" strokeWidth={1} />
            <text x={pad - 6} y={y + 3} textAnchor="end" fontSize={9} fill="hsl(var(--muted-foreground))">{t}%</text>
          </g>
        );
      })}
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} strokeLinejoin="round" />
      {pts.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={4} fill="hsl(var(--primary))" stroke="hsl(var(--card))" strokeWidth={2}>
            <title>{`${MONTHS[i]}: ${DEMO_CONVERSION[i]} % (demo)`}</title>
          </circle>
          <text x={x} y={h + 13} textAnchor="middle" fontSize={9} fill="hsl(var(--muted-foreground))">{MONTHS[i]}</text>
        </g>
      ))}
    </svg>
  );
}

export function DashboardPreview() {
  return (
    <div className="space-y-6">
      <PendingModuleNotice message={PENDING_MODULE_MESSAGE} />
      <div>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">Kommende KPI'er</h2>
          <DemoTag />
          <span className="text-xs text-muted-foreground">Illustrative demoværdier — ikke platformens data</span>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" data-testid="demo-kpis">
          {DEMO_KPIS.map((k) => (
            <div key={k.label} className="rounded-xl border border-dashed border-border bg-card/70 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">{k.label}</p>
                <DemoTag />
              </div>
              <p className="mt-2 text-xl font-semibold tabular-nums text-foreground/70">{k.value}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{k.note}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <PreviewArea icon={<BarChart3 />} title="MRR over tid (demo)" description="Månedlig tilbagevendende omsætning — illustrative demoværdier.">
          <BarPreview />
        </PreviewArea>
        <PreviewArea icon={<LineChart />} title="Tilbudskonvertering (demo)" description="Andel accepterede tilbud pr. måned — illustrative demoværdier.">
          <LinePreview />
        </PreviewArea>
      </div>
    </div>
  );
}
