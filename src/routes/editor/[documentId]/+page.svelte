<script lang="ts">
  import TipTapEditor from "$lib/TipTapEditor.svelte";
  import PresenceList from "$lib/PresenceList.svelte";
  import EditorToolbar from "$lib/EditorToolbar.svelte";
  import { page } from "$app/stores";
  import type { Awareness } from "y-protocols/awareness";
  import { getNip07Pubkey, fetchNostrProfile, getRandomColor } from "$lib/nostrUtils";
  import { loadConfig } from "$lib/config";
  import type { Editor } from "@tiptap/core";

  const pageStore = $state($page);

  const documentId = $derived(pageStore.params.documentId ?? "default");

  // Hier wird der aktuelle User definiert.
  // Momentan ist dies hardcodiert auf "TestUser".
  // Später könnte hier ein echter Login oder eine Eingabeaufforderung stehen.
  const user = $state({
    name: "TestUser",
    color: "#0ea5e9",
  });

  let mode: "local" | "nostr" = $state("local");
  let awareness: Awareness | null = $state(null);
  let editor: Editor | null = $state(null);
  let relays: string[] = $state([]);

  $effect(() => {
    const storedMode = localStorage.getItem("editor_mode");
    if (storedMode === "nostr" || storedMode === "local") {
      mode = storedMode;
    }
  });

  $effect(() => {
    localStorage.setItem("editor_mode", mode);
    if (mode === "nostr") {
      loadNostrProfile();
    }
  });

  // Load config to get relays
  $effect(() => {
      loadConfig().then(c => relays = c.docRelays);
  });

  async function loadNostrProfile() {
    try {
      const config = await loadConfig();
      const pubkey = await getNip07Pubkey();
      
      // Set color based on pubkey immediately
      user.color = getRandomColor(pubkey);

      const profile = await fetchNostrProfile(pubkey, config.profileRelays);

      if (profile && profile.name) {
        user.name = profile.name;
      } else {
        user.name = "NostrUser";
      }
    } catch (e) {
      console.error("Failed to load Nostr profile", e);
    }
  }

  // Callback to receive awareness from TipTapEditor
  function handleAwarenessReady(aw: Awareness | null) {
    awareness = aw;
  }
</script>

<svelte:head>
  <title>Realtime Editor – {documentId}</title>
</svelte:head>

<main class="page">
  <header class="header">
    <h1 class="doc-title">{documentId}</h1>
    
    <div class="toolbar-wrapper">
        <EditorToolbar {editor} />
    </div>

    <div class="spacer"></div>

    <PresenceList {awareness} {mode} />
    
    <div class="controls">
      <label class:active={mode === "local"}>
        <input type="radio" bind:group={mode} value="local" /> Local
      </label>
      <label class:active={mode === "nostr"}>
        <input type="radio" bind:group={mode} value="nostr" /> Nostr
      </label>
    </div>
  </header>
  
  <section class="editor-container">
    {#key mode}
      <TipTapEditor
        {documentId}
        {user}
        {mode}
        onAwarenessReady={handleAwarenessReady}
        bind:editor={editor}
      />
    {/key}
  </section>

  <footer class="footer">
      <div class="status-item">
          <strong>Mode:</strong> {mode}
      </div>
      {#if mode === 'nostr'}
      <div class="status-item">
          <strong>Relays:</strong> {relays.join(', ')}
      </div>
      {/if}
  </footer>
</main>

<style>
  :global(body) {
      margin: 0;
      overflow: hidden;
  }

  .page {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background-color: #f9fafb;
  }

  .header {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    padding: 0.5rem 1rem;
    background-color: white;
    border-bottom: 1px solid #e5e7eb;
    gap: 1rem;
    height: 3.5rem;
  }

  .doc-title {
    font-size: 1.125rem;
    font-weight: 600;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
  }

  .toolbar-wrapper {
      display: flex;
      align-items: center;
  }

  .spacer {
      flex-grow: 1;
  }

  .controls {
    display: flex;
    gap: 0.25rem;
    background: #f3f4f6;
    padding: 0.25rem;
    border-radius: 0.5rem;
    flex-shrink: 0;
  }

  .controls label {
    padding: 0.25rem 0.5rem;
    border-radius: 0.375rem;
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 500;
    color: #4b5563;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .controls label:hover {
    color: #111827;
  }

  .controls label.active {
    background: white;
    color: #0ea5e9;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
  }

  .controls input {
    display: none;
  }

  .editor-container {
    flex-grow: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background-color: white;
    position: relative;
  }
  
  /* Override TipTapEditor styles to fit */
  :global(.editor-container .editor) {
      border: none;
      border-radius: 0;
      height: 100%;
  }

  .footer {
      flex-shrink: 0;
      padding: 0.25rem 1rem;
      background-color: #f3f4f6;
      border-top: 1px solid #e5e7eb;
      font-size: 0.75rem;
      color: #6b7280;
      display: flex;
      gap: 1rem;
      align-items: center;
      height: 1.5rem;
  }

  .status-item strong {
      font-weight: 600;
      color: #4b5563;
  }
</style>
