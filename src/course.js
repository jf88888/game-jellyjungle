// Course definition for Jelly Jungle.
// Forward is -Z; y is the landing (top) height; r is collision radius.

export const ISLANDS = [
  { id: 1,  x: 0,   z: 0,     y: 1.2, r: 5.4, type: 'start',      name: 'First Leap' },
  { id: 2,  x: 0,   z: -10,   y: 1.6, r: 3.1, type: 'plain',      name: 'Easy Does It' },
  { id: 3,  x: -4,  z: -19,   y: 2.0, r: 3.1, type: 'spring',     name: 'Mushroom Launch' },
  { id: 4,  x: 2,   z: -29,   y: 3.2, r: 3.6, type: 'spinner',    name: 'Candy Spinner' },
  { id: 5,  x: 7,   z: -39,   y: 3.8, r: 4.0, type: 'checkpoint', name: 'Cloud Camp' },
  { id: 6,  x: 1,   z: -49,   y: 4.1, r: 3.1, type: 'moving',     name: 'Wandering Island' },
  { id: 7,  x: -6,  z: -59,   y: 4.7, r: 3.2, type: 'spring',     name: 'Bounce Again' },
  { id: 8,  x: -1,  z: -71,   y: 5.8, r: 3.8, type: 'spinner',    name: 'Double Trouble' },
  { id: 9,  x: 7,   z: -82,   y: 6.5, r: 4.0, type: 'checkpoint', name: 'Starlight Camp' },
  { id: 10, x: 4,   z: -92,   y: 7.1, r: 3.0, type: 'crumble',    name: 'Keep Moving' },
  { id: 11, x: -3,  z: -102,  y: 7.7, r: 3.2, type: 'moving',     name: 'Cloud Crossing' },
  { id: 12, x: -7,  z: -113,  y: 8.2, r: 3.3, type: 'spring',     name: 'One Last Bounce' },
  { id: 13, x: 0,   z: -127,  y: 10.0, r: 5.0, type: 'finish',    name: 'Above the Clouds' },
];

export const CRYSTALS_PER_ISLAND = 3;
export const TOTAL_CRYSTALS = ISLANDS.length * CRYSTALS_PER_ISLAND; // 39

// Deterministic crystal placement: three per island on a ring, offset per island.
export function crystalSpots(island) {
  const spots = [];
  const baseAngle = (island.id * 1.7 + 0.6);
  for (let i = 0; i < CRYSTALS_PER_ISLAND; i++) {
    const a = baseAngle + (i * Math.PI * 2) / CRYSTALS_PER_ISLAND;
    const ringR = island.r * 0.55;
    spots.push({
      x: island.x + Math.cos(a) * ringR,
      z: island.z + Math.sin(a) * ringR,
      y: island.y + 1.15,
    });
  }
  return spots;
}

// Star rating for the finish screen.
export function starsFor(crystals) {
  if (crystals >= 30) return 3;
  if (crystals >= 18) return 2;
  return 1;
}
