<script lang="ts">
  import TipTapEditor from "$lib/TipTapEditor.svelte";
  import PresenceList from "$lib/PresenceList.svelte";
  import { page } from "$app/stores";
  import type { Awareness } from "y-protocols/awareness";

  const pageStore = $state($page);

  const documentId = $derived(pageStore.params.documentId ?? "default");

  const user = $state({
    name: "TestUser",
    color: "#0ea5e9",
  });

  let mode: "local" | "nostr" = $state("local");
  let awareness: Awareness | null = $state(null);

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
    <h1>Editor: {documentId}</h1>
    <div class="header-actions">
      <PresenceList {awareness} {mode} />
      <div class="controls">
        <label class:active={mode === "local"}>
          <input type="radio" bind:group={mode} value="local" /> Local
        </label>
        <label class:active={mode === "nostr"}>
          <input type="radio" bind:group={mode} value="nostr" /> Nostr
        </label>
      </div>
    </div>
  </header>
  <section class="editor-container">
    {#key mode}
      <TipTapEditor
        {documentId}
        {user}
        {mode}
        onAwarenessReady={handleAwarenessReady}
      />
    {/key}
  </section>
</main>

<style>
  .page {
    max-width: 64rem;
    margin: 0 auto;
    padding: 2rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .header h1 {
    font-size: 1.5rem;
    font-weight: 600;
  }

  .header-actions {
    display: flex;
    gap: 1rem;
    align-items: center;
  }

  .controls {
    display: flex;
    gap: 0.5rem;
    background: #f3f4f6;
    padding: 0.25rem;
    border-radius: 0.5rem;
  }

  .controls label {
    padding: 0.25rem 0.75rem;
    border-radius: 0.375rem;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    color: #4b5563;
    transition: all 0.2s;
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
    background-color: #f9fafb;
    padding: 1rem;
    border-radius: 0.75rem;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
  }
</style>
