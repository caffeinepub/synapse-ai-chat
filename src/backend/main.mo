import Map "mo:core/Map";
import Runtime "mo:core/Runtime";
import Array "mo:core/Array";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Iter "mo:core/Iter";
import Nat "mo:core/Nat";
import Order "mo:core/Order";

actor {
  type Message = {
    role : Text;
    content : Text;
    timestamp : Int;
  };

  type Conversation = {
    title : Text;
    messages : [Message];
    lastMessageTimestamp : Int;
  };

  module Conversation {
    public func compare(a : Conversation, b : Conversation) : Order.Order {
      Int.compare(b.lastMessageTimestamp, a.lastMessageTimestamp);
    };
  };

  var nextConversationId = 0;

  let conversations = Map.empty<Nat, Conversation>();

  func getConversationInternal(conversationId : Nat) : Conversation {
    switch (conversations.get(conversationId)) {
      case (null) { Runtime.trap("Conversation does not exist") };
      case (?conversation) { conversation };
    };
  };

  public shared ({ caller }) func createConversation(title : Text) : async Nat {
    let conversationId = nextConversationId;
    nextConversationId += 1;

    let conversation : Conversation = {
      title;
      messages = [];
      lastMessageTimestamp = Time.now();
    };

    conversations.add(conversationId, conversation);
    conversationId;
  };

  public shared ({ caller }) func sendMessage(conversationId : Nat, content : Text) : async () {
    if (content == "") { Runtime.trap("Cannot send empty message") };

    let conversation = getConversationInternal(conversationId);

    let userMessage : Message = {
      role = "user";
      content;
      timestamp = Time.now();
    };

    let assistantResponse : Message = {
      role = "assistant";
      content = "I'm just a simple echo AI. You said: " # content;
      timestamp = Time.now();
    };

    let updatedMessages = conversation.messages.concat([userMessage, assistantResponse]);

    let updatedConversation : Conversation = {
      conversation with
      messages = updatedMessages;
      lastMessageTimestamp = Time.now();
    };

    conversations.add(conversationId, updatedConversation);
  };

  public query ({ caller }) func getAllConversations() : async [Conversation] {
    conversations.values().toArray().sort();
  };

  public query ({ caller }) func getConversation(conversationId : Nat) : async Conversation {
    getConversationInternal(conversationId);
  };

  public shared ({ caller }) func deleteConversation(conversationId : Nat) : async () {
    if (not conversations.containsKey(conversationId)) {
      Runtime.trap("Conversation does not exist");
    };
    conversations.remove(conversationId);
  };
};
