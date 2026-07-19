"use client";

import { create } from "zustand";
import type { ProctoringEvent } from "@/types/proctor";

interface ProctorState {
  isMonitoring: boolean;
  events: ProctoringEvent[];
  integrityScore: number;
  tabSwitches: number;
  setMonitoring: (active: boolean) => void;
  addEvent: (event: ProctoringEvent) => void;
  setIntegrityScore: (score: number) => void;
  incrementTabSwitches: () => void;
  reset: () => void;
}

export const useProctorStore = create<ProctorState>((set) => ({
  isMonitoring: false,
  events: [],
  integrityScore: 100,
  tabSwitches: 0,
  setMonitoring: (active) => set({ isMonitoring: active }),
  addEvent: (event) => set((state) => ({ events: [...state.events, event] })),
  setIntegrityScore: (score) => set({ integrityScore: score }),
  incrementTabSwitches: () =>
    set((state) => ({ tabSwitches: state.tabSwitches + 1 })),
  reset: () =>
    set({ isMonitoring: false, events: [], integrityScore: 100, tabSwitches: 0 }),
}));
