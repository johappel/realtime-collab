import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { IndexeddbPersistence } from 'y-indexeddb';
import type { EventTemplate } from 'nostr-tools';
import { NostrYDocProvider } from './NostrYDocProvider';
import { NostrAwarenessProvider } from './NostrAwarenessProvider';

export interface UseNostrYDocResult {
  ydoc: Y.Doc;
  yXmlFragment: Y.XmlFragment;
  provider: NostrYDocProvider;
  awareness: Awareness;
  awarenessProvider: NostrAwarenessProvider;
  persistence: IndexeddbPersistence;
}

export function useNostrYDoc(
  documentId: string,
  myPubkey: string,
  signAndPublish: (evt: EventTemplate) => Promise<any>,
  debug: boolean = false,
  relays?: string[],
  userIdentifier?: string, // Optional: unique user identifier (e.g., nickname in group mode)
  isGroupMode: boolean = false, // If true, allows multiple users with same pubkey
): UseNostrYDocResult {
  // Try to restore clientID to prevent "ghost users" on reload
  // In group mode, we need to use a user-specific key to ensure each user gets their own clientID
  let clientID: number | undefined;
  try {
    // Use userIdentifier (nickname) if provided to make clientID unique per user, not just per document
    const storageKey = userIdentifier 
      ? `yjs_clientId_${documentId}_${userIdentifier}` 
      : `yjs_clientId_${documentId}`;
    
    // Use localStorage instead of sessionStorage for group mode to persist across tabs/sessions
    const storage = userIdentifier ? localStorage : sessionStorage;
    const stored = storage.getItem(storageKey);
    
    if (stored) {
      clientID = parseInt(stored, 10);
      console.log(`[useNostrYDoc] ✅ Restored clientID: ${clientID} for user: ${userIdentifier || 'default'}`);
    }
  } catch (e) {
    console.warn('[useNostrYDoc] Failed to restore clientID:', e);
  }

  // If no stored ID, Yjs will generate one. We should store it after creation.
  // However, Y.Doc constructor allows passing clientID.
  // If we don't pass it, it's random.
  
  const ydocOptions: any = {};
  if (clientID) {
    ydocOptions.clientID = clientID;
  }

  const ydoc = new Y.Doc(ydocOptions);
  
  if (!clientID) {
      console.log(`[useNostrYDoc] 🆕 Generated new clientID: ${ydoc.clientID} for user: ${userIdentifier || 'default'}`);
  }
  
  // Store the clientID for next reload with user-specific key
  try {
    const storageKey = userIdentifier 
      ? `yjs_clientId_${documentId}_${userIdentifier}` 
      : `yjs_clientId_${documentId}`;
    
    // Use localStorage for group mode to persist across tabs/sessions
    const storage = userIdentifier ? localStorage : sessionStorage;
    storage.setItem(storageKey, ydoc.clientID.toString());
    console.log(`[useNostrYDoc] 💾 Stored clientID: ${ydoc.clientID} with key: ${storageKey}`);
  } catch (e) {
    console.warn('[useNostrYDoc] Failed to store clientID:', e);
  }

  const yXmlFragment = ydoc.getXmlFragment('prosemirror');
  const awareness = new Awareness(ydoc);

  // Persistenz via IndexedDB (Offline-Support)
  const persistence = new IndexeddbPersistence(documentId, ydoc);

  const provider = new NostrYDocProvider({
    ydoc,
    documentId,
    myPubkey,
    signAndPublish,
    debug,
    relays,
  });

  const awarenessProvider = new NostrAwarenessProvider({
    awareness,
    documentId,
    myPubkey,
    signAndPublish,
    relays,
    debug,
    isGroupMode,
  });

  return { ydoc, yXmlFragment, provider, awareness, awarenessProvider, persistence };
}
