<script lang="ts">
  import { Directory } from "$lib/states/directory.svelte";
  import { open, confirm } from "@tauri-apps/plugin-dialog";
  import { onDestroy } from "svelte";
  import ViewLayout from "./ViewLayout.svelte";

  const directory = new Directory();
  onDestroy(() => directory.cleanup());

  async function openDir() {
    const selected = await open({ directory: true });
    if (selected !== null) {
      directory.path = selected;
    }
  }

  let newNameInput: HTMLInputElement = null!;

  function addGroupToNewName(groupName: string) {
    const insertion = `$<${groupName}>`;
    const start = newNameInput.selectionStart ?? directory.newFileNamePattern.length;
    const end = newNameInput.selectionEnd ?? start;
    directory.newFileNamePattern =
      directory.newFileNamePattern.slice(0, start) + insertion + directory.newFileNamePattern.slice(end);
    const newPos = start + insertion.length;
    requestAnimationFrame(() => {
      newNameInput.setSelectionRange(newPos, newPos);
      newNameInput.focus();
    });
  }

  const renameCount = $derived(
    directory.files.filter((f) => !f.ignore && !f.matchError && f.newName && f.newName !== f.name).length,
  );
</script>

<ViewLayout
  bind:path={directory.path}
  pathIsValid={directory.pathIsValid}
  pathError={directory.pathError}
  onopen={openDir}
  onreload={() => directory.reload()}
  fileCount="{renameCount} / {directory.files.length}"
>
  {#snippet configExtra()}
    <div class="field">
      <label for="filter-input">Filter pattern</label>
      <input id="filter-input" placeholder="Filter files by name..." bind:value={directory.fileFilterPattern} />
    </div>

    <div class="field">
      <label for="match-input">Match pattern</label>
      <input id="match-input" placeholder="Enter file name pattern..." bind:value={directory.fileNamePattern} />
    </div>

    <div class="field">
      <label for="rename-input">Rename pattern</label>
      <input
        id="rename-input"
        placeholder="Enter new name pattern..."
        bind:value={directory.newFileNamePattern}
        bind:this={newNameInput}
      />
      {#if directory.groupNames.length > 0}
        <div class="groups">
          <span class="groups-label">Insert group:</span>
          {#each directory.groupNames as groupName (groupName)}
            <button class="group-btn" onclick={() => addGroupToNewName(groupName)}>{groupName}</button>
          {/each}
        </div>
      {/if}
    </div>
  {/snippet}

  {#snippet options()}
    <label>
      <input type="checkbox" bind:checked={directory.ignoreSystemFiles} />
      Ignore system files
    </label>
    <button
      onclick={async () => {
        if (await confirm(`Rename ${renameCount} file(s)?`)) {
          await directory.renameAll();
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
    {#each directory.files as file (file.name)}
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
    color: #666;
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
    background-color: #fff0f0;
  }

  .error {
    color: red;
  }
</style>
