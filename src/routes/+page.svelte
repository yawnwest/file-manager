<script lang="ts">
  import { Directory } from "$lib/states/directory.svelte";
  import { Zoom } from "$lib/states/zoom.svelte";
  import { open, confirm } from "@tauri-apps/plugin-dialog";
  import { onDestroy } from "svelte";

  const zoom = new Zoom();
  const directory = new Directory();
  onDestroy(() => directory.cleanup());

  async function openDir() {
    const selected = await open({
      directory: true,
    });
    if (selected !== null) {
      directory.path = selected;
    }
  }

  let newNameInput: HTMLInputElement = null!;

  function addGroupToNewName(groupName: string) {
    const insertion = `$<${groupName}>`;
    const start =
      newNameInput.selectionStart ?? directory.newFileNamePattern.length;
    const end = newNameInput.selectionEnd ?? start;
    directory.newFileNamePattern =
      directory.newFileNamePattern.slice(0, start) +
      insertion +
      directory.newFileNamePattern.slice(end);
    // Restore cursor position after the inserted text
    const newPos = start + insertion.length;
    requestAnimationFrame(() => {
      newNameInput.setSelectionRange(newPos, newPos);
      newNameInput.focus();
    });
  }
</script>

<svelte:window onkeydown={zoom.handleKeydown} />

<main>
  <section class="config">
    <div class="field">
      <label for="dir-input">Directory</label>
      <div class="dir-row">
        <input
          id="dir-input"
          placeholder="Enter a directory..."
          bind:value={directory.path}
          class:invalid={!directory.pathIsValid}
        />
        <button onclick={() => openDir()}>Open …</button>
        <button onclick={() => directory.reload()}>Reload</button>
      </div>
      <p class="error">{directory.pathError}</p>
    </div>

    <div class="field">
      <label for="match-input">Match pattern</label>
      <input
        id="match-input"
        placeholder="Enter file name pattern..."
        bind:value={directory.fileNamePattern}
      />
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
          {#each directory.groupNames as groupName, _}
            <button
              class="group-btn"
              onclick={() => addGroupToNewName(groupName)}>{groupName}</button
            >
          {/each}
        </div>
      {/if}
    </div>

    <div class="field options-row">
      <label>
        <input type="checkbox" bind:checked={directory.ignoreSystemFiles} />
        Ignore system files
      </label>
      <button
        onclick={async () => {
          const count = directory.files.filter(
            (f) => !f.ignore && f.newName && f.newName !== f.name,
          ).length;
          if (await confirm(`Rename ${count} file(s)?`)) {
            await directory.renameAll();
          }
        }}>Rename all</button
      >
    </div>
  </section>

  <section class="files">
    <table>
      <thead>
        <tr>
          <th>Ignore</th>
          <th>Current name</th>
          <th>New name</th>
          <th>Override pattern</th>
          <th>Error</th>
        </tr>
      </thead>
      <tbody>
        {#each directory.files as file, _}
          <tr class:failed={file.renameError}>
            <td><input type="checkbox" bind:checked={file.ignore} /></td>
            <td>{file.name}</td>
            <td>{file.newName}</td>
            <td>
              <input
                placeholder="Override pattern..."
                bind:value={file.overridePattern}
              />
            </td>
            <td>{#if file.renameError}<span class="error">{file.renameError}</span>{/if}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
</main>

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

  .field label {
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

  :global(body) {
    margin: 0;
    padding: 0;
  }

  main {
    box-sizing: border-box;
    width: 100vw;
    max-width: 100%;
  }

  .files {
    padding: 1rem;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th {
    text-align: left;
    font-size: 0.85rem;
    padding: 0.25rem 0.5rem;
    border-bottom: 1px solid #ccc;
  }

  td {
    padding: 0.2rem 0.5rem;
    vertical-align: middle;
  }

  th:nth-child(1),
  td:nth-child(1) {
    width: 4rem;
  }
  th:nth-child(2),
  td:nth-child(2) {
    width: 20%;
  }
  th:nth-child(3),
  td:nth-child(3) {
    width: 20%;
  }
  th:nth-child(4),
  td:nth-child(4) {
    width: 15%;
  }

  td:nth-child(4) input {
    width: 100%;
  }

  tr.failed td {
    background-color: #fff0f0;
  }
</style>
