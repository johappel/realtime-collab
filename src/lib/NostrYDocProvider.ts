import * as Y from 'yjs';
import type { EventTemplate, Event } from 'nostr-tools';
import { NativeRelay } from './nostrUtils';

const DEFAULT_RELAYS = [
  'ws://localhost:7000',
];

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
  debug?: boolean;
}

export class NostrYDocProvider {
  private relays: string[];
  private activeRelays: NativeRelay[] = [];

  private ydoc: Y.Doc;

  private documentId: string;

  private myPubkey: string;

  private signAndPublish: (event: EventTemplate) => Promise<void>;
  
  private debug: boolean;

  constructor(opts: NostrYDocProviderOptions) {
    this.ydoc = opts.ydoc;
    this.documentId = opts.documentId;
    this.relays = opts.relays ?? DEFAULT_RELAYS;
    this.myPubkey = opts.myPubkey;
    this.signAndPublish = opts.signAndPublish;
    this.debug = opts.debug ?? false;

    this.subscribe();
    this.bindYDocUpdates();
  }

  private applyEvent(event: Event) {
    try {
        const update = base64ToUint8(event.content);
        Y.applyUpdate(this.ydoc, update, 'remote');
        if (this.debug) console.log(`[NostrYDocProvider] Applied update from event ${event.id}`);
    } catch (error) {
        // Warnung statt Error, da es sich oft um alte/ungültige Test-Events handelt (z.B. "debug-content...")
        if (this.debug) console.warn(`[NostrYDocProvider] Skipping invalid event ${event.id}:`, error instanceof Error ? error.message : String(error));
    }
  }

  private subscribe() {
    if (this.debug) console.log(`[NostrYDocProvider] Connecting to relays:`, this.relays);
    
    for (const url of this.relays) {
        try {
            const relay = new NativeRelay(url, (event) => {
                this.applyEvent(event);
            }, this.debug);
            
            relay.sendReq({
                kinds: [9337],
                '#d': [this.documentId],
            });

            this.activeRelays.push(relay);
        } catch (e) {
            console.error(`[NostrYDocProvider] Failed to connect to ${url}`, e);
        }
    }
  }

  private bindYDocUpdates() {
    this.ydoc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote') return;

      const base64Update = uint8ToBase64(update);

      const nostrEvent: EventTemplate = {
        kind: 9337,
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
    this.activeRelays.forEach(r => r.close());
    this.activeRelays = [];
  }
}
