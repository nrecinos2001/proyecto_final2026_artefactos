import { Suspense } from "react";
import { DeviceSettings } from "@/components/device-settings";
import { Skeleton } from "@/components/ui";

export default function ConfiguracionPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <DeviceSettings />
    </Suspense>
  );
}
