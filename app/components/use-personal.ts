"use client";
import { useSyncExternalStore } from "react";
import { getPersonalStore } from "../../lib/personal-store";
export function usePersonalData(){const store=getPersonalStore();return useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot);}
