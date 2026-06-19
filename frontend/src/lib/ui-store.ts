"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type UiState = {
  assistantOpen: boolean;
  setAssistantOpen: (open: boolean) => void;
  toggleAssistant: () => void;

  // Incremented to ask the assistant panel to open + focus its input.
  assistantFocusTick: number;
  focusAssistant: () => void;

  // Optional text to drop into the assistant's draft box on next focus
  // (e.g. "Improve with assistant" from the composer).
  pendingSeed: string | null;
  seedAssistant: (text: string) => void;
  clearSeed: () => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      assistantOpen: true,
      setAssistantOpen: (assistantOpen) => set({ assistantOpen }),
      toggleAssistant: () => set((s) => ({ assistantOpen: !s.assistantOpen })),

      assistantFocusTick: 0,
      focusAssistant: () =>
        set((s) => ({
          assistantOpen: true,
          assistantFocusTick: s.assistantFocusTick + 1,
        })),

      pendingSeed: null,
      seedAssistant: (text) =>
        set((s) => ({
          assistantOpen: true,
          pendingSeed: text,
          assistantFocusTick: s.assistantFocusTick + 1,
        })),
      clearSeed: () => set({ pendingSeed: null }),
    }),
    {
      name: "quill.ui",
      partialize: (s) => ({ assistantOpen: s.assistantOpen }),
    },
  ),
);
