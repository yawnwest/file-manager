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

<ViewLayout
  bind:path={cleaner.path}
  pathIsValid={cleaner.pathIsValid}
  pathError={cleaner.pathError}
  onopen={openDir}
  onreload={() => cleaner.reload()}
  lockPath={cleaner.deleting}
  fileCount={cleaner.scanning
    ? "Scanning…"
    : cleaner.deleting
      ? "Deleting…"
      : [
          `${cleaner.emptyFolders.length} empty folder(s)`,
          cleaner.skippedFolders.length > 0 ? `${cleaner.skippedFolders.length} inaccessible folder(s) skipped` : "",
        ]
          .filter(Boolean)
          .join(", ")}
>
  {#snippet options()}
    <span></span>
    <button
      disabled={cleaner.scanning || cleaner.deleting}
      onclick={async () => {
        if (await confirm(`Delete ${cleaner.emptyFolders.length} empty folder(s)?`)) {
          await cleaner.deleteAll();
        }
      }}>Delete all</button
    >
  {/snippet}

  {#snippet tableHead()}
    <th>Folder path</th>
    <th>Error</th>
  {/snippet}

  {#snippet tableBody()}
    {#each cleaner.emptyFolders as folder (folder.path)}
      <tr class:failed={folder.deleteError}>
        <td>{folder.path}</td>
        <td>
          {#if folder.deleteError}<span class="error">{folder.deleteError}</span>{/if}
        </td>
      </tr>
    {/each}
    {#each cleaner.skippedFolders as folder (folder.path)}
      <tr class="skipped">
        <td>{folder.path}</td>
        <td><span class="skipped-label">{folder.reason}</span></td>
      </tr>
    {/each}
  {/snippet}
</ViewLayout>

<style>
  :global(tr.failed td) {
    background-color: #fff0f0;
  }

  .error {
    color: red;
  }

  :global(tr.skipped td) {
    color: #999;
  }

  .skipped-label {
    font-style: italic;
  }
</style>
