<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    path: string;
    pathIsValid: boolean;
    pathError: string;
    onopen: () => void;
    onreload: () => void;
    fileCount: string;
    lockPath?: boolean;
    configExtra?: Snippet;
    options: Snippet;
    tableHead: Snippet;
    tableBody: Snippet;
  }

  let {
    path = $bindable(),
    pathIsValid,
    pathError,
    onopen,
    onreload,
    fileCount,
    lockPath = false,
    configExtra,
    options,
    tableHead,
    tableBody,
  }: Props = $props();
</script>

<section class="config">
  <div class="field">
    <label for="folder-input">Folder</label>
    <div class="folder-row">
      <input
        id="folder-input"
        placeholder="Enter a folder path..."
        bind:value={path}
        class:invalid={!pathIsValid}
        disabled={lockPath}
      />
      <button onclick={onopen} disabled={lockPath}>Open …</button>
      <button onclick={onreload}>Reload</button>
    </div>
    <p class="error">{pathError}</p>
  </div>

  {@render configExtra?.()}

  <div class="field options-row">
    {@render options()}
  </div>
</section>

<section class="files">
  <p class="file-count">{fileCount}</p>
  <table>
    <thead>
      <tr>{@render tableHead()}</tr>
    </thead>
    <tbody>
      {@render tableBody()}
    </tbody>
  </table>
</section>

<style>
  .error {
    color: var(--color-destructive);
  }

  .invalid {
    outline: 2px solid red;
  }

  .config {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  :global(.field label) {
    font-weight: bold;
    font-size: 0.85rem;
  }

  .folder-row {
    display: flex;
    gap: 0.5rem;
  }

  .folder-row input {
    flex: 1;
  }

  .options-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }

  .files {
    padding: 1rem;
  }

  .file-count {
    margin: 0 0 0.5rem;
    font-size: 0.85rem;
    color: var(--color-neutral);
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  :global(th) {
    text-align: left;
    font-size: 0.85rem;
    padding: 0.25rem 0.5rem;
    border-bottom: 1px solid var(--color-border);
  }

  :global(td) {
    padding: 0.2rem 0.5rem;
    vertical-align: middle;
  }
</style>
