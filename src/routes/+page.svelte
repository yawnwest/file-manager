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
    {#if zoom.value !== 1}
      <button class="zoom-reset" onclick={() => (zoom.value = 1)}>
        {Math.round(zoom.value * 100)}%
      </button>
    {/if}
  </nav>

  {#if activeTab === "rename"}
    <RenameView />
  {:else}
    <CleanView />
  {/if}
</main>

<style>
  :global(:root) {
    color-scheme: light dark;
    --color-background: #ffffff; /* page background */
    --color-surface: #ffffff; /* card/panel backgrounds */
    --color-foreground: #1e1e3a; /* default text */
    --color-primary: #0078f8; /* main accent, CTAs */
    --color-neutral: #888888; /* neutral actions */
    --color-success: #00a800; /* success */
    --color-warning: #f8b800; /* warning */
    --color-destructive: #d82800; /* destructive actions */
    --color-ring: #60b4fc; /* focus rings */
    --color-border: #222222; /* borders, scrollbars and dividers */
  }

  @media (prefers-color-scheme: dark) {
    :global(:root) {
      --color-background: #0f0f1e;
      --color-surface: #1e1e3a;
      --color-foreground: #f4f4ff;
      --color-border: #888888;
      --color-destructive: #f83800;
    }
  }

  :global(body) {
    margin: 0;
    padding: 0;
    background-color: var(--color-background);
    color: var(--color-foreground);
    font-family: system-ui, sans-serif;
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
