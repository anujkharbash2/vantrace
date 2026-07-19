// Distinct, readable colors for overlaying multiple runs on one chart
export const RUN_COLORS = [
  '#f0a23c', // amber (brand accent)
  '#60a5fa', // blue
  '#4ade80', // green
  '#f472b6', // pink
  '#a78bfa', // purple
  '#fb923c', // orange
  '#22d3ee', // cyan
  '#facc15', // yellow
  '#fb7185', // rose
  '#34d399', // emerald
]

export function colorForIndex(index: number): string {
  return RUN_COLORS[index % RUN_COLORS.length]
}