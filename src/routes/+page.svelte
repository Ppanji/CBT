<script lang="ts">
  import { onMount } from "svelte";
  let exams = [];

  onMount(async () => {
    const res = await fetch("/api/exams");
    exams = await res.json();
  });
</script>

<main class="p-6">
  <h1 class="text-2xl font-bold mb-4">CBT — Daftar Ujian</h1>

  <div class="grid grid-cols-1 gap-4">
    {#each exams as e}
      <div class="card p-4">
        <h2 class="card-title">{e.title}</h2>
        <p class="text-sm">{e.description}</p>
      </div>
    {/each}
  </div>
</main>
