import { Toaster } from "@/components/ui/sonner";
import { useIsMobile } from "@/hooks/use-mobile";

export function AppToaster() {
  const isMobile = useIsMobile();
  return <Toaster richColors position={isMobile ? "top-center" : "top-right"} />;
}
