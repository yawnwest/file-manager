<script lang="ts">
  import { Organizer } from "$lib/states/organizer.svelte";
  import { confirm, open } from "@tauri-apps/plugin-dialog";
  import { onDestroy } from "svelte";
  import ActionPanel from "./ActionPanel.svelte";
  import EntriesTable from "./EntriesTable.svelte";
  import FilterPanel from "./FilterPanel.svelte";

  const organizer = new Organizer();
  const disabled = $derived(organizer.state !== "idle");
  onDestroy(organizer.cleanup);

  let action = $state<"delete" | "move" | "rename">("delete");

  async function openFolder() {
    const selected = await open({ directory: true });
    if (selected !== null) {
      organizer.path = selected;
    }
  }

  function reloadFolder() {
    organizer.reload();
  }

  async function deleteAll() {
    const ok = await confirm(
      `Delete ${organizer.deleteCount} of ${organizer.entryCount} entries? This cannot be undone.`,
      {
        title: "Confirm deletion",
        kind: "warning",
      },
    );
    if (ok) await organizer.deleteAll();
  }

  async function openMoveTarget() {
    const selected = await open({ directory: true });
    if (selected !== null) {
      organizer.moveConfig.targetPath = selected;
    }
  }

  async function moveAll() {
    const ok = await confirm(
      `Move ${organizer.deleteCount} of ${organizer.entryCount} entries to "${organizer.moveConfig.targetPath}"?`,
      {
        title: "Confirm move",
        kind: "warning",
      },
    );
    if (ok) await organizer.moveAll();
  }

  async function renameAll() {
    const ok = await confirm(`Rename ${organizer.renameCount} of ${organizer.entryCount} entries?`, {
      title: "Confirm rename",
      kind: "warning",
    });
    if (ok) await organizer.renameAll();
  }
</script>

<section class="folder-selector">
  <div class="field">
    <label for="folder-input">Folder</label>
    <input
      id="folder-input"
      placeholder="Enter a folder path..."
      bind:value={organizer.path}
      class:invalid={!organizer.pathIsValid}
      disabled={disabled && organizer.state !== "scanning"}
    />
    <button onclick={openFolder} {disabled}>Open …</button>
    <button onclick={reloadFolder} {disabled}>↺</button>
  </div>
  <p class="error path-error">{organizer.pathError}</p>
</section>

<FilterPanel filters={organizer.filters} {disabled} />

<ActionPanel
  bind:action
  {organizer}
  {disabled}
  onDeleteAll={deleteAll}
  onMoveAll={moveAll}
  onRenameAll={renameAll}
  onOpenMoveTarget={openMoveTarget}
/>

<EntriesTable {organizer} {action} />

<style>
  .folder-selector {
    display: flex;
    flex-direction: column;
    padding: 1rem;
  }

  .field {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
  }

  .field label {
    font-weight: bold;
  }

  input {
    flex: 1;
  }

  input,
  button {
    border: 1px solid var(--color-border);
    border-radius: 4px;
    padding: 0.25rem 0.5rem;
  }

  input {
    background-color: var(--color-surface);
    color-scheme: light dark;
  }

  button {
    --btn-color: var(--color-primary);
    color: #ffffff;
    background-color: var(--btn-color);
    cursor: pointer;
  }

  button:active:not(:disabled) {
    background-color: color-mix(in srgb, var(--btn-color) 80%, black);
  }

  button:disabled,
  input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transition: opacity 0s 150ms;
  }

  .error {
    color: var(--color-destructive);
  }

  .path-error {
    margin: 0.5rem 0 0;
    min-height: 1lh;
  }

  .invalid {
    outline: 2px solid var(--color-destructive);
  }
</style>
