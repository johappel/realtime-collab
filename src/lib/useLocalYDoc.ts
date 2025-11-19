import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';

// Lokale Y.Doc-Factory für MVP 1 (ohne Nostr)
export function useLocalYDoc(_documentId: string) {
  const ydoc = new Y.Doc();
  const yXmlFragment = ydoc.getXmlFragment('prosemirror');
  const awareness = new Awareness(ydoc);

  return { ydoc, yXmlFragment, awareness };
}
