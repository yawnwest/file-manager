<script lang="ts">
  import { Zoom } from "$lib/states/zoom.svelte";
  import RenameView from "$lib/components/RenameView.svelte";
  import CleanView from "$lib/components/CleanView.svelte";
  import UpdateChecker from "$lib/components/UpdateChecker.svelte";

  const zoom = new Zoom();

  let activeTab = $state<"rename" | "clean">("rename");
</script>

<svelte:window onkeydown={zoom.handleKeydown} />

<UpdateChecker />

<main>
  <nav class="tabs">
    <button class:active={activeTab === "rename"} onclick={() => (activeTab = "rename")}>Rename files</button>
    <button class:active={activeTab === "clean"} onclick={() => (activeTab = "clean")}>Delete empty folders</button>
  </nav>

  {#if activeTab === "rename"}
    <RenameView />
  {:else}
    <CleanView />
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
  }

  main {
    box-sizing: border-box;
    width: 100vw;
    max-width: 100%;
  }

  .tabs {
    display: flex;
    border-bottom: 1px solid #ccc;
    padding: 0 1rem;
  }

  .tabs button {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 0.5rem 1rem;
    cursor: pointer;
    font-size: 0.9rem;
    margin-bottom: -1px;
  }

  .tabs button.active {
    border-bottom-color: currentColor;
    font-weight: bold;
  }
</style>
