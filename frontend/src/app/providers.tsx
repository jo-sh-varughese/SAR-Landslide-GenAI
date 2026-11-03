"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { TipProvider } from "@/components/ui/primitives";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 30_000 } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <TipProvider delayDuration={250}>{children}</TipProvider>
    </QueryClientProvider>
  );
}
