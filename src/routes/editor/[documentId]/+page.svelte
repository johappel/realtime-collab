<script lang="ts">
  import TipTapEditor from "$lib/TipTapEditor.svelte";
  import EditorToolbar from "$lib/EditorToolbar.svelte";
  import HistorySidebar from "$lib/HistorySidebar.svelte";
  import AppHeader from "$lib/AppHeader.svelte";
  import { appState } from "$lib/stores/appState.svelte";
  import { page } from "$app/stores";
  import type { Awareness } from "y-protocols/awareness";
  import type { Editor } from "@tiptap/core";
  import TurndownService from "turndown";
  import { gfm } from "turndown-plugin-gfm";
  import type { Event } from "nostr-tools";
  import { untrack, onMount } from "svelte";

  const pageStore = $state($page);
  const documentId = $derived(pageStore.params.documentId ?? "default");
  const isMarkdownView = $derived($page.url.searchParams.has("markdown"));

  let fetchedContent = $state<string | null>(null);
  const urlContent = $derived(
    $page.url.searchParams.get("content") || $page.url.searchParams.get("text"),
  );
  const fileUrl = $derived($page.url.searchParams.get("file"));

  $effect(() => {
    if (fileUrl) {
      fetchedContent = null;
      fetch(fileUrl)
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          fetchedContent = await res.text();
        })
        .catch((e) => {
          console.error("Failed to load file from URL:", e);
        });
    } else {
      fetchedContent = null;
    }
  });

  const initialContent = $derived(fetchedContent ?? urlContent);

  let awareness: Awareness | null = $state(null);
  let editor: Editor | null = $state(null);

  let showHistory = $state(false);
  let maxWidth = $state(1024);

  let markdownContent = $state("");
  let docTitle = $state(untrack(() => documentId));
  let snapshots: Event[] = $state([]);
  let provider: any = $state(null);

  onMount(async () => {
    appState.init();
    const storedWidth = localStorage.getItem("editor_max_width");
    if (storedWidth) {
      maxWidth = parseInt(storedWidth, 10);
    }

    // Check for URL parameters for auto-login with group code
    const urlParams = new URLSearchParams(window.location.search);
    const groupCode = urlParams.get("code");
    const nickname = urlParams.get("name");

    if (groupCode) {
      // Auto-login with group code
      await appState.setGroupCode(groupCode, nickname || undefined);
      await appState.initGroup();

      // Remove parameters from URL after processing
      window.history.replaceState({}, "", window.location.pathname);
    }
  });

  $effect(() => {
    localStorage.setItem("editor_max_width", maxWidth.toString());
  });

  $effect(() => {
    if (isMarkdownView && editor) {
      const update = () => {
        if (!editor) return;
        const turndownService = new TurndownService({
          headingStyle: "atx",
          codeBlockStyle: "fenced",
        });
        turndownService.use(gfm);
        markdownContent = turndownService.turndown(editor.getHTML());
      };

      update();
      editor.on("update", update);

      return () => {
        editor?.off("update", update);
      };
    }
  });

  function handleAwarenessReady(aw: Awareness | null) {
    awareness = aw;
  }

  function handleDownload(format: string) {
    if (!editor) return;

    let content = "";
    let mimeType = "text/plain";
    let extension = "txt";

    if (format === "html") {
      content = editor.getHTML();
      mimeType = "text/html";
      extension = "html";
    } else if (format === "doc") {
      content = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset='utf-8'><title>${documentId}</title></head><body>
        ${editor.getHTML()}
        </body></html>`;
      mimeType = "application/msword";
      extension = "doc";
    } else if (format === "markdown") {
      const turndownService = new TurndownService({
        headingStyle: "atx",
        codeBlockStyle: "fenced",
      });
      turndownService.use(gfm);
      content = turndownService.turndown(editor.getHTML());
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
  }

  function handleSaveSnapshot() {
    if (provider && typeof provider.saveSnapshot === "function") {
      provider.saveSnapshot().catch(console.error);
    }
  }

  function handleLoadSnapshot(snapshot: Event) {
    if (provider && typeof provider.applySnapshot === "function") {
      provider.applySnapshot(snapshot);
    } else {
      alert(
        "Snapshot laden wird noch nicht unterstützt (Provider nicht bereit).",
      );
    }
  }
</script>

<svelte:head>
  <title>Realtime Editor – {documentId}</title>
</svelte:head>

{#snippet editorToolbar()}
  <EditorToolbar {editor} />
{/snippet}

<main class="page">
  {#if !isMarkdownView}
    <AppHeader
      bind:documentId={docTitle}
      {awareness}
      bind:showHistory
      bind:maxWidth
      onDownload={handleDownload}
      toolbar={editorToolbar}
      showEditorControls={true}
    />
  {/if}

  <div class="content-wrapper">
    <section class="editor-container" class:visually-hidden={isMarkdownView}>
      {#key appState.mode}
        <TipTapEditor
          {documentId}
          user={appState.user}
          mode={appState.mode}
          {maxWidth}
          {initialContent}
          bind:title={docTitle}
          onAwarenessReady={handleAwarenessReady}
          bind:editor
          bind:provider
          onSnapshots={(s) => (snapshots = s)}
        />
      {/key}
    </section>

    {#if showHistory && appState.mode === "nostr"}
      <HistorySidebar
        {snapshots}
        onSaveSnapshot={handleSaveSnapshot}
        onLoadSnapshot={handleLoadSnapshot}
      />
    {/if}
  </div>

  {#if isMarkdownView}
    <pre class="markdown-output">{markdownContent || "Loading..."}</pre>
  {/if}

  {#if !isMarkdownView}
    <footer class="footer">
      <div class="status-item">
        <strong>Mode:</strong>
        {appState.mode}
      </div>
      {#if appState.mode === "nostr"}
        <div class="status-item">
          <strong>Relays:</strong>
          {appState.relays.join(", ")}
        </div>
      {/if}
    </footer>
  {/if}
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

  :global(.dark) .page {
    background-color: #111827;
  }

  .content-wrapper {
    flex-grow: 1;
    display: flex;
    overflow: hidden;
  }

  .editor-container {
    flex-grow: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background-color: white;
    position: relative;
  }

  :global(.dark) .editor-container {
    background-color: #1f2937;
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

  :global(.dark) .footer {
    background-color: #1f2937;
    border-top-color: #374151;
    color: #9ca3af;
  }

  .status-item strong {
    font-weight: 600;
    color: #4b5563;
  }

  :global(.dark) .status-item strong {
    color: #d1d5db;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }

  .markdown-output {
    padding: 1rem;
    white-space: pre-wrap;
    font-family: monospace;
    margin: 0;
    height: 100%;
    overflow: auto;
    background-color: white;
    color: #111827;
    font-size: 0.875rem;
    line-height: 1.5;
  }

  :global(.dark) .markdown-output {
    background-color: #1f2937;
    color: #e5e7eb;
  }
</style>
