import { Card } from "../../../components/ui";

export function CustomerLoading() {
  return (
    <Card>
      <div className="space-y-4">
        <div className="h-4 w-40 animate-pulse rounded bg-white/10" />
        <div className="h-12 animate-pulse rounded-xl bg-white/5" />
        <div className="h-12 animate-pulse rounded-xl bg-white/5" />
        <div className="h-12 animate-pulse rounded-xl bg-white/5" />
      </div>
    </Card>
  );
}
