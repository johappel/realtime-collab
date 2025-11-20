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
  signAndPublish: (evt: EventTemplate) => Promise<void>,
  debug: boolean = false,
  relays?: string[],
): UseNostrYDocResult {
  // Try to restore clientID from sessionStorage to prevent "ghost users" on reload
  let clientID: number | undefined;
  try {
    const stored = sessionStorage.getItem(`yjs_clientId_${documentId}`);
    if (stored) {
      clientID = parseInt(stored, 10);
      if (debug) console.log(`[useNostrYDoc] Restored clientID: ${clientID}`);
    }
  } catch (e) {
    // ignore
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
      if (debug) console.log(`[useNostrYDoc] Generated new clientID: ${ydoc.clientID}`);
  }
  
  // Store the clientID for next reload
  try {
    sessionStorage.setItem(`yjs_clientId_${documentId}`, ydoc.clientID.toString());
  } catch (e) {
    // ignore
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
  });

  return { ydoc, yXmlFragment, provider, awareness, awarenessProvider, persistence };
}
