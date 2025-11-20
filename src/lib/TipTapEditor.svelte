<script lang="ts">
  import { Editor } from "@tiptap/core";
  import StarterKit from "@tiptap/starter-kit";
  import Collaboration from "@tiptap/extension-collaboration";
  import CollaborationCaret from "@tiptap/extension-collaboration-caret";
  import { TextStyle } from "@tiptap/extension-text-style";
  import { Color } from "@tiptap/extension-color";
  import { Highlight } from "@tiptap/extension-highlight";
  import { Table } from "@tiptap/extension-table";
  import { TableCell } from "@tiptap/extension-table-cell";
  import { TableHeader } from "@tiptap/extension-table-header";
  import { TableRow } from "@tiptap/extension-table-row";
  import BubbleMenu from "@tiptap/extension-bubble-menu";
  import "./tiptap.css";
  import { useLocalYDoc } from "./useLocalYDoc";
  import { useNostrYDoc } from "./useNostrYDoc";
  import { getNip07Pubkey, signAndPublishNip07 } from "./nostrUtils";
  import { loadConfig } from "./config";
  import * as Y from "yjs";
  import { Awareness } from "y-protocols/awareness";
  import { untrack } from "svelte";
  import { marked } from "marked";

  let {
    documentId,
    user,
    mode = "local",
    onAwarenessReady,
    editor = $bindable(null),
    maxWidth = 1024,
    title = $bindable(""),
    initialContent = null,
  } = $props<{
    documentId: string;
    user?: { name: string; color: string };
    mode?: "local" | "nostr";
    onAwarenessReady?: (awareness: Awareness | null) => void;
    editor?: Editor | null;
    maxWidth?: number;
    title?: string;
    initialContent?: string | null;
  }>();

  const defaultUser = { name: "Anon", color: "#ff8800" } as const;
  const editorUser = user ?? defaultUser;

  let editorElement: HTMLDivElement | null = $state(null);
  let bubbleMenuElement: HTMLDivElement | null = $state(null);
  let ydoc: Y.Doc | null = $state(null);
  let awareness: Awareness | null = $state(null);
  let provider: any = null;
  let awarenessProvider: any = null;
  let persistence: any = null;
  let error: string | null = $state(null);
  let loading: boolean = $state(false);

  // Call callback when awareness changes
  $effect(() => {
    if (onAwarenessReady) {
      onAwarenessReady(awareness);
    }
  });

  $effect(() => {
    let cancelled = false;

    async function init() {
      try {
        loading = true;
        error = null;
        let newYdoc: Y.Doc;
        let newAwareness: Awareness;
        let newProvider: any = null;
        let newAwarenessProvider: any = null;
        let newPersistence: any = null;

        if (mode === "nostr") {
          const pubkey = await getNip07Pubkey();
          const config = await loadConfig();
          if (cancelled) return;
          // Hier initialisieren wir den Nostr-Provider.
          // useNostrYDoc erstellt intern eine Y.Doc Instanz und verbindet sie via NostrYDocProvider mit den Relays.
          // Der dritte Parameter ist die Callback-Funktion zum Signieren und Publizieren von Events.
          // Der vierte Parameter aktiviert den Debug-Modus (true = Logs anzeigen).
          const result = useNostrYDoc(
            documentId,
            pubkey,
            (evt) => signAndPublishNip07(evt, config.docRelays),
            false, // Debug-Modus an für Diagnose
            config.docRelays
          );
          newYdoc = result.ydoc;
          newAwareness = result.awareness;
          newProvider = result.provider;
          newAwarenessProvider = result.awarenessProvider;
          newPersistence = result.persistence;
        } else {
          const result = useLocalYDoc(documentId);
          newYdoc = result.ydoc;
          newAwareness = result.awareness;
          newPersistence = result.persistence;
        }

        if (cancelled) {
          newYdoc.destroy();
          if (newProvider && typeof newProvider.destroy === "function") {
            newProvider.destroy();
          }
          if (newAwarenessProvider && typeof newAwarenessProvider.destroy === "function") {
            newAwarenessProvider.destroy();
          }
          if (newPersistence && typeof newPersistence.destroy === "function") {
            newPersistence.destroy();
          }
          return;
        }

        ydoc = newYdoc;
        awareness = newAwareness;
        provider = newProvider;
        awarenessProvider = newAwarenessProvider;
        persistence = newPersistence;
      } catch (e) {
        console.error("Failed to initialize editor:", e);
        error = e instanceof Error ? e.message : String(e);
      } finally {
        if (!cancelled) {
          loading = false;
        }
      }
    }

    init();

    return () => {
      cancelled = true;

      // Destroy editor before destroying Yjs doc to prevent "mismatched transaction" errors
      if (editor) {
        editor.destroy();
        editor = null;
      }

      if (provider && typeof provider.destroy === "function") {
        provider.destroy();
      }
      if (awarenessProvider && typeof awarenessProvider.destroy === "function") {
        awarenessProvider.destroy();
      }
      if (awareness) {
        awareness.destroy();
      }
      if (persistence && typeof persistence.destroy === "function") {
        persistence.destroy();
      }
      if (ydoc) {
        ydoc.destroy();
      }
      ydoc = null;
      awareness = null;
      provider = null;
      awarenessProvider = null;
      persistence = null;
      loading = false;
    };
  });

  // Sync user state with awareness
  // Note: CollaborationCaret also syncs user state on init, but we keep this
  // to ensure updates are propagated if we ever decide to not recreate the editor
  $effect(() => {
    if (awareness && editor) {
      // Check if state is already correct to avoid unnecessary updates
      const currentState = awareness.getLocalState() as any;
      const newUser = {
        name: editorUser.name,
        color: editorUser.color,
      };
      
      if (!currentState || 
          currentState.user?.name !== newUser.name || 
          currentState.user?.color !== newUser.color) {
          
        awareness.setLocalStateField("user", newUser);
      }
    }
  });

  // Sync Title with Yjs Metadata
  $effect(() => {
    if (!ydoc) return;

    const metaMap = ydoc.getMap("metadata");

    const handleMetaUpdate = (event: Y.YMapEvent<any>) => {
      // Ignore local updates to prevent loops/cursor jumps
      if (event.transaction.local) return;

      const storedTitle = metaMap.get("title") as string;
      if (storedTitle !== undefined && storedTitle !== title) {
        title = storedTitle;
      }
    };

    metaMap.observe(handleMetaUpdate);
    
    // Initial sync
    const storedTitle = metaMap.get("title") as string;
    untrack(() => {
      if (storedTitle !== undefined && storedTitle !== title) {
          title = storedTitle;
      } else if (storedTitle === undefined && title && title !== documentId) {
           metaMap.set("title", title);
      }
    });

    return () => {
      metaMap.unobserve(handleMetaUpdate);
    };
  });

  // Write title changes to Yjs
  $effect(() => {
      if (!ydoc) return;
      const metaMap = ydoc.getMap("metadata");
      const storedTitle = metaMap.get("title") as string;
      
      if (title && title !== storedTitle) {
          metaMap.set("title", title);
      }
  });

  $effect(() => {
    if (!editorElement || !bubbleMenuElement || !ydoc || !awareness) return;

    // Re-create editor when user changes to ensure consistent state
    // This avoids "mismatched transaction" errors that can occur when updating
    // the user in an existing CollaborationCaret instance
    const currentUser = editorUser;

    const instance = new Editor({
      element: editorElement,
      extensions: [
        StarterKit.configure({
          history: false,
        } as any),
        TextStyle,
        Color,
        Highlight.configure({ multicolor: true }),
        Table.configure({
          resizable: true,
        }),
        TableRow,
        TableHeader,
        TableCell,
        BubbleMenu.configure({
          element: bubbleMenuElement,
          shouldShow: ({ editor }) => {
            // Show only for tables
            return editor.isActive("table");
          },
        }),
        Collaboration.configure({
          document: ydoc,
          field: "prosemirror",
        }),
        CollaborationCaret.configure({
          provider: { awareness },
          user: {
            name: currentUser.name,
            color: currentUser.color,
          },
        }),
      ],
      editorProps: {
        attributes: {
          class: "tiptap",
        },
      },
    });

    editor = instance;

    // Inject initial content if provided and document is empty
    if (initialContent && ydoc) {
      const yXmlFragment = ydoc.getXmlFragment('prosemirror');
      // Only insert if document is effectively empty (length 0 or just empty paragraph)
      // Note: Checking yXmlFragment.length might be enough, but TipTap structure is complex.
      // For simplicity, we check if the Yjs type is empty.
      if (yXmlFragment.length === 0) {
         // We need to wait for the editor to be ready to parse HTML/Markdown?
         // Actually, we can just setContent on the editor instance.
         // But we should be careful not to overwrite if we are in collaborative mode and data is coming in.
         // However, if yXmlFragment is empty, it means we have no data yet.
         
         // Wait a tick to ensure everything is initialized?
         setTimeout(async () => {
             if (instance.isEmpty) {
                 try {
                    const htmlContent = await marked.parse(initialContent);
                    instance.commands.setContent(htmlContent);
                 } catch (e) {
                    console.error("Failed to parse initial markdown content", e);
                    // Fallback to plain text if parsing fails
                    instance.commands.setContent(initialContent);
                 }
             }
         }, 100);
      }
    }

    return () => {
      instance.destroy();
      editor = null;
    };
  });
