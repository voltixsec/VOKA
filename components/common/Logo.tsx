type LogoProps = {
  compact?: boolean;
};

export function Logo({ compact = false }: LogoProps) {
  return (
    <div className="inline-flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-violet-500 font-bold text-slate-950">
        V
      </div>

      {!compact ? (
        <div>
          <p className="text-lg font-semibold text-white">VOKA</p>
          <p className="text-xs text-slate-400">AI Sales Employee</p>
        </div>
      ) : null}
    </div>
  );
}
