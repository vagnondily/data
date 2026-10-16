interface Counts {
  active: number;
  paused: number;
  completed: number;
  total: number;
}

interface Props {
  counts: Counts;
  onPaste: () => void;
  onResumeAll: () => void;
  onPauseAll: () => void;
  onClearCompleted: () => void;
  onClearAll: () => void;
  onSettings: () => void;
}

interface ToolProps {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  badge?: number;
}

function Tool({ icon, label, onClick, disabled, danger, badge }: ToolProps) {
  return (
    <button
      className={`tool-btn ${danger ? "danger" : ""}`}
      onClick={onClick}
      disabled={disabled}
      title={label}
    >
      <span className="tool-icon">{icon}</span>
      <span className="tool-label">{label}</span>
      {badge ? <span className="tool-badge">{badge}</span> : null}
    </button>
  );
}

// Barre d'outils façon IDM : actions globales bien visibles.
export function Toolbar({
  counts,
  onPaste,
  onResumeAll,
  onPauseAll,
  onClearCompleted,
  onClearAll,
  onSettings,
}: Props) {
  return (
    <div className="toolbar">
      <Tool icon="📋" label="Coller le lien" onClick={onPaste} />
      <div className="tool-sep" />
      <Tool
        icon="▶"
        label="Tout reprendre"
        onClick={onResumeAll}
        disabled={counts.paused === 0}
        badge={counts.paused}
      />
      <Tool
        icon="⏸"
        label="Tout suspendre"
        onClick={onPauseAll}
        disabled={counts.active === 0}
        badge={counts.active}
      />
      <div className="tool-sep" />
      <Tool
        icon="🧹"
        label="Nettoyer terminés"
        onClick={onClearCompleted}
        disabled={counts.completed === 0}
        badge={counts.completed}
      />
      <Tool
        icon="🗑"
        label="Tout supprimer"
        onClick={onClearAll}
        disabled={counts.total === 0}
        danger
      />
      <div className="tool-spacer" />
      <Tool icon="⚙️" label="Paramètres" onClick={onSettings} />
    </div>
  );
}
