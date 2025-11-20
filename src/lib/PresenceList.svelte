<script lang="ts">
    import { Awareness } from "y-protocols/awareness";
    import Users from "lucide-svelte/icons/users";

    const { awareness, mode = "local" } = $props<{
        awareness: Awareness | null;
        mode?: "local" | "nostr";
    }>();

    // Derive active users from awareness
    let users = $state<Array<{ id: number; name: string; color: string }>>([]);
    let pulsingUsers = $state<Record<number, boolean>>({});
    let timeouts: Record<number, any> = {};

    function triggerPulse(id: number) {
        // console.log('Triggering pulse for', id);
        if (timeouts[id]) clearTimeout(timeouts[id]);

        // Reset state (force reactivity)
        pulsingUsers[id] = false;
        
        setTimeout(() => {
            pulsingUsers[id] = true;
            // console.log('Pulse ON', id);
            
            timeouts[id] = setTimeout(() => {
                pulsingUsers[id] = false;
                // console.log('Pulse OFF', id);
            }, 500);
        }, 20);
    }

    $effect(() => {
        const currentAwareness = awareness;

        if (!currentAwareness) {
            users = [];
            return;
        }

        const updateUsers = () => {
            const activeUsers: Array<{ id: number; name: string; color: string }> = [];
            currentAwareness.getStates().forEach((state: any, clientId: number) => {
                if (state.user) {
                    activeUsers.push({
                        id: clientId,
                        name: state.user.name || "Anonym",
                        color: state.user.color || "#999",
                    });
                }
            });
            users = activeUsers;
        };

        const onChange = (changes: any, origin: any) => {
            // console.log('PresenceList change:', changes, origin);
            updateUsers();
            if (changes && changes.updated) {
                changes.updated.forEach((id: number) => {
                    // Only pulse for remote changes or if we want to see our own pulse (usually not)
                    // The origin 'remote' comes from NostrAwarenessProvider
                    if (id !== currentAwareness.clientID) {
                        triggerPulse(id);
                    }
                });
            }
        };

        // Initial update
        updateUsers();

        // Listen for changes
        currentAwareness.on('change', onChange);
        
        return () => {
            currentAwareness.off('change', onChange);
        };
    });
</script>

{#if awareness && users.length > 0}
    <div class="presence-list">
        <div class="presence-header">
            <Users size={16} />
            <span class="presence-count">
                {#if mode === "local"}
                    Local
                {:else}
                    {users.length} online
                {/if}
            </span>
        </div>
        <div class="presence-avatars">
            {#each users as user (user.id)}
                <div
                     class="avatar {pulsingUsers[user.id] ? 'pulsing' : ''}"
                    style="background-color: {user.color}"
                    title={user.name}
                >
                    <!-- 
                        Hier werden die Initialen generiert.
                        Aktuell nehmen wir einfach die ersten zwei Buchstaben des Namens.
                        Da der Default-Name "TestUser" ist (siehe routes/editor/[id]/+page.svelte),
                        erscheint hier "TE".
                    -->
                    {user.name.slice(0, 2).toUpperCase()}
                </div>
            {/each}
        </div>
    </div>
{/if}

<style>
    .presence-list {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.5rem 0.75rem;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 0.5rem;
    }

    .presence-header {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        color: #6b7280;
    }

    .presence-count {
        font-size: 0.875rem;
        font-weight: 500;
    }

    .presence-avatars {
        display: flex;
        gap: 0.25rem;
    }

    .avatar {
        width: 2rem;
        height: 2rem;
        border-radius: 9999px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.75rem;
        font-weight: 600;
        color: white;
        border: 2px solid white;
        box-shadow: 0 1px 2px rgb(0 0 0 / 0.1);
        cursor: default;
        position: relative; /* Wichtig für z-index */
    }

    @keyframes pulse-ring {
        0% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7);
        }
        50% {
            transform: scale(1.15);
        }
        100% {
            transform: scale(1);
            box-shadow: 0 0 0 6px rgba(59, 130, 246, 0);
        }
    }

    .pulsing {
        animation: pulse-ring 0.5s cubic-bezier(0.4, 0, 0.6, 1);
        z-index: 10;
    }
</style>
