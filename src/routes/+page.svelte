<script lang="ts">
  import { Zoom } from "$lib/states/zoom.svelte";
  import OrganizerView from "$lib/components/OrganizerView.svelte";
  import UpdateChecker from "$lib/components/UpdateChecker.svelte";

  const zoom = new Zoom();

  let activeTab = $state<"organize" | "watch" | "diff">("organize");
</script>

<svelte:window onkeydown={zoom.handleKeydown} />

<UpdateChecker />

<main>
  <nav class="tabs">
    <button class:active={activeTab === "organize"} onclick={() => (activeTab = "organize")}>Organizer</button>
    <!-- <button class:active={activeTab === "watch"} onclick={() => (activeTab = "watch")}>Watcher</button>
    <button class:active={activeTab === "diff"} onclick={() => (activeTab = "diff")}>Differ</button> -->
    {#if zoom.value !== 1}
      <button class="zoom-reset" onclick={() => (zoom.value = 1)}>
        {Math.round(zoom.value * 100)}%
      </button>
    {/if}
  </nav>

  {#if activeTab === "organize"}
    <OrganizerView />
  {:else if activeTab === "watch"}
    <!-- <RenameView /> -->
  {:else}
    <!-- <CleanView /> -->
  {/if}
</main>

<style>
  main {
    box-sizing: border-box;
    width: 100vw;
    max-width: 100%;
  }

  .tabs {
    display: flex;
    border-bottom: 1px solid var(--color-border);
    padding: 0 1rem;
  }

  .tabs button {
    background: none;
    border: none;
    border-radius: 0;
    border-bottom: 2px solid transparent;
    padding: 0.5rem 1rem;
    cursor: pointer;
    font-size: 0.9rem;
    margin-bottom: -1px;
    color: var(--color-foreground);
  }

  .tabs button.active {
    border-bottom-color: currentColor;
    font-weight: bold;
  }

  .zoom-reset {
    margin-left: auto;
    font-size: 0.8rem;
    color: var(--color-neutral);
  }
</style>
