<script lang="ts">
  import type { Event } from "nostr-tools";
  import { fetchNostrProfile } from "./nostrUtils";
  import { loadConfig } from "./config";
  import Save from "lucide-svelte/icons/save";
  import Clock from "lucide-svelte/icons/clock";
  import User from "lucide-svelte/icons/user";

  let { snapshots = [], onSaveSnapshot, onLoadSnapshot } = $props<{
    snapshots: Event[];
    onSaveSnapshot: () => void;
    onLoadSnapshot: (snapshot: Event) => void;
  }>();

  let profiles: Record<string, { name?: string; picture?: string }> = $state({});

  $effect(() => {
    loadConfig().then(async (config) => {
      for (const s of snapshots) {
        if (!profiles[s.pubkey]) {
          const p = await fetchNostrProfile(s.pubkey, config.profileRelays);
          if (p) {
            profiles[s.pubkey] = p;
          }
        }
      }
    });
  });

  function formatTime(ts: number) {
    return new Date(ts * 1000).toLocaleString();
  }
</script>

<div class="sidebar">
  <div class="header">
    <h3><Clock size={16} /> Versionen</h3>
    <button class="save-btn" onclick={onSaveSnapshot} title="Snapshot erstellen">
      <Save size={16} />
    </button>
  </div>

  <div class="list">
    {#if snapshots.length === 0}
      <div class="empty">Keine Snapshots vorhanden</div>
    {/if}
    {#each snapshots.sort((a, b) => b.created_at - a.created_at) as snapshot}
      <div class="item">
        <div class="item-header">
          <span class="author">
            {#if profiles[snapshot.pubkey]?.picture}
              <img src={profiles[snapshot.pubkey].picture} alt="" class="avatar" />
            {:else}
              <User size={12} />
            {/if}
            {profiles[snapshot.pubkey]?.name || snapshot.pubkey.slice(0, 8)}
          </span>
          <span class="time">{formatTime(snapshot.created_at)}</span>
        </div>
        <button class="load-btn" onclick={() => onLoadSnapshot(snapshot)}>
          Laden
        </button>
      </div>
    {/each}
  </div>
</div>

<style>
  .sidebar {
    width: 250px;
    background: white;
    border-left: 1px solid #e5e7eb;
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .header {
    padding: 0.75rem;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #f9fafb;
  }

  h3 {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: #374151;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .save-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: #4b5563;
    padding: 0.25rem;
    border-radius: 0.25rem;
  }

  .save-btn:hover {
    background: #e5e7eb;
    color: #111827;
  }

  .list {
    flex-grow: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  .empty {
    text-align: center;
    color: #9ca3af;
    font-size: 0.75rem;
    padding: 1rem;
  }

  .item {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    padding: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .item-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
    font-size: 0.75rem;
  }

  .author {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-weight: 500;
    color: #374151;
  }

  .avatar {
    width: 1rem;
    height: 1rem;
    border-radius: 50%;
  }

  .time {
    color: #9ca3af;
    font-size: 0.7rem;
  }

  .load-btn {
    width: 100%;
    padding: 0.25rem;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    cursor: pointer;
    color: #4b5563;
  }

  .load-btn:hover {
    background: #e5e7eb;
    color: #111827;
  }
</style>
