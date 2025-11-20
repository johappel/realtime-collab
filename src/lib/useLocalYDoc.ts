import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { IndexeddbPersistence } from 'y-indexeddb';

// Lokale Y.Doc-Factory für MVP 1 (ohne Nostr)
export function useLocalYDoc(documentId: string) {
  const ydoc = new Y.Doc();
  const yXmlFragment = ydoc.getXmlFragment('prosemirror');
  const awareness = new Awareness(ydoc);

  // Persistenz via IndexedDB
  const persistence = new IndexeddbPersistence(documentId, ydoc);

  return { ydoc, yXmlFragment, awareness, persistence };
}
