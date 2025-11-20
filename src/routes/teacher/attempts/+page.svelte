<script lang="ts">
  import { onMount } from 'svelte';
  let examId: number = 1; // ubah / bind dari select exam di UI teacher
  let attempts = [];
  let loading = false;

  onMount(()=> loadAttempts());

  async function loadAttempts(){
    loading = true;
    try {
      const res = await fetch(`/api/exams/${examId}/attempts`);
      attempts = await res.json();
    } catch(e){ console.error(e); attempts = []; }
    loading = false;
  }

  function exportCSV(){
    const rows = [
      ['Attempt ID','Student','Started','Finished','Score','Duration(s)'],
      ...attempts.map(a=>[a.id, a.student_name, a.started_at, a.finished_at, a.score, a.duration_seconds])
    ];
    const csv = rows.map(r => r.map(c=> `"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type:'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `exam_${examId}_attempts.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }
</script>

<div>
  <h2>Rekap Attempt (Exam {examId})</h2>
  <div><button on:click={loadAttempts} disabled={loading}>{loading?'Memuat...':'Refresh'}</button> <button on:click={exportCSV}>Export CSV</button></div>

  {#if attempts.length===0}
    <div>Tidak ada attempt.</div>
  {:else}
    <table style="width:100%; border-collapse:collapse;">
      <thead><tr><th>ID</th><th>Siswa</th><th>Mulai</th><th>Selesai</th><th>Skor</th><th>Dur(s)</th><th>Aksi</th></tr></thead>
      <tbody>
        {#each attempts as a}
          <tr>
            <td>{a.id}</td>
            <td>{a.student_name}</td>
            <td>{a.started_at}</td>
            <td>{a.finished_at}</td>
            <td>{a.score ?? '-'}</td>
            <td>{a.duration_seconds ?? '-'}</td>
            <td><a href={`/teacher/attempts/${a.id}`} target="_blank">Detail</a></td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>
