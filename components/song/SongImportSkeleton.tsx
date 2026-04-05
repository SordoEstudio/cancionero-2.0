export function SongImportSkeleton() {
  return (
    <div className="animate-pulse space-y-6 p-4">
      {/* Título */}
      <div className="space-y-2">
        <div className="h-7 w-1/2 rounded-md bg-[var(--bg-elevated)]" />
        <div className="h-4 w-1/3 rounded-md bg-[var(--bg-elevated)]" />
      </div>

      {/* Secciones de ejemplo */}
      {[1, 2, 3].map((n) => (
        <div key={n} className="space-y-2">
          <div className="h-3 w-16 rounded bg-[var(--bg-elevated)]" />
          {[1, 2, 3, 4].map((l) => (
            <div key={l} className="space-y-1">
              <div className={`h-3 rounded bg-[var(--bg-elevated)]`} style={{ width: `${50 + Math.random() * 40}%` }} />
              <div className={`h-4 rounded bg-[var(--bg-elevated)]`} style={{ width: `${60 + Math.random() * 30}%` }} />
            </div>
          ))}
        </div>
      ))}

      <p className="text-center text-sm text-[var(--text-muted)] mt-4">
        Importando canción...
      </p>
    </div>
  );
}
