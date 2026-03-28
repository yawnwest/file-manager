<script lang="ts">
  import { Directory } from "$lib/states/directory.svelte";
  import { Zoom } from "$lib/states/zoom.svelte";
  import { open } from "@tauri-apps/plugin-dialog";

  const zoom = new Zoom();
  const directory = new Directory();

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
  <form class="row">
    <input placeholder="Enter a directory..." bind:value={directory.path} />
    <button on:click={() => openDir()}>Open ...</button>
  </form>
  <p>{directory.error}</p>

  <ul>
    {#each directory.files as file, _}
      <li>{file}</li>
    {/each}
  </ul>
</main>

<style>
</style>
