import Link from "next/link";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="brand" aria-label="TableFlow home">
      <span className="brand-mark" aria-hidden="true">
        TF
      </span>
      <span>TableFlow</span>
    </Link>
  );
}
