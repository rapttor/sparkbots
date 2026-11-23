import { ETH_QR } from "./sponsorQr";

/** The QR code of the Ethereum address (drawn from `sponsorQr.ts`): a white square with a quiet zone so wallets can scan it from the screen. */
export function EthQr({ size = 132 }: { size?: number }) {
  const q = 4, n = ETH_QR.size;
  return (
    <svg role="img" aria-label="QR code of the Ethereum address" width={size} height={size} viewBox={`${-q} ${-q} ${n + 2 * q} ${n + 2 * q}`} shapeRendering="crispEdges" style={{ background: "#fff", borderRadius: 6, display: "block" }}>
      <path d={ETH_QR.path} fill="#000" />
    </svg>
  );
}
