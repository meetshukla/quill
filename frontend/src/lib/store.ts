"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ComposerMode } from "./types";

// Shared composer state. The assistant populates this, then the user
// navigates to /app/composer to review and explicitly publish/schedule.
// Persisted to localStorage so a draft survives navigation and reloads.

export type ComposerState = {
  mode: ComposerMode;
  text: string;
  threadParts: string[];
  quotePostId: string;
  replyToPostId: string;
  scheduleEnabled: boolean;
  scheduledAt: string; // datetime-local value
  // bumped whenever an external source (assistant) replaces the draft,
  // so the composer page can react / scroll / toast.
  hydrationToken: number;

  setMode: (mode: ComposerMode) => void;
  setText: (text: string) => void;
  setThreadParts: (parts: string[]) => void;
  setQuotePostId: (id: string) => void;
  setReplyToPostId: (id: string) => void;
  setScheduleEnabled: (enabled: boolean) => void;
  setScheduledAt: (value: string) => void;
  reset: () => void;

  // Used by the assistant action cards.
  loadDraft: (input: {
    text: string;
    mode?: ComposerMode;
    scheduledAt?: string;
  }) => void;
};

const initial = {
  mode: "original" as ComposerMode,
  text: "",
  threadParts: ["", ""],
  quotePostId: "",
  replyToPostId: "",
  scheduleEnabled: false,
  scheduledAt: "",
  hydrationToken: 0,
};

export const useComposerStore = create<ComposerState>()(
  persist(
    (set) => ({
      ...initial,
      setMode: (mode) => set({ mode }),
      setText: (text) => set({ text }),
      setThreadParts: (threadParts) => set({ threadParts }),
      setQuotePostId: (quotePostId) => set({ quotePostId }),
      setReplyToPostId: (replyToPostId) => set({ replyToPostId }),
      setScheduleEnabled: (scheduleEnabled) => set({ scheduleEnabled }),
      setScheduledAt: (scheduledAt) => set({ scheduledAt }),
      reset: () =>
        set((s) => ({ ...initial, hydrationToken: s.hydrationToken + 1 })),
      loadDraft: ({ text, mode, scheduledAt }) =>
        set((s) => ({
          text,
          mode: mode ?? s.mode,
          scheduleEnabled: Boolean(scheduledAt) || s.scheduleEnabled,
          scheduledAt: scheduledAt ?? s.scheduledAt,
          hydrationToken: s.hydrationToken + 1,
        })),
    }),
    {
      name: "quill.composer",
      partialize: (s) => ({
        mode: s.mode,
        text: s.text,
        threadParts: s.threadParts,
        quotePostId: s.quotePostId,
        replyToPostId: s.replyToPostId,
        scheduleEnabled: s.scheduleEnabled,
        scheduledAt: s.scheduledAt,
      }),
    },
  ),
);
