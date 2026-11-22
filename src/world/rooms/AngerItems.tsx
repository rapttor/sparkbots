import type { ItemKind } from "./anger";
import { itemDef } from "./anger";

const B = ({ p, s, c, r }: { p: [number, number, number]; s: [number, number, number]; c: string; r?: [number, number, number] }) => (
  <mesh position={p} rotation={r}><boxGeometry args={s} /><meshStandardMaterial color={c} roughness={0.7} /></mesh>
);

/** Low-poly, box-only models of the smashable office junk. Origin = floor centre; each is roughly 0.5-0.9 units tall. Colours come from the item palette (also used for the debris). */
export function ItemModel({ kind }: { kind: ItemKind }) {
  const [a, b, c, d] = itemDef(kind).palette as [string, string, string, string];
  switch (kind) {
    case "computer": return (
      <group>
        <B p={[-0.3, 0.3, 0]} s={[0.26, 0.6, 0.5]} c={a} />                       {/* tower */}
        <B p={[-0.3, 0.4, 0.26]} s={[0.18, 0.04, 0.02]} c={d} />                  {/* drive slot */}
        <B p={[0.12, 0.08, 0]} s={[0.5, 0.16, 0.45]} c={a} />                     {/* monitor base */}
        <B p={[0.12, 0.5, 0]} s={[0.55, 0.45, 0.45]} c={a} />                     {/* CRT body */}
        <B p={[0.12, 0.5, 0.23]} s={[0.42, 0.34, 0.02]} c={c} />                  {/* screen */}
        <B p={[0.12, 0.02, 0.45]} s={[0.55, 0.05, 0.18]} c={b} />                 {/* keyboard */}
      </group>
    );
    case "fax": return (
      <group>
        <B p={[0, 0.15, 0]} s={[0.85, 0.3, 0.6]} c={a} />                          {/* body */}
        <B p={[0, 0.34, -0.05]} s={[0.7, 0.08, 0.4]} c={b} />                     {/* top deck */}
        <B p={[0, 0.55, -0.22]} s={[0.5, 0.35, 0.03]} c={c} r={[-0.25, 0, 0]} />  {/* paper in */}
        <B p={[0, 0.2, 0.34]} s={[0.55, 0.03, 0.2]} c={c} r={[0.3, 0, 0]} />      {/* paper out */}
        <B p={[-0.38, 0.4, 0.05]} s={[0.1, 0.1, 0.5]} c={d} />                     {/* handset */}
        <B p={[0.25, 0.37, 0.2]} s={[0.25, 0.03, 0.12]} c={d} />                  {/* keypad */}
      </group>
    );
    case "floppy": return (
      <group rotation={[0, 0.4, 0]}>
        <B p={[0, 0.03, 0]} s={[0.5, 0.05, 0.5]} c={a} />                          {/* shell */}
        <B p={[0.07, 0.065, -0.14]} s={[0.26, 0.02, 0.2]} c={b} />                {/* metal shutter */}
        <B p={[0, 0.065, 0.14]} s={[0.34, 0.02, 0.2]} c={c} />                    {/* label */}
        <B p={[0.2, 0.065, 0.2]} s={[0.07, 0.02, 0.07]} c={d} />                  {/* write-protect tab */}
      </group>
    );
    case "phone": return (
      <group>
        <B p={[0, 0.1, 0]} s={[0.55, 0.2, 0.45]} c={a} />                          {/* base */}
        <B p={[0, 0.27, 0.08]} s={[0.12, 0.12, 0.3]} c={b} />                     {/* keypad block */}
        <B p={[0, 0.27, -0.13]} s={[0.55, 0.1, 0.12]} c={a} />                    {/* cradle */}
        <B p={[0, 0.38, -0.13]} s={[0.62, 0.1, 0.12]} c={b} />                    {/* handset bar */}
        <B p={[-0.3, 0.32, -0.13]} s={[0.12, 0.2, 0.14]} c={b} />                 {/* earpiece */}
        <B p={[0.3, 0.32, -0.13]} s={[0.12, 0.2, 0.14]} c={b} />                  {/* mouthpiece */}
        <B p={[0.15, 0.22, 0.1]} s={[0.05, 0.03, 0.05]} c={d} />                  {/* buttons */}
      </group>
    );
    case "mail": return (
      <group>
        <B p={[-0.2, 0.06, 0]} s={[0.4, 0.12, 0.5]} c={a} />                       {/* paper stack */}
        <B p={[-0.2, 0.13, 0]} s={[0.36, 0.02, 0.46]} c={b} />
        <B p={[0.2, 0.04, 0.05]} s={[0.5, 0.06, 0.34]} c={a} r={[0, 0.3, 0]} />   {/* envelope */}
        <B p={[0.2, 0.075, 0.05]} s={[0.46, 0.01, 0.1]} c={d} r={[0, 0.3, 0]} />   {/* address */}
        <B p={[0.4, 0.08, 0.14]} s={[0.07, 0.01, 0.08]} c={c} r={[0, 0.3, 0]} />   {/* stamp */}
      </group>
    );
  }
}
