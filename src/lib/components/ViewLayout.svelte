<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    path: string;
    pathIsValid: boolean;
    pathError: string;
    onopen: () => void;
    onreload: () => void;
    fileCount: string;
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
    configExtra,
    options,
    tableHead,
    tableBody,
  }: Props = $props();
</script>

<section class="config">
  <div class="field">
    <label for="dir-input">Directory</label>
    <div class="dir-row">
      <input id="dir-input" placeholder="Enter a directory..." bind:value={path} class:invalid={!pathIsValid} />
      <button onclick={onopen}>Open …</button>
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
    color: red;
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

  .dir-row {
    display: flex;
    gap: 0.5rem;
  }

  .dir-row input {
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
    color: #666;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  :global(th) {
    text-align: left;
    font-size: 0.85rem;
    padding: 0.25rem 0.5rem;
    border-bottom: 1px solid #ccc;
  }

  :global(td) {
    padding: 0.2rem 0.5rem;
    vertical-align: middle;
  }
</style>
