interface FeaturePlaceholderProps {
  title: string;
  description: string;
}

export default function FeaturePlaceholder({
  title,
  description,
}: FeaturePlaceholderProps) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-8 shadow-sm sm:p-12">
      <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
        AERM workspace
      </span>

      <h2 className="mt-3 text-2xl font-bold tracking-tight text-zinc-900">
        {title}
      </h2>

      <p className="mt-3 max-w-xl text-sm leading-7 text-zinc-500">
        {description}
      </p>

      <div className="mt-8 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-5">
        <p className="text-sm font-medium text-zinc-700">
          Feature implementation pending
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          This workspace will be implemented in its designated development
          phase.
        </p>
      </div>
    </section>
  );
}