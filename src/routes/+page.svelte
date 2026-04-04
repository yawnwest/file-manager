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
  :global(:root) {
    --color-bg: #ffffff;
    --color-text: #000000;
    --color-border: #ccc;
    --color-text-muted: #666;
    --color-text-faint: #999;
    --color-error-bg: #fff0f0;
    --color-error: red;
  }

  @media (prefers-color-scheme: dark) {
    :global(:root) {
      --color-bg: #1e1e1e;
      --color-text: #e0e0e0;
      --color-border: #444;
      --color-text-muted: #aaa;
      --color-text-faint: #777;
      --color-error-bg: #3d1515;
      --color-error: #ff6b6b;
    }
  }

  :global(body) {
    margin: 0;
    padding: 0;
    background-color: var(--color-bg);
    color: var(--color-text);
  }

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
