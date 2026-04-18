<script lang="ts">
  import { Organizer } from "$lib/states/organizer.svelte";
  import { confirm, open } from "@tauri-apps/plugin-dialog";
  import { onDestroy } from "svelte";
  import ActionPanel from "./ActionPanel.svelte";
  import EntriesTable from "./EntriesTable.svelte";
  import FilterPanel from "./FilterPanel.svelte";

  const organizer = new Organizer();
  const isExecuting = $derived(
    organizer.state === "deleting" || organizer.state === "renaming" || organizer.state === "moving",
  );
  onDestroy(organizer.cleanup);

  let action = $state<"delete" | "move" | "rename">("delete");

  async function openFolder() {
    const selected = await open({ directory: true });
    if (selected !== null) {
      organizer.path = selected;
    }
  }

  async function deleteAll() {
    const ok = await confirm(
      `Delete ${organizer.activeCount} of ${organizer.entryCount} entries? This cannot be undone.`,
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
      `Move ${organizer.activeCount} of ${organizer.entryCount} entries to "${organizer.moveConfig.targetPath}"?`,
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

<div class="view">
  <section class="folder-selector">
    <div class="field">
      <label for="folder-input">Folder</label>
      <input
        id="folder-input"
        placeholder="Enter a folder path..."
        bind:value={organizer.path}
        class:invalid={!organizer.pathIsValid}
        aria-invalid={!organizer.pathIsValid || undefined}
        disabled={isExecuting}
      />
      <button onclick={openFolder} disabled={isExecuting}>Open …</button>
      <button
        onclick={organizer.reload}
        disabled={organizer.state !== "idle" && organizer.state !== "done" && organizer.state !== "scanning"}
        aria-label="Reload folder">↺</button
      >
    </div>
    <p class="error path-error" aria-live="polite">{organizer.pathError}</p>
  </section>

  <FilterPanel bind:filters={organizer.filters} disabled={isExecuting} />

  <ActionPanel
    bind:action
    {organizer}
    disabled={isExecuting}
    disabledExecute={organizer.state !== "idle"}
    onDeleteAll={deleteAll}
    onMoveAll={moveAll}
    onRenameAll={renameAll}
    onOpenMoveTarget={openMoveTarget}
  />

  <EntriesTable {organizer} {action} />
</div>

<style>
  .view {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  .folder-selector {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
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

  .field input {
    flex: 1;
  }

  .path-error {
    margin: 0.5rem 0 0;
    min-height: 1lh;
  }
</style>
