"use client";

import { useState } from "react";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/lib/theme";
import { ApiError } from "@/lib/api";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => {
    // A 403 can mean an admin just changed this person's role: re-read /auth/me so the menu
    // and buttons catch up (the API already refused the call).
    const onError = (err: unknown) => {
      if (err instanceof ApiError && err.status === 403 && err.code === "FORBIDDEN") void qc.invalidateQueries({ queryKey: ["me"] });
    };
    const qc: QueryClient = new QueryClient({
        queryCache: new QueryCache({ onError }),
        mutationCache: new MutationCache({ onError }),
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // Don't retry what will fail again (401/403/404/400).
            retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
          },
        },
      });
    return qc;
  });
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}
