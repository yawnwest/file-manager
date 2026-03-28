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

<main class="container">
  <div class="row">
    <input
      placeholder="Enter a directory..."
      bind:value={directory.path}
      class:invalid={!directory.pathIsValid}
    />
    <input
      placeholder="Enter file name pattern..."
      bind:value={directory.fileNamePattern}
    />
    <input
      placeholder="Enter new name pattern..."
      bind:value={directory.newFileNamePattern}
      bind:this={newNameInput}
    />
    <button onclick={() => openDir()}>Open ...</button>
    <button onclick={() => directory.reload()}>Reload</button>
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
  <p class="error">{directory.pathError}</p>

  <label>
    <input type="checkbox" bind:checked={directory.ignoreSystemFiles} />
    Ignore system files
  </label>

  <ul>
    {#each directory.groupNames as groupName, _}
      <li>
        <button onclick={() => addGroupToNewName(groupName)}>{groupName}</button
        >
      </li>
    {/each}
  </ul>
  <ul>
    {#each directory.files as file, _}
      <li>{file.name}</li>
    {/each}
  </ul>
  <ul>
    {#each directory.files as file, _}
      <li class:failed={file.renameError}>
        <input type="checkbox" bind:checked={file.ignore} />
        <input
          placeholder="Override pattern..."
          bind:value={file.overridePattern}
        />
        {file.newName}
        <span class="error">{file.renameError}</span>
      </li>
    {/each}
  </ul>
</main>

<style>
  .error {
    color: red;
  }

  .invalid {
    outline: 2px solid red;
  }
</style>
