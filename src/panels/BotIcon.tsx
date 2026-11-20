const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/** Blocky pixel spark-bot icon: body with two eye holes, arm bar, four legs. Click to pick its color. */
export function BotIcon({ color, onPick, title = "Bot color (click to change)", size = 26 }: { color: string; onPick: (c: string) => void; title?: string; size?: number }) {
  return (
    <label className="bot-icon" title={title} onClick={stop}>
      <svg viewBox="0 100 576 390" width={size} height={Math.round(size * 0.68)} fill={color} aria-hidden="true">
        <path fillRule="evenodd" d="M70 113H503V405H70Z M142 189H178V258H142Z M396 189H432V258H396Z" />
        <rect x="0" y="258" width="576" height="73" />
        <rect x="106" y="405" width="36" height="70" /><rect x="178" y="405" width="36" height="70" />
        <rect x="359" y="405" width="36" height="70" /><rect x="432" y="405" width="36" height="70" />
      </svg>
      <input type="color" value={color} onChange={(e) => onPick(e.target.value)} />
    </label>
  );
}
