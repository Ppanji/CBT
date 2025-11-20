<script lang="ts">
  import { onMount } from 'svelte';

  let subject = 'Bahasa Indonesia';
  let fullname = '';
  let kelas = '6A';
  let loading = false;
  let error = '';

  async function doLogin() {
    error = '';
    if (!subject || !fullname || !kelas) {
      error = 'Lengkapi semua kolom.';
      return;
    }
    loading = true;
    try {
      const res = await fetch('/api/student/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subject, fullname, kelas })
      });
      if (!res.ok) {
        const txt = await res.text().catch(()=>null);
        error = 'Login gagal: ' + (txt || res.statusText);
        loading = false;
        return;
      }
      // cookie HttpOnly sudah diset oleh server; cukup redirect
      window.location.href = '/student';
    } catch (e:any) {
      error = 'Network error';
      console.error(e);
    } finally {
      loading = false;
    }
  }
</script>

<style>
  /* sesuaikan style sesuai thememu; ini fallback */
  .card { max-width:640px; margin:40px auto; padding:22px; background:white; border-radius:10px; box-shadow:0 10px 30px rgba(2,6,23,0.06);}
  label { display:block; margin-top:12px; font-weight:600; }
  input, select { width:100%; padding:10px; border-radius:8px; border:1px solid #e5e7eb; margin-top:6px;}
  button { margin-top:16px; padding:10px 14px; border-radius:8px; }
  .err { color:#b91c1c; margin-top:8px; }
</style>

<main>
  <div class="card">
    <h2>Selamat Datang — Siswa</h2>
    <p>Pilih mata pelajaran, isi nama lengkap, pilih kelas, lalu klik Login.</p>

    <label>Mata Pelajaran</label>
    <select bind:value={subject}>
      <option>Bahasa Indonesia</option>
      <option>Matematika</option>
    </select>

    <label>Nama Lengkap</label>
    <input placeholder="Tulis nama lengkap siswa..." bind:value={fullname} />

    <label>Kelas</label>
    <select bind:value={kelas}>
      <option>6A</option>
      <option>6B</option>
      <option>6C</option>
    </select>

    <div style="display:flex; gap:8px;">
      <button on:click={doLogin} disabled={loading}>{loading ? 'Tunggu...' : 'Login'}</button>
      <button on:click={()=>{ fullname=''; }}>Reset</button>
    </div>

    {#if error}
      <div class="err">{error}</div>
    {/if}
  </div>
</main>
