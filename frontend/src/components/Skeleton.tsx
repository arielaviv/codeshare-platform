export function SkeletonLine({ width = '100%', height = '14px' }: { width?: string; height?: string }) {
  return <div className="skeleton" style={{ width, height }} />;
}

export function SkeletonCard() {
  return (
    <div className="border border-edge dark:border-[#2A2A2A] rounded p-5 bg-white dark:bg-[#141414]">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="skeleton w-8 h-8 rounded-full" />
        <div className="flex-1">
          <div className="skeleton h-3 w-24 mb-1.5" />
          <div className="skeleton h-2.5 w-16" />
        </div>
      </div>
      <div className="skeleton h-4 w-3/4 mb-2" />
      <div className="skeleton h-3 w-full mb-1" />
      <div className="skeleton h-3 w-2/3 mb-4" />
      <div className="skeleton h-[200px] w-full rounded mb-4" />
      <div className="flex gap-4 pt-3 border-t border-edge dark:border-[#2A2A2A]">
        <div className="skeleton h-3 w-12" />
        <div className="skeleton h-3 w-12" />
      </div>
    </div>
  );
}

export function SkeletonComment() {
  return (
    <div className="border-b border-edge-light dark:border-[#2A2A2A] pb-4">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="skeleton h-3 w-20" />
        <div className="skeleton h-2.5 w-14" />
      </div>
      <div className="skeleton h-3 w-full mb-1" />
      <div className="skeleton h-3 w-4/5" />
    </div>
  );
}

export function SkeletonProfile() {
  return (
    <div className="border border-edge dark:border-[#2A2A2A] rounded p-6 bg-white dark:bg-[#141414]">
      <div className="flex items-center gap-4">
        <div className="skeleton w-16 h-16 rounded-full" />
        <div className="flex-1">
          <div className="skeleton h-5 w-32 mb-2" />
          <div className="skeleton h-3 w-48 mb-1" />
          <div className="skeleton h-3 w-24" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonProjectCard() {
  return (
    <div className="bg-[#141414] border border-[#2A2A2A] rounded-lg p-4">
      <div className="skeleton h-4 w-3/4 mb-2" />
      <div className="skeleton h-3 w-1/2 mb-3" />
      <div className="flex gap-2">
        <div className="skeleton h-5 w-16 rounded-full" />
        <div className="skeleton h-5 w-14 rounded-full" />
      </div>
    </div>
  );
}
