<script lang="ts">
  import OrganizerView from "$lib/components/OrganizerView.svelte";
  import UpdateChecker from "$lib/components/UpdateChecker.svelte";
  import { Zoom } from "$lib/states/zoom.svelte";
  import { onDestroy } from "svelte";

  const zoom = new Zoom();
  onDestroy(zoom.cleanup);
</script>

<svelte:window onkeydown={zoom.handleKeydown} />

<UpdateChecker />

<main>
  <div class="tabs" role="tablist">
    <span class="tab active" role="tab" aria-selected="true">Organizer</span>
    {#if zoom.value !== 1}
      <button class="zoom-reset" onclick={() => (zoom.value = 1)}>
        {Math.round(zoom.value * 100)}%
      </button>
    {/if}
  </div>

  <OrganizerView />
</main>

<style>
  main {
    box-sizing: border-box;
    width: 100vw;
    max-width: 100%;
    height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .tabs {
    display: flex;
    border-bottom: 1px solid var(--color-border);
    padding: 0 1rem;
  }

  .tabs button,
  .tabs .tab {
    background: none;
    border: none;
    border-radius: 0;
    border-bottom: 2px solid transparent;
    padding: 0.5rem 1rem;
    font-size: 0.9rem;
    margin-bottom: -1px;
    color: var(--color-foreground);
  }

  .tabs button {
    cursor: pointer;
  }

  .tabs .active {
    border-bottom-color: currentColor;
    font-weight: bold;
  }

  .zoom-reset {
    margin-left: auto;
    font-size: 0.8rem;
    color: var(--color-neutral);
  }
</style>
