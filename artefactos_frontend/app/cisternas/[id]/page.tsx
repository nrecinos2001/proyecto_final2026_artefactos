import { Suspense } from "react";
import { Dashboard, DashboardSkeleton } from "@/components/dashboard";

export default function CisternaPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}
