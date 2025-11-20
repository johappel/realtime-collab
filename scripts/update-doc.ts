
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Highlight } from '@tiptap/extension-highlight';
import Collaboration from '@tiptap/extension-collaboration';
import * as Y from 'yjs';
import { marked } from 'marked';
import { JSDOM } from 'jsdom';
import { WebSocket } from 'ws';
import { generateSecretKey, finalizeEvent, type EventTemplate, type Event } from 'nostr-tools';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Polyfills for Node.js environment
global.WebSocket = WebSocket as any;
const dom = new JSDOM('<!DOCTYPE html><body></body>');
global.window = dom.window as any;
global.document = dom.window.document;
// Node.js 22+ has a read-only global.navigator. We use defineProperty to override it.
Object.defineProperty(global, 'navigator', {
    value: dom.window.navigator,
    writable: true,
    configurable: true,
});

// Helper: Base64 conversion
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

// Minimal NativeRelay for Node.js (copied/adapted from nostrUtils to be standalone)
class NodeRelay {
    private ws: WebSocket;
    private url: string;
    private subId: string;
    private onEvent: (event: Event) => void;
    private onEOSE?: () => void;

    constructor(url: string, onEvent: (event: Event) => void, onEOSE?: () => void) {
        this.url = url;
        this.onEvent = onEvent;
        this.onEOSE = onEOSE;
        this.subId = 'sub-' + Math.random().toString(36).substring(2);
        this.ws = new WebSocket(url);
        
        this.ws.onopen = () => {
            // console.log(`Connected to ${url}`);
        };

        this.ws.onmessage = (msg: any) => {
            try {
                const data = JSON.parse(msg.data.toString());
                if (!Array.isArray(data)) return;
                
                const [type, subId, payload] = data;
                
                if (type === 'EVENT' && subId === this.subId) {
                    this.onEvent(payload as Event);
                } else if (type === 'EOSE' && subId === this.subId) {
                    if (this.onEOSE) this.onEOSE();
                }
            } catch (e) {
                console.error(`Error parsing message from ${url}`, e);
            }
        };
    }

    public sendReq(filter: any) {
        if (this.ws.readyState !== WebSocket.OPEN) {
            this.ws.once('open', () => this.sendReq(filter));
            return;
        }
        const req = ["REQ", this.subId, filter];
        this.ws.send(JSON.stringify(req));
    }

    public close() {
        this.ws.close();
    }
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.log("Usage: npx tsx scripts/update-doc.ts <documentId> <markdownFile>");
        process.exit(1);
    }

    const documentId = args[0];
    const markdownFile = args[1];

    if (!fs.existsSync(markdownFile)) {
        console.error(`File not found: ${markdownFile}`);
        process.exit(1);
    }

    const markdown = fs.readFileSync(markdownFile, 'utf-8');

    // Load config
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const configPath = path.resolve(__dirname, '../static/config.json');
    let relays = ['ws://localhost:7000'];
    
    try {
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            if (config.docRelays) relays = config.docRelays;
        }
    } catch (e) {
        console.warn("Could not load config.json, using default relays.");
    }

    console.log(`Updating document '${documentId}' on relays: ${relays.join(', ')}`);

    // 1. Fetch current state
    const ydoc = new Y.Doc();
    
    await new Promise<void>((resolve) => {
        let eoseCount = 0;
        let activeRelays = 0;
        let resolved = false;
        
        const checkDone = () => {
            if (eoseCount >= activeRelays && !resolved) {
                resolved = true;
                resolve();
            }
        };

        relays.forEach(url => {
            try {
                const relay = new NodeRelay(url, (event) => {
                    try {
                        const update = base64ToUint8(event.content);
                        Y.applyUpdate(ydoc, update, 'remote');
                    } catch (e) {
                        // ignore
                    }
                }, () => {
                    eoseCount++;
                    checkDone();
                    relay.close();
                });
                activeRelays++;
                
                relay.sendReq({
                    kinds: [9337],
                    '#d': [documentId],
                });
            } catch (e) {
                console.error(`Failed to connect to ${url}`);
            }
        });

        if (activeRelays === 0) resolve();
        setTimeout(() => { if (!resolved) { resolved = true; resolve(); } }, 3000);
    });

    // 2. Prepare Editor
    const html = await marked.parse(markdown);
    const sk = generateSecretKey(); // Random key for this update
    
    const updates: Uint8Array[] = [];
    ydoc.on('update', (update) => {
        updates.push(update);
    });

    const editor = new Editor({
        extensions: [
            StarterKit.configure({ history: false } as any),
            TextStyle,
            Color,
            Highlight.configure({ multicolor: true }),
            Table.configure({ resizable: true }),
            TableRow,
            TableHeader,
            TableCell,
            Collaboration.configure({
                document: ydoc,
                field: 'prosemirror',
            }),
        ],
    });

    // 3. Update Content
    editor.commands.setContent(html);
    
    // 4. Publish Updates
    if (updates.length > 0) {
        const mergedUpdate = Y.mergeUpdates(updates);
        const base64Update = uint8ToBase64(mergedUpdate);
        
        const eventTemplate: EventTemplate = {
            kind: 9337,
            content: base64Update,
            tags: [['d', documentId]],
            created_at: Math.floor(Date.now() / 1000),
        };
        
        const signedEvent = finalizeEvent(eventTemplate, sk);
        
        const publishPromises = relays.map(url => {
            return new Promise<void>((resolve) => {
                try {
                    const ws = new WebSocket(url);
                    ws.onopen = () => {
                        const msg = JSON.stringify(['EVENT', signedEvent]);
                        ws.send(msg);
                        setTimeout(() => {
                            ws.close();
                            resolve();
                        }, 500);
                    };
                    ws.onerror = () => resolve();
                } catch (e) {
                    resolve();
                }
            });
        });
        
        await Promise.all(publishPromises);
        console.log("Update published successfully.");
    } else {
        console.log("No changes detected.");
    }
    
    editor.destroy();
    ydoc.destroy();
    process.exit(0);
}

main();
