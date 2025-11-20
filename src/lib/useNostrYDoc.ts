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
  const ydoc = new Y.Doc();
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
  });

  return { ydoc, yXmlFragment, provider, awareness, awarenessProvider, persistence };
}
