<script lang="ts">
  import TipTapEditor from "$lib/TipTapEditor.svelte";
  import PresenceList from "$lib/PresenceList.svelte";
  import EditorToolbar from "$lib/EditorToolbar.svelte";
  import SettingsDialog from "$lib/SettingsDialog.svelte";
  import Settings from "lucide-svelte/icons/settings";
  import { page } from "$app/stores";
  import type { Awareness } from "y-protocols/awareness";
  import { getNip07Pubkey, fetchNostrProfile, getRandomColor } from "$lib/nostrUtils";
  import { loadConfig } from "$lib/config";
  import type { Editor } from "@tiptap/core";

  import { untrack } from "svelte";

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
  
  let showSettings = $state(false);
  let maxWidth = $state(1024);
  let settingsButton: HTMLButtonElement | null = $state(null);
  
  // Initialize with documentId. Updates will come via binding from TipTapEditor
  let docTitle = $state(untrack(() => documentId));

  $effect(() => {
    const storedMode = localStorage.getItem("editor_mode");
    if (storedMode === "nostr" || storedMode === "local") {
      mode = storedMode;
    }
    
    const storedWidth = localStorage.getItem("editor_max_width");
    if (storedWidth) {
        maxWidth = parseInt(storedWidth, 10);
    }
  });

  $effect(() => {
    localStorage.setItem("editor_mode", mode);
    if (mode === "nostr") {
      loadNostrProfile();
    }
  });
  
  $effect(() => {
      localStorage.setItem("editor_max_width", maxWidth.toString());
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

  function handleDownload(format: "markdown" | "html" | "doc") {
    if (!editor) return;

    let content = "";
    let mimeType = "text/plain";
    let extension = "txt";

    if (format === "html") {
      content = editor.getHTML();
      mimeType = "text/html";
      extension = "html";
    } else if (format === "doc") {
      // Simple HTML export with .doc extension (Word can open this)
      content = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset='utf-8'><title>${documentId}</title></head><body>
        ${editor.getHTML()}
        </body></html>`;
      mimeType = "application/msword";
      extension = "doc";
    } else if (format === "markdown") {
      // Basic HTML to Markdown conversion (simplified)
      // Ideally use a library like turndown, but for now we can try to use text or basic replacement
      // Since we don't have a markdown serializer installed, we'll warn or do a best effort
      // For now, let's just dump the text content or use a very simple regex replacer if needed.
      // Actually, let's just use the text content for now to avoid adding heavy deps without permission
      // Or better: use editor.getText() but that loses formatting.
      // Let's try to do a very basic conversion.
      
      // NOTE: For a real app, install 'turndown' or 'tiptap-markdown'
      content = editor.getText(); 
      alert("Markdown export requires 'tiptap-markdown' or 'turndown'. Exporting plain text for now.");
      mimeType = "text/markdown";
      extension = "md";
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${documentId}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showSettings = false;
  }
</script>

<svelte:head>
  <title>Realtime Editor – {documentId}</title>
</svelte:head>

<SettingsDialog 
    bind:open={showSettings} 
    bind:maxWidth={maxWidth} 
    onDownload={handleDownload}
    anchorElement={settingsButton}
/>

<main class="page">
  <header class="header">
    <div class="header-left">
        <input 
            type="text" 
            class="doc-title-input" 
            bind:value={docTitle} 
            placeholder={documentId}
            title="Dokumenttitel bearbeiten"
        />
    </div>

    <div class="header-center">
        <div class="toolbar-wrapper">
            <EditorToolbar {editor} />
        </div>
    </div>

    <div class="header-right">
        <PresenceList {awareness} {mode} />
        
        <div class="controls">
            <button 
                class="icon-btn" 
                onclick={() => showSettings = true} 
                title="Einstellungen"
                bind:this={settingsButton}
            >
                <Settings size={18} />
            </button>
            <div class="divider"></div>
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
        {maxWidth}
        bind:title={docTitle}
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
    background-color: white;
    border-bottom: 1px solid #e5e7eb;
    height: 3.5rem;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: 0 1rem;
  }

  .header-left {
      display: flex;
      align-items: center;
      justify-content: flex-start;
  }

  .header-center {
      display: flex;
      align-items: center;
      justify-content: center;
  }

  .header-right {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 1rem;
  }

  .doc-title-input {
    font-size: 1.125rem;
    font-weight: 600;
    margin: 0;
    border: 1px solid transparent;
    background: transparent;
    padding: 0.25rem 0.5rem;
    border-radius: 0.375rem;
    width: 100%;
    max-width: 250px;
    color: #111827;
    transition: all 0.2s;
  }

  .doc-title-input:hover {
      background-color: #f3f4f6;
  }

  .doc-title-input:focus {
      outline: none;
      background-color: white;
      border-color: #3b82f6;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
  }

  .toolbar-wrapper {
      display: flex;
      align-items: center;
  }

  .controls {
    display: flex;
    align-items: center;
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

  .icon-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      cursor: pointer;
      padding: 0.25rem 0.5rem;
      color: #4b5563;
      border-radius: 0.375rem;
  }
  
  .icon-btn:hover {
      background-color: white;
      color: #111827;
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
  }

  .divider {
      width: 1px;
      height: 1.25rem;
      background-color: #d1d5db;
      margin: 0 0.25rem;
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

  /* Responsive adjustments */
  @media (max-width: 768px) {
      .header {
          display: flex;
          flex-wrap: wrap;
          height: auto;
          padding: 0.5rem;
          gap: 0.5rem;
      }

      .header-left, .header-center, .header-right {
          width: 100%;
          justify-content: center;
      }
  }
</style>
