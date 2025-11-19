<script lang="ts">
  import { goto } from '$app/navigation';

  let docId = $state('');

  const examples = ['demo', 'playground', 'draft-1'];

  function openDocument(id?: string) {
    const targetId = (id ?? docId).trim();
    if (!targetId) return;
    goto(`/editor/${encodeURIComponent(targetId)}`);
  }
 </script>

<svelte:head>
  <title>Realtime Editor – Dokument auswählen</title>
</svelte:head>

<main class="page">
  <header class="header">
    <div>
      <p class="eyebrow">Collaborative Tools</p>
      <h1>Dokument auswählen oder neu starten</h1>
      <p class="lead">
        Gib eine documentId ein oder wähle eines der Beispiele. Jede ID mappt auf einen eigenen Yjs/Nostr-Kanal.
      </p>
    </div>
  </header>

  <section class="panel">
    <form
      class="doc-form"
      onsubmit={(event) => {
        event.preventDefault();
        openDocument();
      }}
    >
      <label for="doc-id">documentId</label>
      <div class="form-row">
        <input
          id="doc-id"
          name="doc-id"
          placeholder="z. B. meeting-notes"
          bind:value={docId}
        />
        <button type="submit">Öffnen</button>
      </div>
    </form>
  </section>

  <section class="panel">
    <h2>Beispiele</h2>
    <div class="examples">
      {#each examples as example}
        <button type="button" onclick={() => openDocument(example)}>
          /editor/{example}
        </button>
      {/each}
    </div>
  </section>
</main>

<style>
  .page {
    max-width: 48rem;
    margin: 0 auto;
    padding: 2rem 1rem 3rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .header .eyebrow {
    text-transform: uppercase;
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    color: #6b7280;
    margin-bottom: 0.5rem;
  }

  .header h1 {
    font-size: 1.8rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
  }

  .lead {
    color: #4b5563;
  }

  .panel {
    background: #f9fafb;
    border-radius: 0.75rem;
    padding: 1.5rem;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
  }

  .doc-form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .doc-form label {
    font-weight: 600;
  }

  .form-row {
    display: flex;
    gap: 0.75rem;
  }

  input {
    flex: 1;
    border: 1px solid #d1d5db;
    border-radius: 0.5rem;
    padding: 0.65rem 0.85rem;
  }

  button {
    border: none;
    border-radius: 0.5rem;
    padding: 0.65rem 1.2rem;
    background: #0ea5e9;
    color: white;
    font-weight: 600;
    cursor: pointer;
  }

  button:hover {
    background: #0284c7;
  }

  .examples {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .examples button {
    background: white;
    border: 1px solid #e5e7eb;
    color: #0f172a;
  }

  .examples button:hover {
    background: #f1f5f9;
  }
</style>