</script>

<div class="editor" style="--editor-max-width: {maxWidth}px">
  {#if loading}
    <div class="loading-overlay">
      <div class="spinner"></div>
      <p>Verbinde mit Nostr...</p>
    </div>
  {/if}
  {#if error}
    <div class="error-alert">
      <p><strong>Fehler:</strong> {error}</p>
      <p class="text-sm">
        Bitte stelle sicher, dass du eine Nostr-Extension (z. B. Alby, nos2x)
        installiert hast, wenn du den Nostr-Modus nutzt.
      </p>
      <button class="retry-button" onclick={() => window.location.reload()}>
        Neu laden
      </button>
    </div>
  {/if}
  <div class="editor-content" bind:this={editorElement}></div>
  
  <div class="bubble-menu" bind:this={bubbleMenuElement}>
    {#if editor}
      <button
        onclick={() => editor?.chain().focus().addColumnBefore().run()}
        title="Add Column Before"
      >Col ←</button>
      <button
        onclick={() => editor?.chain().focus().addColumnAfter().run()}
        title="Add Column After"
      >Col →</button>
      <button
        onclick={() => editor?.chain().focus().deleteColumn().run()}
        title="Delete Column"
      >Del Col</button>
      <span class="separator">|</span>
      <button
        onclick={() => editor?.chain().focus().addRowBefore().run()}
        title="Add Row Before"
      >Row ↑</button>
      <button
        onclick={() => editor?.chain().focus().addRowAfter().run()}
        title="Add Row After"
      >Row ↓</button>
      <button
        onclick={() => editor?.chain().focus().deleteRow().run()}
        title="Delete Row"
      >Del Row</button>
      <span class="separator">|</span>
      <button
        onclick={() => editor?.chain().focus().mergeCells().run()}
        title="Merge Cells"
      >Merge</button>
      <button
        onclick={() => editor?.chain().focus().splitCell().run()}
        title="Split Cell"
      >Split</button>
      <span class="separator">|</span>
      <button
        onclick={() => editor?.chain().focus().deleteTable().run()}
        title="Delete Table"
        class="danger"
      >Delete Table</button>
    {/if}
  </div>
</div>

<style>
  .editor {
    position: relative;
    height: 100%;
    display: flex;
    flex-direction: column;
    --editor-max-width: 1024px;
  }

  .editor-content {
    flex-grow: 1;
    overflow-y: auto;
    padding: 1rem;
    cursor: text;
    display: flex;
    justify-content: center;
  }

  /* Make the editor content take full height */
  :global(.editor .tiptap) {
    min-height: 100%;
    outline: none;
    font-size: 1rem;
    line-height: 1.5;
    width: 100%;
    max-width: var(--editor-max-width);
    margin: 0 auto;
  }

  :global(.editor .tiptap:focus) {
    outline: none;
  }

  :global(.editor .tiptap > * + *) {
    margin-top: 0.75rem;
  }

  .error-alert {
    background-color: #fee2e2;
    color: #991b1b;
    padding: 1rem;
    border-bottom: 1px solid #fecaca;
    border-radius: 0.5rem 0.5rem 0 0;
  }

  .text-sm {
    font-size: 0.875rem;
    margin-top: 0.25rem;
  }

  .loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(255, 255, 255, 0.8);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 10;
    border-radius: 0.5rem;
  }

  .spinner {
    width: 2rem;
    height: 2rem;
    border: 3px solid #e5e7eb;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 0.5rem;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .retry-button {
    margin-top: 0.5rem;
    padding: 0.25rem 0.75rem;
    background-color: #991b1b;
    color: white;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 0.875rem;
  }

  .retry-button:hover {
    background-color: #7f1d1d;
  }

  .bubble-menu {
    display: flex;
    background-color: white;
    padding: 0.2rem;
    border-radius: 0.5rem;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    border: 1px solid #e5e7eb;
    gap: 0.25rem;
    align-items: center;
    visibility: hidden;
  }

  :global(.tippy-box) .bubble-menu {
    visibility: visible;
  }

  .bubble-menu button {
    border: none;
    background: none;
    color: #374151;
    font-size: 0.75rem;
    font-weight: 500;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    cursor: pointer;
    white-space: nowrap;
  }

  .bubble-menu button:hover {
    background-color: #f3f4f6;
    color: #111827;
  }

  .bubble-menu button.danger {
    color: #ef4444;
  }

  .bubble-menu button.danger:hover {
    background-color: #fee2e2;
    color: #991b1b;
  }

  .bubble-menu .separator {
    color: #e5e7eb;
    margin: 0 0.25rem;
  }
</style>
