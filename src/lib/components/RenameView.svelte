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

<div class="rename-view">
  <ViewLayout
    bind:path={folder.path}
    pathIsValid={folder.pathIsValid}
    pathError={folder.pathError}
    onopen={openFolder}
    onreload={() => folder.reload()}
    changeCount={folder.files.length === 0
      ? "No files loaded"
      : `Renaming ${renameCount} of ${folder.files.length} ${folder.files.length === 1 ? "file" : "files"}`}
  >
    {#snippet configExtra()}
      <label for="filter-input">Filter pattern</label>
      <input id="filter-input" placeholder="Filter files by name..." bind:value={folder.fileFilterPattern} />

      <label for="match-input">Match pattern</label>
      <input id="match-input" placeholder="Enter file name pattern..." bind:value={folder.fileNamePattern} />

      <label for="rename-input">Rename pattern</label>
      <input
        id="rename-input"
        placeholder="Enter new name pattern..."
        bind:value={folder.newFileNamePattern}
        bind:this={newNameInput}
      />

      {#if folder.groupNames.length > 0}
        <span aria-hidden="true"></span>
        <div class="tags">
          {#each folder.groupNames as groupName (groupName)}
            <span
              class="tag"
              role="button"
              tabindex="0"
              onclick={() => addGroupToNewName(groupName)}
              onkeydown={(e) => (e.key === "Enter" || e.key === " ") && addGroupToNewName(groupName)}>{groupName}</span
            >
          {/each}
        </div>
      {/if}

      <label for="ignore-system">Ignore system files</label>
      <input id="ignore-system" type="checkbox" bind:checked={folder.ignoreSystemFiles} />
    {/snippet}

    {#snippet options()}
      <button
        onclick={async () => {
          if (await confirm(`Rename ${renameCount} ${renameCount === 1 ? "file" : "files"}?`)) {
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
</div>

<style>
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .tag {
    display: inline-block;
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    font-size: 0.8rem;
    background-color: var(--color-primary);
    border: 1px solid var(--color-primary);
    color: #ffffff;
    cursor: pointer;
    user-select: none;
  }

  .tag:hover {
    background-color: color-mix(in srgb, var(--color-primary) 80%, black);
    border-color: color-mix(in srgb, var(--color-primary) 80%, black);
  }

  :global(.rename-view th:nth-child(1)),
  :global(.rename-view td:nth-child(1)) {
    width: 3rem;
    text-align: center;
  }

  :global(.rename-view th:nth-child(2)),
  :global(.rename-view td:nth-child(2)),
  :global(.rename-view th:nth-child(3)),
  :global(.rename-view td:nth-child(3)) {
    width: 28%;
    overflow-wrap: anywhere;
  }

  :global(.rename-view th:nth-child(4)),
  :global(.rename-view td:nth-child(4)) {
    width: 20%;
  }

  :global(.rename-view td:nth-child(4) input) {
    width: 100%;
  }
</style>
