<script lang="ts">
  import { Directory } from "$lib/states/directory.svelte";

  const directory = new Directory();
</script>

<main class="container">
  <form class="row">
    <input placeholder="Enter a directory..." bind:value={directory.path} />
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
