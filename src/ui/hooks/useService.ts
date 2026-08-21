import { useMemo } from "react";
import { usePlugin } from "@/ui/context/PluginContext";
import type { Cradle } from "@/domain/types";

export function useService<K extends keyof Cradle>(key: K): Cradle[K] {
	const plugin = usePlugin();
	return useMemo((): Cradle[K] => {
		return plugin.container.resolve(key);
	}, [plugin, key]);
}
