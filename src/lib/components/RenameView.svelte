<script lang="ts">
  import { Folder } from "$lib/states/folder.svelte";
  import { open, confirm } from "@tauri-apps/plugin-dialog";
  import { onDestroy } from "svelte";
  import ViewLayout from "./ViewLayout.svelte";

  const folder = new Folder();
  onDestroy(() => folder.cleanup());

  async function openFolder() {
    const selected = await open({ directory: true });
    if (selected !== null) {
      folder.path = selected;
    }
  }

  let newNameInput: HTMLInputElement = null!;

  function addGroupToNewName(groupName: string) {
    const insertion = `$<${groupName}>`;
    const start = newNameInput.selectionStart ?? folder.newFileNamePattern.length;
    const end = newNameInput.selectionEnd ?? start;
    folder.newFileNamePattern =
      folder.newFileNamePattern.slice(0, start) + insertion + folder.newFileNamePattern.slice(end);
    const newPos = start + insertion.length;
    requestAnimationFrame(() => {
      newNameInput.setSelectionRange(newPos, newPos);
      newNameInput.focus();
    });
  }

  const renameCount = $derived(
    folder.files.filter((f) => !f.ignore && !f.matchError && f.newName && f.newName !== f.name).length,
  );
</script>

<ViewLayout
  bind:path={folder.path}
  pathIsValid={folder.pathIsValid}
  pathError={folder.pathError}
  onopen={openFolder}
  onreload={() => folder.reload()}
  fileCount="{renameCount} / {folder.files.length}"
>
  {#snippet configExtra()}
    <div class="field">
      <label for="filter-input">Filter pattern</label>
      <input id="filter-input" placeholder="Filter files by name..." bind:value={folder.fileFilterPattern} />
    </div>

    <div class="field">
      <label for="match-input">Match pattern</label>
      <input id="match-input" placeholder="Enter file name pattern..." bind:value={folder.fileNamePattern} />
    </div>

    <div class="field">
      <label for="rename-input">Rename pattern</label>
      <input
        id="rename-input"
        placeholder="Enter new name pattern..."
        bind:value={folder.newFileNamePattern}
        bind:this={newNameInput}
      />
      {#if folder.groupNames.length > 0}
        <div class="groups">
          <span class="groups-label">Insert group:</span>
          {#each folder.groupNames as groupName (groupName)}
            <button class="group-btn" onclick={() => addGroupToNewName(groupName)}>{groupName}</button>
          {/each}
        </div>
      {/if}
    </div>
  {/snippet}

  {#snippet options()}
    <label>
      <input type="checkbox" bind:checked={folder.ignoreSystemFiles} />
      Ignore system files
    </label>
    <button
      onclick={async () => {
        if (await confirm(`Rename ${renameCount} file(s)?`)) {
          await folder.renameAll();
        }
      }}>Rename all</button
    >
  {/snippet}

  {#snippet tableHead()}
    <th>Ignore</th>
    <th>Current name</th>
    <th>New name</th>
    <th>Override pattern</th>
    <th>Error</th>
  {/snippet}

  {#snippet tableBody()}
    {#each folder.files as file (file.name)}
      <tr class:failed={file.renameError}>
        <td><input type="checkbox" bind:checked={file.ignore} /></td>
        <td>{file.name}</td>
        <td>{file.newName}</td>
        <td><input placeholder="Override pattern..." bind:value={file.overridePattern} /></td>
        <td>
          {#if file.renameError}<span class="error">{file.renameError}</span>
          {:else if file.matchError}<span class="error">Match pattern does not match</span>{/if}
        </td>
      </tr>
    {/each}
  {/snippet}
</ViewLayout>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .groups {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
    margin-top: 0.25rem;
  }

  .groups-label,
  .group-btn {
    font-size: 0.8rem;
  }

  .groups-label {
    color: var(--color-text-muted);
  }

  .group-btn {
    padding: 0.1rem 0.4rem;
  }

  :global(th:nth-child(1)),
  :global(td:nth-child(1)) {
    width: 4rem;
  }
  :global(th:nth-child(2)),
  :global(td:nth-child(2)) {
    width: 20%;
  }
  :global(th:nth-child(3)),
  :global(td:nth-child(3)) {
    width: 20%;
  }
  :global(th:nth-child(4)),
  :global(td:nth-child(4)) {
    width: 15%;
  }

  :global(td:nth-child(4) input) {
    width: 100%;
  }

  :global(tr.failed td) {
    background-color: var(--color-error-bg);
  }

  .error {
    color: var(--color-error);
  }
</style>
