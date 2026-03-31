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
  fileCount="{cleaner.emptyFolders.length} empty folder(s)"
>
  {#snippet options()}
    <span></span>
    <button
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
  {/snippet}
</ViewLayout>

<style>
  :global(tr.failed td) {
    background-color: #fff0f0;
  }

  .error {
    color: red;
  }
</style>
