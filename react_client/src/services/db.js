import localforage from 'localforage';
import { v4 as uuidv4 } from 'uuid';

localforage.config({
  name: 'DTN_Mesh_Chat',
  storeName: 'messages'
});

export const saveMessageLocal = async (msg) => {
  const existing = await localforage.getItem(msg.id);
  if (!existing) {
    await localforage.setItem(msg.id, msg);
    return true;
  }
  return false;
};

export const getLocalMessages = async () => {
  const messages = [];
  await localforage.iterate((value) => {
    messages.push(value);
  });
  // Sort by priority desc, timestamp desc
  messages.sort((a, b) => {
    if (a.priority !== b.priority) {
      return (b.priority || 1) - (a.priority || 1);
    }
    return new Date(b.timestamp) - new Date(a.timestamp);
  });
  return messages;
};

export const createLocalMessage = async (content, senderId, latitude = null, longitude = null) => {
  const msg = {
    id: uuidv4(),
    content,
    sender_id: senderId,
    receiver_id: null,
    timestamp: new Date().toISOString(),
    priority: 1, // Server AI will prioritize and update later
    is_synced: false,
    is_local: true,
    latitude,
    longitude
  };
  await localforage.setItem(msg.id, msg);
  return msg;
};
