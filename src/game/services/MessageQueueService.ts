// import { store, setStoreState } from "@/game/store";

// export type MessageQueueItem = {
//   user: string;
//   content: string;
// };

// const MESSAGE_QUEUE_STORE_KEY = "global.messageQueue";

// export class MessageQueueService {
//   private queueState = store<MessageQueueItem[]>(MESSAGE_QUEUE_STORE_KEY);

//   constructor() {}

//   addMessage(item: MessageQueueItem) {
//     const queue = this.queueState?.get() || [];
//     setStoreState(MESSAGE_QUEUE_STORE_KEY, [...queue, item]);
//   }

//   addEmergentMessage(item: MessageQueueItem) {
//     const queue = this.queueState?.get() || [];
//     setStoreState(MESSAGE_QUEUE_STORE_KEY, [item, ...queue]);
//   }

//   removeMessage(index: number) {
//     const queue = this.queueState?.get() || [];
//     if (index < 0 || index >= queue.length) return;
//     queue.splice(index, 1);
//     setStoreState(MESSAGE_QUEUE_STORE_KEY, [...queue]);
//   }

//   clearQueue() {
//     setStoreState(MESSAGE_QUEUE_STORE_KEY, []);
//   }

//   getQueue() {
//     return this.queueState?.get() || [];
//   }

//   watchQueue(callback: (queue: MessageQueueItem[]) => void) {
//     this.queueState?.watch(callback);
//   }

//   unwatchQueue(callback: (queue: MessageQueueItem[]) => void) {
//     this.queueState?.unwatch(callback);
//   }
// }
