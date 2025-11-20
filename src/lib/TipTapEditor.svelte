<script lang="ts">
  import { Editor } from "@tiptap/core";
  import StarterKit from "@tiptap/starter-kit";
  import Collaboration from "@tiptap/extension-collaboration";
  import "./tiptap.css";
  import { useLocalYDoc } from "./useLocalYDoc";
  import { useNostrYDoc } from "./useNostrYDoc";
  import { getNip07Pubkey, signAndPublishNip07 } from "./nostrUtils";
  import { loadConfig } from "./config";
  import * as Y from "yjs";
  import { Awareness } from "y-protocols/awareness";
  import Bold from "lucide-svelte/icons/bold";
  import Italic from "lucide-svelte/icons/italic";
  import Undo2 from "lucide-svelte/icons/undo-2";
  import Redo2 from "lucide-svelte/icons/redo-2";
  import Heading1 from "lucide-svelte/icons/heading-1";
  import Heading2 from "lucide-svelte/icons/heading-2";
  import Quote from "lucide-svelte/icons/quote";
  import List from "lucide-svelte/icons/list";
  import ListOrdered from "lucide-svelte/icons/list-ordered";
  import Code from "lucide-svelte/icons/code";
  import SquareCode from "lucide-svelte/icons/square-code";

  const {
    documentId,
    user,
    mode = "local",
    onAwarenessReady,
  } = $props<{
    documentId: string;
    user?: { name: string; color: string };
    mode?: "local" | "nostr";
    onAwarenessReady?: (awareness: Awareness | null) => void;
  }>();

  const defaultUser = { name: "Anon", color: "#ff8800" } as const;
  const editorUser = user ?? defaultUser;

  let editor: Editor | null = $state(null);
  let editorElement: HTMLDivElement | null = null;
  let ydoc: Y.Doc | null = $state(null);
  let awareness: Awareness | null = $state(null);
  let provider: any = null;
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
            false, // Debug-Modus aus (Production)
            config.docRelays
          );
          newYdoc = result.ydoc;
          newAwareness = result.awareness;
          newProvider = result.provider;
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
          if (newPersistence && typeof newPersistence.destroy === "function") {
            newPersistence.destroy();
          }
          return;
        }

        ydoc = newYdoc;
        awareness = newAwareness;
        provider = newProvider;
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
      if (provider && typeof provider.destroy === "function") {
        provider.destroy();
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
      persistence = null;
      loading = false;
    };
  });

  $effect(() => {
    if (awareness) {
      awareness.setLocalStateField("user", {
        name: editorUser.name,
        color: editorUser.color,
      });
    }
  });

  $effect(() => {
    if (!editorElement || !ydoc) return;

    const instance = new Editor({
      element: editorElement,
      extensions: [
        StarterKit.configure({
          history: false,
        } as any),
        Collaboration.configure({
          document: ydoc,
          field: "prosemirror",
        }),
      ],
      editorProps: {
        attributes: {
          class: "tiptap",
        },
      },
    });

    editor = instance;

    return () => {
      instance.destroy();
      editor = null;
    };
  });
</script>

<div class="editor">
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
  <div class="toolbar">
    <button
      type="button"
      class="toolbar-button"
      aria-label="Undo"
      title="Undo"
      onclick={() => editor?.chain().focus().undo().run()}
      disabled={!editor || !editor.can().undo()}
    >
      <Undo2 size={18} />
    </button>
    <button
      type="button"
      class="toolbar-button"
      aria-label="Redo"
      title="Redo"
      onclick={() => editor?.chain().focus().redo().run()}
      disabled={!editor || !editor.can().redo()}
    >
      <Redo2 size={18} />
    </button>
    <span class="toolbar-separator" aria-hidden="true"></span>
    <button
      type="button"
      class="toolbar-button"
      aria-label="Bold"
      title="Bold"
      onclick={() => editor?.chain().focus().toggleBold().run()}
      disabled={!editor}
    >
      <Bold size={18} />
    </button>
    <button
      type="button"
      class="toolbar-button"
      aria-label="Italic"
      title="Italic"
      onclick={() => editor?.chain().focus().toggleItalic().run()}
      disabled={!editor}
    >
      <Italic size={18} />
    </button>
    <button
      type="button"
      class="toolbar-button"
      aria-label="Inline code"
      title="Inline code"
      onclick={() => editor?.chain().focus().toggleCode().run()}
      disabled={!editor}
    >
      <Code size={18} />
    </button>
    <span class="toolbar-separator" aria-hidden="true"></span>
    <button
      type="button"
      class="toolbar-button"
      aria-label="Heading 1"
      title="Heading 1"
      onclick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
      disabled={!editor}
    >
      <Heading1 size={18} />
    </button>
    <button
      type="button"
      class="toolbar-button"
      aria-label="Heading 2"
      title="Heading 2"
      onclick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
      disabled={!editor}
    >
      <Heading2 size={18} />
    </button>
    <button
      type="button"
      class="toolbar-button"
      aria-label="Blockquote"
      title="Blockquote"
      onclick={() => editor?.chain().focus().toggleBlockquote().run()}
      disabled={!editor}
    >
      <Quote size={18} />
    </button>
    <button
      type="button"
      class="toolbar-button"
      aria-label="Bullet list"
      title="Bullet list"
      onclick={() => editor?.chain().focus().toggleBulletList().run()}
      disabled={!editor}
    >
      <List size={18} />
    </button>
    <button
      type="button"
      class="toolbar-button"
      aria-label="Ordered list"
      title="Ordered list"
      onclick={() => editor?.chain().focus().toggleOrderedList().run()}
      disabled={!editor}
    >
      <ListOrdered size={18} />
    </button>
    <button
      type="button"
      class="toolbar-button"
      aria-label="Code block"
      title="Code block"
      onclick={() => editor?.chain().focus().toggleCodeBlock().run()}
      disabled={!editor}
    >
      <SquareCode size={18} />
    </button>
  </div>
  <div class="editor-content" bind:this={editorElement}></div>
</div>

<style>
  .editor {
    position: relative;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    background-color: white;
  }

  .toolbar {
    display: flex;
    gap: 0.25rem;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid #e5e7eb;
    background-color: #f9fafb;
  }

  .toolbar-button {
    font-size: 0.875rem;
    padding: 0.25rem 0.5rem;
    border-radius: 0.375rem;
    border: 1px solid #e5e7eb;
    background-color: white;
    cursor: pointer;
  }

  .toolbar-button:hover:not(:disabled) {
    background-color: #f3f4f6;
  }

  .toolbar-button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .editor:focus-within {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
  }

  .editor-content {
    padding: 0.75rem 0.75rem 1rem;
  }

  :global(.editor .tiptap) {
    min-height: 16rem;
    outline: none;
    font-size: 1rem;
    line-height: 1.5;
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
</style>
