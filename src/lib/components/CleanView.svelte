<script lang="ts">
  import { EmptyFolderCleaner } from "$lib/states/empty-folder-cleaner.svelte";
  import { open, confirm } from "@tauri-apps/plugin-dialog";
  import { onDestroy } from "svelte";
  import ViewLayout from "./ViewLayout.svelte";

  const cleaner = new EmptyFolderCleaner();
  onDestroy(() => cleaner.cleanup());

  async function openDir() {
    const selected = await open({ directory: true });
    if (selected !== null) {
      cleaner.path = selected;
    }
  }
</script>

<div class="clean-view">
  <ViewLayout
    bind:path={cleaner.path}
    pathIsValid={cleaner.pathIsValid}
    pathError={cleaner.pathError}
    onopen={openDir}
    onreload={() => cleaner.reload()}
    lockPath={cleaner.deleting}
    changeCount={cleaner.scanning
      ? `Scanning… (${cleaner.scanChecked} checked, ${cleaner.emptyCount} empty found)`
      : cleaner.deleting
        ? "Deleting…"
        : [
            `${cleaner.emptyCount} empty folder(s)`,
            cleaner.skippedCount > 0 ? `${cleaner.skippedCount} inaccessible folder(s) skipped` : "",
          ]
            .filter(Boolean)
            .join(", ")}
  >
    {#snippet options()}
      <button
        disabled={cleaner.scanning || cleaner.deleting}
        onclick={async () => {
          if (await confirm(`Delete ${cleaner.emptyCount} empty folder(s)?`)) {
            await cleaner.deleteAll();
          }
        }}>Delete all</button
      >
    {/snippet}

    {#snippet tableHead()}
      <th>Folder path</th>
      <th>Status</th>
    {/snippet}

    {#snippet tableBody()}
      {#each cleaner.folders as folder (folder.path)}
        <tr
          class:failed={folder.status === "failed"}
          class:skipped={folder.status === "skipped"}
          class:success={folder.status === "deleted"}
        >
          <td>{folder.path}</td>
          <td>
            {#if folder.status}{folder.statusText}{/if}
          </td>
        </tr>
      {/each}
    {/snippet}
  </ViewLayout>
</div>

<style>
  :global(.clean-view th:nth-child(1)),
  :global(.clean-view td:nth-child(1)) {
    width: 66%;
    overflow-wrap: anywhere;
  }
</style>
