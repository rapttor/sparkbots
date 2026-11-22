import type { Weapon } from "./anger";

const Box = ({ p, s, c }: { p: [number, number, number]; s: [number, number, number]; c: string }) => (
  <mesh position={p} castShadow={false}><boxGeometry args={s} /><meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.5} roughness={0.7} /></mesh>
);

/** Low-poly, box-only weapon along +z from the grip (z = 0) to the head (z = length). One shape per weapon so each reads at a glance. */
export function WeaponModel({ w }: { w: Weapon }) {
  const L = w.length;
  switch (w.id) {
    case "bat": return (<group>
      <Box p={[0, 0, L * 0.18]} s={[0.05, 0.05, L * 0.36]} c={w.shaft} />
      <Box p={[0, 0, L * 0.58]} s={[0.09, 0.09, L * 0.44]} c={w.shaft} />
      <Box p={[0, 0, L * 0.88]} s={[0.13, 0.13, L * 0.24]} c={w.head} />
      <Box p={[0, 0, -0.02]} s={[0.08, 0.08, 0.04]} c="#3f2d1d" /></group>);
    case "hammer": return (<group>
      <Box p={[0, 0, L / 2]} s={[0.06, 0.06, L]} c={w.shaft} />
      <Box p={[0, 0, L]} s={[0.17, 0.17, 0.28]} c={w.head} />
      <Box p={[0, 0, L + 0.17]} s={[0.2, 0.2, 0.06]} c="#cbd5e1" /></group>);
    case "wrench": return (<group>
      <Box p={[0, 0, L / 2]} s={[0.07, 0.04, L]} c={w.shaft} />
      <Box p={[0.09, 0, L + 0.02]} s={[0.05, 0.05, 0.22]} c={w.head} /><Box p={[-0.09, 0, L + 0.02]} s={[0.05, 0.05, 0.22]} c={w.head} />
      <Box p={[0, 0, L + 0.12]} s={[0.23, 0.05, 0.05]} c={w.head} /><Box p={[0, 0, L - 0.08]} s={[0.23, 0.05, 0.05]} c={w.head} /></group>);
    case "pry-bar": return (<group>
      <Box p={[0, 0, L / 2]} s={[0.05, 0.05, L]} c={w.shaft} />
      <Box p={[0, 0.05, L]} s={[0.05, 0.13, 0.05]} c={w.head} />
      <Box p={[0, 0.1, L + 0.07]} s={[0.05, 0.04, 0.16]} c={w.head} />
      <Box p={[0, 0, -0.03]} s={[0.09, 0.07, 0.07]} c={w.head} /></group>);
    default: return (<group>   // wrecking bar: long, with a hooked claw end and a chisel end
      <Box p={[0, 0, L / 2]} s={[0.07, 0.07, L]} c={w.shaft} />
      <Box p={[0, 0.07, L]} s={[0.07, 0.2, 0.07]} c={w.head} />
      <Box p={[0, 0.15, L + 0.1]} s={[0.07, 0.06, 0.24]} c={w.head} />
      <Box p={[0, 0.05, -0.05]} s={[0.12, 0.04, 0.12]} c={w.head} /></group>);
  }
}
