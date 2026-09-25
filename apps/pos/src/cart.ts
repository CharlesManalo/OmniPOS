import { create } from "zustand";
import { invoke } from "../../../packages/ui/api";
let opening: Promise<{ id: string }> | null = null;
let generation = 0;
export const useCart = create<{
  saleId: string | null;
  items: Record<string, number>;
  add: (id: string) => Promise<void>;
  quantity: (id: string, n: number) => void;
  clear: () => void;
}>((set, get) => ({
  saleId: null,
  items: {},
  add: async (id) => {
    const started = generation;
    let saleId = get().saleId;
    if (!saleId) {
      opening ??= invoke<{ id: string }>({ action: "pos.beginSale" }).finally(
        () => {
          opening = null;
        },
      );
      saleId = (await opening).id;
    }
    if (started !== generation) {
      await invoke({ action: "pos.cancelSale", id: saleId });
      return;
    }
    set((s) => ({
      saleId,
      items: { ...s.items, [id]: (s.items[id] ?? 0) + 1 },
    }));
  },
  quantity: (id, n) => {
    const items = { ...get().items };
    if (n <= 0) delete items[id];
    else items[id] = n;
    if (!Object.keys(items).length) get().clear();
    else set({ items });
  },
  clear: () => {
    generation++;
    const id = get().saleId;
    set({ items: {}, saleId: null });
    if (id) void invoke({ action: "pos.cancelSale", id }).catch(() => {});
  },
}));
