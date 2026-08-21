import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 0,
			gcTime: 0,
			retry: 0,
			refetchOnWindowFocus: false,
		},
		mutations: {
			retry: 0,
		},
	},
});
