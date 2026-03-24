import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface Message {
    content: string;
    role: string;
    timestamp: bigint;
}
export interface Conversation {
    title: string;
    lastMessageTimestamp: bigint;
    messages: Array<Message>;
}
export interface backendInterface {
    createConversation(title: string): Promise<bigint>;
    deleteConversation(conversationId: bigint): Promise<void>;
    getAllConversations(): Promise<Array<Conversation>>;
    getConversation(conversationId: bigint): Promise<Conversation>;
    sendMessage(conversationId: bigint, content: string): Promise<void>;
}
