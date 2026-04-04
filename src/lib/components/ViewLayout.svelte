<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    path: string;
    pathIsValid: boolean;
    pathError: string;
    onopen: () => void;
    onreload: () => void;
    changeCount: string;
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
    changeCount,
    lockPath = false,
    configExtra,
    options,
    tableHead,
    tableBody,
  }: Props = $props();
</script>

<section class="config">
  <div class="group">
    <div class="field">
      <label for="folder-input">Folder</label>
      <input
        id="folder-input"
        placeholder="Enter a folder path..."
        bind:value={path}
        class:invalid={!pathIsValid}
        disabled={lockPath}
      />
      <button onclick={onopen} disabled={lockPath}>Open …</button>
      <button onclick={onreload} disabled={lockPath}>↺</button>
    </div>
    <p class="error path-error">{pathError}</p>
  </div>

  {@render configExtra?.()}

  <div class="field options-row">
    <p class="file-count">{changeCount}</p>
    {@render options()}
  </div>
</section>

<section class="files">
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
  /* Config section */
  .config {
    display: flex;
    flex-direction: column;
    padding: 1rem;
  }

  .group {
    display: flex;
    flex-direction: column;
  }

  .field {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
  }

  :global(.field label) {
    font-weight: bold;
  }

  :global(.field input) {
    flex: 1;
  }

  :global(input, select, textarea, button) {
    font: inherit;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    padding: 0.25rem 0.5rem;
  }

  :global(input, select, textarea) {
    color: var(--color-foreground);
    background-color: var(--color-surface);
    color-scheme: light dark;
  }

  :global(button) {
    --btn-color: var(--color-neutral);
    color: #ffffff;
    background-color: var(--btn-color);
    cursor: pointer;
  }

  :global(button:hover:not(:disabled)) {
    background-color: color-mix(in srgb, var(--btn-color) 80%, black);
  }

  :global(button:disabled, input:disabled) {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .options-row {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
  }

  :global(.options-row button) {
    --btn-color: var(--color-primary);
  }

  /* Files section */
  .files {
    padding: 1rem;
  }

  .file-count {
    margin: 0;
    font-size: 0.85rem;
    color: var(--color-neutral);
  }

  table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
  }

  table :global(th) {
    text-align: left;
    padding: 0.25rem 0.5rem;
    border-bottom: 1px solid var(--color-border);
  }

  table :global(td) {
    padding: 0.2rem 0.5rem;
    vertical-align: middle;
    overflow: hidden;
  }

  :global(.skipped td) {
    font-style: italic;
    color: var(--color-neutral);
  }

  :global(.failed td) {
    color: var(--color-destructive);
  }

  :global(.success td) {
    color: var(--color-success);
  }

  table :global(tbody tr:nth-child(even)) {
    background-color: color-mix(in srgb, var(--color-surface) 95%, var(--color-foreground));
  }

  /* States */
  :global(.error) {
    color: var(--color-destructive);
  }

  .path-error {
    margin: 0.5rem 0 0;
    min-height: 1.5lh;
  }

  .invalid {
    outline: 2px solid red;
  }
</style>
