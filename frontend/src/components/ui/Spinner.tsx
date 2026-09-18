export function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const cls = { sm: "h-4 w-4", md: "h-6 w-6", lg: "h-10 w-10" }[size];
  return (
    <div
      className={`${cls} animate-spin rounded-full border-2 border-gray-300 border-t-blue-600`}
      role="status"
      aria-label="Lädt…"
    />
  );
}
