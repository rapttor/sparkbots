import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type { Layout } from "../layout";
import { roams } from "../roam";
import { SPONSOR_LINES, SPONSOR_LINKS, filledLinks, isFilled, isUsable, type SponsorLink } from "../../shared/sponsor";
import { ETH_QR } from "../../shared/sponsorQr";
import { SPONSOR_BUBBLE_FLAG, mayShow, type SponsorBubbleState } from "./sponsorBubbles";
import { loadFlag } from "./fire";
import { bubble, btn, btnOff, panel, pointer, Stop, RoomHtml } from "./ui";

/** Open a sponsor link. Only ever called from a click, and only for a real https address ("#" placeholders do nothing). */
export function openSponsor(l: SponsorLink): boolean {
  if (l.address && isUsable(l)) { try { void navigator.clipboard?.writeText(l.address); } catch { /* clipboard blocked: nothing happens */ } return true; } // a receive address is copied, never opened
  if (!isFilled(l.href)) return false;
  window.open(l.href, "_blank", "noopener,noreferrer");
  return true;
}

/** The QR code of the Ethereum address (drawn from `sponsorQr.ts`, white square with a quiet zone so wallets can scan it from the screen). */
export function EthQr({ size = 132 }: { size?: number }) {
  const q = 4, n = ETH_QR.size;
  return (
    <svg role="img" aria-label="QR code of the Ethereum address" width={size} height={size} viewBox={`${-q} ${-q} ${n + 2 * q} ${n + 2 * q}`} shapeRendering="crispEdges" style={{ background: "#fff", borderRadius: 6, display: "block" }}>
      <path d={ETH_QR.path} fill="#000" />
    </svg>
  );
}

function Cards({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState("");
  return (
    <div style={panel}>
      <div style={{ fontWeight: 700, marginBottom: 4, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <span>💛 Support SparkBots</span>
        <button style={{ background: "none", border: 0, color: "inherit", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 2px" }} aria-label="Close" title="Close (Esc)" onClick={onClose}>×</button>
      </div>
      {SPONSOR_LINKS.map((l) => {
        const ok = isUsable(l);
        return <button key={l.id} style={ok ? btn : btnOff} disabled={!ok} title={ok ? l.note : "Coming soon"} onClick={() => { if (openSponsor(l) && l.address) { setCopied(l.id); setTimeout(() => setCopied(""), 2500); } }}>{l.icon} {l.label}{ok ? (copied === l.id ? " · address copied ✓" : l.address ? " · copy address" : "") : " (soon)"}</button>;
      })}
      <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center" }}>
        <EthQr />
        <div style={{ fontSize: 11, opacity: 0.8, maxWidth: 150 }}>Scan with your wallet to tip in ETH (Ethereum mainnet only).</div>
      </div>
    </div>
  );
}

/** The sponsor room (one card per link) and the rare idle sponsor bubble (opt-in, frequency-capped; click opens the cards, never a link). */
export function SponsorRoom({ layout }: { layout: Layout }) {
  const sz = layout.zones.find((z) => z.zone.id === "sponsor-room");
  const [open, setOpen] = useState(false);
  const [say, setSay] = useState<{ id: string; text: string } | null>(null);
  useEffect(() => { // Esc closes the support card
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); setOpen(false); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [open]);
  const st = useRef<SponsorBubbleState>({ lastAt: 0, shown: 0 });
  const lastCheck = useRef(0);
  const lay = useRef(layout); lay.current = layout;
  const pos = useRef({ x: 0, z: 0 });

  useFrame(() => {
    const now = Date.now();
    if (say) { const r = roams.get(say.id); if (r) { pos.current.x = r.x; pos.current.z = r.z; } return; }
    if (now - lastCheck.current < 30_000) return;
    lastCheck.current = now;
    if (!mayShow(st.current, now, loadFlag(SPONSOR_BUBBLE_FLAG), filledLinks().length > 0) || Math.random() > 0.2) return;
    const idle = lay.current.desks.filter((d) => d.worker.state === "idle" && roams.has(d.worker.id));
    const pick = idle[Math.floor(Math.random() * idle.length)];
    if (!pick) return;
    st.current = { lastAt: now, shown: st.current.shown + 1 };
    setSay({ id: pick.worker.id, text: SPONSOR_LINES[Math.floor(Math.random() * SPONSOR_LINES.length)]! });
    setTimeout(() => setSay(null), 9000);
  });

  if (!sz) return null;
  return (
    <>
      {SPONSOR_LINKS.map((l, i) => {
        const ok = isUsable(l);
        return (
          <group key={l.id} position={[sz.x + (i - 1.5) * 2, 0.8, sz.z - 1.0]}
            onClick={(e) => { e.stopPropagation(); openSponsor(l); }} {...(ok ? pointer : {})}>
            <mesh position={[0, 0.2, 0]}><boxGeometry args={[0.7, 0.4, 0.1]} /><meshStandardMaterial color={ok ? "#fbbf24" : "#6b7280"} /></mesh>
            <RoomHtml position={[0, 0.9 + (i % 2) * 0.5, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}><div style={{ ...bubble, opacity: ok ? 1 : 0.6 }}>{l.icon} {l.label}{ok ? "" : " (soon)"}</div></RoomHtml>
          </group>
        );
      })}
      {/* the "info stand" in front of the pedestals (a visit stands at z+1.0, so it sits a little further out) */}
      <mesh position={[sz.x, 0.4, sz.z + 1.9]} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} {...pointer}>
        <boxGeometry args={[0.6, 0.8, 0.6]} /><meshStandardMaterial color="#a78bfa" />
      </mesh>
      {!open && <RoomHtml position={[sz.x, 1.2, sz.z + 1.9]} center zIndexRange={[10, 0]}><Stop><div style={{ ...bubble, pointerEvents: "auto", cursor: "pointer" }} onClick={() => setOpen(true)}>💛 Support</div></Stop></RoomHtml>}
      {open && <RoomHtml position={[sz.x, 1.5, sz.z + 1.9]} center zIndexRange={[30, 0]}><Stop><Cards onClose={() => setOpen(false)} /></Stop></RoomHtml>}
      {say && (
        <group position={[pos.current.x, 2.6, pos.current.z]}>
          <RoomHtml center zIndexRange={[20, 0]}><Stop><div style={{ ...bubble, pointerEvents: "auto", cursor: "pointer" }} onClick={() => { setOpen(true); setSay(null); }}>{say.text}</div></Stop></RoomHtml>
        </group>
      )}
    </>
  );
}
