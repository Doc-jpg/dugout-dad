import React from 'react';
import type { FieldZone } from '../../engine/types';

/**
 * Tap-the-field graphic. Zones are polygons in a 100x100 box; home plate at (50,95).
 * Returns the zone code and the normalized point (x right 0..1, y toward outfield 0..1).
 */
interface ZoneDef {
  id: FieldZone;
  label: string;
  points: string; // polygon points
  lx: number;
  ly: number;
}

// Geometry: home (50,95). Foul lines go to (5,50)... we draw a fan.
const ZONES: ZoneDef[] = [
  // Infield
  { id: '3B_LINE', label: '3B line', points: '50,95 40,85 28,72 22,66 50,95', lx: 31, ly: 80 },
  { id: '3B', label: '3B', points: '50,95 22,66 30,58 44,74', lx: 31, ly: 67 },
  { id: 'SS', label: 'SS', points: '50,95 44,74 30,58 40,50 50,62', lx: 40, ly: 59 },
  { id: 'MIDDLE', label: 'Mid', points: '50,62 40,50 50,44 60,50', lx: 50, ly: 52 },
  { id: '2B', label: '2B', points: '50,95 50,62 60,50 70,58 56,74', lx: 60, ly: 59 },
  { id: '1B', label: '1B', points: '50,95 56,74 70,58 78,66', lx: 69, ly: 67 },
  { id: '1B_LINE', label: '1B line', points: '50,95 78,66 72,72 60,85', lx: 69, ly: 80 },
  // Shallow outfield
  { id: 'LF_SHALLOW', label: 'Shallow LF', points: '22,66 30,58 40,50 32,36 14,52', lx: 26, ly: 52 },
  { id: 'CF_SHALLOW', label: 'Shallow CF', points: '40,50 50,44 60,50 66,36 50,28 34,36', lx: 50, ly: 40 },
  { id: 'RF_SHALLOW', label: 'Shallow RF', points: '78,66 70,58 60,50 68,36 86,52', lx: 74, ly: 52 },
  // Outfield
  { id: 'LF', label: 'LF', points: '14,52 32,36 22,22 4,38', lx: 18, ly: 38 },
  { id: 'LC', label: 'LC', points: '32,36 34,36 50,28 44,14 22,22', lx: 36, ly: 25 },
  { id: 'CF', label: 'CF', points: '44,14 50,28 56,14 50,8', lx: 50, ly: 16 },
  { id: 'RC', label: 'RC', points: '66,36 68,36 78,22 56,14 50,28', lx: 64, ly: 25 },
  { id: 'RF', label: 'RF', points: '86,52 68,36 78,22 96,38', lx: 82, ly: 38 },
  // Deep
  { id: 'LF_DEEP', label: 'Deep LF', points: '4,38 22,22 16,14 0,30', lx: 10, ly: 26 },
  { id: 'LC_DEEP', label: 'Deep LC', points: '22,22 44,14 40,4 16,14', lx: 30, ly: 12 },
  { id: 'CF_DEEP', label: 'Deep CF', points: '44,14 50,8 56,14 60,4 40,4', lx: 50, ly: 7 },
  { id: 'RC_DEEP', label: 'Deep RC', points: '56,14 78,22 84,14 60,4', lx: 70, ly: 12 },
  { id: 'RF_DEEP', label: 'Deep RF', points: '78,22 96,38 100,30 84,14', lx: 90, ly: 26 },
  // Foul
  { id: 'FOUL_L', label: 'Foul', points: '50,95 40,85 28,72 22,66 14,52 4,38 0,30 0,95', lx: 8, ly: 70 },
  { id: 'FOUL_R', label: 'Foul', points: '50,95 60,85 72,72 78,66 86,52 96,38 100,30 100,95', lx: 92, ly: 70 }
];

export const ZONE_LABEL: Record<FieldZone, string> = Object.fromEntries(ZONES.map((z) => [z.id, z.label])) as Record<FieldZone, string>;

export function FieldZonePicker({
  zone,
  point,
  onPick
}: {
  zone?: FieldZone;
  point?: { x: number; y: number };
  onPick: (zone: FieldZone, point: { x: number; y: number }) => void;
}) {
  const ref = React.useRef<SVGSVGElement>(null);
  const handle = (z: FieldZone, e: React.MouseEvent | React.PointerEvent) => {
    const svg = ref.current;
    if (!svg) return onPick(z, { x: 0.5, y: 0.5 });
    const rect = svg.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const yDown = (e.clientY - rect.top) / rect.height;
    // y toward outfield: home plate is at the bottom (0.95), fence at the top.
    const y = Math.max(0, Math.min(1, (0.95 - yDown) / 0.95));
    onPick(z, { x: Math.max(0, Math.min(1, x)), y });
  };
  return (
    <svg ref={ref} className="fieldpick" viewBox="0 0 100 100" role="img" aria-label="Field">
      <rect x="0" y="0" width="100" height="100" fill="var(--field-2)" />
      <path d="M50 95 L0 30 Q50 -14 100 30 Z" fill="var(--field)" />
      <path d="M50 95 L22 66 Q50 40 78 66 Z" fill="var(--dirt)" opacity=".85" />
      <path d="M50 88 L34 72 Q50 56 66 72 Z" fill="var(--field)" />
      <line x1="50" y1="95" x2="0" y2="30" stroke="#fff" strokeWidth=".8" />
      <line x1="50" y1="95" x2="100" y2="30" stroke="#fff" strokeWidth=".8" />
      {ZONES.map((z) => (
        <polygon key={z.id} className={`zone ${zone === z.id ? 'on' : ''}`} points={z.points} onClick={(e) => handle(z.id, e)} />
      ))}
      {ZONES.map((z) => (
        <text key={z.id + 't'} x={z.lx} y={z.ly} textAnchor="middle" dominantBaseline="middle">
          {z.label.replace('Shallow ', 'S ').replace('Deep ', 'D ')}
        </text>
      ))}
      {point && <circle className="mark" cx={point.x * 100} cy={95 - point.y * 95} r="2.6" />}
    </svg>
  );
}
