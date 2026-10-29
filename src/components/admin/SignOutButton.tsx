"use client";

import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm btn-block"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/staff/login");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
