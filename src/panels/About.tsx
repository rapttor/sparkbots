import { useState } from "react";
import logo from "../assets/rapttor/rapttor_logo-green.png";
import logotype from "../assets/rapttor/rapttor_logo-text-green.png";
import { BRAND } from "../shared/brand";
import { OWNER } from "../shared/owner";
import { EthQr } from "../shared/EthQr";
import { SPONSOR_LINKS, isFilled, type SponsorLink } from "../shared/sponsor";

/** About the maker (the header logo opens it): rapttor's logo, a few words, links and the ways to support SparkBots. Plain links, opened only when you click them. */
export function About() {
  const [copied, setCopied] = useState("");
  const copy = (l: SponsorLink) => { try { void navigator.clipboard?.writeText(l.address ?? ""); } catch { /* clipboard blocked */ } setCopied(l.id); setTimeout(() => setCopied(""), 2500); };
  return (
    <div className="about">
      <div className="about-hero">
        <img className="about-logo" src={logo} alt="The rapttor origami raptor" width={96} />
        <img className="about-type" src={logotype} alt="rapttor" />
      </div>
      <p>{BRAND.name} is made by <b>{OWNER.name}</b>: a personal tool first, local and private, a bit silly on purpose. Everything stays on your machine.</p>
      <p className="about-links">
        <a href={OWNER.site} target="_blank" rel="noopener noreferrer">rapttor.com</a>
        <a href={OWNER.github} target="_blank" rel="noopener noreferrer">GitHub</a>
        <a href={OWNER.repo} target="_blank" rel="noopener noreferrer">{BRAND.name} on GitHub</a>
      </p>
      <h4>Support {BRAND.name}</h4>
      <div className="about-support">
        {SPONSOR_LINKS.map((l) => isFilled(l.href)
          ? <a key={l.id} className="about-btn" href={l.href} target="_blank" rel="noopener noreferrer" title={l.note}>{l.icon} {l.label}</a>
          : l.address ? <button key={l.id} className="about-btn" title={l.note} onClick={() => copy(l)}>{l.icon} {l.label} · {copied === l.id ? "address copied ✓" : "copy address"}</button>
          : <span key={l.id} className="about-btn off" title="Coming soon">{l.icon} {l.label} (soon)</span>)}
      </div>
      <div className="about-eth">
        <EthQr size={120} />
        <small className="muted">Scan with a wallet to tip in ETH (Ethereum mainnet only).</small>
      </div>
      <p className="muted small">MIT licence. Original mascot and artwork. {BRAND.name} is not affiliated with Anthropic, OpenAI or the OpenCode project.</p>
    </div>
  );
}
