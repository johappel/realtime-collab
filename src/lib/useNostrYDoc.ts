import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import type { EventTemplate } from 'nostr-tools';
import { NostrYDocProvider } from './NostrYDocProvider';
import { NostrAwarenessProvider } from './NostrAwarenessProvider';

export interface UseNostrYDocResult {
  ydoc: Y.Doc;
  yXmlFragment: Y.XmlFragment;
  provider: NostrYDocProvider;
  awareness: Awareness;
  awarenessProvider: NostrAwarenessProvider;
}

export function useNostrYDoc(
  documentId: string,
  myPubkey: string,
  signAndPublish: (evt: EventTemplate) => Promise<void>,
  debug: boolean = false,
): UseNostrYDocResult {
  const ydoc = new Y.Doc();
  const yXmlFragment = ydoc.getXmlFragment('prosemirror');
  const awareness = new Awareness(ydoc);

  const provider = new NostrYDocProvider({
    ydoc,
    documentId,
    myPubkey,
    signAndPublish,
    debug,
  });

  const awarenessProvider = new NostrAwarenessProvider({
    awareness,
    documentId,
    myPubkey,
    signAndPublish,
  });

  return { ydoc, yXmlFragment, provider, awareness, awarenessProvider };
}
