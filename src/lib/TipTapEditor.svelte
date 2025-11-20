<script lang="ts">
  import { Editor } from "@tiptap/core";
  import StarterKit from "@tiptap/starter-kit";
  import Collaboration from "@tiptap/extension-collaboration";
  import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
  import "./tiptap.css";
  import { useLocalYDoc } from "./useLocalYDoc";
  import { useNostrYDoc } from "./useNostrYDoc";
  import { getNip07Pubkey, signAndPublishNip07 } from "./nostrUtils";
  import { loadConfig } from "./config";
  import * as Y from "yjs";
  import { Awareness } from "y-protocols/awareness";
  import { untrack } from "svelte";

  let {
    documentId,
    user,
    mode = "local",
    onAwarenessReady,
    editor = $bindable(null),
    maxWidth = 1024,
  } = $props<{
    documentId: string;
    user?: { name: string; color: string };
    mode?: "local" | "nostr";
    onAwarenessReady?: (awareness: Awareness | null) => void;
    editor?: Editor | null;
    maxWidth?: number;
  }>();

  const defaultUser = { name: "Anon", color: "#ff8800" } as const;
  const editorUser = user ?? defaultUser;

  let editorElement: HTMLDivElement | null = null;
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

  $effect(() => {
    if (awareness && editor) {
      awareness.setLocalStateField("user", {
        name: editorUser.name,
        color: editorUser.color,
      });
    }
  });

  $effect(() => {
    if (!editorElement || !ydoc || !awareness) return;

    // Untrack editorUser so this effect doesn't re-run when user changes
    // This prevents destroying and recreating the editor when the profile loads
    const initialUser = untrack(() => editorUser);

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
        CollaborationCursor.configure({
          provider: { awareness },
          user: {
            name: initialUser.name,
            color: initialUser.color,
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
</style>
