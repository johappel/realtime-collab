import * as Y from 'yjs';
import { SimplePool, type EventTemplate, type Event } from 'nostr-tools';

const DEFAULT_RELAYS = ['wss://relay.damus.io'];

function uint8ToBase64(u8: Uint8Array): string {
  return btoa(String.fromCharCode(...u8));
}

function base64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    u8[i] = bin.charCodeAt(i);
  }
  return u8;
}

export interface NostrYDocProviderOptions {
  ydoc: Y.Doc;
  documentId: string;
  relays?: string[];
  myPubkey: string;
  signAndPublish: (event: EventTemplate) => Promise<void>;
}

// Bidirektionales Binding Yjs ↔ Nostr für Dokument-Updates
type SubCloser = {
  close: (reason?: string) => void;
};

export class NostrYDocProvider {
  private pool: SimplePool;

  private relays: string[];

  private sub: SubCloser | null = null;

  private ydoc: Y.Doc;

  private documentId: string;

  private myPubkey: string;

  private signAndPublish: (event: EventTemplate) => Promise<void>;

  constructor(opts: NostrYDocProviderOptions) {
    this.ydoc = opts.ydoc;
    this.documentId = opts.documentId;
    this.relays = opts.relays ?? DEFAULT_RELAYS;
    this.myPubkey = opts.myPubkey;
    this.signAndPublish = opts.signAndPublish;

    this.pool = new SimplePool();

    this.subscribe();
    this.bindYDocUpdates();
  }

  private subscribe() {
    this.sub = this.pool.subscribeMany(
      this.relays,
      {
        kinds: [31337],
        '#d': [this.documentId],
      },
      {
        onevent: (event: Event) => {
          try {
            if (event.pubkey === this.myPubkey) return;
            const update = base64ToUint8(event.content);
            Y.applyUpdate(this.ydoc, update, 'remote');
          } catch (error) {
            console.error('Failed to apply Yjs update from Nostr event', error);
          }
        },
      },
    );
  }

  private bindYDocUpdates() {
    this.ydoc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote') return;

      const base64Update = uint8ToBase64(update);

      const nostrEvent: EventTemplate = {
        kind: 31337,
        content: base64Update,
        tags: [['d', this.documentId]],
        created_at: Math.floor(Date.now() / 1000),
      };

      this.signAndPublish(nostrEvent).catch((error) => {
        console.error('Failed to sign/publish Nostr Yjs event', error);
      });
    });
  }

  destroy() {
    this.sub?.close('teardown');
    this.sub = null;

    this.pool.close(this.relays);
  }
}
