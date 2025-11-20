/**
 * NostrYDocProvider.ts
 * 
 * This module implements a Nostr-based Yjs document provider.
 * It allows real-time collaboration by broadcasting and receiving
 * Yjs updates over Nostr relays.
 * 
 * */
 
import * as Y from 'yjs';
import type { EventTemplate, Event } from 'nostr-tools';
import { NativeRelay } from './nostrUtils';

const DEFAULT_RELAYS = [
  'ws://localhost:7000',
];

function uint8ToBase64(u8: Uint8Array): string {
  const CHUNK_SIZE = 0x8000;
  let index = 0;
  const length = u8.length;
  let result = '';
  while (index < length) {
    const slice = u8.subarray(index, Math.min(index + CHUNK_SIZE, length));
    result += String.fromCharCode.apply(null, slice as any);
    index += CHUNK_SIZE;
  }
  return btoa(result);
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
  signAndPublish: (event: EventTemplate) => Promise<Event | void>;
  debug?: boolean;
}

export class NostrYDocProvider {
  private relays: string[];
  private activeRelays: NativeRelay[] = [];

  private ydoc: Y.Doc;

  private documentId: string;

  private myPubkey: string;

  private signAndPublish: (event: EventTemplate) => Promise<Event | void>;
  
  private debug: boolean;

  // Observable for external UI
  public onSnapshot: ((snapshots: Event[]) => void) | null = null;
  private snapshots: Map<string, Event> = new Map(); // id -> event

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
    // if (event.pubkey === this.myPubkey) return; 
    // ^-- REMOVED: This prevents syncing between different tabs/devices 
    // using the same Nostr identity (common in testing).
    // Yjs handles duplicate updates internally anyway.

    try {
        if (event.kind === 31338 || event.kind === 9338) {
            // Snapshot (31338 = Replaceable/Current, 9338 = History)
            if (this.debug) console.log(`[NostrYDocProvider] Received snapshot ${event.id} from ${event.pubkey} (kind ${event.kind})`);
            
            // Store by event ID to allow multiple snapshots (history)
            this.snapshots.set(event.id, event);
            
            if (this.onSnapshot) {
                this.onSnapshot(Array.from(this.snapshots.values()));
            }
        } else {
            // Update (9337)
            const update = base64ToUint8(event.content);
            Y.applyUpdate(this.ydoc, update, 'remote');
            if (this.debug) console.log(`[NostrYDocProvider] Applied update from event ${event.id}`);
        }
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
                kinds: [9337, 31338, 9338],
                '#d': [this.documentId],
            });

            this.activeRelays.push(relay);
        } catch (e) {
            console.error(`[NostrYDocProvider] Failed to connect to ${url}`, e);
        }
    }
  }

  public async saveSnapshot() {
      const state = Y.encodeStateAsUpdate(this.ydoc);
      const base64State = uint8ToBase64(state);
      
      // Use kind 9338 for manual snapshots (History)
      const event: EventTemplate = {
          kind: 9338,
          content: base64State,
          tags: [['d', this.documentId]],
          created_at: Math.floor(Date.now() / 1000),
      };
      
      const signedEvent = await this.signAndPublish(event);
      if (this.debug) console.log(`[NostrYDocProvider] Published snapshot kind 9338`);

      if (signedEvent && (signedEvent as Event).id) {
          // Optimistically update local snapshots map and notify UI
          this.snapshots.set((signedEvent as Event).id, signedEvent as Event);
          if (this.onSnapshot) {
              this.onSnapshot(Array.from(this.snapshots.values()));
          }
      }
  }

  public async applySnapshot(event: Event) {
      try {
          const update = base64ToUint8(event.content);
          Y.applyUpdate(this.ydoc, update, 'remote');
          if (this.debug) console.log(`[NostrYDocProvider] Applied snapshot ${event.id}`);
      } catch (e) {
          console.error("Failed to apply snapshot", e);
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

      this.signAndPublish(nostrEvent).then(() => {
        if (this.debug) console.log(`[NostrYDocProvider] Published update kind 9337`);
      }).catch((error) => {
        console.error('Failed to sign/publish Nostr Yjs event', error);
      });
    });
  }

  destroy() {
    this.activeRelays.forEach(r => r.close());
    this.activeRelays = [];
  }
}
