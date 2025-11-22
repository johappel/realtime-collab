<script lang="ts">
    import { appState } from '$lib/stores/appState.svelte';
    import PresenceList from '$lib/PresenceList.svelte';
    import SettingsDialog from '$lib/SettingsDialog.svelte';
    import Settings from "lucide-svelte/icons/settings";
    import History from "lucide-svelte/icons/history";
    import type { Awareness } from "y-protocols/awareness";

    let { 
        documentId = $bindable(),
        awareness,
        showHistory = $bindable(false),
        maxWidth = $bindable(1024),
        onDownload,
        toolbar,
        showEditorControls = false
    } = $props<{
        documentId: string;
        awareness: Awareness | null;
        showHistory: boolean;
        maxWidth: number;
        onDownload?: (format: string) => void;
        toolbar?: import('svelte').Snippet;
        showEditorControls?: boolean;
    }>();

    let showSettings = $state(false);
    let settingsButton: HTMLButtonElement | null = $state(null);

    async function handleGroupMode() {
        const code = window.prompt('Bitte Gruppen-Code eingeben:', appState.groupCode || '');
        if (code) {
            await appState.setGroupCode(code);
            await appState.initGroup();
        }
    }
</script>

<header class="header">
    <div class="header-left">
        <input 
            type="text" 
            class="doc-title-input" 
            bind:value={documentId} 
            placeholder="Untitled"
            title="Dokumenttitel bearbeiten"
        />
    </div>

    <div class="header-center">
        <div class="toolbar-wrapper">
            {#if toolbar}
                {@render toolbar()}
            {/if}
        </div>
    </div>

    <div class="header-right">
        <PresenceList {awareness} mode={appState.mode} />
        
        <div class="controls">
            {#if showEditorControls}
                <button 
                    class="icon-btn" 
                    class:active={showHistory}
                    onclick={() => showHistory = !showHistory} 
                    title="Versionen / Snapshots"
                >
                    <History size={18} />
                </button>
                <button 
                    class="icon-btn" 
                    onclick={() => showSettings = true} 
                    title="Einstellungen"
                    bind:this={settingsButton}
                >
                    <Settings size={18} />
                </button>
                <div class="divider"></div>
            {/if}
            <label class:active={appState.mode === "local"}>
                <input type="radio" name="mode" value="local" checked={appState.mode === 'local'} onchange={() => appState.setMode('local')} /> Local
            </label>
            <label class:active={appState.mode === "nostr"}>
                <input type="radio" name="mode" value="nostr" checked={appState.mode === 'nostr'} onchange={() => appState.setMode('nostr')} /> Nostr
            </label>
            <label class:active={appState.mode === "group"}>
                <input type="radio" name="mode" value="group" checked={appState.mode === 'group'} onchange={handleGroupMode} /> Group
            </label>
        </div>
    </div>
</header>

<SettingsDialog 
    bind:open={showSettings} 
    bind:maxWidth={maxWidth} 
    onDownload={onDownload || (() => {})}
    anchorElement={settingsButton}
/>

<style>
  .header {
    flex-shrink: 0;
    background-color: white;
    border-bottom: 1px solid #e5e7eb;
    height: 3.5rem;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: 0 1rem;
    position: relative;
    z-index: 50;
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
  
  .icon-btn:hover, .icon-btn.active {
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

  /* Dark Mode Overrides */
  :global(.dark) .header {
      background-color: #1f2937;
      border-bottom-color: #374151;
  }

  :global(.dark) .doc-title-input {
      color: #f3f4f6;
  }

  :global(.dark) .doc-title-input:hover {
      background-color: #374151;
  }

  :global(.dark) .doc-title-input:focus {
      background-color: #111827;
      border-color: #60a5fa;
  }

  :global(.dark) .controls {
      background-color: #374151;
  }

  :global(.dark) .controls label {
      color: #d1d5db;
  }

  :global(.dark) .controls label:hover {
      color: #f9fafb;
  }

  :global(.dark) .controls label.active {
      background-color: #1f2937;
      color: #38bdf8;
  }

  :global(.dark) .icon-btn {
      color: #9ca3af;
  }

  :global(.dark) .icon-btn:hover, :global(.dark) .icon-btn.active {
      background-color: #1f2937;
      color: #f3f4f6;
  }

  :global(.dark) .divider {
      background-color: #4b5563;
  }
</style>