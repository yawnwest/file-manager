<script lang="ts">
  import { Organizer } from "$lib/states/organizer.svelte";
  import { confirm, open } from "@tauri-apps/plugin-dialog";
  import { onDestroy } from "svelte";
  import ActionPanel from "./ActionPanel.svelte";
  import EntriesTable from "./EntriesTable.svelte";
  import FilterPanel from "./FilterPanel.svelte";

  const organizer = new Organizer();
  const isExecuting = $derived(organizer.state !== "idle" && organizer.state !== "scanning");
  const isExecutingOrScanning = $derived(organizer.state !== "idle");
  onDestroy(organizer.cleanup);

  let action = $state<"delete" | "move" | "rename">("delete");

  $effect(() => {
    if (action !== "delete") {
      organizer.filters.isEmpty = false;
    }
  });

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
      <button onclick={reloadFolder} disabled={isExecuting} aria-label="Reload folder">↺</button>
    </div>
    <p class="error path-error" aria-live="polite">{organizer.pathError}</p>
  </section>

  <FilterPanel bind:filters={organizer.filters} disabled={isExecuting} />

  <ActionPanel
    bind:action
    {organizer}
    disabled={isExecuting}
    disabledExecute={isExecutingOrScanning}
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
    overflow: hidden;
    min-height: 0;
  }

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

  input:not([type="checkbox"]):not([type="radio"]) {
    flex: 1;
  }

  .path-error {
    margin: 0.5rem 0 0;
    min-height: 1lh;
  }
</style>
