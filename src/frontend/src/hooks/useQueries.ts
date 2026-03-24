import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Conversation, Message } from "../backend.d";
import { useActor } from "./useActor";

// ---- Conversation ID store (localStorage) ----
const STORAGE_KEY = "synapse_conv_ids";

export interface ConvMeta {
  id: string; // bigint serialized as string
  title: string;
  createdAt: number;
}

export function getStoredConvIds(): ConvMeta[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveConvIds(ids: ConvMeta[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

function addConvId(meta: ConvMeta) {
  const ids = getStoredConvIds();
  saveConvIds([meta, ...ids]);
}

function removeConvId(id: string) {
  const ids = getStoredConvIds().filter((m) => m.id !== id);
  saveConvIds(ids);
}

// ---- Hooks ----

export function useConversationList() {
  // returns stored metadata — no backend call needed for listing
  return getStoredConvIds();
}

export function useGetConversation(conversationId: string | null) {
  const { actor, isFetching } = useActor();
  return useQuery<Conversation | null>({
    queryKey: ["conversation", conversationId],
    queryFn: async () => {
      if (!actor || !conversationId) return null;
      return actor.getConversation(BigInt(conversationId));
    },
    enabled: !!actor && !isFetching && !!conversationId,
    staleTime: 5000,
  });
}

export function useCreateConversation() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (title: string) => {
      if (!actor) throw new Error("Actor not ready");
      const id = await actor.createConversation(title);
      const meta: ConvMeta = {
        id: id.toString(),
        title,
        createdAt: Date.now(),
      };
      addConvId(meta);
      return meta;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["convList"] });
    },
  });
}

export function useSendMessage(conversationId: string | null) {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (content: string) => {
      if (!actor || !conversationId) throw new Error("Not ready");
      await actor.sendMessage(BigInt(conversationId), content);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["conversation", conversationId],
      });
    },
  });
}

export function useDeleteConversation() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!actor) throw new Error("Actor not ready");
      await actor.deleteConversation(BigInt(id));
      removeConvId(id);
    },
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: ["conversation", id] });
      queryClient.invalidateQueries({ queryKey: ["convList"] });
    },
  });
}

export type { Conversation, Message };
