<script lang="ts">
  import { Directory } from "$lib/states/directory.svelte";
  import { Zoom } from "$lib/states/zoom.svelte";
  import { open } from "@tauri-apps/plugin-dialog";
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
    />
    <button onclick={() => openDir()}>Open ...</button>
  </div>
  <p class="error">{directory.pathError}</p>

  <label>
    <input type="checkbox" bind:checked={directory.ignoreSystemFiles} />
    Ignore system files
  </label>

  <ul>
    {#each directory.groupNames as groupName, _}
      <li>{groupName}</li>
    {/each}
  </ul>
  <ul>
    {#each directory.files as file, _}
      <li>{file.name}</li>
    {/each}
  </ul>
  <ul>
    {#each directory.files as file, _}
      <li>
        <input type="checkbox" bind:checked={file.ignore} />
        <input
          placeholder="Override pattern..."
          bind:value={file.overridePattern}
        />
        {file.newName}
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
